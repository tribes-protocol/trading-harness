import type { ProviderId } from '../core/config.js';
import type { Frequency } from '../core/time.js';
import type { Chain } from '../schemas/common.js';
import type { PriceSeries, Quote } from '../schemas/market.js';
import type { MacroSeries, MacroSeriesInfo } from '../schemas/macro.js';
import type { NewsBatch, SearchBatch } from '../schemas/news.js';
import type {
  DexPair,
  LabeledFlow,
  TokenPrice,
  TokenRef,
  TransferBatch,
  WalletBalances,
} from '../schemas/onchain.js';
import type { CorporateActions, ExchangeInfo } from '../schemas/fundamentals.js';

/**
 * Provider adapter contract. Every adapter:
 *  - is constructed lazily and never throws at import time;
 *  - reads its key via core/config (never process.env directly);
 *  - routes ALL requests through core/http.HttpClient;
 *  - returns schema-validated normalized shapes with source, freshness,
 *    and quality flags filled in truthfully (delayed/EOD data must carry
 *    the matching flag);
 *  - implements the subset of capability interfaces below that its
 *    provider verifiably supports (per its docs research record) — and
 *    nothing more.
 */

export interface ProviderMeta {
  id: ProviderId;
  name: string;
  docsUrl: string;
  /** YYYY-MM-DD of the official-docs review this adapter was built from. */
  docsReviewDate: string;
  apiVersion: string;
  envVar: string;
}

export interface HealthCheckResult {
  provider: ProviderId;
  configured: boolean;
  /** true/false = live call attempted; null = live check not attempted. */
  live: boolean | null;
  latencyMs?: number;
  message: string;
  checkedAt: string;
}

export interface ProviderAdapter {
  readonly id: ProviderId;
  readonly meta: ProviderMeta;
  isConfigured(): boolean;
  /**
   * With {live:true}, performs exactly ONE minimal-quota request to verify
   * auth/connectivity. Never throws — failures are folded into the result
   * (message already redacted by the error layer).
   */
  healthCheck(opts?: { live?: boolean }): Promise<HealthCheckResult>;
}

/* ------------------------- capability interfaces ------------------------- */

export interface QuoteSource {
  getQuote(params: { symbol: string }): Promise<Quote>;
}

export interface DailyBarsSource {
  getDailyBars(params: {
    symbol: string;
    from?: string;
    to?: string;
    limit?: number;
  }): Promise<PriceSeries>;
}

export interface IntradayBarsSource {
  getIntradayBars(params: {
    symbol: string;
    interval: Frequency;
    from?: string;
    to?: string;
    limit?: number;
  }): Promise<PriceSeries>;
}

export interface CorporateActionsSource {
  getCorporateActions(params: {
    symbol: string;
    from?: string;
    to?: string;
  }): Promise<CorporateActions>;
}

export interface ExchangeDirectorySource {
  listExchanges(params?: { limit?: number }): Promise<ExchangeInfo[]>;
}

export interface MacroSeriesSource {
  getMacroSeries(params: {
    seriesId: string;
    from?: string;
    to?: string;
    vintage?: 'latest' | 'point_in_time';
  }): Promise<MacroSeries>;
  searchMacroSeries(params: { query: string; limit?: number }): Promise<MacroSeriesInfo[]>;
}

export interface NewsSource {
  getNews(params: {
    query?: string;
    from?: string;
    to?: string;
    language?: string;
    category?: string;
    max?: number;
  }): Promise<NewsBatch>;
}

export interface WebSearchSource {
  webSearch(params: {
    query: string;
    maxResults?: number;
    depth?: 'basic' | 'advanced';
    includeAnswer?: boolean;
  }): Promise<SearchBatch>;
}

/** Loose token reference for lookups; adapters resolve to a full TokenRef. */
export interface TokenQuery {
  chain?: Chain;
  address?: string;
  /** Provider-native id (e.g. CoinGecko coin id). */
  providerId?: string;
  symbol?: string;
}

