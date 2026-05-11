import kleur from 'kleur';
import { Api18nClient, ApiError } from '../client.js';
import { loadConfig } from '../config.js';
import { resolveToken } from '../credentials.js';
import type { ProposalStatus, ProposalSummary } from '../types.js';

const STATUSES: ProposalStatus[] = ['pending', 'approved', 'rejected', 'superseded'];

function buildClient() {
  const credentials = resolveToken();
  if (!credentials) {
    console.error(kleur.red('Not signed in. Run `api18n login` first.'));
    process.exit(1);
  }
  return loadConfig(process.cwd()).then((config) =>
    new Api18nClient({
      baseUrl: credentials.baseUrl ?? config.baseUrl,
      token: credentials.token,
      companyId: config.companyId,
    }),
  );
}

export interface ProposalsListOptions {
  status?: string;
  limit?: number;
}

export async function runProposalsList(options: ProposalsListOptions = {}): Promise<void> {
  const client = await buildClient();
  let status: ProposalStatus | undefined;
  if (options.status) {
    if (!(STATUSES as string[]).includes(options.status)) {
      console.error(
        kleur.red(
          `Unknown --status "${options.status}". Use one of: ${STATUSES.join(', ')}`,
        ),
      );
      process.exit(1);
    }
    status = options.status as ProposalStatus;
  }
  let proposals: ProposalSummary[];
  try {
    proposals = await client.listProposals(status);
  } catch (err) {
    handleApiError(err);
  }
  if (proposals.length === 0) {
    console.log(kleur.gray(status ? `No ${status} proposals.` : 'No proposals.'));
    return;
  }
  if (options.limit && options.limit > 0) {
    proposals = proposals.slice(0, options.limit);
  }
  console.log();
  for (const p of proposals) {
    console.log(
      `${kleur.bold(p.id.slice(0, 8))}  ${statusBadge(p.status)}  ` +
        kleur.gray(
          `+${p.counts.create} ~${p.counts.update} -${p.counts.delete}`,
        ) +
        '  ' +
        kleur.gray(describeProposer(p.proposer)),
    );
    if (p.summary) {
      console.log(`         ${kleur.gray('“' + truncate(p.summary, 80) + '”')}`);
    }
  }
}

export interface ProposalsShowOptions {
  json?: boolean;
}

export async function runProposalsShow(
  id: string,
  options: ProposalsShowOptions = {},
): Promise<void> {
  if (!id) {
    console.error(kleur.red('Usage: api18n proposals show <id>'));
    process.exit(1);
  }
  const client = await buildClient();
  let proposal;
  try {
    proposal = await client.getProposal(id);
  } catch (err) {
    handleApiError(err);
  }

  if (options.json) {
    console.log(JSON.stringify(proposal, null, 2));
    return;
  }

  const { diff } = proposal;
  console.log();
  console.log(`${kleur.bold(proposal.id)}  ${statusBadge(proposal.status)}`);
  console.log(`  ${kleur.gray('by')}     ${describeProposer(proposal.proposer)}`);
  console.log(`  ${kleur.gray('when')}   ${proposal.createdAt}`);
  if (proposal.summary) {
    console.log(`  ${kleur.gray('note')}   ${proposal.summary}`);
  }
  if (proposal.decidedAt) {
    console.log(
      `  ${kleur.gray('decided')} ${proposal.decidedAt}${
        proposal.decisionNote ? ` — ${proposal.decisionNote}` : ''
      }`,
    );
  }

  if (diff.create.length > 0) {
    console.log();
    console.log(kleur.green(`+ Create (${diff.create.length})`));
    for (const c of diff.create) {
      console.log(`  ${kleur.bold(c.key)}`);
      for (const [lang, val] of Object.entries(c.values)) {
        if (val === null) continue;
        console.log(`    ${kleur.gray(lang.padEnd(4))} ${val}`);
      }
    }
  }
  if (diff.update.length > 0) {
    console.log();
    console.log(kleur.cyan(`~ Update (${diff.update.length})`));
    for (const u of diff.update) {
      console.log(`  ${kleur.bold(u.key)}`);
      for (const c of u.changes) {
        console.log(
          `    ${kleur.gray(c.languageCode.padEnd(4))} ` +
            kleur.red(`${c.from ?? '—'}`) +
            kleur.gray(' → ') +
            kleur.green(`${c.to ?? '—'}`),
        );
      }
    }
  }
  if (diff.delete.length > 0) {
    console.log();
    console.log(kleur.red(`- Delete (${diff.delete.length})`));
    for (const d of diff.delete) {
      console.log(`  ${kleur.bold(d.key)}`);
    }
  }
  if (
    diff.create.length === 0 &&
    diff.update.length === 0 &&
    diff.delete.length === 0
  ) {
    console.log(kleur.gray('  (empty diff)'));
  }
}

function statusBadge(status: ProposalStatus): string {
  switch (status) {
    case 'pending':
      return kleur.yellow('pending');
    case 'approved':
      return kleur.green('approved');
    case 'rejected':
      return kleur.red('rejected');
    case 'superseded':
      return kleur.gray('superseded');
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

function handleApiError(err: unknown): never {
  if (err instanceof ApiError) {
    console.error(kleur.red(`${err.status}: ${err.message}`));
  } else {
    console.error(kleur.red(err instanceof Error ? err.message : String(err)));
  }
  process.exit(1);
}
