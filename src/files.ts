import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import {
  applyEdits,
  findNodeAtLocation,
  getNodeValue,
  modify,
  parse as parseJsonc,
  parseTree,
  printParseErrorCode,
  type Edit,
  type ParseError,
} from 'jsonc-parser';

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

const JSONC_PARSE_OPTIONS = {
  allowTrailingComma: true,
  disallowComments: false,
} as const;

export function readJsonFile(path: string): Record<string, unknown> | null {
  // ponytail: isFile() guard — without it, a directory at this path throws EISDIR
  if (!existsSync(path) || !statSync(path).isFile()) return null;
  const raw = readFileSync(path, 'utf8');
  if (raw.trim().length === 0) return {};
  const errors: ParseError[] = [];
  // JSONC-tolerant parse (comments, trailing commas) — same parser the
  // backend uses for GitHub files, so commented local files don't error.
  const data = parseJsonc(raw, errors, JSONC_PARSE_OPTIONS);
  if (errors.length > 0 || data === undefined) {
    throw new Error(`Couldn't parse ${path}: ${describeParseError(errors)}`);
  }
  return data as Record<string, unknown>;
}

/**
 * Like readJsonFile, but also returns the raw file text so the caller can
 * preserve the original indentation and trailing newline on write.
 */
export function readJsonFileWithRaw(
  path: string,
): { data: Record<string, unknown>; raw: string } | null {
  // ponytail: isFile() guard — without it, a directory at this path throws EISDIR
  if (!existsSync(path) || !statSync(path).isFile()) return null;
  const raw = readFileSync(path, 'utf8');
  if (raw.trim().length === 0) return { data: {}, raw };
  const errors: ParseError[] = [];
  // JSONC-tolerant parse, same as readJsonFile.
  const data = parseJsonc(raw, errors, JSONC_PARSE_OPTIONS);
  if (errors.length > 0 || data === undefined) {
    throw new Error(`Couldn't parse ${path}: ${describeParseError(errors)}`);
  }
  return { data: data as Record<string, unknown>, raw };
}

function describeParseError(errors: ParseError[]): string {
  if (errors.length === 0) return 'invalid JSONC';
  const first = errors[0];
  return `invalid JSONC (${printParseErrorCode(first.error)}) at offset ${first.offset}`;
}

/**
 * Detect the indentation string of a JSON file from its first indented
 * line. Returns the indent string (spaces or tabs), or `'  '` (2-space)
 * as a fallback when the file is empty or has no indented lines.
 */
export function detectIndent(raw: string): string {
  // ponytail: first-indented-line regex; translation JSON is well-formed and
  // consistent, so we don't need detect-indent's full statistical detector.
  // Upgrade path: pull in sindresorhus/detect-indent if mixed-indent files
  // ever cause churn.
  for (const line of raw.split('\n')) {
    const m = line.match(/^( +|\t+)/);
    if (m) return m[1];
  }
  return '  ';
}

/**
 * Convert a flat dot-notation key to a jsonc-parser jsonPath array.
 * Mirrors `unflatten`'s guard: empty segments from malformed keys are dropped.
 * ponytail: split-on-dot — a literal "." in a key is ambiguous; the backend
 * has the same limitation, so we match it rather than invent an escape.
 */
export function keyToJsonPath(key: string): string[] {
  return key.split('.').filter((s) => s.length > 0);
}

/**
 * Apply `desired` (flat key → value) to a raw JSON/JSONC file using
 * positional jsonc-parser edits — the same mechanism the backend uses for
 * GitHub files (sync.ts patchLocaleFile). Existing keys are edited in place
 * (order, comments, formatting survive); new keys are appended at the end of
 * their object; untouched keys keep their original text byte-for-byte.
 *
 * Returns `null` when a key present in the file is absent from `desired` —
 * jsonc-parser can't delete a property without a positional remove, and
 * removing the enclosing object would corrupt siblings. The caller falls
 * back to `mergePreservingOrder` + `writeJsonFile` (comments lost) for that
 * rare removal case, mirroring the backend's "push never deletes keys".
 */
