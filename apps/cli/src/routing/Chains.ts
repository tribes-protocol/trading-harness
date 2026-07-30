// ---------------------------------------------------------------------------
// Canonical chain names for `tribes-cli asset` and their per-provider
// identifiers: BirdEye `x-chain` header value, CoinGecko onchain
// (GeckoTerminal) network id, CoinGecko asset-platform id.
// ---------------------------------------------------------------------------

export type CanonicalChain =
  | 'solana'
  | 'ethereum'
  | 'base'
  | 'bsc'
  | 'arbitrum'
  | 'polygon'
  | 'optimism'
  | 'avalanche'

export type ResolvedChain = {
  readonly canonical: CanonicalChain
  readonly birdeye: string
  readonly geckoterminal: string
  readonly coingecko: string
}

type ChainProviderIds = {
  readonly birdeye: string
  readonly geckoterminal: string
  readonly coingecko: string
}

const CHAIN_PROVIDER_IDS: Record<CanonicalChain, ChainProviderIds> = {
  solana: { birdeye: 'solana', geckoterminal: 'solana', coingecko: 'solana' },
  ethereum: { birdeye: 'ethereum', geckoterminal: 'eth', coingecko: 'ethereum' },
  base: { birdeye: 'base', geckoterminal: 'base', coingecko: 'base' },
  bsc: { birdeye: 'bsc', geckoterminal: 'bsc', coingecko: 'binance-smart-chain' },
  arbitrum: { birdeye: 'arbitrum', geckoterminal: 'arbitrum', coingecko: 'arbitrum-one' },
  polygon: { birdeye: 'polygon', geckoterminal: 'polygon_pos', coingecko: 'polygon-pos' },
  optimism: { birdeye: 'optimism', geckoterminal: 'optimism', coingecko: 'optimistic-ethereum' },
  // BirdEye docs list the chain as 'avalanche'; GeckoTerminal's network id is
  // 'avax'. Unverified against a live call on this key — flag if a 4xx points
  // at the chain id.
  avalanche: { birdeye: 'avalanche', geckoterminal: 'avax', coingecko: 'avalanche' }
}

function isCanonicalChain(value: string): value is CanonicalChain {
  return value in CHAIN_PROVIDER_IDS
}

export function resolveChain(chain: string): ResolvedChain {
  const canonical = chain.trim().toLowerCase()
  if (!isCanonicalChain(canonical)) {
    throw new Error(
      `unsupported chain '${chain}' — supported chains: ${Object.keys(CHAIN_PROVIDER_IDS).join(', ')}`
    )
  }
  const ids = CHAIN_PROVIDER_IDS[canonical]
  return { canonical, ...ids }
}
