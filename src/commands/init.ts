import { existsSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import kleur from 'kleur';
import prompts from 'prompts';
import { byLengthAsc, Fzf } from 'fzf';
import { DEFAULT_LOCALES_PATTERN, findConfigFile } from '../config.js';

const TEMPLATE = (locales: string, localeMap: Record<string, string[]>) => `import { defineConfig } from '@api18n/cli';

export default defineConfig({
  locales: '${locales}',${Object.keys(localeMap).length > 0 ? `
  localeMap: ${JSON.stringify(localeMap, null, 2).replace(/\n/g, '\n  ')},` : ''}
});
`;

/** Dirs we never descend into during discovery. */
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '.next', '.cache']);

/** A locale-code-ish filename stem: en, pt, pt-br, es_MX, zh-Hant, en-GB, es-419. */
const LOCALE_STEM = /^[a-z]{2,3}([-_][a-z0-9]{2,4})?$/i;

/** Extensions we treat as translation files. */
const LOCALE_EXTS = new Set(['.json', '.jsonc']);

/**
 * Bounded recursive walk. Yields every directory under `root` (relative to
 * `root`, posix separators) up to `maxDepth`, skipping SKIP_DIRS and hidden
 * entries. Used both to feed the fzf path picker and to find locale files.
 *
 * ponytail: hand-rolled, no glob dep — depth-capped so big repos stay fast;
 * switch to tinyglobby if wildcards/ignore globs ever become needed.
 */
export function walkDirs(root: string, maxDepth = 6): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const stack: { dir: string; depth: number }[] = [{ dir: root, depth: 0 }];
  while (stack.length) {
    const { dir, depth } = stack.pop()!;
    let names: string[];
    try {
      names = readdirSync(dir);
    } catch {
      continue;
    }
    for (const name of names) {
      if (name.startsWith('.') || SKIP_DIRS.has(name)) continue;
      const full = resolve(dir, name);
      let isDir: boolean;
      try {
        isDir = statSync(full).isDirectory();
      } catch {
        continue;
      }
      if (!isDir || depth >= maxDepth) continue;
      const rel = relative(root, full).replace(/\\/g, '/');
      if (seen.has(rel)) continue;
      seen.add(rel);
      out.push(rel);
      stack.push({ dir: full, depth: depth + 1 });
    }
  }
  return out.sort();
}

/**
 * Recursively find translation files and pick the directory that holds the
 * most locale-code-named files. Returns the inferred pattern + the files, or
 * null when nothing locale-like is on disk.
 *
 *   src/i18n/dictionaries/pt-br.json, en.json  →
 *     { pattern: 'src/i18n/dictionaries/{locale}.json', files: [...] }
 */
export function discoverLocaleFiles(
  root: string,
): { pattern: string; files: string[] } | null {
  // dir (relative) → list of { stem, ext }
  const buckets = new Map<string, { stem: string; ext: string }[]>();
  const dirs = ['', ...walkDirs(root)];
  for (const rel of dirs) {
    const abs = rel ? resolve(root, rel) : root;
    let names: string[];
    try {
      names = readdirSync(abs);
    } catch {
      continue;
    }
    for (const name of names) {
      const dot = name.lastIndexOf('.');
      if (dot <= 0) continue;
      const stem = name.slice(0, dot);
      const ext = name.slice(dot).toLowerCase();
      if (!LOCALE_EXTS.has(ext) || !LOCALE_STEM.test(stem)) continue;
      const key = rel || '.';
      (buckets.get(key) ?? buckets.set(key, []).get(key)!).push({ stem, ext });
    }
  }
  if (buckets.size === 0) return null;
  // Pick the bucket with the most locale files; tie-break on shallowest path.
  let best: { rel: string; files: { stem: string; ext: string }[] } | null = null;
  for (const [rel, files] of buckets) {
    if (
      !best ||
      files.length > best.files.length ||
      (files.length === best.files.length && rel.length < best.rel.length)
    ) {
      best = { rel, files };
    }
  }
  if (!best || best.files.length === 0) return null;
  const ext = best.files[0].ext;
  const dir = best.rel === '.' ? '' : `${best.rel}/`;
  return {
    pattern: `${dir}{locale}${ext}`,
    files: best.files.map((f) => f.stem),
  };
}

/**
 * Build the static choices for the fallback path picker: the default pattern
 * plus every discoverable directory (recursive), so nested locale dirs are
 * navigable without typing a full path.
 */
