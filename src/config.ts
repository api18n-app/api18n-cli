import { existsSync, statSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { bundleRequire } from "bundle-require";

const DEFAULT_BASE_URL = "https://www.api18n.com";
const DEFAULT_BACKEND_URL = "https://api18n-backend.onrender.com";
// Backend (Fastify API) URL the CLI hits for /cli/* endpoints. Override with
// API18N_BACKEND_URL for local development, e.g.:
//   API18N_BACKEND_URL=http://localhost:3333 bun start whoami
const BACKEND_URL = process.env.API18N_BACKEND_URL ?? DEFAULT_BACKEND_URL;
const DEFAULT_LOCALES_PATTERN = "messages/{locale}.json";
const DEFAULT_TYPEGEN_OUT = "messages/messages.d.ts";

export interface TypegenConfig {
  /** Path (relative to config dir) to write the generated .d.ts. */
  out?: string;
  /** Locale code used as the source of truth for arg-type inference. */
  baseLocale?: string;
}

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
  /**
   * Type generation for the `api18n` runtime SDK. Set to `false` to disable.
   * Defaults to writing `messages/messages.d.ts` from the base locale.
   */
  typegen?: boolean | TypegenConfig;
}

/**
 * Identity helper for TS autocomplete in `api18n.config.ts`.
 */
export function defineConfig(config: UserConfig): UserConfig {
  return config;
}

export interface ResolvedTypegenConfig {
  enabled: boolean;
  out: string;
  baseLocale: string | null;
}

export interface ResolvedConfig {
  locales: string;
  baseUrl: string;
  include?: string[];
  companyId?: string;
  typegen: ResolvedTypegenConfig;
  /** Absolute path to the directory containing api18n.config.ts. */
  rootDir: string;
}

const CONFIG_CANDIDATES = [
  "api18n.config.ts",
  "api18n.config.js",
  "api18n.config.mjs",
];

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
      `No api18n.config.ts found in ${cwd}. Run "api18n init" to create one.`,
    );
  }
  const { mod } = await bundleRequire({ filepath: path });
  const user: UserConfig = mod.default ?? mod;
  if (!user || typeof user !== "object") {
    throw new Error(
      `api18n.config.ts must export a default object (got ${typeof user})`,
    );
  }
  return {
    locales: user.locales ?? DEFAULT_LOCALES_PATTERN,
    baseUrl: user.baseUrl ?? DEFAULT_BASE_URL,
    include: user.include,
    companyId: user.companyId,
    typegen: resolveTypegen(user.typegen),
    rootDir: dirname(path),
  };
}

function resolveTypegen(value: UserConfig["typegen"]): ResolvedTypegenConfig {
  if (value === false) {
    return { enabled: false, out: DEFAULT_TYPEGEN_OUT, baseLocale: null };
  }
  const obj = typeof value === "object" && value !== null ? value : {};
  return {
    enabled: true,
    out: obj.out ?? DEFAULT_TYPEGEN_OUT,
    baseLocale: obj.baseLocale ?? null,
  };
}

export {
  BACKEND_URL,
  DEFAULT_BACKEND_URL,
  DEFAULT_BASE_URL,
  DEFAULT_LOCALES_PATTERN,
  DEFAULT_TYPEGEN_OUT,
};
