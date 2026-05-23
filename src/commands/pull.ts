import { existsSync } from 'node:fs';
import { relative } from 'node:path';
import kleur from 'kleur';
import { Api18nClient, ApiError } from '../client.js';
import { BACKEND_URL, loadConfig } from '../config.js';
import { resolveToken } from '../credentials.js';
import {
  buildLocalePath,
  readJsonFile,
  unflatten,
  writeJsonFile,
} from '../files.js';
import { withSpinner } from '../spinner.js';
import { relativeOut, writeTypes } from '../typegen-runner.js';
import type { TranslationDataset, TranslationRow } from '../types.js';

export interface PullOptions {
  dryRun?: boolean;
  locale?: string[];
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
    const path = buildLocalePath(config.rootDir, config.locales, lang.code);
    const flat: Record<string, string | null> = {};
    for (const row of dataset.rows as TranslationRow[]) {
      flat[row.key] = row.values[lang.code] ?? null;
    }
    const nested = unflatten(flat);

    const exists = existsSync(path);
    const current = exists ? readJsonFile(path) : null;
    const same = current !== null && stableStringify(current) === stableStringify(nested);

    const rel = relative(process.cwd(), path);

    if (same) {
      summary.unchanged.push(rel);
      continue;
    }

    if (!options.dryRun) {
      writeJsonFile(path, nested);
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

function stableStringify(value: unknown): string {
  return JSON.stringify(value, Object.keys(flattenForSort(value)).sort());
}

function flattenForSort(value: unknown, out: Record<string, true> = {}): Record<string, true> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    for (const k of Object.keys(value as object)) {
      out[k] = true;
      flattenForSort((value as Record<string, unknown>)[k], out);
    }
  }
  return out;
}
