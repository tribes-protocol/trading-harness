import { generateAuthorizationSignature, type WalletApiRequestSignatureInput } from '@privy-io/node'
import type { SolInstruction } from '@shared/types/solana'
import type { EthSignTypedData, Tx } from '@shared/types/transaction'
import { toHex } from 'viem'

import { PRIVY_APP_ID } from '@/common/env'
import type { CommandResult } from '@/types/CommandRunner'

const PRIVY_API_BASE_URL = 'https://api.privy.io'

interface GenerateEthSendTransactionSignatureParams {
  walletId: string
  txData: Tx
  privateKeyPem: string
}

interface GenerateSolSendTransactionSignatureParams {
  walletId: string
  transaction: SolInstruction
  privateKeyPem: string
}

interface GenerateEthSignTypedDataV4SignatureParams {
  walletId: string
  typedData: EthSignTypedData
  privateKeyPem: string
}

export function commandText(result: CommandResult): string {
  const parts = [result.stdout.trim(), result.stderr.trim()].filter((part) => part.length > 0)
  return parts.join('\n')
}

export function trimCommandText(result: CommandResult): string {
  return commandText(result).slice(0, 4000)
}

export function generateEthSendTransactionSignature(
  params: GenerateEthSendTransactionSignatureParams
): string {
  const { walletId, txData, privateKeyPem } = params
  const input: WalletApiRequestSignatureInput = {
    version: 1,
    url: new URL(`/v1/wallets/${walletId}/rpc`, PRIVY_API_BASE_URL).toString(),
    method: 'POST',
    headers: {
      'privy-app-id': PRIVY_APP_ID
    },
    body: {
      method: 'eth_sendTransaction',
      caip2: `eip155:${txData.chainId}`,
      chain_type: 'ethereum',
      params: {
        transaction: {
          to: txData.to,
          data: txData.data,
          value: toHex(txData.value),
          chain_id: txData.chainId
        }
      }
    }
  }

  return generateAuthorizationSignature({
    input,
    authorizationPrivateKey: toBase64AuthorizationPrivateKey(privateKeyPem)
  })
}

export function generateSolSendTransactionSignature(
  params: GenerateSolSendTransactionSignatureParams
): string {
  const { walletId, transaction, privateKeyPem } = params
  const input: WalletApiRequestSignatureInput = {
    version: 1,
    url: new URL(`/v1/wallets/${walletId}/rpc`, PRIVY_API_BASE_URL).toString(),
    method: 'POST',
    headers: {
      'privy-app-id': PRIVY_APP_ID
    },
    body: {
      method: 'signAndSendTransaction',
      caip2: 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp',
      chain_type: 'solana',
      params: {
        transaction,
        encoding: 'base64'
      }
    }
  }

  return generateAuthorizationSignature({
    input,
    authorizationPrivateKey: toBase64AuthorizationPrivateKey(privateKeyPem)
  })
}

export function generateEthSignTypedDataV4Signature(
  params: GenerateEthSignTypedDataV4SignatureParams
): string {
  const { walletId, typedData, privateKeyPem } = params
  const input: WalletApiRequestSignatureInput = {
    version: 1,
    url: new URL(`/v1/wallets/${walletId}/rpc`, PRIVY_API_BASE_URL).toString(),
    method: 'POST',
    headers: {
      'privy-app-id': PRIVY_APP_ID
    },
    body: {
      method: 'eth_signTypedData_v4',
      chain_type: 'ethereum',
      params: {
        typed_data: {
          domain: typedData.domain,
          types: typedData.types,
          primary_type: typedData.primaryType,
          message: typedData.message
        }
      }
    }
  }

  return generateAuthorizationSignature({
    input,
    authorizationPrivateKey: toBase64AuthorizationPrivateKey(privateKeyPem)
  })
}

function toBase64AuthorizationPrivateKey(privateKeyPem: string): string {
  const key = privateKeyPem.replace(/-----[^-]+-----/gu, '').replace(/\s+/gu, '')
  if (key.length === 0) {
    throw new Error('Invalid authorization private key format')
  }
  return key
}