export function applyServerToRaw(
  raw: string,
  desired: Record<string, string | null>,
  options: { indent?: string } = {},
): { text: string; changed: boolean } | null {
  const indent = options.indent ?? detectIndent(raw);
  const formattingOptions = {
    insertSpaces: !indent.includes('\t'),
    tabSize: indent.includes('\t') ? 1 : indent.length,
    eol: '\n',
  };

  const errors: ParseError[] = [];
  const tree = parseTree(raw, errors, JSONC_PARSE_OPTIONS);
  if (!tree || errors.length > 0) return null;

  // Keys present in the file but not desired → can't patch in place.
  const desiredSet = new Set(
    Object.keys(desired).filter((k) => desired[k] !== null && desired[k] !== undefined),
  );
  for (const key of walkFileKeys(raw)) {
    if (!desiredSet.has(key)) return null;
  }

  const edits: Edit[] = [];
  for (const [key, value] of Object.entries(desired)) {
    if (value === null || value === undefined) continue;
    const jsonPath = keyToJsonPath(key);
    // Skip no-op edits: same value → leave the original text alone, which
    // both avoids churn and prevents overlapping no-op edits when appending.
    const node = findNodeAtLocation(tree, jsonPath);
    if (node && getNodeValue(node) === value) continue;
    edits.push(...modify(raw, jsonPath, value, { formattingOptions }));
  }

  if (edits.length === 0) return { text: raw, changed: false };
  return { text: applyEdits(raw, edits), changed: true };
}

/**
 * Enumerate flat dot-keys present in a raw JSON/JSONC document, mirroring
 * `flatten` (leaf strings only, null leaves skipped).
 */
function walkFileKeys(raw: string): string[] {
  const data = parseJsonc(raw, [], JSONC_PARSE_OPTIONS);
  if (data === undefined || typeof data !== 'object' || data === null || Array.isArray(data)) {
    return [];
  }
  return Object.keys(flatten(data as Record<string, unknown>));
}

/**
 * Merge `incoming` into `existing`, preserving `existing`'s key order at
 * every level. New keys from `incoming` append in their incoming order.
 * Returns `{ result, changed }` where `changed` is true only when a value
 * was added, updated, or removed (order-only differences do not count).
 *
 * Used by `pull` so re-running against an unchanged server dataset (or one
 * with only value edits) doesn't churn the file's key order and produce a
 * spurious git diff.
 */
export function mergePreservingOrder(
  existing: Record<string, unknown> | null,
  incoming: Record<string, unknown>,
): { result: Record<string, unknown>; changed: boolean } {
  if (!existing) return { result: incoming, changed: true };

  const result: Record<string, unknown> = {};
  let changed = false;

  // 1. Walk existing keys in their file order; keep value from `incoming`
  //    (so a server value update lands), recursing into nested objects.
  for (const key of Object.keys(existing)) {
    if (!(key in incoming)) {
      changed = true; // key removed on server
      continue;
    }
    const ex = existing[key];
    const inc = incoming[key];
    if (isPlainObject(ex) && isPlainObject(inc)) {
      const { result: child, changed: childChanged } = mergePreservingOrder(
        ex as Record<string, unknown>,
        inc as Record<string, unknown>,
      );
      result[key] = child;
      if (childChanged) changed = true;
    } else if (inc === undefined) {
      // unflatten never emits undefined, but guard anyway
      changed = true;
    } else if (ex !== inc) {
      result[key] = inc;
      changed = true;
    } else {
      result[key] = ex; // identical value — keep existing ref (no-op for stringify)
    }
  }

  // 2. Append keys that exist on server but not in the file, in server order.
  for (const key of Object.keys(incoming)) {
    if (!(key in existing)) {
      result[key] = incoming[key];
      changed = true;
    }
  }

  return { result, changed };
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

export function writeJsonFile(
  path: string,
  content: Record<string, unknown>,
  options: { indent?: string; trailingNewline?: boolean } = {},
): void {
  mkdirSync(dirname(path), { recursive: true });
  const indent = options.indent ?? '  ';
  const trailing = options.trailingNewline ?? true;
  const json = JSON.stringify(content, null, indent) + (trailing ? '\n' : '');
  writeFileSync(path, json, 'utf8');
}