function scanDirs(): PathChoice[] {
  const choices: PathChoice[] = [
    { title: DEFAULT_LOCALES_PATTERN, value: DEFAULT_LOCALES_PATTERN },
  ];
  for (const rel of walkDirs(process.cwd())) {
    choices.push({ title: rel, value: rel });
  }
  return choices;
}

export interface PathChoice {
  title: string;
  value: string;
}

/**
 * Filter the static choices for a typed input, ranked by fzf. Follows
 * antfu-collective/ni's integration: Fzf ranks the choices by relevance
 * (smart-case, subsequence matches), then the ranked results are re-mapped
 * back onto the original choices so prompts shows the right values.
 */
export function filterPaths(
  input: string,
  choices: PathChoice[],
): PathChoice[] {
  const fzf = new Fzf(choices, {
    selector: (item) => item.title,
    casing: 'case-insensitive',
    tiebreakers: [byLengthAsc],
  });
  return fzf.find(input).map((r) => r.item);
}

/**
 * Suggest paths for the autocomplete prompt.
 * - Always prepend the typed input as the first result so Enter submits it.
 * - If input has a path separator, scan that subdirectory dynamically.
 * - Otherwise fuzzy-filter the static choices with fzf.
 */
function dirSuggest(
  input: string,
  choices: { title: string; value?: string }[],
): Promise<PathChoice[]> {
  const typed: PathChoice = { title: input || '.', value: input || '.' };
  if (!input) return Promise.resolve(choices as PathChoice[]);

  if (input.includes('/')) {
    const dir = isAbsolute(input) ? input : resolve(process.cwd(), input);
    let entries: string[] = [];
    try {
      entries = readdirSync(dir).filter((name) => {
        try {
          return statSync(resolve(dir, name)).isDirectory();
        } catch {
          return false;
        }
      });
    } catch {
      /* not a dir or unreadable */
    }
    const dynamic = entries.map((name) => {
      const full = `${input.replace(/\/$/, '')}/${name}`;
      return { title: full, value: full };
    });
    return Promise.resolve([typed, ...dynamic]);
  }

  return Promise.resolve([
    typed,
    ...filterPaths(
      input,
      choices.map((c) => ({ title: c.title, value: c.value ?? c.title })),
    ),
  ]);
}

/**
 * Extract the base language from a locale code using Intl.Locale when the tag
 * is valid (pt-BR → pt, es-MX → es, zh-Hant → zh). Falls back to the segment
 * before the first `-`/`_` for codes Intl.Locale rejects — e.g. a custom
 * project code like `pt-br-x-custom` is still mapped to `pt`.
 */
function baseLocale(code: string): string {
  try {
    return new Intl.Locale(code.replace(/_/g, '-')).language;
  } catch {
    return code.split(/[-_]/)[0].toLowerCase();
  }
}

/**
 * Infer locale variants from the files on disk, matching the config pattern.
 * A variant file is `{before}{code}{after}` where `code` contains `-` or `_`
 * and `base` (its language part) differs from the code itself. The base
 * becomes the server code in localeMap:
 *   pt-br.json  →  { pt: ['pt-br'] }
 *   es_MX.json  →  { es: ['es_MX'] }
 *   zh-Hant.json →  { zh: ['zh-Hant'] }
 * The default file for a base locale (pt.json) never matches, so no mapping
 * is inferred for it — localeMap only ever overrides variants.
 *
 * ponytail: only patterns whose {locale} sits in the basename are scanned;
 * directory-form patterns ({locale}/messages.json) return {} — rare, add
 * when someone needs it.
 */
export function detectLocaleVariants(
  rootDir: string,
  localesPattern: string,
): Record<string, string[]> {
  const pattern = localesPattern.replace(/\\/g, '/');
  const dir = dirname(resolve(rootDir, pattern));
  const last = pattern.split('/').pop() ?? '';
  const [before, after] = last.split('{locale}');
  if (after === undefined) return {};

  const localeMap: Record<string, string[]> = {};
  let entries: string[] = [];
  try {
    entries = readdirSync(dir);
  } catch {
    return {};
  }

  for (const name of entries) {
    if (!name.startsWith(before) || !name.endsWith(after)) continue;
    const code = name.slice(before.length, name.length - after.length);
    if (!code.includes('-') && !code.includes('_')) continue;
    const base = baseLocale(code);
    if (base === code.toLowerCase()) continue;
    (localeMap[base] ??= []).push(code);
  }
  // readdirSync order is filesystem-dependent; sort so the generated config
  // is deterministic on every machine.
  for (const codes of Object.values(localeMap)) codes.sort();
  return localeMap;
}

