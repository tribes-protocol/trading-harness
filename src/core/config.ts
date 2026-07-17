import { ConfigError } from './errors.js';
import { registerSecret } from './redact.js';

/**
 * Environment configuration. Credentials are loaded exclusively from
 * environment variables (optionally via a local .env file, never committed)
 * and registered with the redactor so they can never appear in logs,
 * errors, or outputs.
 */

export const PROVIDER_IDS = [
  'alchemy',
  'helius',
  'moralis',
  'birdeye',
  'coingecko',
  'nansen',
  'marketstack',
  'fred',
  'newsdata',
  'tavily',
] as const;

export type ProviderId = (typeof PROVIDER_IDS)[number];

const ENV_KEYS: Record<ProviderId, string> = {
  alchemy: 'ALCHEMY_API_KEY',
  helius: 'HELIUS_API_KEY',
  moralis: 'MORALIS_API_KEY',
  birdeye: 'BIRDEYE_API_KEY',
  coingecko: 'COINGECKO_PRO_API_KEY',
  nansen: 'NANSEN_API_KEY',
  marketstack: 'MARKETSTACK_API_KEY',
  fred: 'FRED_API_KEY',
  newsdata: 'NEWSDATA_API_KEY',
  tavily: 'TAVILY_API_KEY',
};

/** Accepted alternate spellings seen in real deployments. */
const ENV_KEY_ALIASES: Partial<Record<ProviderId, string[]>> = {
  coingecko: ['COIN_GECKO_PRO_API_KEY'],
  newsdata: ['NEWSDATAIO_API_KEY'],
};

let envLoaded = false;

/** Idempotently load .env (if present) and register all keys as secrets. */
export function loadEnv(): void {
  if (envLoaded) return;
  envLoaded = true;
  // Under vitest the developer's local .env must never leak into tests —
  // tests set the exact env vars they need explicitly.
  if (!process.env.VITEST) {
    try {
      process.loadEnvFile('.env');
    } catch {
      // No .env file — environment variables may still be set directly.
    }
  }
  for (const id of PROVIDER_IDS) {
    registerSecret(process.env[ENV_KEYS[id]]);
    for (const alias of ENV_KEY_ALIASES[id] ?? []) registerSecret(process.env[alias]);
  }
}

/** Test-only: allow reloading after env mutation. */
export function resetEnvCacheForTests(): void {
  envLoaded = false;
}

export function envVarName(id: ProviderId): string {
  return ENV_KEYS[id];
}

export function getApiKey(id: ProviderId): string | undefined {
  loadEnv();
  const value = process.env[ENV_KEYS[id]]?.trim();
  if (value) return value;
  for (const alias of ENV_KEY_ALIASES[id] ?? []) {
    const aliased = process.env[alias]?.trim();
    if (aliased) return aliased;
  }
  return undefined;
}

export function isConfigured(id: ProviderId): boolean {
  return getApiKey(id) !== undefined;
}

export function requireApiKey(id: ProviderId): string {
  const value = getApiKey(id);
  if (value === undefined) {
    throw new ConfigError(
      `Missing API key for provider "${id}". Set ${ENV_KEYS[id]} in the environment or .env.`,
      { details: { provider: id, envVar: ENV_KEYS[id] } },
    );
  }
  return value;
}

export interface PlatformSettings {
  timeoutMs: number;
  cacheDir: string;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
}

function intFromEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new ConfigError(`${name} must be a positive integer, got "${raw}"`);
  }
  return parsed;
}

export function getSettings(): PlatformSettings {
  loadEnv();
  const level = process.env.LOG_LEVEL ?? 'info';
  if (!['debug', 'info', 'warn', 'error'].includes(level)) {
    throw new ConfigError(`LOG_LEVEL must be one of debug|info|warn|error, got "${level}"`);
  }
  return {
    timeoutMs: intFromEnv('PI_HTTP_TIMEOUT_MS', 15_000),
    cacheDir: process.env.PI_CACHE_DIR ?? '.cache',
    logLevel: level as PlatformSettings['logLevel'],
  };
}
