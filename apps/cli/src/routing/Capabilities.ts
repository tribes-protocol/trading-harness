import type {
  AssetCandlesPayload,
  AssetHoldersListPayload,
  AssetNewListPayload,
  AssetPriceQuotePayload,
  AssetProfilePayload,
  AssetSearchResultsPayload,
  AssetTrendingListPayload
} from '@/types/Capability'

// ---------------------------------------------------------------------------
// Per-capability source contracts for the `asset` router. An adapter wraps one
// provider's existing service method(s) behind a capability payload; the
// router tries sources in chain order and stops at the first success.
// ---------------------------------------------------------------------------

export type AssetProviderId =
  | 'birdeye'
  | 'geckoterminal'
  | 'coingecko'
  | 'marketstack'
  | 'hyperliquid'

export type AssetSource<T> = {
  readonly provider: AssetProviderId
  // Authoritative for its identifier space (CoinGecko for coin ids,
  // Marketstack for tickers, Hyperliquid for perps): not-found is final,
  // never a fallback trigger.
  readonly authoritative?: boolean
  readonly fetch: () => Promise<T>
}

export type PriceSource = AssetSource<AssetPriceQuotePayload>
export type CandleSource = AssetSource<AssetCandlesPayload>
export type ProfileSource = AssetSource<AssetProfilePayload>
export type TrendingSource = AssetSource<AssetTrendingListPayload>
export type NewListingsSource = AssetSource<AssetNewListPayload>
export type SearchSource = AssetSource<AssetSearchResultsPayload>
export type HoldersSource = AssetSource<AssetHoldersListPayload>

// Thrown by adapters when a provider answered 200 but carried no data where
// data was expected — a fallback trigger.
export class EmptyPayloadError extends Error {}

// Thrown by adapters when the provider does not know the requested asset.
// Final for authoritative sources; a fallback trigger for contract-address
// lookups (indexing coverage differs per provider).
export class NotFoundError extends Error {}
