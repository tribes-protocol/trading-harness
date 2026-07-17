/**
 * Raw Alchemy response shapes consumed by the adapter, derived strictly
 * from the official docs captured in docs/research/providers/alchemy.json
 * (Transfers API reference, Portfolio API get-tokens-by-address, Prices
 * API quickstart). Fields the adapter does not consume are omitted.
 */

/* ------------------------------ JSON-RPC ------------------------------- */

export interface AlchemyJsonRpcError {
  code: number;
  message: string;
}

/**
 * JSON-RPC 2.0 envelope. HTTP 200 responses can still carry an `error`
 * object (e.g. execution reverted, code 3) — callers MUST check `error`
 * before trusting `result`.
 */
export interface AlchemyJsonRpcResponse<T> {
  jsonrpc: string;
  id: number | string | null;
  result?: T;
  error?: AlchemyJsonRpcError;
}

/* ------------------- alchemy_getAssetTransfers (v2) -------------------- */

export interface AlchemyRawContract {
  /** Raw transfer value as hex string; null for NFTs. */
  value: string | null;
  /** Token contract address; null for external/internal (native) transfers. */
  address: string | null;
  /** Token decimals as hex string; nullable. */
  decimal: string | null;
}

export interface AlchemyErc1155Metadata {
  tokenId: string;
  value: string;
}

export interface AlchemyAssetTransfer {
  /** external | internal | erc20 | erc721 | erc1155 | specialnft */
  category: string;
  /** Hex-encoded block number. */
  blockNum: string;
  from: string;
  /** Null for contract creation. */
  to: string | null;
  /** Decimal-adjusted amount; null for ERC-721 / unknown decimals. */
  value: number | null;
  /** Transaction hash. */
  hash: string;
  /** Unique transfer identifier (disambiguates transfers within one tx). */
  uniqueId?: string;
  tokenId?: string | null;
  /** Deprecated by Alchemy; use tokenId. */
  erc721TokenId?: string | null;
  erc1155Metadata?: AlchemyErc1155Metadata[] | null;
  /** "ETH" or token symbol; nullable. */
  asset: string | null;
  rawContract: AlchemyRawContract;
  /** Present when withMetadata: true (Ethereum/Base/Polygon/Arbitrum/Optimism). */
  metadata?: { blockTimestamp: string };
}

export interface AlchemyAssetTransfersResult {
  transfers: AlchemyAssetTransfer[];
  /** Cursor for the next page (10-minute TTL); blank/absent when done. */
  pageKey?: string;
}

/* ------------- Portfolio (Data) API — tokens by address (v1) ------------ */

export interface AlchemyPriceEntry {
  /** e.g. "usd" (case varies across docs examples). */
  currency: string;
  /** Price as a decimal STRING. */
  value: string;
  /** ISO-8601 timestamp of the provider's last price update. */
  lastUpdatedAt: string;
}

export interface AlchemyPortfolioTokenMetadata {
  name?: string | null;
  symbol?: string | null;
  decimals?: number | null;
  logo?: string | null;
}

export interface AlchemyPortfolioToken {
  /** Queried wallet address. */
  address: string;
  /** Network identifier, e.g. "eth-mainnet", "matic-mainnet". */
  network: string;
  /** Token contract address; null for the native token. */
  tokenAddress: string | null;
  /** Raw base-unit balance as decimal string per docs (hex tolerated defensively). */
  tokenBalance: string;
  tokenMetadata?: AlchemyPortfolioTokenMetadata | null;
  tokenPrices?: AlchemyPriceEntry[] | null;
  /** Null on success; error message string otherwise. */
  error?: string | null;
}

export interface AlchemyTokensByAddressResponse {
  data: {
    tokens: AlchemyPortfolioToken[];
    pageKey?: string | null;
  };
}

/* --------------------------- Prices API (v1) ---------------------------- */

export interface AlchemyPricesTokenResult {
  /** Present on by-symbol responses only. */
  symbol?: string | null;
  /** Present on by-address responses (endpoint reference): queried network. */
  network?: string | null;
  /** Present on by-address responses (endpoint reference): queried address. */
  address?: string | null;
  prices: AlchemyPriceEntry[];
  /** Null on success. */
  error?: unknown;
}

export interface AlchemyPricesResponse {
  data: AlchemyPricesTokenResult[];
}
