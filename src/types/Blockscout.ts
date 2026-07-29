import { z } from 'zod'

// ---------------------------------------------------------------------------
// Blockscout multichain gateway (api.blockscout.com). Every path is prefixed by
// the numeric CHAIN ID as its first segment: /{chainId}/api/v2/...
//
// Scope is deliberately narrow — five reads that answer the questions the risk
// desk asks before sizing an EVM position, and nothing else. Blockscout exposes
// a large explorer API; blocks, logs, stats and NFT metadata are not wrapped
// because no desk consumes them, and price/market data is left to CoinGecko,
// BirdEye and GeckoTerminal, which do it better.
//
// The gap this fills: BirdEye covers holders but is Solana-centric, and nothing
// in the stack could previously answer "is this contract verified, is it a
// proxy, who deployed it, and what else has that deployer touched" on EVM.
// ---------------------------------------------------------------------------

// Blockscout tags addresses it believes are scams and tokens by reputation.
// These are the provider's opinion, not ground truth — surfaced because a
// negative flag is worth acting on, not because a clean one proves safety.
export const BlockscoutAddressSchema = z
  .object({
    hash: z.string().nullish(),
    name: z.string().nullish(),
    is_contract: z.boolean().nullish(),
    is_verified: z.boolean().nullish(),
    is_scam: z.boolean().nullish(),
    proxy_type: z.string().nullish(),
    creator_address_hash: z.string().nullish(),
    creation_transaction_hash: z.string().nullish(),
    coin_balance: z.string().nullish(),
    ens_domain_name: z.string().nullish(),
    public_tags: z.array(z.unknown()).nullish()
  })
  .passthrough()
export type BlockscoutAddress = z.infer<typeof BlockscoutAddressSchema>

export const BlockscoutTokenSchema = z
  .object({
    address_hash: z.string().nullish(),
    name: z.string().nullish(),
    symbol: z.string().nullish(),
    decimals: z.string().nullish(),
    type: z.string().nullish(),
    total_supply: z.string().nullish(),
    holders_count: z.string().nullish(),
    circulating_market_cap: z.string().nullish(),
    reputation: z.string().nullish()
  })
  .passthrough()
export type BlockscoutToken = z.infer<typeof BlockscoutTokenSchema>

// Holder balances arrive as raw integer strings in token base units — they are
// NOT decimal-adjusted, so a comparison against total_supply must use the same
// units rather than a humanized figure.
const BlockscoutHolderSchema = z
  .object({
    address: BlockscoutAddressSchema.nullish(),
    value: z.string().nullish(),
    token_id: z.string().nullish()
  })
  .passthrough()

export const BlockscoutHoldersSchema = z
  .object({
    items: z.array(BlockscoutHolderSchema).nullish(),
    next_page_params: z.unknown()
  })
  .passthrough()
export type BlockscoutHolders = z.infer<typeof BlockscoutHoldersSchema>

// `is_verified` only means source was published. `is_fully_verified` and
// `is_partially_verified` distinguish how much of it matched, and a non-null
// `proxy_type` means the ABI here is the PROXY's, not the implementation's.
export const BlockscoutContractSchema = z
  .object({
    name: z.string().nullish(),
    is_verified: z.boolean().nullish(),
    is_fully_verified: z.boolean().nullish(),
    is_partially_verified: z.boolean().nullish(),
    is_changed_bytecode: z.boolean().nullish(),
    certified: z.boolean().nullish(),
    proxy_type: z.string().nullish(),
    implementations: z.array(z.unknown()).nullish(),
    compiler_version: z.string().nullish(),
    evm_version: z.string().nullish(),
    creation_status: z.string().nullish()
  })
  .passthrough()
export type BlockscoutContract = z.infer<typeof BlockscoutContractSchema>

const BlockscoutTransactionSchema = z
  .object({
    hash: z.string().nullish(),
    timestamp: z.string().nullish(),
    method: z.string().nullish(),
    result: z.string().nullish(),
    status: z.string().nullish(),
    value: z.string().nullish(),
    from: BlockscoutAddressSchema.nullish(),
    to: BlockscoutAddressSchema.nullish(),
    created_contract: BlockscoutAddressSchema.nullish()
  })
  .passthrough()

export const BlockscoutTransactionsSchema = z
  .object({
    items: z.array(BlockscoutTransactionSchema).nullish(),
    next_page_params: z.unknown()
  })
  .passthrough()
export type BlockscoutTransactions = z.infer<typeof BlockscoutTransactionsSchema>

// ---------------------------------------------------------------------------
// `tribes-cli onchain-evm` command options.
// ---------------------------------------------------------------------------

const OutOptionSchema = z.string().nullish()
// Numeric chain id, not a name — the gateway validates it and 404s an unknown
// one, which is how a bad chain is told apart from a missing key (402).
const ChainIdSchema = z.number().int().positive()
const AddressSchema = z.string().min(1)

export const EvmAddressCommandOptionsSchema = z.object({
  chainId: ChainIdSchema,
  address: AddressSchema,
  out: OutOptionSchema
})
export type EvmAddressCommandOptions = z.infer<typeof EvmAddressCommandOptionsSchema>

export const EvmTransactionsCommandOptionsSchema = z.object({
  chainId: ChainIdSchema,
  address: AddressSchema,
  limit: z.number().int().min(1).max(100).nullish(),
  out: OutOptionSchema
})
export type EvmTransactionsCommandOptions = z.infer<typeof EvmTransactionsCommandOptionsSchema>

export const EvmHoldersCommandOptionsSchema = z.object({
  chainId: ChainIdSchema,
  address: AddressSchema,
  limit: z.number().int().min(1).max(100).nullish(),
  out: OutOptionSchema
})
export type EvmHoldersCommandOptions = z.infer<typeof EvmHoldersCommandOptionsSchema>
