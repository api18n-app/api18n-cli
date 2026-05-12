import { describe, it, expect } from 'vitest';
import { inferSchemas, renderMessagesDts } from './typegen.js';

describe('inferSchemas', () => {
  it('returns sorted keys with empty args for static strings', () => {
    const out = inferSchemas({ 'button.save': 'Save', 'button.cancel': 'Cancel' });
    expect(out).toEqual([
      { key: 'button.cancel', raw: 'Cancel', args: [] },
      { key: 'button.save', raw: 'Save', args: [] },
    ]);
  });

  it('infers string | number for plain {var}', () => {
    const out = inferSchemas({ hello: 'Hello {name}' });
    expect(out[0]!.args).toEqual([{ name: 'name', tsType: 'string | number' }]);
  });

  it('infers number for plural args', () => {
    const out = inferSchemas({
      items: '{count, plural, one {# item} other {# items}}',
    });
    expect(out[0]!.args).toEqual([{ name: 'count', tsType: 'number' }]);
  });

  it('infers Date | number for date args', () => {
    const out = inferSchemas({ placed: 'Placed on {when, date, long}' });
    expect(out[0]!.args).toEqual([{ name: 'when', tsType: 'Date | number' }]);
  });

  it('infers number for number args', () => {
    const out = inferSchemas({ balance: '{amount, number, ::currency/USD}' });
    expect(out[0]!.args).toEqual([{ name: 'amount', tsType: 'number' }]);
  });

  it('infers a ReactNode callback for tags', () => {
    const out = inferSchemas({ agreement: 'Read our <link>terms</link>' });
    expect(out[0]!.args).toEqual([{ name: 'link', tsType: '(chunks: ReactNode) => ReactNode' }]);
  });

  it('combines multiple distinct args in one message', () => {
    const out = inferSchemas({
      mixed: '{greeting}, you have {count, plural, one {# new message} other {# new messages}}',
    });
    expect(out[0]!.args).toEqual([
      { name: 'count', tsType: 'number' },
      { name: 'greeting', tsType: 'string | number' },
    ]);
  });

  it('keeps the most specific type when the same name appears twice', () => {
    const out = inferSchemas({ k: '{count} of {count, plural, one {1} other {many}}' });
    expect(out[0]!.args).toEqual([{ name: 'count', tsType: 'number' }]);
  });

  it('skips null values silently', () => {
    const out = inferSchemas({ withVal: 'Hi', missing: null });
    expect(out).toHaveLength(1);
    expect(out[0]!.key).toBe('withVal');
  });

  it('falls back to empty args for unparseable messages', () => {
    // Unclosed brace is malformed ICU MessageFormat.
    const out = inferSchemas({ broken: 'Hello {name' });
    expect(out[0]).toEqual({ key: 'broken', raw: 'Hello {name', args: [] });
  });
});

describe('renderMessagesDts', () => {
  it('emits module augmentation with __raw and args', () => {
    const out = renderMessagesDts([
      { key: 'hello', raw: 'Hello {name}', args: [{ name: 'name', tsType: 'string | number' }] },
    ]);
    expect(out).toContain("import 'api18n';");
    expect(out).toContain("declare module 'api18n' {");
    expect(out).toContain('interface Messages {');
    expect(out).toContain("hello: { __raw: 'Hello {name}'; name: string | number };");
  });

  it('quotes keys with dots and includes ReactNode import only when needed', () => {
    const out = renderMessagesDts([
      { key: 'button.save', raw: 'Save', args: [] },
      {
        key: 'agreement',
        raw: 'Read our <link>terms</link>',
        args: [{ name: 'link', tsType: '(chunks: ReactNode) => ReactNode' }],
      },
    ]);
    expect(out).toContain("import type { ReactNode } from 'react';");
    expect(out).toContain("'button.save': { __raw: 'Save' };");
    expect(out).toContain("agreement: { __raw: 'Read our <link>terms</link>'; link: (chunks: ReactNode) => ReactNode };");
  });

  it('omits the React import when no tag args are present', () => {
    const out = renderMessagesDts([
      { key: 'plain', raw: 'Plain', args: [] },
    ]);
    expect(out).not.toContain('ReactNode');
  });

  it('escapes single quotes in raw messages', () => {
    const out = renderMessagesDts([
      { key: 'apos', raw: "It's fine", args: [] },
    ]);
    expect(out).toContain("__raw: 'It\\'s fine'");
  });
});
