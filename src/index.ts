import { Command } from 'commander';
import kleur from 'kleur';
import { runInit } from './commands/init.js';
import { runLogin } from './commands/login.js';
import { runLogout } from './commands/logout.js';
import { runWhoami } from './commands/whoami.js';
import { runPull } from './commands/pull.js';
import { runPush } from './commands/push.js';
import { runStatus } from './commands/status.js';
import { runTypes } from './commands/types.js';
import {
  runProposalsList,
  runProposalsShow,
} from './commands/proposals.js';

const program = new Command();

program
  .name('api18n')
  .description('Pull and push translations between your local files and the api18n dashboard.')
  .version('0.1.0');

program
  .command('init')
  .description('Create an api18n.config.ts in the current directory.')
  .action(async () => {
    try {
      await runInit();
    } catch (err) {
      fail(err);
    }
  });

program
  .command('login')
  .description('Sign in with a Personal Access Token from the dashboard.')
  .option('--token <token>', 'use a token non-interactively')
  .action(async (opts: { token?: string }) => {
    try {
      await runLogin({ token: opts.token });
    } catch (err) {
      fail(err);
    }
  });

program
  .command('logout')
  .description('Forget the locally stored API token.')
  .action(() => {
    try {
      runLogout();
    } catch (err) {
      fail(err);
    }
  });

program
  .command('whoami')
  .description('Show the signed-in user and current company.')
  .action(async () => {
    try {
      await runWhoami();
    } catch (err) {
      fail(err);
    }
  });

program
  .command('pull')
  .description('Fetch translations from the dashboard and write them to local files.')
  .option('--dry-run', "Show what would change without writing files")
  .option('--locale <codes...>', "Only pull these locale codes (e.g. --locale en pt)")
  .action(async (opts: { dryRun?: boolean; locale?: string[] }) => {
    try {
      await runPull({ dryRun: opts.dryRun, locale: opts.locale });
    } catch (err) {
      fail(err);
    }
  });

program
  .command('push')
  .description('Submit local changes as a proposal for dashboard approval.')
  .option('--dry-run', 'Show what would change without submitting')
  .option('-m, --message <text>', 'Optional summary shown in the dashboard review card')
  .action(async (opts: { dryRun?: boolean; message?: string }) => {
    try {
      await runPush({ dryRun: opts.dryRun, message: opts.message });
    } catch (err) {
      fail(err);
    }
  });

program
  .command('status')
  .description('Show pending proposals and local-vs-server drift.')
  .action(async () => {
    try {
      await runStatus();
    } catch (err) {
      fail(err);
    }
  });

program
  .command('types')
  .description('Regenerate messages.d.ts for the api18n runtime SDK.')
  .action(async () => {
    try {
      await runTypes();
    } catch (err) {
      fail(err);
    }
  });

const proposals = program
  .command('proposals')
  .description('Inspect translation proposals.');

proposals
  .command('list')
  .description('List recent proposals.')
  .option('--status <status>', 'Filter by pending | approved | rejected | superseded')
  .option('--limit <n>', 'Maximum rows to show', (v) => Number(v))
  .action(async (opts: { status?: string; limit?: number }) => {
    try {
      await runProposalsList(opts);
    } catch (err) {
      fail(err);
    }
  });

proposals
  .command('show <id>')
  .description('Print the full diff of a single proposal.')
  .option('--json', 'Output raw JSON instead of formatted text')
  .action(async (id: string, opts: { json?: boolean }) => {
    try {
      await runProposalsShow(id, opts);
    } catch (err) {
      fail(err);
    }
  });

// IMPORTANT: do not auto-invoke `parseAsync` here. This module is also
// imported as a library — `api18n.config.ts` does `import { defineConfig }
// from "@api18n/cli"` — and any side effect at module load would run the
// installed copy of the CLI a second time (with whatever stale code it has),
// hijacking the command in subtle ways. The bin shim is the only caller of
// `run()`.
export async function run(argv: readonly string[] = process.argv): Promise<void> {
  try {
    await program.parseAsync([...argv]);
  } catch (err) {
    fail(err);
  }
}

function fail(err: unknown): never {
  if (err instanceof Error) {
    console.error(kleur.red(err.message));
  } else {
    console.error(kleur.red(String(err)));
  }
  process.exit(1);
}

// Re-export defineConfig so users can write `import { defineConfig } from '@api18n/cli'`
export { defineConfig } from './config.js';
export type { UserConfig } from './config.js';
