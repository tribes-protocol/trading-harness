import { logger } from '../core/logger.js';
import { NotSupportedError, PlatformError } from '../core/errors.js';
import type { Operation, ProviderRegistryFile } from '../schemas/registry.js';
import { findCapabilities, type CapabilityMatch } from './registry.js';

/**
 * Provider routing with explicit fallback. The primary is the
 * highest-priority configured provider for an operation; on failure the
 * executor walks the fallback chain, RECORDING that a fallback was used so
 * downstream consumers can flag results (`fallback_source` quality flag).
 */

export interface RouteResult<T> {
  value: T;
  providerUsed: string;
  fallbackUsed: boolean;
  /** Providers that were tried and failed before one succeeded. */
  failures: { provider: string; error: string }[];
}

export interface RouteOptions {
  assetClass?: string;
  chain?: string;
  requireConfigured?: boolean;
  /** Injectable for tests; defaults to the on-disk registry. */
  registry?: ProviderRegistryFile;
}

export function routeCandidates(operation: Operation, opts: RouteOptions = {}): CapabilityMatch[] {
  const matches = findCapabilities(operation, opts);
  return opts.requireConfigured === false ? matches : matches.filter((m) => m.configured);
}

/**
 * Execute `fn` against candidates in priority order until one succeeds.
 * Throws NotSupportedError when no candidate exists, or the last error
 * when all candidates fail.
 */
export async function executeWithFallback<T>(
  operation: Operation,
  opts: RouteOptions,
  fn: (match: CapabilityMatch) => Promise<T>,
): Promise<RouteResult<T>> {
  const candidates = routeCandidates(operation, opts);
  if (candidates.length === 0) {
    throw new NotSupportedError(
      `No configured provider offers operation "${operation}"` +
        (opts.assetClass ? ` for asset class "${opts.assetClass}"` : '') +
        (opts.chain ? ` on chain "${opts.chain}"` : ''),
      { details: { operation, ...opts } },
    );
  }

  const failures: { provider: string; error: string }[] = [];
  let lastError: unknown;
  for (const [index, match] of candidates.entries()) {
    try {
      const value = await fn(match);
      if (index > 0) {
        logger.warn('operation served by fallback provider', {
          operation,
          providerUsed: match.provider.id,
          failures,
        });
      }
      return {
        value,
        providerUsed: match.provider.id,
        fallbackUsed: index > 0,
        failures,
      };
    } catch (error) {
      lastError = error;
      failures.push({
        provider: match.provider.id,
        error: error instanceof PlatformError ? error.message : String(error),
      });
      logger.warn('provider failed, trying next candidate', {
        operation,
        provider: match.provider.id,
        remaining: candidates.length - index - 1,
      });
    }
  }
  throw lastError;
}
