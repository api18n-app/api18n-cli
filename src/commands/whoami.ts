import kleur from 'kleur';
import { Api18nClient, ApiError } from '../client.js';
import { findConfigFile, loadConfig, DEFAULT_BASE_URL } from '../config.js';
import { resolveToken } from '../credentials.js';

export async function runWhoami(): Promise<void> {
  const credentials = resolveToken();
  if (!credentials) {
    console.error(kleur.red('Not signed in. Run `api18n login` first.'));
    process.exit(1);
  }

  let baseUrl = credentials.baseUrl ?? DEFAULT_BASE_URL;
  let companyId: string | undefined;
  if (findConfigFile(process.cwd())) {
    try {
      const config = await loadConfig(process.cwd());
      baseUrl = config.baseUrl;
      companyId = config.companyId;
    } catch {
      /* config exists but unreadable — use defaults */
    }
  }

  const client = new Api18nClient({ baseUrl, token: credentials.token, companyId });
  try {
    const me = await client.me();
    const name =
      [me.user.firstName, me.user.lastName].filter(Boolean).join(' ') ||
      me.user.email ||
      me.user.id;
    console.log(kleur.bold(name));
    console.log(`  ${kleur.gray('email   ')} ${me.user.email ?? '—'}`);
    console.log(`  ${kleur.gray('company ')} ${me.company.name} (${me.company.id})`);
    console.log(`  ${kleur.gray('role    ')} ${me.role}`);
    console.log(`  ${kleur.gray('auth    ')} ${me.authMethod}`);
    console.log(`  ${kleur.gray('host    ')} ${baseUrl}`);
  } catch (err) {
    if (err instanceof ApiError) {
      console.error(kleur.red(`${err.status}: ${err.message}`));
    } else {
      console.error(
        kleur.red(err instanceof Error ? err.message : String(err))
      );
    }
    process.exit(1);
  }
}
