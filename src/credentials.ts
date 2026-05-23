import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync, chmodSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

export interface StoredCredentials {
  token: string;
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
    if (typeof parsed.token === 'string') {
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
 * Resolve the token to use for API calls. The credentials file written by
 * `api18n login` is the single source of truth — no env-var fallback, so
 * behaviour is identical regardless of whether the runner auto-loads `.env`.
 * CI: run `api18n login --token "$TOKEN"` once per job before other commands.
 */
export function resolveToken(): { token: string } | null {
  const stored = readCredentials();
  if (stored) return { token: stored.token };
  return null;
}
