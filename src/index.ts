import { Command } from 'commander';
import kleur from 'kleur';
import { runInit } from './commands/init.js';
import { runLogin } from './commands/login.js';
import { runLogout } from './commands/logout.js';
import { runWhoami } from './commands/whoami.js';
import { runPull } from './commands/pull.js';

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
  .option('--base-url <url>', 'override the dashboard URL')
  .option('--token <token>', 'use a token non-interactively')
  .action(async (opts: { baseUrl?: string; token?: string }) => {
    try {
      await runLogin({ baseUrl: opts.baseUrl, token: opts.token });
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

program.parseAsync(process.argv).catch(fail);

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
