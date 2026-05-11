import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

/**
 * Build a nested object from flat dot-notation keys.
 *   { "a.b.c": "x" }  →  { a: { b: { c: "x" } } }
 *
 * Null / undefined values are skipped so missing translations don't end up
 * as JSON nulls in the output.
 */
export function unflatten(entries: Record<string, string | null>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(entries)) {
    if (value === null || value === undefined) continue;
    const segments = key.split('.').filter((s) => s.length > 0);
    if (segments.length === 0) continue;
    let cursor: Record<string, unknown> = out;
    for (let i = 0; i < segments.length - 1; i++) {
      const segment = segments[i];
      const next = cursor[segment];
      if (typeof next !== 'object' || next === null || Array.isArray(next)) {
        cursor[segment] = {};
      }
      cursor = cursor[segment] as Record<string, unknown>;
    }
    cursor[segments[segments.length - 1]] = value;
  }
  return out;
}

/**
 * Inverse of unflatten — used by `push` later.
 *   { a: { b: { c: "x" } } }  →  { "a.b.c": "x" }
 */
export function flatten(
  obj: Record<string, unknown>,
  prefix = '',
  out: Record<string, string> = {}
): Record<string, string> {
  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (value === null || value === undefined) continue;
    if (typeof value === 'object' && !Array.isArray(value)) {
      flatten(value as Record<string, unknown>, fullKey, out);
    } else if (typeof value === 'string') {
      out[fullKey] = value;
    } else {
      out[fullKey] = String(value);
    }
  }
  return out;
}

/** Replace `{locale}` placeholder in a path pattern. */
export function buildLocalePath(rootDir: string, pattern: string, locale: string): string {
  return resolve(rootDir, pattern.replace(/\{locale\}/g, locale));
}

export function readJsonFile(path: string): Record<string, unknown> | null {
  if (!existsSync(path)) return null;
  try {
    const raw = readFileSync(path, 'utf8');
    if (raw.trim().length === 0) return {};
    return JSON.parse(raw) as Record<string, unknown>;
  } catch (err) {
    throw new Error(
      `Couldn't parse ${path}: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}

export function writeJsonFile(path: string, content: Record<string, unknown>): void {
  mkdirSync(dirname(path), { recursive: true });
  const json = JSON.stringify(content, null, 2) + '\n';
  writeFileSync(path, json, 'utf8');
}
