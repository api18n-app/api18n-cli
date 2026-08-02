import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { discoverLocaleFiles, walkDirs } from './commands/init.js';

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'api18n-discovery-'));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('discoverLocaleFiles', () => {
  it('finds locale files nested three levels deep and infers the pattern', () => {
    const nested = join(dir, 'src/i18n/dictionaries');
    mkdirSync(nested, { recursive: true });
    writeFileSync(join(nested, 'pt-br.json'), '{}');
    writeFileSync(join(nested, 'en.json'), '{}');
    writeFileSync(join(nested, 'es.json'), '{}');

    const result = discoverLocaleFiles(dir);
    expect(result).not.toBeNull();
    expect(result!.pattern).toBe('src/i18n/dictionaries/{locale}.json');
    expect(result!.files.sort()).toEqual(['en', 'es', 'pt-br']);
  });

  it('finds locale files at the project root', () => {
    writeFileSync(join(dir, 'pt-br.json'), '{}');
    writeFileSync(join(dir, 'en.json'), '{}');

    const result = discoverLocaleFiles(dir);
    expect(result).not.toBeNull();
    expect(result!.pattern).toBe('{locale}.json');
    expect(result!.files.sort()).toEqual(['en', 'pt-br']);
  });

  it('ignores non-locale filenames like package.json and index.json', () => {
    writeFileSync(join(dir, 'package.json'), '{}');
    writeFileSync(join(dir, 'index.json'), '{}');
    writeFileSync(join(dir, 'tsconfig.json'), '{}');

    expect(discoverLocaleFiles(dir)).toBeNull();
  });

  it('skips node_modules and dist', () => {
    const nm = join(dir, 'node_modules/pkg');
    mkdirSync(nm, { recursive: true });
    writeFileSync(join(nm, 'pt-br.json'), '{}');
    const dist = join(dir, 'dist');
    mkdirSync(dist);
    writeFileSync(join(dist, 'en.json'), '{}');

    expect(discoverLocaleFiles(dir)).toBeNull();
  });

  it('picks the directory with the most locale files', () => {
    mkdirSync(join(dir, 'a'), { recursive: true });
    writeFileSync(join(dir, 'a', 'en.json'), '{}');
    const b = join(dir, 'b');
    mkdirSync(b);
    writeFileSync(join(b, 'en.json'), '{}');
    writeFileSync(join(b, 'pt-br.json'), '{}');
    writeFileSync(join(b, 'es.json'), '{}');

    const result = discoverLocaleFiles(dir);
    expect(result!.pattern).toBe('b/{locale}.json');
  });

  it('returns null when no locale-like files exist', () => {
    mkdirSync(join(dir, 'src'));
    writeFileSync(join(dir, 'src', 'readme.md'), 'hi');
    expect(discoverLocaleFiles(dir)).toBeNull();
  });

  it('supports .jsonc extension', () => {
    writeFileSync(join(dir, 'pt-br.jsonc'), '{}');
    const result = discoverLocaleFiles(dir);
    expect(result!.pattern).toBe('{locale}.jsonc');
  });
});

describe('walkDirs', () => {
  it('lists nested directories relative to root, sorted', () => {
    mkdirSync(join(dir, 'src/i18n/dictionaries'), { recursive: true });
    mkdirSync(join(dir, 'locales'));
    mkdirSync(join(dir, 'node_modules/pkg'), { recursive: true });

    expect(walkDirs(dir)).toEqual(['locales', 'src', 'src/i18n', 'src/i18n/dictionaries']);
  });

  it('skips hidden directories', () => {
    mkdirSync(join(dir, '.git'));
    mkdirSync(join(dir, '.cache'));
    mkdirSync(join(dir, 'real'));

    expect(walkDirs(dir)).toEqual(['real']);
  });
});