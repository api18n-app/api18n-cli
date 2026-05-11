import {
  TRANSLATION_DIFF_SCHEMA_VERSION,
  type TranslationDataset,
  type TranslationDiff,
  type TranslationRow,
} from './types.js';

/**
 * Compare a server-side dataset against a flat view of the local files.
 * Both sides are { key → values-by-language }; this function returns the
 * minimal set of create/update/delete operations needed to make the
 * server match local.
 *
 * `localByKey` should hold one entry per key, with values keyed by the
 * same language codes the server uses. Missing values (`null` /
 * `undefined`) on either side compare equal when they represent
 * "no value".
 */
export function computeTranslationDiff(
  server: TranslationDataset,
  localByKey: Map<string, Record<string, string | null>>,
): TranslationDiff {
  const languages = server.languages.map((l) => l.code);
  const langSet = new Set(languages);

  const serverByKey = new Map<string, TranslationRow>();
  for (const row of server.rows) serverByKey.set(row.key, row);

  const create: TranslationDiff['create'] = [];
  const update: TranslationDiff['update'] = [];
  const deletes: TranslationDiff['delete'] = [];

  // Walk local keys
  for (const [key, localValues] of localByKey) {
    const serverRow = serverByKey.get(key);
    if (!serverRow) {
      // New key on local side → create.
      const values: Record<string, string | null> = {};
      for (const lang of languages) values[lang] = normalize(localValues[lang]);
      // Skip if it's all-empty for some reason.
      if (Object.values(values).every((v) => v === null)) continue;
      create.push({ key, values });
      continue;
    }
    const changes: TranslationDiff['update'][number]['changes'] = [];
    for (const lang of languages) {
      const local = normalize(localValues[lang]);
      const remote = normalize(serverRow.values[lang]);
      if (local !== remote) {
        changes.push({ languageCode: lang, from: remote, to: local });
      }
    }
    if (changes.length > 0) update.push({ key, changes });
  }

  // Server keys missing locally → delete
  for (const [key] of serverByKey) {
    if (!localByKey.has(key)) deletes.push({ key });
  }

  return {
    schemaVersion: TRANSLATION_DIFF_SCHEMA_VERSION,
    create,
    update,
    delete: deletes,
    languages: languages.filter((l) => langSet.has(l)),
  };
}

function normalize(value: string | null | undefined): string | null {
  if (value === undefined || value === null) return null;
  if (value === '') return null;
  return value;
}
