import { describe, it, expect } from 'vitest';
import { flatten, unflatten } from './files.js';

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
