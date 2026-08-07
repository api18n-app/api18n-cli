import { describe, it, expect } from 'vitest';
import { computeTranslationDiff } from './diff.js';
import { TRANSLATION_DIFF_SCHEMA_VERSION, type TranslationDataset } from './types.js';

function makeDataset(rows: Array<{ key: string; values: Record<string, string | null> }>, langs: string[] = ['en']): TranslationDataset {
  return {
    schemaVersion: 1,
    company: { id: 'co-1', name: 'Test' },
    baseLanguage: { code: 'en', name: 'English' },
    languages: langs.map((code) => ({
      code,
      name: code.toUpperCase(),
      stability: code === 'en' ? 'stable' : 'experimental',
      isBase: code === 'en',
    })),
    rows: rows.map((r) => ({ key: r.key, referenceName: null, values: r.values })),
    truncated: false,
    exportedAt: '2026-05-09T00:00:00.000Z',
  };
}

describe('computeTranslationDiff', () => {
  it('returns an empty diff when local matches the server', () => {
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

  it('flags new local-only keys as creates', () => {
    const server = makeDataset([{ key: 'existing', values: { en: 'Hi' } }]);
    const local = new Map([
      ['existing', { en: 'Hi' }],
      ['brand-new', { en: 'Fresh' }],
    ]);
    const diff = computeTranslationDiff(server, local);
    expect(diff.create).toEqual([
      { key: 'brand-new', values: { en: 'Fresh' } },
    ]);
    expect(diff.update).toEqual([]);
    expect(diff.delete).toEqual([]);
  });

  it('flags removed local keys as deletes', () => {
    const server = makeDataset([
      { key: 'gone', values: { en: 'Goodbye' } },
      { key: 'stay', values: { en: 'Here' } },
    ]);
    const local = new Map([['stay', { en: 'Here' }]]);
    const diff = computeTranslationDiff(server, local);
    expect(diff.delete).toEqual([{ key: 'gone' }]);
    expect(diff.create).toEqual([]);
    expect(diff.update).toEqual([]);
  });

  it('flags changed values as updates with before/after per language', () => {
    const server = makeDataset(
      [{ key: 'greeting', values: { en: 'Hi', pt: 'Olá' } }],
      ['en', 'pt'],
    );
    const local = new Map([['greeting', { en: 'Hello', pt: 'Olá' }]]);
    const diff = computeTranslationDiff(server, local);
    expect(diff.update).toEqual([
      {
        key: 'greeting',
        changes: [{ languageCode: 'en', from: 'Hi', to: 'Hello' }],
      },
    ]);
    expect(diff.create).toEqual([]);
    expect(diff.delete).toEqual([]);
  });

  it('treats null and empty string as the same "no value"', () => {
    const server = makeDataset(
      [{ key: 'optional', values: { en: 'A', pt: null } }],
      ['en', 'pt'],
    );
    const local = new Map([['optional', { en: 'A', pt: '' }]]);
    const diff = computeTranslationDiff(server, local);
    expect(diff.update).toEqual([]);
  });

  it("doesn't create a row that is entirely null on local", () => {
    const server = makeDataset([], ['en', 'pt']);
    const local = new Map<string, Record<string, string | null>>([
      ['empty.key', { en: null, pt: null }],
    ]);
    const diff = computeTranslationDiff(server, local);
    expect(diff.create).toEqual([]);
  });

  it('handles multi-language updates touching only some columns', () => {
    const server = makeDataset(
      [{ key: 'k', values: { en: 'A', pt: 'B', es: 'C' } }],
      ['en', 'pt', 'es'],
    );
    const local = new Map([['k', { en: 'A', pt: 'B-new', es: 'C-new' }]]);
    const diff = computeTranslationDiff(server, local);
    expect(diff.update).toHaveLength(1);
    const changes = diff.update[0].changes.map((c) => c.languageCode).sort();
    expect(changes).toEqual(['es', 'pt']);
  });

  it('preserves the languages list from the server in the resulting diff', () => {
    const server = makeDataset([], ['en', 'pt', 'es']);
    const local = new Map<string, Record<string, string | null>>();
    const diff = computeTranslationDiff(server, local);
    expect(diff.languages).toEqual(['en', 'pt', 'es']);
  });

  it('treats missing local language as a delete to the value (null → no change if server is also null)', () => {
    const server = makeDataset(
      [{ key: 'k', values: { en: 'A', pt: 'B' } }],
      ['en', 'pt'],
    );
    // Local has en only — pt is absent (undefined), which normalize() treats as null
    const local = new Map([['k', { en: 'A' }]]);
    const diff = computeTranslationDiff(server, local);
    // pt: was "B", local is undefined → null → from "B" to null
    expect(diff.update).toEqual([
      {
        key: 'k',
        changes: [{ languageCode: 'pt', from: 'B', to: null }],
      },
    ]);
  });
});
