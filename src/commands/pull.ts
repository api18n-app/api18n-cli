import { existsSync, statSync, writeFileSync } from 'node:fs';
import { relative } from 'node:path';
import kleur from 'kleur';
import { Api18nClient, ApiError } from '../client.js';
import { BACKEND_URL, loadConfig } from '../config.js';
import { resolveToken } from '../credentials.js';
import {
  applyServerToRaw,
  buildLocalePath,
  detectIndent,
  mergePreservingOrder,
  readJsonFileWithRaw,
  unflatten,
} from '../files.js';
import { withSpinner } from '../spinner.js';
import { relativeOut, writeTypes } from '../typegen-runner.js';
import { getExperimentalLanguageCodes } from '../language-stability.js';
import type { TranslationDataset, TranslationRow } from '../types.js';

export interface PullOptions {
  dryRun?: boolean;
  locale?: string[];
}

/** Re-serialize a merged object (fallback path only — patch edits preferred). */
function serialize(
  content: Record<string, unknown>,
  indent: string,
  trailingNewline: boolean,
): string {
  return JSON.stringify(content, null, indent) + (trailingNewline ? '\n' : '');
}

export async function runPull(options: PullOptions = {}): Promise<void> {
  const config = await loadConfig(process.cwd());
  const credentials = resolveToken();
  if (!credentials) {
    console.error(kleur.red('Not signed in. Run `api18n login` first.'));
    process.exit(1);
  }

  const client = new Api18nClient({
    baseUrl: BACKEND_URL,
    apiKey: credentials.token,
    companyId: config.companyId,
  });

  let dataset: TranslationDataset;
  try {
    dataset = await withSpinner('Fetching translations…', () => client.dataset());
  } catch (err) {
    if (err instanceof ApiError) {
      console.error(kleur.red(`Couldn't fetch dataset (${err.status}): ${err.message}`));
    } else {
      console.error(kleur.red(err instanceof Error ? err.message : String(err)));
    }
    process.exit(1);
  }

  // Filter locales by config.include and --locale
  const includeSet = options.locale && options.locale.length > 0
    ? new Set(options.locale)
    : config.include
      ? new Set(config.include)
      : null;
  const languages = includeSet
    ? dataset.languages.filter((l) => includeSet.has(l.code))
    : dataset.languages;

  if (languages.length === 0) {
    console.log(kleur.yellow('No matching locales to pull.'));
    return;
  }

  const experimentalCodes = getExperimentalLanguageCodes(languages);
  if (experimentalCodes.length > 0) {
    console.warn(
      kleur.yellow(
        `⚠ Experimental locales: ${experimentalCodes.join(', ')}. They are supported, but experimental.`,
      ),
    );
  }

  if (dataset.truncated) {
    console.warn(
      kleur.yellow(
        `⚠ Dataset response was truncated — your project exceeds the per-request row cap. Contact api18n support.`
      )
    );
  }

  type Outcome = 'created' | 'updated' | 'unchanged';
  const summary: Record<Outcome, string[]> = {
    created: [],
    updated: [],
    unchanged: [],
  };

  for (const lang of languages) {
    const flat: Record<string, string | null> = {};
    for (const row of dataset.rows as TranslationRow[]) {
      flat[row.key] = row.values[lang.code] ?? null;
    }
    const nested = unflatten(flat);

    // Each server language writes to its own {locale}.json file.
    const localCode = lang.code;
    const path = buildLocalePath(config.rootDir, config.locales, localCode);
    const exists = existsSync(path) && statSync(path).isFile();
    const existing = exists ? readJsonFileWithRaw(path) : null;
    const current = existing ? existing.data : null;
    const rel = relative(process.cwd(), path);

    // Existing file → patch in place first (comments, order, formatting
    // survive, like the backend does on GitHub push). Falls back to a full
    // merge+re-serialize only when a key must be removed from the file —
    // the one case positional edits can't express.
    let text: string | undefined;
    let changed: boolean;
    if (existing) {
      const patched = applyServerToRaw(existing.raw, flat, {
        indent: detectIndent(existing.raw),
      });
      if (patched) {
        text = patched.text;
        changed = patched.changed;
      } else {
        const merged = mergePreservingOrder(current, nested);
        changed = merged.changed;
        if (changed) {
          const indent = detectIndent(existing.raw);
          const trailingNewline = existing.raw.endsWith('\n');
          text = serialize(merged.result, indent, trailingNewline);
        }
      }
    } else {
      const merged = mergePreservingOrder(null, nested);
      changed = merged.changed;
      if (changed) text = serialize(merged.result, '  ', true);
    }

    if (!changed) {
      summary.unchanged.push(rel);
      continue;
    }

    if (!options.dryRun) {
      writeFileSync(path, text!, 'utf8');
    }
    if (exists) summary.updated.push(rel);
    else summary.created.push(rel);
  }

  console.log();
  for (const path of summary.created) console.log(kleur.green('  + '), path);
  for (const path of summary.updated) console.log(kleur.cyan('  ~ '), path);
  for (const path of summary.unchanged) console.log(kleur.gray('  = '), path);

  const totalChanged = summary.created.length + summary.updated.length;
  console.log();
  if (totalChanged === 0) {
    console.log(kleur.gray('Already up to date.'));
  } else if (options.dryRun) {
    console.log(
      kleur.yellow(
        `${totalChanged} file${totalChanged === 1 ? '' : 's'} would change. Run without --dry-run to write.`
      )
    );
  } else {
    console.log(
      kleur.green(
        `✓ Wrote ${totalChanged} file${totalChanged === 1 ? '' : 's'}.`
      )
    );
  }

  if (config.typegen.enabled && !options.dryRun) {
    try {
      const result = writeTypes(config, dataset);
      console.log(
        kleur.green(
          `✓ Wrote types for ${result.keyCount} key${result.keyCount === 1 ? '' : 's'} (${result.baseLocale}) → ${relativeOut(config)}`,
        ),
      );
    } catch (err) {
      console.error(
        kleur.yellow(`⚠ Skipped typegen: ${err instanceof Error ? err.message : String(err)}`),
      );
    }
  }
}
