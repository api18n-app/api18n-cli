import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  applyServerToRaw,
  keyToJsonPath,
  readJsonFile,
  readJsonFileWithRaw,
} from './files.js';

const COMMENTED = `{
  // greeting shown at the top of the app
  "greeting": "Hi",
  "button": {
    "save": "Save", // keep the comma style
  },
  "footer": "Footer",
}
`;

describe('keyToJsonPath', () => {
  it('splits dot keys into path segments', () => {
    expect(keyToJsonPath('a.b.c')).toEqual(['a', 'b', 'c']);
  });
  it('drops empty segments from malformed keys', () => {
    expect(keyToJsonPath('a..b')).toEqual(['a', 'b']);
  });
  it('returns a single segment for a bare key', () => {
    expect(keyToJsonPath('home')).toEqual(['home']);
  });
});

describe('JSONC-tolerant read', () => {
  it('parses comments and trailing commas in readJsonFile', () => {
    const dir = mkdtempSync(join(tmpdir(), 'api18n-'));
    const path = join(dir, 'en.json');
    writeFileSync(path, COMMENTED, 'utf8');
    expect(readJsonFile(path)).toEqual({
      greeting: 'Hi',
      button: { save: 'Save' },
      footer: 'Footer',
    });
  });

  it('parses comments and trailing commas in readJsonFileWithRaw', () => {
    const dir = mkdtempSync(join(tmpdir(), 'api18n-'));
    const path = join(dir, 'en.json');
    writeFileSync(path, COMMENTED, 'utf8');
    const res = readJsonFileWithRaw(path);
    expect(res).not.toBeNull();
    expect(res!.data).toEqual({
      greeting: 'Hi',
      button: { save: 'Save' },
      footer: 'Footer',
    });
    expect(res!.raw).toBe(COMMENTED);
  });

  it('still throws on truly malformed input', () => {
    const dir = mkdtempSync(join(tmpdir(), 'api18n-'));
    const path = join(dir, 'bad.json');
    writeFileSync(path, '{"a": ', 'utf8');
    expect(() => readJsonFile(path)).toThrow(/Couldn't parse/);
  });
});

describe('applyServerToRaw', () => {
  it('edits a changed value in place, preserving comments and order', () => {
    const { text, changed } = applyServerToRaw(COMMENTED, {
      greeting: 'Hello',
      'button.save': 'Save',
      footer: 'Footer',
    })!;
    expect(changed).toBe(true);
    expect(text).toContain('"greeting": "Hello"');
    expect(text).toContain('// greeting shown at the top of the app');
    expect(text).toContain('"button": {');
    expect(text).toContain('"save": "Save", // keep the comma style');
    expect(text).toContain('"footer": "Footer"');
  });

  it('reports no change when values match', () => {
    const { text, changed } = applyServerToRaw(COMMENTED, {
      greeting: 'Hi',
      'button.save': 'Save',
      footer: 'Footer',
    })!;
    expect(changed).toBe(false);
    expect(text).toBe(COMMENTED);
  });

  it('appends new keys at the end of the object', () => {
    const { text } = applyServerToRaw(COMMENTED, {
      greeting: 'Hi',
      'button.save': 'Save',
      footer: 'Footer',
      brand: 'New',
    })!;
    expect(text).toContain('"brand": "New"');
    // existing keys keep their relative order
    const iGreeting = text.indexOf('"greeting"');
    const iButton = text.indexOf('"button"');
    const iFooter = text.indexOf('"footer"');
    expect(iGreeting).toBeLessThan(iButton);
    expect(iButton).toBeLessThan(iFooter);
    expect(text.indexOf('"brand"')).toBeGreaterThan(iFooter);
  });

  it('edits nested values in place inside their object', () => {
    const { text } = applyServerToRaw(COMMENTED, {
      greeting: 'Hi',
      'button.save': 'Saved!',
      footer: 'Footer',
    })!;
    expect(text).toContain('"save": "Saved!"');
    expect(text).toContain('"button": {');
  });

  it('returns null when a file key is absent from desired (removal case)', () => {
    const res = applyServerToRaw(COMMENTED, {
      greeting: 'Hi',
      'button.save': 'Save',
    });
    expect(res).toBeNull();
  });

  it('skips null values, treating them as removed-from-desired', () => {
    const res = applyServerToRaw(COMMENTED, {
      greeting: 'Hi',
      'button.save': 'Save',
      footer: null,
    });
    expect(res).toBeNull();
  });

  it('returns null for an empty desired map (every file key is a removal)', () => {
    expect(applyServerToRaw(COMMENTED, {})).toBeNull();
  });
});
