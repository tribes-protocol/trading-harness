/**
 * Raw Moralis response shapes, derived strictly from the documented
 * response fields in docs/research/providers/moralis.json (official docs
 * reviewed 2026-07-17). Only fields the adapter consumes are typed
 * strictly; everything else is left open so unknown/undocumented keys
 * (including fixture-only keys prefixed with `_`) are ignored.
 *
 * Numeric fields are typed `string | number` wherever the official docs
 * do not pin the JSON type — Moralis serializes several numerics as
 * strings (e.g. `balance`, `usd_price_24hr_percent_change`).
 */

type NumericLike = string | number | null | undefined;

/* ------------------------- EVM: GET /erc20/{address}/price ------------------------- */

export interface MoralisErc20PriceResponse {
  tokenName?: string | null;
  tokenSymbol?: string | null;
  tokenLogo?: string | null;
  tokenDecimals?: NumericLike;
  nativePrice?: {
    value?: string;
    decimals?: number;
    name?: string;
    symbol?: string;
    address?: string;
  } | null;
  usdPrice?: NumericLike;
  usdPriceFormatted?: string | null;
  usdPrice24h?: NumericLike;
  usdPrice24hrUsdChange?: NumericLike;
  usdPrice24hrPercentChange?: NumericLike;
  exchangeAddress?: string | null;
  exchangeName?: string | null;
  tokenAddress?: string | null;
  pairAddress?: string | null;
  toBlock?: NumericLike;
  possibleSpam?: boolean | null;
  verifiedContract?: boolean | null;
  pairTotalLiquidityUsd?: NumericLike;
  securityScore?: NumericLike;
}

/* ------------------ Solana: GET /token/{network}/{address}/price ------------------ */

export interface MoralisSolanaTokenPriceResponse {
  tokenAddress?: string | null;
  pairAddress?: string | null;
  nativePrice?: {
    value?: string;
    decimals?: number;
    name?: string;
    symbol?: string;
  } | null;
  usdPrice?: NumericLike;
  exchangeAddress?: string | null;
  exchangeName?: string | null;
  logo?: string | null;
  name?: string | null;
  symbol?: string | null;
  usdPrice24h?: NumericLike;
  usdPrice24hrUsdChange?: NumericLike;
  usdPrice24hrPercentChange?: NumericLike;
  isVerifiedContract?: boolean | null;
}

/* --------------------- EVM: GET /wallets/{address}/tokens --------------------- */

export interface MoralisWalletTokenItem {
  token_address?: string | null;
  name?: string | null;
  symbol?: string | null;
  logo?: string | null;
  thumbnail?: string | null;
  decimals?: NumericLike;
  balance?: string | null;
  possible_spam?: boolean | null;
  verified_contract?: boolean | null;
  usd_price?: NumericLike;
  usd_price_24hr_percent_change?: NumericLike;
  usd_price_24hr_usd_change?: NumericLike;
  usd_value_24hr_usd_change?: NumericLike;
  usd_value?: NumericLike;
  portfolio_percentage?: NumericLike;
  balance_formatted?: string | null;
  native_token?: boolean | null;
  total_supply?: string | null;
  total_supply_formatted?: string | null;
  percentage_relative_to_total_supply?: NumericLike;
}

export interface MoralisWalletTokensResponse {
  page?: number;
  page_size?: number;
  block_number?: NumericLike;
  cursor?: string | null;
  result?: MoralisWalletTokenItem[];
}

/* ------------- Solana: GET /account/{network}/{address}/portfolio ------------- */

export interface MoralisSolanaPortfolioTokenItem {
  associatedTokenAddress?: string | null;
  mint?: string | null;
  name?: string | null;
  symbol?: string | null;
  tokenStandard?: string | number | null;
  /** Documented as string (formatted amount). */
  amount?: NumericLike;
  amountRaw?: string | null;
  /** Documented as number; string accepted defensively. */
  decimals?: NumericLike;
  logo?: string | null;
  isVerifiedContract?: boolean | null;
  possibleSpam?: boolean | null;
}

export interface MoralisSolanaPortfolioResponse {
  nativeBalance?: {
    solana?: NumericLike;
    lamports?: string | null;
  } | null;
  nfts?: unknown[];
  tokens?: MoralisSolanaPortfolioTokenItem[];
}

/* --------------------- EVM: GET /wallets/{address}/history --------------------- */

export interface MoralisErc20TransferItem {
  token_name?: string | null;
  token_symbol?: string | null;
  token_logo?: string | null;
  token_decimals?: NumericLike;
  /** Token contract address. */
  address?: string | null;
  from_address?: string | null;
  to_address?: string | null;
  /** Raw integer amount as string. */
  value?: string | null;
  value_formatted?: string | null;
  log_index?: number | null;
  possible_spam?: boolean | null;
  verified_contract?: boolean | null;
  block_timestamp?: string | null;
}

export interface MoralisNativeTransferItem {
  from_address?: string | null;
  to_address?: string | null;
  /** Raw integer amount (wei) as string. */
  value?: string | null;
  value_formatted?: string | null;
  direction?: string | null;
  internal_transaction?: boolean | null;
  token_symbol?: string | null;
  token_logo?: string | null;
}

export interface MoralisWalletHistoryTransaction {
  hash?: string | null;
  nonce?: NumericLike;
  transaction_index?: NumericLike;
  from_address?: string | null;
  from_address_label?: string | null;
  to_address?: string | null;
  to_address_label?: string | null;
  value?: string | null;
  gas?: NumericLike;
  gas_price?: NumericLike;
  block_timestamp?: string | null;
  block_number?: NumericLike;
  block_hash?: string | null;
  transaction_fee?: NumericLike;
  category?: string | null;
  summary?: string | null;
  method_label?: string | null;
  possible_spam?: boolean | null;
  erc20_transfers?: MoralisErc20TransferItem[];
  native_transfers?: MoralisNativeTransferItem[];
  nft_transfers?: unknown[];
  internal_transactions?: unknown[];
}

export interface MoralisWalletHistoryResponse {
  page?: number;
  page_size?: number;
  cursor?: string | null;
  result?: MoralisWalletHistoryTransaction[];
}

/* -------------------- EVM: GET /erc20/{token_address}/pairs -------------------- */

export interface MoralisPairTokenItem {
  token_address?: string | null;
  token_name?: string | null;
  token_symbol?: string | null;
  token_logo?: string | null;
  token_decimals?: NumericLike;
  pair_token_type?: string | null;
  liquidity_usd?: NumericLike;
}

export interface MoralisTokenPairItem {
  exchange_address?: string | null;
  exchange_name?: string | null;
  exchange_logo?: string | null;
  pair_label?: string | null;
  pair_address?: string | null;
  usd_price?: NumericLike;
  usd_price_24hr?: NumericLike;
  usd_price_24hr_percent_change?: NumericLike;
  usd_price_24hr_usd_change?: NumericLike;
  liquidity_usd?: NumericLike;
  inactive_pair?: boolean | null;
  /** Address of the base token as a string (per official schema). */
  base_token?: string | null;
  /** Address of the quote token as a string (per official schema). */
  quote_token?: string | null;
  volume_24h_native?: NumericLike;
  volume_24h_usd?: NumericLike;
  pair?: MoralisPairTokenItem[];
}

export interface MoralisTokenPairsResponse {
  pairs?: MoralisTokenPairItem[];
  cursor?: string | null;
  page_size?: number;
  page?: number;
}

/* ----------------------- EVM: GET /web3-api-version ----------------------- */

export interface MoralisWeb3ApiVersionResponse {
  version?: string;
}
