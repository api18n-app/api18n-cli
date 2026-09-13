import {
  LEGACY_TRANSLATION_DIFF_SCHEMA_VERSION,
  TRANSLATION_DIFF_SCHEMA_VERSION,
  type TranslationDataset,
  type TranslationDiff,
  type TranslationRow,
} from './types.js';
import {
  isStructuredTranslationValue,
  translationValueEquals,
  type TranslationValue,
  type TranslationValues,
} from './translation-values.js';

export class StructuredValuesRequireV2Error extends Error {
  constructor(public readonly key: string, public readonly languageCode: string) {
    super(
      `Structured value at "${key}" (${languageCode}) requires a dataset-v2 api18n server. Update the server or use string values.`,
    );
    this.name = 'StructuredValuesRequireV2Error';
  }
}

export interface ComputeTranslationDiffOptions {
  /** Only these locale columns are writable; omitted columns are preserved. */
  languages?: readonly string[];
}

/**
 * Compare a server-side dataset against a flat view of the local files.
 * Arrays stay atomic and JSON values compare deeply (object key order is
 * insignificant). A partial locale selection never deletes an entire row.
 */
export function computeTranslationDiff(
  server: TranslationDataset,
  localByKey: Map<string, TranslationValues>,
  options: ComputeTranslationDiffOptions = {},
): TranslationDiff {
  const serverLanguages = server.languages.map((language) => language.code);
  const serverLanguageSet = new Set(serverLanguages);
  const languages = options.languages
    ? [...new Set(options.languages)].filter((code) => serverLanguageSet.has(code))
    : serverLanguages;
  const isFullLanguageSet =
    languages.length === serverLanguages.length &&
    serverLanguages.every((code) => languages.includes(code));

  const serverByKey = new Map<string, TranslationRow>();
  for (const row of server.rows) serverByKey.set(row.key, row);

  const create: Array<{ key: string; values: TranslationValues }> = [];
  const update: Array<{
    key: string;
    changes: Array<{
      languageCode: string;
      from: TranslationValue | null;
      to: TranslationValue | null;
    }>;
  }> = [];
  const deletes: Array<{ key: string }> = [];

  for (const [key, localValues] of localByKey) {
    const serverRow = serverByKey.get(key);
    if (!serverRow) {
      const values: TranslationValues = {};
      for (const languageCode of languages) {
        const value = normalize(localValues[languageCode]);
        assertLegacyCompatible(server, key, languageCode, value);
        values[languageCode] = value;
      }
      if (Object.values(values).every((value) => value === null)) continue;
      create.push({ key, values });
      continue;
    }

    const changes: Array<{
      languageCode: string;
      from: TranslationValue | null;
      to: TranslationValue | null;
    }> = [];
    for (const languageCode of languages) {
      const local = normalize(localValues[languageCode]);
      const remote = normalize(serverRow.values[languageCode]);
      assertLegacyCompatible(server, key, languageCode, local);
      if (!translationValueEquals(local, remote)) {
        changes.push({ languageCode, from: remote, to: local });
      }
    }
    if (changes.length > 0) update.push({ key, changes });
  }

  for (const [key, serverRow] of serverByKey) {
    if (localByKey.has(key)) continue;
    if (isFullLanguageSet) {
      deletes.push({ key });
      continue;
    }

    const changes = languages.flatMap((languageCode) => {
      const remote = normalize(serverRow.values[languageCode]);
      return remote === null
        ? []
        : [{ languageCode, from: remote, to: null }];
    });
    if (changes.length > 0) update.push({ key, changes });
  }

  const common = {
    create,
    update,
    delete: deletes,
    languages,
  };
  if (server.schemaVersion === LEGACY_TRANSLATION_DIFF_SCHEMA_VERSION) {
    return {
      schemaVersion: LEGACY_TRANSLATION_DIFF_SCHEMA_VERSION,
      ...common,
    } as TranslationDiff;
  }
  return {
    schemaVersion: TRANSLATION_DIFF_SCHEMA_VERSION,
    ...common,
  };
}

function normalize(
  value: TranslationValue | null | undefined,
): TranslationValue | null {
  if (value === undefined || value === null) return null;
  if (value === '') return null;
  return value;
}

function assertLegacyCompatible(
  server: TranslationDataset,
  key: string,
  languageCode: string,
  value: TranslationValue | null,
): void {
  if (server.schemaVersion === 1 && isStructuredTranslationValue(value)) {
    throw new StructuredValuesRequireV2Error(key, languageCode);
  }
}
