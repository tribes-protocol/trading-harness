/**
 * Raw CoinGecko Pro API response shapes consumed by the adapter, derived
 * strictly from the documented response fields in
 * docs/research/providers/coingecko-pro.json (official docs review
 * 2026-07-17). Fields the adapter does not consume are typed loosely or
 * omitted; unknown keys are ignored at runtime.
 */

/** One row of GET /coins/markets (array response). Nullable per docs: many
 *  market fields can be null for thinly-tracked coins. */
export interface CoinsMarketsRow {
  id: string;
  symbol: string;
  name: string;
  image?: string | null;
  current_price: number | null;
  market_cap: number | null;
  market_cap_rank?: number | null;
  fully_diluted_valuation?: number | null;
  total_volume: number | null;
  high_24h?: number | null;
  low_24h?: number | null;
  price_change_24h?: number | null;
  price_change_percentage_24h: number | null;
  market_cap_change_24h?: number | null;
  circulating_supply?: number | null;
  total_supply?: number | null;
  max_supply?: number | null;
  ath?: number | null;
  ath_date?: string | null;
  atl?: number | null;
  atl_date?: string | null;
  roi?: unknown;
  last_updated: string | null;
  sparkline_in_7d?: unknown;
}

export type CoinsMarketsResponse = CoinsMarketsRow[];

/**
 * Per-currency entry of GET /simple/price and GET /simple/token_price/{id}.
 * Keys follow the vs_currency requested (this adapter always requests usd).
 */
export interface SimplePriceEntry {
  usd?: number;
  usd_market_cap?: number;
  usd_24h_vol?: number;
  usd_24h_change?: number;
  /** UNIX epoch seconds. */
  last_updated_at?: number;
}

/** GET /simple/price — object keyed by CoinGecko coin id. */
export type SimplePriceResponse = Record<string, SimplePriceEntry>;

/** GET /simple/token_price/{id} — object keyed by contract address. */
export type SimpleTokenPriceResponse = Record<string, SimplePriceEntry>;

/** GET /coins/{id}/ohlc — array of [timestamp(ms), open, high, low, close]. */
export type CoinOhlcRow = [number, number, number, number, number];
export type CoinOhlcResponse = CoinOhlcRow[];

/* ------------------- onchain (GeckoTerminal) endpoints ------------------- */

export interface OnchainRelationshipRef {
  data: {
    /** Token ids are formatted "{network}_{address}", dex ids are slugs. */
    id: string;
    type: string;
  };
}

/** One pool of GET /onchain/networks/{network}/tokens/{token_address}/pools.
 *  Numeric attribute values are JSON strings per the official docs example. */
export interface OnchainPool {
  id: string;
  type: string;
  attributes: {
    address: string;
    name: string;
    pool_created_at?: string | null;
    base_token_price_usd?: string | null;
    quote_token_price_usd?: string | null;
    base_token_price_native_currency?: string | null;
    quote_token_price_native_currency?: string | null;
    base_token_price_quote_token?: string | null;
    quote_token_price_base_token?: string | null;
    token_price_usd?: string | null;
    fdv_usd?: string | null;
    market_cap_usd?: string | null;
    reserve_in_usd?: string | null;
    volume_usd?: Record<string, string | null>;
    price_change_percentage?: Record<string, string | null>;
    transactions?: Record<string, unknown>;
  };
  relationships: {
    base_token?: OnchainRelationshipRef;
    quote_token?: OnchainRelationshipRef;
    dex?: OnchainRelationshipRef;
    network?: OnchainRelationshipRef;
  };
}

export interface OnchainIncludedToken {
  id: string;
  type: 'token';
  attributes: {
    address: string;
    name?: string | null;
    symbol?: string | null;
    decimals?: number | null;
    image_url?: string | null;
    coingecko_coin_id?: string | null;
  };
}

export interface OnchainIncludedDex {
  id: string;
  type: 'dex';
  attributes: {
    name?: string | null;
  };
}

export type OnchainIncluded = OnchainIncludedToken | OnchainIncludedDex;

export interface OnchainTokenPoolsResponse {
  data: OnchainPool[];
  included?: OnchainIncluded[];
}
