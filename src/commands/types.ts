import kleur from 'kleur';
import { Api18nClient, ApiError } from '../client.js';
import { BACKEND_URL, loadConfig } from '../config.js';
import { resolveToken } from '../credentials.js';
import { relativeOut, writeTypes } from '../typegen-runner.js';
import type { TranslationDataset } from '../types.js';

export async function runTypes(): Promise<void> {
  const config = await loadConfig(process.cwd());
  if (!config.typegen.enabled) {
    console.error(kleur.red('Typegen is disabled in api18n.config.ts (typegen: false).'));
    process.exit(1);
  }

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
    dataset = await client.dataset();
  } catch (err) {
    if (err instanceof ApiError) {
      console.error(kleur.red(`Couldn't fetch dataset (${err.status}): ${err.message}`));
    } else {
      console.error(kleur.red(err instanceof Error ? err.message : String(err)));
    }
    process.exit(1);
  }

  try {
    const result = writeTypes(config, dataset);
    console.log(
      kleur.green(
        `✓ Wrote types for ${result.keyCount} key${result.keyCount === 1 ? '' : 's'} (${result.baseLocale}) → ${relativeOut(config)}`,
      ),
    );
  } catch (err) {
    console.error(kleur.red(err instanceof Error ? err.message : String(err)));
    process.exit(1);
  }
}
