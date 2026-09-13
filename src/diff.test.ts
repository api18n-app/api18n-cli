import { describe, expect, it } from 'vitest';
import {
  computeTranslationDiff,
  StructuredValuesRequireV2Error,
} from './diff.js';
import {
  LEGACY_TRANSLATION_DIFF_SCHEMA_VERSION,
  TRANSLATION_DIFF_SCHEMA_VERSION,
  type TranslationDataset,
  type TranslationValues,
} from './types.js';

function makeDataset(
  rows: Array<{ key: string; values: TranslationValues }>,
  langs: string[] = ['en'],
  schemaVersion: 1 | 2 = 2,
): TranslationDataset {
  return {
    schemaVersion,
    company: { id: 'co-1', name: 'Test' },
    baseLanguage: { code: 'en', name: 'English' },
    languages: langs.map((code) => ({
      code,
      name: code.toUpperCase(),
      stability: code === 'en' ? 'stable' : 'experimental',
      isBase: code === 'en',
    })),
    rows: rows.map((row) => ({ ...row, referenceName: null })),
    truncated: false,
    exportedAt: '2026-05-09T00:00:00.000Z',
  };
}

describe('computeTranslationDiff', () => {
  it('returns an empty v2 diff when local matches the server', () => {
    const server = makeDataset([
      { key: 'a.b', values: { en: 'Hello' } },
      { key: 'a.c', values: { en: 'World' } },
    ]);
    const local = new Map([
      ['a.b', { en: 'Hello' }],
      ['a.c', { en: 'World' }],
    ]);

    const diff = computeTranslationDiff(server, local);

    expect(diff.schemaVersion).toBe(TRANSLATION_DIFF_SCHEMA_VERSION);
    expect(diff.create).toEqual([]);
    expect(diff.update).toEqual([]);
    expect(diff.delete).toEqual([]);
  });

  it('emits v1 diffs for legacy string-only datasets', () => {
    const server = makeDataset(
      [{ key: 'greeting', values: { en: 'Hi' } }],
      ['en'],
      1,
    );

    const diff = computeTranslationDiff(
      server,
      new Map([['greeting', { en: 'Hello' }]]),
    );

    expect(diff.schemaVersion).toBe(LEGACY_TRANSLATION_DIFF_SCHEMA_VERSION);
    expect(diff.update).toEqual([
      {
        key: 'greeting',
        changes: [{ languageCode: 'en', from: 'Hi', to: 'Hello' }],
      },
    ]);
  });

  it('flags creates, updates, and deletes', () => {
    const server = makeDataset([
      { key: 'changed', values: { en: 'Before' } },
      { key: 'gone', values: { en: 'Goodbye' } },
    ]);
    const local = new Map<string, TranslationValues>([
      ['changed', { en: 'After' }],
      ['new', { en: 'Fresh' }],
    ]);

    const diff = computeTranslationDiff(server, local);

    expect(diff.create).toEqual([{ key: 'new', values: { en: 'Fresh' } }]);
    expect(diff.update).toEqual([
      {
        key: 'changed',
        changes: [{ languageCode: 'en', from: 'Before', to: 'After' }],
      },
    ]);
    expect(diff.delete).toEqual([{ key: 'gone' }]);
  });

  it('preserves structured create and update values', () => {
    const server = makeDataset([
      {
        key: 'steps',
        values: { en: ['First', { label: 'Second', enabled: true }] },
      },
    ]);
    const local = new Map<string, TranslationValues>([
      ['steps', { en: ['First', { label: 'Updated', enabled: true }] }],
      ['limits', { en: 5 }],
    ]);

    const diff = computeTranslationDiff(server, local);

    expect(diff.create).toEqual([{ key: 'limits', values: { en: 5 } }]);
    expect(diff.update).toEqual([
      {
        key: 'steps',
        changes: [
          {
            languageCode: 'en',
            from: ['First', { label: 'Second', enabled: true }],
            to: ['First', { label: 'Updated', enabled: true }],
          },
        ],
      },
    ]);
  });

  it('compares nested objects deeply without depending on property order', () => {
    const server = makeDataset([
      {
        key: 'cards',
        values: { en: [{ title: 'One', meta: { rank: 1, active: true } }] },
      },
    ]);
    const local = new Map<string, TranslationValues>([
      ['cards', { en: [{ meta: { active: true, rank: 1 }, title: 'One' }] }],
    ]);

    expect(computeTranslationDiff(server, local).update).toEqual([]);
  });

  it('treats array order as meaningful', () => {
    const server = makeDataset([
      { key: 'steps', values: { en: ['First', 'Second'] } },
    ]);
    const local = new Map<string, TranslationValues>([
      ['steps', { en: ['Second', 'First'] }],
    ]);

    expect(computeTranslationDiff(server, local).update).toHaveLength(1);
  });

  it('refuses structured pushes against a v1 dataset', () => {
    const server = makeDataset([], ['en'], 1);
    const local = new Map<string, TranslationValues>([
      ['steps', { en: ['First', 'Second'] }],
    ]);

    expect(() => computeTranslationDiff(server, local)).toThrow(
      StructuredValuesRequireV2Error,
    );
  });

  it('treats null and empty string as the same missing value', () => {
    const server = makeDataset(
      [{ key: 'optional', values: { en: 'A', pt: null } }],
      ['en', 'pt'],
    );
    const local = new Map<string, TranslationValues>([
      ['optional', { en: 'A', pt: '' }],
    ]);

    expect(computeTranslationDiff(server, local).update).toEqual([]);
  });

  it('does not create a row that is entirely null locally', () => {
    const server = makeDataset([], ['en', 'pt']);
    const local = new Map<string, TranslationValues>([
      ['empty.key', { en: null, pt: null }],
    ]);

    expect(computeTranslationDiff(server, local).create).toEqual([]);
  });

  it('only writes included languages and preserves excluded columns', () => {
    const server = makeDataset(
      [
        { key: 'changed', values: { en: 'Before', pt: 'Antes' } },
        { key: 'missing-locally', values: { en: 'Delete me', pt: 'Keep me' } },
      ],
      ['en', 'pt'],
    );
    const local = new Map<string, TranslationValues>([
      ['changed', { en: 'After' }],
    ]);

    const diff = computeTranslationDiff(server, local, { languages: ['en'] });

    expect(diff.languages).toEqual(['en']);
    expect(diff.update).toEqual([
      {
        key: 'changed',
        changes: [{ languageCode: 'en', from: 'Before', to: 'After' }],
      },
      {
        key: 'missing-locally',
        changes: [{ languageCode: 'en', from: 'Delete me', to: null }],
      },
    ]);
    expect(diff.delete).toEqual([]);
  });

  it('removes entire rows only when every server language is writable', () => {
    const server = makeDataset(
      [{ key: 'gone', values: { en: 'Bye', pt: 'Tchau' } }],
      ['en', 'pt'],
    );

    expect(computeTranslationDiff(server, new Map()).delete).toEqual([
      { key: 'gone' },
    ]);
  });
});
