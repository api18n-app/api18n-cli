import kleur from 'kleur';
import { Api18nClient, ApiError } from '../client.js';
import { BACKEND_URL, loadConfig } from '../config.js';
import { resolveToken } from '../credentials.js';
import { computeTranslationDiff } from '../diff.js';
import { buildLocalePath, flatten, readJsonFile } from '../files.js';
import type { ProposalSummary, TranslationDataset } from '../types.js';

export async function runStatus(): Promise<void> {
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

  let server: TranslationDataset;
  let pending: ProposalSummary[];
  try {
    // Sequential, not Promise.all: two concurrent /cli/* requests trigger
    // back-to-back authApiKey lookups that share a bun-sql connection and
    // clobber each other's unnamed prepared statements under PgBouncer
    // (`prepare: false`), surfacing as 500. One extra round-trip beats a
    // broken command.
    server = await client.dataset();
    pending = await client.listProposals('pending');
  } catch (err) {
    if (err instanceof ApiError) {
      console.error(kleur.red(`Couldn't reach the dashboard (${err.status}): ${err.message}`));
    } else {
      console.error(kleur.red(err instanceof Error ? err.message : String(err)));
    }
    process.exit(1);
  }

  // Pending proposals first
  console.log();
  if (pending.length === 0) {
    console.log(kleur.gray('No pending proposals.'));
  } else {
    console.log(kleur.bold(`Pending proposals (${pending.length})`));
    for (const p of pending) {
      const name = describeProposer(p.proposer);
      const counts = `+${p.counts.create} · ~${p.counts.update} · -${p.counts.delete}`;
      console.log(
        `  ${kleur.yellow('●')} ${kleur.bold(p.id.slice(0, 8))} ${kleur.gray(`(${counts})`)}  ${kleur.gray(name)}`,
      );
      if (p.summary) console.log(`     ${kleur.gray(`“${truncate(p.summary, 80)}”`)}`);
    }
  }

  // Local-vs-server drift
  const localByKey = new Map<string, Record<string, string | null>>();
  for (const lang of server.languages) {
    const path = buildLocalePath(config.rootDir, config.locales, lang.code);
    const content = readJsonFile(path);
    if (!content) continue;
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
  const diff = computeTranslationDiff(server, localByKey);
  const drift = diff.create.length + diff.update.length + diff.delete.length;

  console.log();
  if (drift === 0) {
    console.log(kleur.green('✓'), 'Local files match the dashboard.');
  } else {
    console.log(kleur.bold('Local drift'));
    if (diff.create.length) console.log(kleur.green(`  +${diff.create.length} would create`));
    if (diff.update.length) console.log(kleur.cyan(`  ~${diff.update.length} would update`));
    if (diff.delete.length) console.log(kleur.red(`  -${diff.delete.length} would delete`));
    console.log(kleur.gray('  Run `api18n push` to submit as a proposal.'));
  }
}

function describeProposer(p: ProposalSummary['proposer']): string {
  const name = [p.firstName, p.lastName].filter(Boolean).join(' ');
  return name || p.email || p.id;
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1).trimEnd() + '…';
}
