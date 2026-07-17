/**
 * Raw Nansen API request/response shapes for the endpoints this adapter
 * consumes, derived strictly from the official-docs research record
 * (docs/research/providers/nansen.json). Only documented fields are
 * modeled; anything the docs do not guarantee is optional/nullable.
 *
 * All consumed endpoints are POST with JSON bodies under /api/v1/ and
 * authenticate via the lowercase `apikey` header.
 */

/** Standard v1 request pagination: page is 1-based; per_page default 10, max 1000. */
export interface NansenPaginationRequest {
  page: number;
  per_page: number;
}

/** Standard v1 response pagination. No cursor and no total-count field. */
export interface NansenPaginationResponse {
  page: number;
  per_page: number;
  is_last_page: boolean;
}

/** Standard v1 response envelope: `{ data, pagination }`. */
export interface NansenEnvelope<T> {
  data?: T[] | null;
  pagination?: NansenPaginationResponse | null;
}

export type NansenOrderDirection = 'ASC' | 'DESC';

export interface NansenOrderBy {
  field: string;
  direction: NansenOrderDirection;
}

/* ------------------- POST /api/v1/smart-money/netflow ------------------- */

export interface NansenSmartMoneyNetflowFilters {
  token_address?: string;
  /** Documented default false. */
  include_stablecoins?: boolean;
  /** Documented default false. */
  include_native_tokens?: boolean;
}

export interface NansenSmartMoneyNetflowRequest {
  /** Smart-money supported chains, or 'all'. */
  chains: string[];
  filters?: NansenSmartMoneyNetflowFilters;
  pagination?: NansenPaginationRequest;
  order_by?: NansenOrderBy[];
}

export interface NansenSmartMoneyNetflowRow {
  token_address: string;
  token_symbol?: string | null;
  net_flow_1h_usd?: number | null;
  net_flow_24h_usd?: number | null;
  net_flow_7d_usd?: number | null;
  net_flow_30d_usd?: number | null;
  chain: string;
  token_sectors?: string[] | null;
  trader_count?: number | null;
  token_age_days?: number | null;
  market_cap_usd?: number | null;
}

/* -------------- POST /api/v1/profiler/address/current-balance -------------- */

export interface NansenProfilerBalanceRequest {
  /** address OR entity_name; response `address` is empty when entity_name is used. */
  address?: string;
  entity_name?: string;
  /** Nansen chain slug, or 'all' for cross-chain. */
  chain: string;
  /** Documented default true; pinned explicitly by the adapter. */
  hide_spam_token?: boolean;
  pagination?: NansenPaginationRequest;
  order_by?: NansenOrderBy[];
}

/**
 * ProfilerBalance item. Nansen returns decimal-adjusted `token_amount`
 * only — no raw base-unit amount and no token-decimals field.
 */
export interface NansenProfilerBalanceRow {
  chain: string;
  address: string;
  token_address: string;
  token_symbol: string;
  token_name?: string | null;
  token_amount?: number | null;
  price_usd?: number | null;
  value_usd?: number | null;
}

/* --------------------- POST /api/v1/search/general --------------------- */

export interface NansenSearchGeneralRequest {
  /** 1-200 chars. */
  search_query: string;
  /** Default 'any'. */
  result_type?: 'token' | 'entity' | 'any';
  chain?: string;
  /** 1-50, default 25. */
  limit?: number;
}

export interface NansenSearchTokenResult {
  name?: string | null;
  symbol?: string | null;
  chain?: string | null;
  address?: string | null;
  /** Docs warn search prices may be delayed — never treated as market data. */
  price?: number | null;
  volume_24h?: number | null;
  market_cap?: number | null;
  rank?: number | null;
}

export interface NansenSearchEntityResult {
  name?: string | null;
  tags?: string[] | null;
  rank?: number | null;
}

export interface NansenSearchGeneralResponse {
  tokens?: NansenSearchTokenResult[] | null;
  entities?: NansenSearchEntityResult[] | null;
  total_results?: number | null;
}

/* ------------------------- documented error bodies ------------------------- */

/** FastAPI-style error body used by most status codes. */
export interface NansenDetailError {
  detail: string | Array<{ loc: Array<string | number>; msg: string; type: string }>;
  /** Present on 429 responses (seconds). */
  retry_after?: number;
}

/** Alternative error shape shown on the authentication docs page (401/403). */
export interface NansenCodedError {
  error: { code: string; message: string };
}
