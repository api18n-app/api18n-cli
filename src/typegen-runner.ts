import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve, relative } from 'node:path';
import { inferSchemas, renderMessagesDts } from './typegen.js';
import type { ResolvedConfig } from './config.js';
import type { TranslationDataset, DatasetLanguage, TranslationRow } from './types.js';

export interface TypegenWriteResult {
  outPath: string;
  keyCount: number;
  baseLocale: string;
}

/**
 * Generate `messages.d.ts` from a TranslationDataset and write it to disk.
 * Returns metadata about what was written; throws if no usable base locale is found.
 */
export function writeTypes(config: ResolvedConfig, dataset: TranslationDataset): TypegenWriteResult {
  const baseLocale = pickBaseLocale(config, dataset);
  const flat: Record<string, string | null> = {};
  for (const row of dataset.rows as TranslationRow[]) {
    flat[row.key] = row.values[baseLocale] ?? null;
  }
  const schemas = inferSchemas(flat);
  const source = renderMessagesDts(schemas);
  const outPath = resolve(config.rootDir, config.typegen.out);
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, source, 'utf8');
  return { outPath, keyCount: schemas.length, baseLocale };
}

function pickBaseLocale(config: ResolvedConfig, dataset: TranslationDataset): string {
  const explicit = config.typegen.baseLocale;
  if (explicit) {
    const exists = dataset.languages.some((l: DatasetLanguage) => l.code === explicit);
    if (!exists) {
      throw new Error(
        `typegen.baseLocale "${explicit}" is not in the dataset (available: ${dataset.languages.map((l) => l.code).join(', ')})`,
      );
    }
    return explicit;
  }
  const base = dataset.languages.find((l: DatasetLanguage) => l.isBase);
  if (base) return base.code;
  const first = dataset.languages[0];
  if (!first) {
    throw new Error('No languages in dataset — cannot generate types.');
  }
  return first.code;
}

export function relativeOut(config: ResolvedConfig): string {
  return relative(process.cwd(), resolve(config.rootDir, config.typegen.out));
}
