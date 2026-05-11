import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync, chmodSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

export interface StoredCredentials {
  token: string;
  baseUrl: string;
  /** Cached for display; not the source of truth — server is. */
  user?: { id: string; email: string | null };
  company?: { id: string; name: string };
}

function credentialsPath(): string {
  // Allow override for tests / multi-account workflows.
  const override = process.env.API18N_CREDENTIALS_PATH;
  if (override) return override;
  return join(homedir(), '.api18n', 'credentials.json');
}

export function readCredentials(): StoredCredentials | null {
  const path = credentialsPath();
  if (!existsSync(path)) return null;
  try {
    const raw = readFileSync(path, 'utf8');
    const parsed = JSON.parse(raw) as StoredCredentials;
    if (typeof parsed.token === 'string' && typeof parsed.baseUrl === 'string') {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

export function writeCredentials(creds: StoredCredentials): void {
  const path = credentialsPath();
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(creds, null, 2));
  try {
    chmodSync(path, 0o600);
  } catch {
    /* best effort — Windows or some FS won't support 0600 */
  }
}

export function clearCredentials(): void {
  const path = credentialsPath();
  if (existsSync(path)) {
    rmSync(path, { force: true });
  }
}

/**
 * Resolve the token to use for API calls. Priority:
 *   1. --token flag (passed in)
 *   2. API18N_TOKEN env var
 *   3. stored credentials file
 */
export function resolveToken(overrideFlag?: string): {
  token: string;
  baseUrl?: string;
} | null {
  if (overrideFlag) return { token: overrideFlag };
  const env = process.env.API18N_TOKEN;
  if (env && env.length > 0) return { token: env };
  const stored = readCredentials();
  if (stored) return { token: stored.token, baseUrl: stored.baseUrl };
  return null;
}
