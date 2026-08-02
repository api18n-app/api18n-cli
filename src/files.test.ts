import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  detectIndent,
  flatten,
  mergePreservingOrder,
  readJsonFile,
  readJsonFileWithRaw,
  unflatten,
} from './files.js';

describe('flatten', () => {
  it('produces dot-notation keys from nested objects', () => {
    expect(flatten({ a: { b: { c: 'x' } } })).toEqual({ 'a.b.c': 'x' });
  });

  it('handles multiple branches at each level', () => {
    expect(
      flatten({ a: { b: 'B', c: { d: 'D' } }, e: 'E' }),
    ).toEqual({
      'a.b': 'B',
      'a.c.d': 'D',
      e: 'E',
    });
  });

  it('skips null and undefined leaves', () => {
    expect(flatten({ a: 'A', b: null as unknown as string, c: undefined as unknown as string })).toEqual({
      a: 'A',
    });
  });

  it('stringifies non-string primitives at leaves', () => {
    expect(flatten({ count: 7 as unknown as string })).toEqual({ count: '7' });
  });

  it('returns an empty object for an empty input', () => {
    expect(flatten({})).toEqual({});
  });
});

describe('unflatten', () => {
  it('reconstructs nested objects from dot keys', () => {
    expect(unflatten({ 'a.b.c': 'x' })).toEqual({ a: { b: { c: 'x' } } });
  });

  it('merges multiple branches under shared prefixes', () => {
    expect(unflatten({ 'a.b': 'B', 'a.c.d': 'D' })).toEqual({
      a: { b: 'B', c: { d: 'D' } },
    });
  });

  it('drops null values entirely', () => {
    expect(unflatten({ a: 'A', b: null })).toEqual({ a: 'A' });
  });

  it('strips empty segments from malformed keys', () => {
    expect(unflatten({ 'a..b': 'x' })).toEqual({ a: { b: 'x' } });
  });

  it('round-trips through flatten without loss', () => {
    const original = {
      button: { cancel: 'Cancel', save: 'Save' },
      app: { title: 'Hello', meta: { author: 'Eduardo' } },
    };
    expect(unflatten(flatten(original))).toEqual(original);
  });
});

describe('readJsonFile', () => {
  it('returns null for a directory instead of throwing EISDIR', () => {
    const dir = mkdtempSync(join(tmpdir(), 'api18n-'));
    expect(readJsonFile(dir)).toBeNull();
  });

  it('returns null for a missing path', () => {
    expect(readJsonFile(join(tmpdir(), 'api18n-does-not-exist.json'))).toBeNull();
  });
});

describe('readJsonFileWithRaw', () => {
  it('returns null for a directory instead of throwing EISDIR', () => {
    const dir = mkdtempSync(join(tmpdir(), 'api18n-'));
    expect(readJsonFileWithRaw(dir)).toBeNull();
  });

  it('returns null for a missing path', () => {
    expect(readJsonFileWithRaw(join(tmpdir(), 'api18n-does-not-exist.json'))).toBeNull();
  });

  it('returns { data, raw } with raw including the trailing newline', () => {
    const dir = mkdtempSync(join(tmpdir(), 'api18n-'));
    const path = join(dir, 'en.json');
    writeFileSync(path, '{\n  "a": "1"\n}\n', 'utf8');
    const res = readJsonFileWithRaw(path);
    expect(res).not.toBeNull();
    expect(res!.data).toEqual({ a: '1' });
    expect(res!.raw).toBe('{\n  "a": "1"\n}\n');
  });

  it('returns { data, raw } without a trailing newline when the file has none', () => {
    const dir = mkdtempSync(join(tmpdir(), 'api18n-'));
    const path = join(dir, 'en.json');
    writeFileSync(path, '{\n  "a": "1"\n}', 'utf8');
    const res = readJsonFileWithRaw(path);
    expect(res).not.toBeNull();
    expect(res!.raw).toBe('{\n  "a": "1"\n}');
  });
});

describe('detectIndent', () => {
  it('detects 2-space indentation', () => {
    expect(detectIndent('{\n  "a": "1"\n}\n')).toBe('  ');
  });

  it('detects 4-space indentation', () => {
    expect(detectIndent('{\n    "a": "1"\n}\n')).toBe('    ');
  });

  it('detects tab indentation', () => {
    expect(detectIndent('{\n\t"a": "1"\n}\n')).toBe('\t');
  });

  it('falls back to 2-space for an empty file', () => {
    expect(detectIndent('')).toBe('  ');
  });

  it('falls back to 2-space for a single-line file with no indent', () => {
    expect(detectIndent('{}')).toBe('  ');
  });
});

describe('mergePreservingOrder', () => {
  it('preserves existing key order when only values change', () => {
    const existing = { z: '1', a: '2', m: '3' };
    const incoming = { a: '2', m: '3-changed', z: '1' };
    const { result, changed } = mergePreservingOrder(existing, incoming);
    expect(Object.keys(result)).toEqual(['z', 'a', 'm']);
    expect(result).toEqual({ z: '1', a: '2', m: '3-changed' });
    expect(changed).toBe(true);
  });

  it('reports no change when values are identical even if order differs', () => {
    const existing = { z: '1', a: '2' };
    const incoming = { a: '2', z: '1' };
    const { result, changed } = mergePreservingOrder(existing, incoming);
    expect(Object.keys(result)).toEqual(['z', 'a']);
    expect(changed).toBe(false);
  });

  it('appends new keys from incoming in incoming order', () => {
    const existing = { a: '1' };
    const incoming = { a: '1', c: '3', b: '2' };
    const { result, changed } = mergePreservingOrder(existing, incoming);
    expect(Object.keys(result)).toEqual(['a', 'c', 'b']);
    expect(changed).toBe(true);
  });

  it('drops keys removed from incoming', () => {
    const existing = { a: '1', b: '2' };
    const incoming = { a: '1' };
    const { result, changed } = mergePreservingOrder(existing, incoming);
    expect(Object.keys(result)).toEqual(['a']);
    expect(changed).toBe(true);
  });

  it('recurses into nested objects preserving inner order', () => {
    const existing = { button: { z: '1', a: '2' }, top: 'x' };
    const incoming = { top: 'x', button: { a: '2', z: '1-changed' } };
    const { result, changed } = mergePreservingOrder(existing, incoming);
    expect(Object.keys(result)).toEqual(['button', 'top']);
    expect(Object.keys(result.button as object)).toEqual(['z', 'a']);
    expect(changed).toBe(true);
  });

  it('reports no change when nested values are identical even if inner order differs', () => {
    const existing = { button: { z: '1', a: '2' }, top: 'x' };
    const incoming = { top: 'x', button: { a: '2', z: '1' } };
    const { result, changed } = mergePreservingOrder(existing, incoming);
    expect(Object.keys(result)).toEqual(['button', 'top']);
    expect(Object.keys(result.button as object)).toEqual(['z', 'a']);
    expect(changed).toBe(false);
  });

  it('returns incoming unchanged when existing is null', () => {
    const incoming = { a: '1' };
    const { result, changed } = mergePreservingOrder(null, incoming);
    expect(result).toBe(incoming);
    expect(changed).toBe(true);
  });
});
