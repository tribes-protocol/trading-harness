import type { SolInstruction } from '@shared/types/solana'
import type { EthSignTypedData, Tx } from '@shared/types/transaction'

export type TransactionServiceParams = {
  readonly apiBaseUrl: string
  readonly apiBearerToken: string
  readonly privyAppId: string
}

export type SendEthTransactionParams = {
  readonly txData: Tx
  readonly walletId: string
  readonly privateKeyPem: string
}

export type SendEthCallsParams = {
  readonly calls: readonly Tx[]
  readonly walletId: string
  readonly privateKeyPem: string
}

export type SendSolTransactionParams = {
  readonly transaction: SolInstruction
  readonly walletId: string
  readonly privateKeyPem: string
}

export type SignEthTypedDataV4Params = {
  readonly typedData: EthSignTypedData
  readonly walletId: string
  readonly privateKeyPem: string
}
