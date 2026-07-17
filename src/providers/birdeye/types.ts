/**
 * Raw Birdeye Data Services response shapes for the endpoints this adapter
 * consumes, derived strictly from the documented response fields in
 * docs/research/providers/birdeye.json (official docs: https://docs.birdeye.so/).
 *
 * Fields Birdeye documents as optional/nullable are typed accordingly.
 * Unknown extra keys (including fixture bookkeeping keys starting with "_")
 * are ignored by the adapter.
 */

/** Common success/message envelope shared by all Birdeye REST responses. */
export interface BirdeyeEnvelope<T> {
  success: boolean;
  /** Present on error envelopes: {"success": false, "message": "..."} */
  message?: string;
  data?: T | null;
}

/** GET /defi/price — data object. */
export interface BirdeyePriceData {
  value: number;
  updateUnixTime: number;
  updateHumanTime?: string;
  priceChange24h?: number;
  priceInNative?: number;
  /** Present when include_liquidity=true is requested. */
  liquidity?: number;
  isScaledUiToken?: boolean;
  scaledValue?: number;
  multiplier?: number | null;
}

/** GET /defi/v3/ohlcv — one candle in data.items[]. */
export interface BirdeyeOhlcvItem {
  o: number;
  h: number;
  l: number;
  c: number;
  /** Volume in base-token units. */
  v: number;
  /** Volume in USD. */
  v_usd?: number;
  /** Candle open time, epoch seconds. */
  unix_time: number;
  address?: string;
  type?: string;
  currency?: string;
}

/** GET /defi/v3/ohlcv — data object. */
export interface BirdeyeOhlcvData {
  is_scaled_ui_token?: boolean;
  multiplier?: number | null;
  items?: BirdeyeOhlcvItem[];
}

/** GET /defi/v2/markets — base/quote token detail on a market item. */
export interface BirdeyeMarketTokenSide {
  address?: string;
  decimals?: number;
  symbol?: string;
  icon?: string;
}

/** GET /defi/v2/markets — one market (pool/pair) in data.items[]. */
export interface BirdeyeMarketItem {
  /** Pair/pool contract address. */
  address: string;
  base?: BirdeyeMarketTokenSide;
  quote?: BirdeyeMarketTokenSide;
  name?: string;
  /** DEX/AMM source, e.g. "Raydium". */
  source?: string;
  liquidity?: number;
  price?: number | null;
  volume24h?: number;
  trade24h?: number;
  trade24hChangePercent?: number;
  uniqueWallet24h?: number;
  uniqueWallet24hChangePercent?: number;
  /** Pool creation time, ISO-8601. */
  createdAt?: string;
}

/** GET /defi/v2/markets — data object. */
export interface BirdeyeMarketsData {
  items?: BirdeyeMarketItem[];
  total?: number;
}

/** GET /v1/wallet/token_list — one holding in data.items[]. */
export interface BirdeyeWalletTokenItem {
  /** Token mint/contract address. */
  address: string;
  decimals?: number;
  /**
   * Raw integer amount. The official reference examples show a JSON number
   * on Solana and a digit string on EVM chains; both are accepted and the
   * string form is preserved exactly (no float round-trip).
   */
  balance: number | string;
  /** Human units after decimals adjustment. */
  uiAmount?: number;
  chainId?: string;
  name?: string;
  symbol?: string;
  icon?: string;
  logoURI?: string;
  priceUsd?: number;
  valueUsd?: number;
  isScaledUiToken?: boolean;
  multiplier?: number | null;
}

/** GET /v1/wallet/token_list — data object. */
export interface BirdeyeWalletTokenListData {
  wallet?: string;
  totalUsd?: number;
  items?: BirdeyeWalletTokenItem[];
}

/** GET /defi/networks — data is an array of network name strings. */
export type BirdeyeNetworksData = string[];
