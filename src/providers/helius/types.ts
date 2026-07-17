/**
 * Raw Helius response shapes, derived strictly from the documented response
 * fields in docs/research/providers/helius.json (verified against the
 * official Helius docs). Only the fields this adapter consumes are typed;
 * unknown extra keys (including fixture keys starting with "_") are ignored.
 */

/**
 * JSON-RPC 2.0 envelope. Helius publishes no canonical error payload schema
 * (research record, errors.errorSchema), so the error object is typed
 * defensively per JSON-RPC 2.0 conventions.
 */
export interface HeliusRpcEnvelope<T> {
  jsonrpc?: string;
  id?: string | number;
  result?: T;
  error?: {
    code?: number;
    message?: string;
  };
}

/** DAS price_info — hourly-updated USD estimates, top-10k tokens only. */
export interface HeliusPriceInfo {
  price_per_token?: number;
  total_price?: number;
  /** Denomination of the price, e.g. "USDC". */
  currency?: string;
}

/**
 * DAS token_info for owner-scoped fungible queries (showFungible: true).
 * Documented in the DAS Fungible Token Extension guide.
 */
export interface HeliusTokenInfo {
  symbol?: string;
  /** Raw base-unit balance as a JSON number. */
  balance?: number;
  supply?: number;
  decimals?: number;
  token_program?: string;
  associated_token_address?: string;
  price_info?: HeliusPriceInfo;
}

export interface HeliusAssetContentMetadata {
  name?: string;
  symbol?: string;
  description?: string;
  token_standard?: string;
}

export interface HeliusAssetContent {
  metadata?: HeliusAssetContentMetadata;
}

export interface HeliusAssetOwnership {
  owner?: string;
  frozen?: boolean;
  delegated?: boolean;
  delegate?: string | null;
  ownership_model?: string;
}

/** One item of getAssetsByOwner result.items[] (same shape as getAsset). */
export interface HeliusDasAsset {
  interface?: string;
  /** Mint address of the token/NFT — the canonical raw identifier. */
  id: string;
  content?: HeliusAssetContent;
  ownership?: HeliusAssetOwnership;
  token_info?: HeliusTokenInfo;
  burnt?: boolean;
}

/**
 * Native SOL balance block returned when options.showNativeBalance is true.
 * Shape documented on the searchAssets reference; price fields are subject
 * to the documented DAS price caching (estimates, not real-time rates).
 */
export interface HeliusNativeBalance {
  lamports?: number;
  price_per_sol?: number;
  total_price?: number;
}

export interface HeliusGetAssetsByOwnerResult {
  last_indexed_slot?: number;
  total?: number;
  limit?: number;
  page?: number;
  items: HeliusDasAsset[];
  nativeBalance?: HeliusNativeBalance;
}

/**
 * One reconciled transfer from getTransfersByAddress result.data[].
 * amount/uiAmount are STRINGS per the official reference (raw base-unit
 * integer and decimals-adjusted decimal respectively). Token-account fields
 * are omitted for native SOL transfers.
 */
export interface HeliusTransferItem {
  signature: string;
  slot?: number;
  blockTime?: number | null;
  type?: string;
  fromUserAccount?: string | null;
  toUserAccount?: string | null;
  fromTokenAccount?: string;
  toTokenAccount?: string;
  mint?: string;
  /** Raw base-unit integer amount as a string. */
  amount?: string;
  decimals?: number;
  /** Decimals-adjusted amount as a string. */
  uiAmount?: string;
  /** Token-2022 transfer-fee fields, present only when applicable. */
  feeAmount?: string;
  feeUiAmount?: string;
  confirmationStatus?: string;
  transactionIdx?: number;
  instructionIdx?: number;
  innerInstructionIdx?: number;
}

export interface HeliusGetTransfersByAddressResult {
  data: HeliusTransferItem[];
  paginationToken?: string | null;
}

/** getHealth returns the string "ok" when the node is healthy. */
export type HeliusGetHealthResult = string;
