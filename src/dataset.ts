import { isTranslationValue } from './translation-values.js';
import type { TranslationDataset } from './types.js';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Validate the wire format before any pull/push can touch local files. Keeping
 * this at the client edge also gives future schema bumps an actionable error.
 */
export function parseTranslationDataset(value: unknown): TranslationDataset {
  if (!isRecord(value)) throw invalidDataset();
  if (value.schemaVersion !== 1 && value.schemaVersion !== 2) {
    throw new Error(
      `Unsupported translation dataset schema ${String(value.schemaVersion)}. Update @api18n/cli and retry.`,
    );
  }
  if (
    !isRecord(value.company) ||
    !isRecord(value.baseLanguage) ||
    !Array.isArray(value.languages) ||
    !Array.isArray(value.rows) ||
    typeof value.truncated !== 'boolean' ||
    typeof value.exportedAt !== 'string'
  ) {
    throw invalidDataset();
  }

  for (const row of value.rows) {
    if (!isRecord(row) || typeof row.key !== 'string' || !isRecord(row.values)) {
      throw invalidDataset();
    }
    for (const translationValue of Object.values(row.values)) {
      if (translationValue === null) continue;
      if (value.schemaVersion === 1) {
        if (typeof translationValue !== 'string') throw invalidDataset();
      } else if (!isTranslationValue(translationValue)) {
        throw invalidDataset();
      }
    }
  }

  return value as unknown as TranslationDataset;
}

export function assertDatasetIsComplete(
  dataset: TranslationDataset,
  action: 'pull' | 'push' | 'status' | 'type generation',
): void {
  if (!dataset.truncated) return;
  throw new Error(
    `The server returned a truncated translation dataset. ${action} was stopped before any local files or proposals were changed. Contact api18n support.`,
  );
}

function invalidDataset(): Error {
  return new Error(
    'The server returned an invalid translation dataset. Update @api18n/cli and retry.',
  );
}
