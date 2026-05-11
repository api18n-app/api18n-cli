import { existsSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import kleur from 'kleur';
import prompts from 'prompts';
import { DEFAULT_LOCALES_PATTERN, findConfigFile } from '../config.js';

const TEMPLATE = (locales: string, baseUrl?: string) => `import { defineConfig } from '@api18n/cli';

export default defineConfig({
  locales: '${locales}',${baseUrl ? `\n  baseUrl: '${baseUrl}',` : ''}
});
`;

export async function runInit(): Promise<void> {
  const cwd = process.cwd();
  const existing = findConfigFile(cwd);
  if (existing) {
    console.log(
      kleur.yellow(`✱ ${existing} already exists. Edit it directly or delete it first.`)
    );
    return;
  }

  const answers = await prompts(
    [
      {
        type: 'text',
        name: 'locales',
        message: 'Where do your translation files live?',
        initial: DEFAULT_LOCALES_PATTERN,
        hint: '{locale} is replaced with the language code',
      },
      {
        type: 'text',
        name: 'baseUrl',
        message: 'Dashboard URL (leave blank for production)',
        initial: '',
        format: (val: string) => val.trim(),
      },
    ],
    {
      onCancel: () => {
        console.log(kleur.gray('Cancelled.'));
        process.exit(0);
      },
    }
  );

  const path = resolve(cwd, 'api18n.config.ts');
  if (existsSync(path)) {
    console.log(kleur.yellow(`✱ ${path} already exists. Cancelled.`));
    return;
  }
  const baseUrl = answers.baseUrl ? answers.baseUrl : undefined;
  writeFileSync(path, TEMPLATE(answers.locales || DEFAULT_LOCALES_PATTERN, baseUrl), 'utf8');

  console.log();
  console.log(kleur.green('✓'), `created ${kleur.bold('api18n.config.ts')}`);
  console.log();
  console.log('Next steps:');
  console.log(`  ${kleur.cyan('api18n login')}    sign in with a Personal Access Token`);
  console.log(`  ${kleur.cyan('api18n pull')}     download translations to local JSON files`);
}
