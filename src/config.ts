import { existsSync, statSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { bundleRequire } from 'bundle-require';

const DEFAULT_BASE_URL = 'https://www.api18n.com';
const DEFAULT_LOCALES_PATTERN = 'messages/{locale}.json';

export interface UserConfig {
  /**
   * Path pattern, relative to the config file, where local JSON
   * translation files live. Use `{locale}` as the language placeholder.
   * Default: `"messages/{locale}.json"`.
   */
  locales?: string;
  /**
   * Optional subset of locale codes to include. Defaults to whatever the
   * company has enabled in the dashboard.
   */
  include?: string[];
  /** Override the dashboard URL. Defaults to api18n.com. */
  baseUrl?: string;
  /** Pin to a specific company; required if your user belongs to several. */
  companyId?: string;
}

/**
 * Identity helper for TS autocomplete in `api18n.config.ts`.
 */
export function defineConfig(config: UserConfig): UserConfig {
  return config;
}

export interface ResolvedConfig extends Required<Omit<UserConfig, 'include' | 'companyId'>> {
  include?: string[];
  companyId?: string;
  /** Absolute path to the directory containing api18n.config.ts. */
  rootDir: string;
}

const CONFIG_CANDIDATES = ['api18n.config.ts', 'api18n.config.js', 'api18n.config.mjs'];

export function findConfigFile(cwd: string): string | null {
  for (const name of CONFIG_CANDIDATES) {
    const candidate = resolve(cwd, name);
    if (existsSync(candidate) && statSync(candidate).isFile()) {
      return candidate;
    }
  }
  return null;
}

export async function loadConfig(cwd: string): Promise<ResolvedConfig> {
  const path = findConfigFile(cwd);
  if (!path) {
    throw new Error(
      `No api18n.config.ts found in ${cwd}. Run "api18n init" to create one.`
    );
  }
  const { mod } = await bundleRequire({ filepath: path });
  const user: UserConfig = mod.default ?? mod;
  if (!user || typeof user !== 'object') {
    throw new Error(`api18n.config.ts must export a default object (got ${typeof user})`);
  }
  return {
    locales: user.locales ?? DEFAULT_LOCALES_PATTERN,
    baseUrl: user.baseUrl ?? DEFAULT_BASE_URL,
    include: user.include,
    companyId: user.companyId,
    rootDir: dirname(path),
  };
}

export { DEFAULT_BASE_URL, DEFAULT_LOCALES_PATTERN };
