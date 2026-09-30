// ---------------------------------------------------------------------------
// Canonical chain names for `tribes-cli asset` and their per-provider
// identifiers: BirdEye `x-chain` header value.
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
}

type ChainProviderIds = {
  readonly birdeye: string
}

const CHAIN_PROVIDER_IDS: Record<CanonicalChain, ChainProviderIds> = {
  solana: { birdeye: 'solana' },
  ethereum: { birdeye: 'ethereum' },
  base: { birdeye: 'base' },
  bsc: { birdeye: 'bsc' },
  arbitrum: { birdeye: 'arbitrum' },
  polygon: { birdeye: 'polygon' },
  optimism: { birdeye: 'optimism' },
  // BirdEye docs list the chain as 'avalanche'. Unverified against a live call
  // on this key — flag if a 4xx points at the chain id.
  avalanche: { birdeye: 'avalanche' }
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
