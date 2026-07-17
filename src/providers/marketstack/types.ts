/**
 * Raw Marketstack v2 response shapes, derived strictly from the documented
 * response fields in docs/research/providers/marketstack.json (official v2
 * OpenAPI spec + docs portal). The official spec leaves some item schemas
 * loosely defined, so nullable fields are typed `| null` and consumers must
 * tolerate NULLs (notably intraday bid/ask/last/mid since the IEX
 * 2025-02-01 policy change).
 */

export interface MarketstackPagination {
  limit: number;
  offset: number;
  count: number;
  total: number;
}

/** Envelope for list endpoints: pagination {limit, offset, count, total} + data[]. */
export interface MarketstackListResponse<T> {
  pagination?: MarketstackPagination;
  data: T[];
}

/**
 * /eod, /eod/latest, /eod/{date} item.
 * Documented fields: open, high, low, close, volume, adj_high, adj_low,
 * adj_close, adj_open, adj_volume, split_factor, dividend, name,
 * exchange_code, asset_type, price_currency, symbol, exchange, date.
 * Adjusted fields follow CRSP methodology; they return null for some
 * instruments (e.g. v1 index data), so they are typed nullable.
 */
export interface MarketstackEodBar {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number | null;
  adj_open: number | null;
  adj_high: number | null;
  adj_low: number | null;
  adj_close: number | null;
  adj_volume: number | null;
  split_factor: number | null;
  dividend: number | null;
  name: string | null;
  exchange_code: string | null;
  asset_type: string | null;
  price_currency: string | null;
  /** Provider-native ticker (e.g. "AAPL", "BRK-B"). */
  symbol: string;
  /** Exchange MIC (e.g. "XNAS"). */
  exchange: string | null;
  /** ISO-8601 timestamp, e.g. "2026-07-16T00:00:00+0000". */
  date: string;
}

/**
 * /intraday item (documented via v2 /tickers/{symbol}/intraday/latest:
 * open, high, low, mid, last_size, bid_size, bid_price, ask_price,
 * ask_size, last, close, volume, marketstack_last, date, symbol, exchange).
 * Since IEX's 2025-02-01 policy change, bid/ask/last/mid/size fields are
 * NULL without a direct IEX market data agreement.
 */
export interface MarketstackIntradayBar {
  open: number | null;
  high: number | null;
  low: number | null;
  close: number | null;
  mid: number | null;
  last: number | null;
  last_size: number | null;
  bid_size: number | null;
  bid_price: number | null;
  ask_price: number | null;
  ask_size: number | null;
  volume: number | null;
  /** Marketstack's derived reference price (not an exchange-official last). */
  marketstack_last: number | null;
  date: string;
  symbol: string;
  exchange: string | null;
}

/** /splits item: {symbol, date, split_factor}. */
export interface MarketstackSplit {
  symbol: string;
  date: string;
  /** e.g. 4 for a 4:1 split. */
  split_factor: number;
}

/** /dividends item: {symbol, date, dividend}. */
export interface MarketstackDividend {
  symbol: string;
  date: string;
  /** Cash dividend per share; currency is not documented. */
  dividend: number;
}

/** /exchanges item (documented v2 field list). */
export interface MarketstackExchange {
  name: string;
  acronym: string | null;
  mic: string | null;
  country: string | null;
  country_code: string | null;
  city: string | null;
  website: string | null;
  operating_mic?: string | null;
  oprt_sgmt?: string | null;
  legal_entity_name?: string | null;
  exchange_lei?: string | null;
  market_category_code?: string | null;
  exchange_status?: string | null;
  date_creation?: string | null;
  date_last_update?: string | null;
  date_last_validation?: string | null;
  date_expiry?: string | null;
  comments?: string | null;
}

/**
 * Documented error envelope (Getting Started page):
 * {"error": {"code", "message", "context": {"<param>": [{"key","message"}]}}}
 */
export interface MarketstackErrorEnvelope {
  error: {
    code?: string;
    message?: string;
    context?: Record<string, Array<{ key: string; message: string }>>;
  };
}