const onCancel = () => {
  console.log(kleur.gray('Cancelled.'));
  process.exit(0);
};

/** fzf-ranked path prompt — the manual-entry fallback. */
async function promptPath(): Promise<string> {
  const answer = await prompts(
    {
      type: 'autocomplete',
      name: 'locales',
      message: 'Where do your translation files live?',
      initial: 0,
      choices: scanDirs(),
      hint: 'Type a path; ↑↓ to pick. {locale} = language code',
      suggest: dirSuggest,
    },
    { onCancel }
  );
  return answer.locales || DEFAULT_LOCALES_PATTERN;
}

export async function runInit(): Promise<void> {
  const cwd = process.cwd();
  const existing = findConfigFile(cwd);
  if (existing) {
    console.log(
      kleur.yellow(`✱ ${existing} already exists. Edit it directly or delete it first.`)
    );
    return;
  }

  // Auto-discover translation files anywhere under cwd. If found, ask once
  // whether to use the discovered pattern; declining (or finding nothing)
  // falls back to the fzf path prompt for manual entry.
  const discovered = discoverLocaleFiles(cwd);
  let locales: string;

  if (discovered) {
    console.log(kleur.gray(`Found ${discovered.files.length} translation file(s) → ${discovered.pattern}`));
    const useDiscovered = await prompts(
      { type: 'confirm', name: 'ok', message: `Use ${discovered.pattern}?`, initial: true },
      { onCancel }
    );
    locales = useDiscovered.ok ? discovered.pattern : await promptPath();
  } else {
    locales = await promptPath();
  }

  // Fix a bare directory path: append /{locale}.json so the CLI can resolve
  // per-language files. Without {locale}, every language resolves to the
  // same path and readFileSync throws EISDIR on the directory.
  if (!locales.includes('{locale}')) {
    locales = `${locales.replace(/\/$/, '')}/{locale}.json`;
    console.log(kleur.gray(`Added {locale}.json → ${locales}`));
  }

  // Variant mappings: server code → list of local codes, auto-detected from
  // the chosen pattern. Nothing is asked when there are no variants.
  let localeMap = detectLocaleVariants(cwd, locales);

  // If variants were detected, ask once whether to map them. Nothing is shown
  // about variants when there are none.
  if (Object.keys(localeMap).length > 0) {
    console.log();
    console.log(kleur.bold('Detected locale variants:'));
    for (const [serverCode, localCodes] of Object.entries(localeMap)) {
      for (const localCode of localCodes) {
        console.log(`  ${kleur.yellow(localCode + '.json')}  pulls from  ${kleur.gray('server ' + serverCode)}`);
      }
    }
    const variantAnswer = await prompts(
      {
        type: 'confirm',
        name: 'useVariants',
        message: 'Map these locale variants?',
        initial: true,
      },
      { onCancel }
    );
    if (!variantAnswer.useVariants) localeMap = {};
  }

  // Preview how the config will behave.
  console.log();
  console.log(kleur.bold('Preview:'));
  console.log(`  ${kleur.cyan(locales)}`);
  if (Object.keys(localeMap).length > 0) {
    for (const [serverCode, localCodes] of Object.entries(localeMap)) {
      for (const localCode of localCodes) {
        console.log(`    ${kleur.yellow(localCode + '.json')}  pulls from  ${kleur.gray('server ' + serverCode)}`);
      }
    }
    console.log(`    ${kleur.gray('(other locales use the default {locale}.json)')}`);
  } else {
    console.log(`    ${kleur.gray('(each locale writes {locale}.json)')}`);
  }
  console.log();

  const confirm = await prompts(
    {
      type: 'confirm',
      name: 'ok',
      message: 'Write this config?',
      initial: true,
    },
    { onCancel }
  );
  if (!confirm.ok) {
    console.log(kleur.gray('Cancelled.'));
    return;
  }

  const path = resolve(cwd, 'api18n.config.ts');
  if (existsSync(path)) {
    console.log(kleur.yellow(`✱ ${path} already exists. Cancelled.`));
    return;
  }
  writeFileSync(path, TEMPLATE(locales, localeMap), 'utf8');

  console.log();
  console.log(kleur.green('✓'), `created ${kleur.bold('api18n.config.ts')}`);
  console.log();
  console.log('Next steps:');
  console.log(`  ${kleur.cyan('api18n login')}    sign in with a Personal Access Token`);
  console.log(`  ${kleur.cyan('api18n pull')}     download translations to local JSON files`);
}