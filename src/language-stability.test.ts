import { describe, expect, it } from 'vitest';
import { getExperimentalLanguageCodes } from './language-stability.js';

describe('getExperimentalLanguageCodes', () => {
  it('returns only registered experimental locales', () => {
    expect(
      getExperimentalLanguageCodes([
        { code: 'en', name: 'English', stability: 'stable', isBase: true },
        { code: 'pt-br', name: 'Brazilian Portuguese', stability: 'experimental', isBase: false },
      ]),
    ).toEqual(['pt-br']);
  });
});
