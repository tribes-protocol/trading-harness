import type { ProviderId } from '../core/config.js';
import { NotSupportedError } from '../core/errors.js';
import { executeWithFallback } from '../registry/routing.js';
import type { AssetClass, Frequency } from '../schemas/common.js';
import type { PriceSeries, Quote } from '../schemas/market.js';
import { getAdapter } from './adapter-registry.js';
import { annotateRouting, detectDisagreement, flagDisagreement } from './quality.js';
import {
  isDailyBarsSource,
  isIntradayBarsSource,
  isQuoteSource,
} from '../providers/types.js';
import { routeCandidates } from '../registry/routing.js';

/**
 * Market-data service: normalized quotes and bars with routing, fallback
 * annotation, and optional cross-provider verification.
 */

export async function getQuote(params: {
  symbol: string;
  assetClass?: AssetClass;
}): Promise<Quote> {
  const route = await executeWithFallback(
    'market.quote',
    { assetClass: params.assetClass },
    async (match) => {
      const adapter = getAdapter(match.provider.id as ProviderId);
      if (!isQuoteSource(adapter)) {
        throw new NotSupportedError(
          `Adapter "${match.provider.id}" does not implement quotes despite registry entry — registry/adapter mismatch`,
        );
      }
      return adapter.getQuote({ symbol: params.symbol });
    },
  );
  return annotateRouting(route);
}

export async function getDailyBars(params: {
  symbol: string;
  assetClass?: AssetClass;
  from?: string;
  to?: string;
  limit?: number;
}): Promise<PriceSeries> {
  const route = await executeWithFallback(
    'market.daily_bars',
    { assetClass: params.assetClass },
    async (match) => {
      const adapter = getAdapter(match.provider.id as ProviderId);
      if (!isDailyBarsSource(adapter)) {
        throw new NotSupportedError(
          `Adapter "${match.provider.id}" does not implement daily bars — registry/adapter mismatch`,
        );
      }
      const { symbol, from, to, limit } = params;
      return adapter.getDailyBars({ symbol, from, to, limit });
    },
  );
  return annotateRouting(route);
}

export async function getIntradayBars(params: {
  symbol: string;
  interval: Frequency;
  assetClass?: AssetClass;
  from?: string;
  to?: string;
  limit?: number;
}): Promise<PriceSeries> {
  const route = await executeWithFallback(
    'market.intraday_bars',
    { assetClass: params.assetClass },
    async (match) => {
      const adapter = getAdapter(match.provider.id as ProviderId);
      if (!isIntradayBarsSource(adapter)) {
        throw new NotSupportedError(
          `Adapter "${match.provider.id}" does not implement intraday bars — registry/adapter mismatch`,
        );
      }
      const { symbol, interval, from, to, limit } = params;
      return adapter.getIntradayBars({ symbol, interval, from, to, limit });
    },
  );
  return annotateRouting(route);
}

export interface CrossCheckedQuote {
  quote: Quote;
  /** All provider views, preserved — never averaged. */
  views: Quote[];
  disagreement?: ReturnType<typeof detectDisagreement>;
  /** Providers that were attempted; the cross-check may have degraded. */
  providersAttempted: number;
  /** Failures are surfaced, never swallowed. */
  failures: { provider: string; error: string }[];
}

/**
 * Fetch the same quote from up to `maxProviders` configured providers and
 * surface disagreement beyond `tolerance` (relative spread). The
 * best-priority successful view is returned as `quote`; if any earlier-
 * priority provider failed, the quote is stamped `fallback_source` with a
 * lineage record — a degraded cross-check is never silent.
 */
export async function getCrossCheckedQuote(params: {
  symbol: string;
  assetClass?: AssetClass;
  tolerance?: number;
  maxProviders?: number;
}): Promise<CrossCheckedQuote> {
  const candidates = routeCandidates('market.quote', { assetClass: params.assetClass }).slice(
    0,
    params.maxProviders ?? 2,
  );
  const views: Quote[] = [];
  const failures: { provider: string; error: string }[] = [];
  let primaryFailed = false;
  for (const [index, match] of candidates.entries()) {
    try {
      const adapter = getAdapter(match.provider.id as ProviderId);
      if (!isQuoteSource(adapter)) {
        failures.push({ provider: match.provider.id, error: 'registry/adapter mismatch: no getQuote' });
        if (index === 0) primaryFailed = true;
        continue;
      }
      views.push(await adapter.getQuote({ symbol: params.symbol }));
    } catch (error) {
      failures.push({
        provider: match.provider.id,
        error: error instanceof Error ? error.message : String(error),
      });
      if (index === 0) primaryFailed = true;
    }
  }
  if (views.length === 0) {
    throw new NotSupportedError(
      `No provider could quote "${params.symbol}"${failures.length ? ` — failures: ${failures.map((f) => `${f.provider}: ${f.error}`).join('; ')}` : ''}`,
    );
  }
  const primary = views[0]!;
  const disagreement = detectDisagreement(
    `quote:${params.symbol}`,
    views.map((v) => ({ provider: v.source.provider, value: v.price })),
    params.tolerance ?? 0.01,
  );
  let quote = disagreement ? flagDisagreement(primary, disagreement) : primary;
  if (primaryFailed) {
    quote = annotateRouting({
      value: quote,
      providerUsed: quote.source.provider,
      fallbackUsed: true,
      failures,
    });
  }
  return { quote, views, disagreement, providersAttempted: candidates.length, failures };
}
