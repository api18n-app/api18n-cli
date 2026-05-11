import kleur from 'kleur';
import { Api18nClient, ApiError } from '../client.js';
import { loadConfig } from '../config.js';
import { resolveToken } from '../credentials.js';
import { computeTranslationDiff } from '../diff.js';
import {
  buildLocalePath,
  flatten,
  readJsonFile,
} from '../files.js';
import type { TranslationDataset } from '../types.js';

export interface PushOptions {
  dryRun?: boolean;
  message?: string;
}

export async function runPush(options: PushOptions = {}): Promise<void> {
  const config = await loadConfig(process.cwd());
  const credentials = resolveToken();
  if (!credentials) {
    console.error(kleur.red('Not signed in. Run `api18n login` first.'));
    process.exit(1);
  }
  const client = new Api18nClient({
    baseUrl: credentials.baseUrl ?? config.baseUrl,
    token: credentials.token,
    companyId: config.companyId,
  });

  let server: TranslationDataset;
  try {
    server = await client.dataset();
  } catch (err) {
    if (err instanceof ApiError) {
      console.error(kleur.red(`Couldn't fetch server dataset (${err.status}): ${err.message}`));
    } else {
      console.error(kleur.red(err instanceof Error ? err.message : String(err)));
    }
    process.exit(1);
  }

  // Build local key→values map from the JSON files on disk
  const includeSet = config.include ? new Set(config.include) : null;
  const languages = includeSet
    ? server.languages.filter((l) => includeSet.has(l.code))
    : server.languages;

  const localByKey = new Map<string, Record<string, string | null>>();
  const missingFiles: string[] = [];

  for (const lang of languages) {
    const path = buildLocalePath(config.rootDir, config.locales, lang.code);
    const content = readJsonFile(path);
    if (content === null) {
      missingFiles.push(path);
      continue;
    }
    const flat = flatten(content);
    for (const [key, value] of Object.entries(flat)) {
      let entry = localByKey.get(key);
      if (!entry) {
        entry = {};
        localByKey.set(key, entry);
      }
      entry[lang.code] = value;
    }
  }

  if (missingFiles.length === languages.length) {
    console.error(kleur.red('No local translation files found.'));
    console.error(kleur.gray('Run `api18n pull` first, or create the files manually.'));
    process.exit(1);
  }

  const diff = computeTranslationDiff(server, localByKey);
  const total = diff.create.length + diff.update.length + diff.delete.length;

  console.log();
  if (total === 0) {
    console.log(kleur.gray('No changes — local matches the dashboard.'));
    return;
  }

  // Brief diff summary
  if (diff.create.length > 0) {
    console.log(
      kleur.green(`  +${String(diff.create.length).padStart(3)} create  `),
      kleur.gray(diff.create.slice(0, 3).map((c) => c.key).join(', ') +
        (diff.create.length > 3 ? `, +${diff.create.length - 3} more` : '')),
    );
  }
  if (diff.update.length > 0) {
    console.log(
      kleur.cyan(`  ~${String(diff.update.length).padStart(3)} update  `),
      kleur.gray(diff.update.slice(0, 3).map((u) => u.key).join(', ') +
        (diff.update.length > 3 ? `, +${diff.update.length - 3} more` : '')),
    );
  }
  if (diff.delete.length > 0) {
    console.log(
      kleur.red(`  -${String(diff.delete.length).padStart(3)} delete  `),
      kleur.gray(diff.delete.slice(0, 3).map((d) => d.key).join(', ') +
        (diff.delete.length > 3 ? `, +${diff.delete.length - 3} more` : '')),
    );
  }

  if (options.dryRun) {
    console.log();
    console.log(
      kleur.yellow(`Would submit ${total} change${total === 1 ? '' : 's'} as a proposal. Run without --dry-run to push.`),
    );
    return;
  }

  let proposal;
  try {
    proposal = await client.createProposal({
      summary: options.message ?? null,
      diff,
    });
  } catch (err) {
    if (err instanceof ApiError) {
      console.error(kleur.red(`Couldn't submit proposal (${err.status}): ${err.message}`));
    } else {
      console.error(kleur.red(err instanceof Error ? err.message : String(err)));
    }
    process.exit(1);
  }

  const dashboardUrl = `${credentials.baseUrl ?? config.baseUrl}/dashboard/translation`;
  console.log();
  console.log(
    kleur.green('✓'),
    `Proposal ${kleur.bold(proposal.id)} submitted as ${proposal.status}.`,
  );
  console.log(`  Review at ${kleur.cyan(dashboardUrl)}`);
}
