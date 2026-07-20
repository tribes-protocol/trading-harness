export type WalletChainId = number | 'solana'

export interface WalletAssetPnl {
  readonly realizedUsd: number
  readonly realizedPercent: number
  readonly unrealizedUsd: number
  readonly unrealizedPercent: number | null
  readonly totalUsd: number
  readonly totalPercent: number | null
}

export interface WalletAsset {
  readonly kind: 'erc20' | 'spl'
  readonly address: string
  readonly name: string
  readonly symbol: string
  readonly chainId: WalletChainId
  readonly wallet: string | null
  readonly balance: number
  readonly balanceUsd: number
  readonly usdPrice: number
  readonly usdPrice24hrPercentChange: number | null
  readonly verified: string
  readonly pnl: WalletAssetPnl | null
}

export interface WalletStatus {
  readonly ok: boolean
  readonly schema: 'wallet-status.v1'
  readonly updatedAt: string
  readonly accountSource: 'agent-assets' | 'cache' | 'unavailable'
  readonly wallets: readonly string[]
  readonly assets: readonly WalletAsset[]
  readonly totalUsd: number
  readonly totalPnlUsd: number | null
  readonly initializing: boolean
  readonly unauthenticated: boolean
  readonly stale: boolean
  readonly error: string | null
}
