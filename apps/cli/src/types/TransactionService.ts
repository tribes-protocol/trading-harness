import type { SolInstruction } from '@/types/Solana'
import type { EthSignTypedData, Tx } from '@/types/Tx'

export type TransactionServiceParams = {
  readonly apiBaseUrl: string
  readonly apiBearerToken: string
  readonly privyAppId: string
}

export type SendEthTransactionParams = {
  readonly txData: Tx
  readonly walletId: string
}

export type SendEthCallsParams = {
  readonly calls: readonly Tx[]
  readonly walletId: string
}

export type SendSolTransactionParams = {
  readonly transaction: SolInstruction
  readonly walletId: string
}

export type SignEthTypedDataV4Params = {
  readonly typedData: EthSignTypedData
  readonly walletId: string
}
