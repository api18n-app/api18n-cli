import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { detectLocaleVariants } from './commands/init.js';

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'api18n-init-variants-'));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('detectLocaleVariants', () => {
  it('maps variant files to their base server locale', () => {
    const messages = join(dir, 'messages');
    mkdirSync(messages);
    writeFileSync(join(messages, 'pt.json'), '{}');
    writeFileSync(join(messages, 'pt-br.json'), '{}');
    writeFileSync(join(messages, 'es.json'), '{}');
    writeFileSync(join(messages, 'es_MX.json'), '{}');
    writeFileSync(join(messages, 'en.json'), '{}');

    expect(detectLocaleVariants(dir, 'messages/{locale}.json')).toEqual({
      pt: ['pt-br'],
      es: ['es_MX'],
    });
  });

  it('returns nothing when only base locales exist', () => {
    const messages = join(dir, 'messages');
    mkdirSync(messages);
    writeFileSync(join(messages, 'pt.json'), '{}');
    writeFileSync(join(messages, 'en.json'), '{}');

    expect(detectLocaleVariants(dir, 'messages/{locale}.json')).toEqual({});
  });

  it('returns nothing for an empty directory', () => {
    mkdirSync(join(dir, 'messages'));
    expect(detectLocaleVariants(dir, 'messages/{locale}.json')).toEqual({});
  });

  it('returns nothing when the pattern has no {locale} placeholder', () => {
    writeFileSync(join(dir, 'pt-br.json'), '{}');

    expect(detectLocaleVariants(dir, 'messages.json')).toEqual({});
  });

  it('scans the directory holding the locale files, not the root', () => {
    const nested = join(dir, 'locales');
    mkdirSync(nested);
    writeFileSync(join(nested, 'pt.json'), '{}');
    writeFileSync(join(nested, 'pt-br.json'), '{}');

    expect(detectLocaleVariants(dir, 'locales/{locale}.json')).toEqual({
      pt: ['pt-br'],
    });
  });

  it('maps region variants to their language via Intl.Locale', () => {
    const messages = join(dir, 'messages');
    mkdirSync(messages);
    writeFileSync(join(messages, 'pt-PT.json'), '{}');
    writeFileSync(join(messages, 'en-GB.json'), '{}');
    writeFileSync(join(messages, 'zh-TW.json'), '{}');

    expect(detectLocaleVariants(dir, 'messages/{locale}.json')).toEqual({
      pt: ['pt-PT'],
      en: ['en-GB'],
      zh: ['zh-TW'],
    });
  });

  it('maps script variants (zh-Hant) to the language, not the script', () => {
    const messages = join(dir, 'messages');
    mkdirSync(messages);
    writeFileSync(join(messages, 'zh-Hant.json'), '{}');
    writeFileSync(join(messages, 'zh-Hans.json'), '{}');

    expect(detectLocaleVariants(dir, 'messages/{locale}.json')).toEqual({
      zh: ['zh-Hans', 'zh-Hant'],
    });
  });

  it('groups multiple variants of the same language under one server code', () => {
    const messages = join(dir, 'messages');
    mkdirSync(messages);
    writeFileSync(join(messages, 'pt-br.json'), '{}');
    writeFileSync(join(messages, 'pt-PT.json'), '{}');

    expect(detectLocaleVariants(dir, 'messages/{locale}.json')).toEqual({
      pt: ['pt-PT', 'pt-br'],
    });
  });
});
