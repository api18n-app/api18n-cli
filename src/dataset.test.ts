import { describe, expect, it } from 'vitest';
import {
  assertDatasetIsComplete,
  parseTranslationDataset,
} from './dataset.js';

function dataset(
  schemaVersion: 1 | 2,
  value: unknown,
  truncated = false,
): unknown {
  return {
    schemaVersion,
    company: { id: 'co-1', name: 'Test' },
    baseLanguage: { code: 'en', name: 'English' },
    languages: [],
    rows: [
      {
        key: 'value',
        referenceName: null,
        values: { en: value },
      },
    ],
    truncated,
    exportedAt: '2026-09-13T00:00:00.000Z',
  };
}

describe('parseTranslationDataset', () => {
  it('accepts recursive structured values in v2', () => {
    const value = [
      'First',
      { label: 'Second', flags: [true, false], metadata: { rank: 2 } },
    ];

    expect(parseTranslationDataset(dataset(2, value)).rows[0]?.values.en).toEqual(
      value,
    );
  });

  it('accepts string values in v1', () => {
    expect(parseTranslationDataset(dataset(1, 'Hello')).schemaVersion).toBe(1);
  });

  it('rejects structured values in v1 instead of coercing them', () => {
    expect(() => parseTranslationDataset(dataset(1, ['First']))).toThrow(
      'invalid translation dataset',
    );
  });

  it('rejects non-finite and plain-object top-level values in v2', () => {
    expect(() => parseTranslationDataset(dataset(2, Number.POSITIVE_INFINITY))).toThrow(
      'invalid translation dataset',
    );
    expect(() => parseTranslationDataset(dataset(2, { label: 'Not a namespace' }))).toThrow(
      'invalid translation dataset',
    );
  });
});

describe('assertDatasetIsComplete', () => {
  it('hard-stops mutations when the dataset is truncated', () => {
    const parsed = parseTranslationDataset(dataset(2, 'Hello', true));

    expect(() => assertDatasetIsComplete(parsed, 'push')).toThrow(
      'push was stopped before any local files or proposals were changed',
    );
  });
});