export interface TokenPriceSource {
  getTokenPrice(params: { token: TokenQuery }): Promise<TokenPrice>;
}

export interface TokenOhlcvSource {
  getTokenOhlcv(params: {
    token: TokenQuery;
    interval: Frequency;
    from?: string;
    to?: string;
    limit?: number;
  }): Promise<PriceSeries>;
}

export interface WalletBalancesSource {
  getWalletBalances(params: { chain: Chain; address: string }): Promise<WalletBalances>;
}

export interface TransfersSource {
  getTransfers(params: {
    chain: Chain;
    address: string;
    limit?: number;
    cursor?: string;
  }): Promise<TransferBatch>;
}

export interface DexPairsSource {
  getDexPairs(params: { chain: Chain; tokenAddress: string; limit?: number }): Promise<DexPair[]>;
}

export interface LabeledFlowsSource {
  getLabeledFlows(params: { token: TokenQuery; window?: string }): Promise<LabeledFlow[]>;
}

export type { TokenRef };

/* ----------------------------- type guards ------------------------------ */

function hasMethods<T>(adapter: ProviderAdapter, names: string[]): adapter is ProviderAdapter & T {
  return names.every(
    (n) => typeof (adapter as unknown as Record<string, unknown>)[n] === 'function',
  );
}

export const isQuoteSource = (a: ProviderAdapter): a is ProviderAdapter & QuoteSource =>
  hasMethods<QuoteSource>(a, ['getQuote']);
export const isDailyBarsSource = (a: ProviderAdapter): a is ProviderAdapter & DailyBarsSource =>
  hasMethods<DailyBarsSource>(a, ['getDailyBars']);
export const isIntradayBarsSource = (
  a: ProviderAdapter,
): a is ProviderAdapter & IntradayBarsSource =>
  hasMethods<IntradayBarsSource>(a, ['getIntradayBars']);
export const isCorporateActionsSource = (
  a: ProviderAdapter,
): a is ProviderAdapter & CorporateActionsSource =>
  hasMethods<CorporateActionsSource>(a, ['getCorporateActions']);
export const isMacroSeriesSource = (a: ProviderAdapter): a is ProviderAdapter & MacroSeriesSource =>
  hasMethods<MacroSeriesSource>(a, ['getMacroSeries', 'searchMacroSeries']);
export const isNewsSource = (a: ProviderAdapter): a is ProviderAdapter & NewsSource =>
  hasMethods<NewsSource>(a, ['getNews']);
export const isWebSearchSource = (a: ProviderAdapter): a is ProviderAdapter & WebSearchSource =>
  hasMethods<WebSearchSource>(a, ['webSearch']);
export const isTokenPriceSource = (a: ProviderAdapter): a is ProviderAdapter & TokenPriceSource =>
  hasMethods<TokenPriceSource>(a, ['getTokenPrice']);
export const isTokenOhlcvSource = (a: ProviderAdapter): a is ProviderAdapter & TokenOhlcvSource =>
  hasMethods<TokenOhlcvSource>(a, ['getTokenOhlcv']);
export const isWalletBalancesSource = (
  a: ProviderAdapter,
): a is ProviderAdapter & WalletBalancesSource =>
  hasMethods<WalletBalancesSource>(a, ['getWalletBalances']);
export const isTransfersSource = (a: ProviderAdapter): a is ProviderAdapter & TransfersSource =>
  hasMethods<TransfersSource>(a, ['getTransfers']);
export const isDexPairsSource = (a: ProviderAdapter): a is ProviderAdapter & DexPairsSource =>
  hasMethods<DexPairsSource>(a, ['getDexPairs']);
export const isLabeledFlowsSource = (
  a: ProviderAdapter,
): a is ProviderAdapter & LabeledFlowsSource =>
  hasMethods<LabeledFlowsSource>(a, ['getLabeledFlows']);
