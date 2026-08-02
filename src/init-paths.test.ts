import { describe, expect, it } from 'vitest';
import { filterPaths, type PathChoice } from './commands/init.js';

const CHOICES: PathChoice[] = [
  { title: 'messages/{locale}.json', value: 'messages/{locale}.json' },
  { title: 'src', value: 'src' },
  { title: 'locales', value: 'locales' },
  { title: 'assets', value: 'assets' },
];

describe('filterPaths', () => {
  it('matches subsequences, not just prefixes', () => {
    expect(filterPaths('mes', CHOICES).map((c) => c.value)).toEqual([
      'messages/{locale}.json',
    ]);
  });

  it('matches mid-path fragments', () => {
    expect(filterPaths('src', CHOICES).map((c) => c.value)).toEqual(['src']);
  });

  it('is case-insensitive', () => {
    expect(filterPaths('MES', CHOICES).map((c) => c.value)).toEqual([
      'messages/{locale}.json',
    ]);
  });

  it('returns everything for an empty query', () => {
    expect(filterPaths('', CHOICES).length).toBe(CHOICES.length);
  });
});
