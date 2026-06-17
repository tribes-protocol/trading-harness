import { generateAuthorizationSignature, type WalletApiRequestSignatureInput } from '@privy-io/node'
import type { SolInstruction } from '@shared/types/solana'
import type { EthSignTypedData, Tx } from '@shared/types/transaction'
import { isNullish } from '@shared/utils/lang'
import { toHex } from 'viem'

const PRIVY_API_BASE_URL = 'https://api.privy.io'

type GenerateEthSendTransactionSignatureParams = {
  readonly walletId: string
  readonly txData: Tx
  readonly privateKeyPem: string
  readonly privyAppId: string
}

type GenerateEthSendCallsSignatureParams = {
  readonly walletId: string
  readonly calls: readonly Tx[]
  readonly privateKeyPem: string
  readonly privyAppId: string
}

type GenerateSolSendTransactionSignatureParams = {
  readonly walletId: string
  readonly transaction: SolInstruction
  readonly privateKeyPem: string
  readonly privyAppId: string
}

type GenerateEthSignTypedDataV4SignatureParams = {
  readonly walletId: string
  readonly typedData: EthSignTypedData
  readonly privateKeyPem: string
  readonly privyAppId: string
}

export function generateEthSendTransactionSignature(
  params: GenerateEthSendTransactionSignatureParams
): string {
  const input: WalletApiRequestSignatureInput = {
    version: 1,
    url: new URL(`/v1/wallets/${params.walletId}/rpc`, PRIVY_API_BASE_URL).toString(),
    method: 'POST',
    headers: {
      'privy-app-id': params.privyAppId
    },
    body: {
      method: 'eth_sendTransaction',
      caip2: `eip155:${params.txData.chainId}`,
      chain_type: 'ethereum',
      params: {
        transaction: {
          to: params.txData.to,
          data: params.txData.data,
          value: toHex(params.txData.value),
          chain_id: params.txData.chainId
        }
      }
    }
  }
  return generateAuthorizationSignature({
    input,
    authorizationPrivateKey: toBase64AuthorizationPrivateKey(params.privateKeyPem)
  })
}

export function generateEthSendCallsSignature(params: GenerateEthSendCallsSignatureParams): string {
  const [firstCall, ...restCalls] = params.calls
  if (isNullish(firstCall)) {
    throw new Error('Cannot sign an empty batch of calls')
  }
  const chainId = firstCall.chainId
  if (restCalls.some((call) => call.chainId !== chainId)) {
    throw new Error('All batched calls must target the same chain')
  }

  const input: WalletApiRequestSignatureInput = {
    version: 1,
    url: new URL(`/v1/wallets/${params.walletId}/rpc`, PRIVY_API_BASE_URL).toString(),
    method: 'POST',
    headers: {
      'privy-app-id': params.privyAppId
    },
    body: {
      method: 'wallet_sendCalls',
      caip2: `eip155:${chainId}`,
      chain_type: 'ethereum',
      params: {
        calls: params.calls.map((call) => ({
          to: call.to,
          data: call.data,
          value: toHex(call.value)
        }))
      }
    }
  }
  return generateAuthorizationSignature({
    input,
    authorizationPrivateKey: toBase64AuthorizationPrivateKey(params.privateKeyPem)
  })
}

export function generateSolSendTransactionSignature(
  params: GenerateSolSendTransactionSignatureParams
): string {
  const input: WalletApiRequestSignatureInput = {
    version: 1,
    url: new URL(`/v1/wallets/${params.walletId}/rpc`, PRIVY_API_BASE_URL).toString(),
    method: 'POST',
    headers: {
      'privy-app-id': params.privyAppId
    },
    body: {
      method: 'signAndSendTransaction',
      caip2: 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp',
      chain_type: 'solana',
      params: {
        transaction: params.transaction,
        encoding: 'base64'
      }
    }
  }
  return generateAuthorizationSignature({
    input,
    authorizationPrivateKey: toBase64AuthorizationPrivateKey(params.privateKeyPem)
  })
}

export function generateEthSignTypedDataV4Signature(
  params: GenerateEthSignTypedDataV4SignatureParams
): string {
  const input: WalletApiRequestSignatureInput = {
    version: 1,
    url: new URL(`/v1/wallets/${params.walletId}/rpc`, PRIVY_API_BASE_URL).toString(),
    method: 'POST',
    headers: {
      'privy-app-id': params.privyAppId
    },
    body: {
      method: 'eth_signTypedData_v4',
      chain_type: 'ethereum',
      params: {
        typed_data: {
          domain: params.typedData.domain,
          types: params.typedData.types,
          primary_type: params.typedData.primaryType,
          message: params.typedData.message
        }
      }
    }
  }
  return generateAuthorizationSignature({
    input,
    authorizationPrivateKey: toBase64AuthorizationPrivateKey(params.privateKeyPem)
  })
}

function toBase64AuthorizationPrivateKey(privateKeyPem: string): string {
  const key = privateKeyPem.replace(/-----[^-]+-----/gu, '').replace(/\s+/gu, '')
  if (key.length === 0) {
    throw new Error('Invalid authorization private key format')
  }
  return key
}
