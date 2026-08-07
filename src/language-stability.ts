import type { DatasetLanguage } from './types.js';

export function getExperimentalLanguageCodes(
  languages: DatasetLanguage[],
): string[] {
  return languages
    .filter((language) => language.stability === 'experimental')
    .map((language) => language.code);
}
