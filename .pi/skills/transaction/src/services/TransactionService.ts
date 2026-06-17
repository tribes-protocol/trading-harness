import { type HexString, HexStringSchema } from '@shared/types/lang'
import { type SolSignature, SolSignatureSchema } from '@shared/types/solana'
import { TxSchema } from '@shared/types/transaction'
import { ensureJsonTreeString } from '@shared/utils/lang'
import { z } from 'zod'

import { fetchTerminalApi } from '@/helpers/TerminalApiRequest'
import {
  EthCallsSchema,
  SendEthCallsApiRequestSchema,
  SendEthTransactionApiRequestSchema,
  SendSolTransactionApiRequestSchema,
  SignEthTypedDataV4ApiRequestSchema
} from '@/types/Transaction'
import type {
  SendEthCallsParams,
  SendEthTransactionParams,
  SendSolTransactionParams,
  SignEthTypedDataV4Params,
  TransactionServiceParams
} from '@/types/TransactionService'
import {
  generateEthSendCallsSignature,
  generateEthSendTransactionSignature,
  generateEthSignTypedDataV4Signature,
  generateSolSendTransactionSignature
} from '@/utils/PrivySignature'

export class TransactionService {
  private readonly apiBaseUrl: string

  private readonly apiBearerToken: string

  private readonly privyAppId: string

  constructor(params: TransactionServiceParams) {
    this.apiBaseUrl = params.apiBaseUrl
    this.apiBearerToken = params.apiBearerToken
    this.privyAppId = params.privyAppId
  }

  async sendCalls(params: SendEthCallsParams): Promise<string> {
    const calls = EthCallsSchema.parse(params.calls)
    const signature = generateEthSendCallsSignature({
      walletId: params.walletId,
      calls,
      privateKeyPem: params.privateKeyPem,
      privyAppId: this.privyAppId
    })
    const apiRequest = SendEthCallsApiRequestSchema.parse({
      calls,
      walletId: params.walletId,
      signature
    })

    const response = await fetchTerminalApi({
      apiBaseUrl: this.apiBaseUrl,
      apiBearerToken: this.apiBearerToken,
      path: '/agent/transaction/sendCalls',
      init: {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json'
        },
        body: ensureJsonTreeString(apiRequest)
      }
    })
    if (!response.ok) {
      const bodyText = await response.text()
      throw new Error(
        `Failed to send Ethereum calls: ${response.status} ${response.statusText}${bodyText}`
      )
    }

    const data: unknown = await response.json()
    return z.string().parse(data)
  }

  async sendEthTransaction(params: SendEthTransactionParams): Promise<HexString> {
    const txData = TxSchema.parse(params.txData)
    const signature = generateEthSendTransactionSignature({
      walletId: params.walletId,
      txData,
      privateKeyPem: params.privateKeyPem,
      privyAppId: this.privyAppId
    })
    const apiRequest = SendEthTransactionApiRequestSchema.parse({
      txData,
      walletId: params.walletId,
      signature
    })

    const response = await fetchTerminalApi({
      apiBaseUrl: this.apiBaseUrl,
      apiBearerToken: this.apiBearerToken,
      path: '/agent/transaction/sendEthTransaction',
      init: {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json'
        },
        body: ensureJsonTreeString(apiRequest)
      }
    })
    if (!response.ok) {
      const bodyText = await response.text()
      throw new Error(
        `Failed to send Ethereum transaction: ${response.status} ${response.statusText}${bodyText}`
      )
    }

    const data: unknown = await response.json()
    return HexStringSchema.parse(data)
  }

  async sendSolTransaction(params: SendSolTransactionParams): Promise<SolSignature> {
    const signature = generateSolSendTransactionSignature({
      walletId: params.walletId,
      transaction: params.transaction,
      privateKeyPem: params.privateKeyPem,
      privyAppId: this.privyAppId
    })
    const apiRequest = SendSolTransactionApiRequestSchema.parse({
      transaction: params.transaction,
      walletId: params.walletId,
      signature
    })

    const response = await fetchTerminalApi({
      apiBaseUrl: this.apiBaseUrl,
      apiBearerToken: this.apiBearerToken,
      path: '/agent/transaction/sendSolTransaction',
      init: {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json'
        },
        body: ensureJsonTreeString(apiRequest)
      }
    })
    if (!response.ok) {
      const bodyText = await response.text()
      throw new Error(
        `Failed to send Solana transaction: ${response.status} ${response.statusText}${bodyText}`
      )
    }

    const data: unknown = await response.json()
    return SolSignatureSchema.parse(data)
  }

  async signEthTypedDataV4(params: SignEthTypedDataV4Params): Promise<HexString> {
    const signature = generateEthSignTypedDataV4Signature({
      walletId: params.walletId,
      typedData: params.typedData,
      privateKeyPem: params.privateKeyPem,
      privyAppId: this.privyAppId
    })
    const apiRequest = SignEthTypedDataV4ApiRequestSchema.parse({
      typedData: params.typedData,
      walletId: params.walletId,
      signature
    })

    const response = await fetchTerminalApi({
      apiBaseUrl: this.apiBaseUrl,
      apiBearerToken: this.apiBearerToken,
      path: '/agent/transaction/signEthTypedDataV4',
      init: {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json'
        },
        body: ensureJsonTreeString(apiRequest)
      }
    })
    if (!response.ok) {
      const bodyText = await response.text()
      throw new Error(
        `Failed to sign Ethereum typed data: ${response.status} ${response.statusText}${bodyText}`
      )
    }

    const data: unknown = await response.json()
    return HexStringSchema.parse(data)
  }
}
