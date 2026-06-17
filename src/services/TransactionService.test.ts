import type { Tx } from '@/types/Tx'
import { afterEach, describe, expect, it, vi } from 'vitest'

import * as terminalApiRequest from '@/helpers/TerminalApiRequest'
import { TransactionService } from '@/services/TransactionService'
import * as privySignature from '@/utils/PrivySignature'

const API_BASE_URL = 'https://api.example.test'
const API_BEARER_TOKEN = 'test-bearer-token'
const WALLET_ID = 'wallet-id'
const PRIVATE_KEY_PEM = 'private-key-pem'

const ETH_REQUEST: Tx = {
  chainId: 42161,
  to: '0x2Df1c51E09aECF9cacB7bc98cB1742757f163dF7',
  value: BigInt(1000),
  data: '0x'
}

const NORMALIZED_ETH_REQUEST: Tx = {
  chainId: 42161,
  to: '0x2df1c51e09aecf9cacb7bc98cb1742757f163df7',
  value: BigInt(1000),
  data: '0x'
}

describe('TransactionService', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('sends eth transaction via terminal api with generated signature', async () => {
    const signatureSpy = vi
      .spyOn(privySignature, 'generateEthSendTransactionSignature')
      .mockReturnValue('privy-signature')
    const fetchSpy = vi.spyOn(terminalApiRequest, 'fetchTerminalApi').mockResolvedValue(
      new Response('"0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"', {
        status: 200,
        headers: {
          'Content-Type': 'application/json'
        }
      })
    )

    const service = new TransactionService({
      apiBaseUrl: API_BASE_URL,
      apiBearerToken: API_BEARER_TOKEN,
      privyAppId: 'privy-app-id'
    })
    const result = await service.sendEthTransaction({
      txData: ETH_REQUEST,
      walletId: WALLET_ID,
      privateKeyPem: PRIVATE_KEY_PEM
    })

    expect(result).toBe('0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb')
    expect(signatureSpy).toHaveBeenCalledWith({
      walletId: WALLET_ID,
      txData: NORMALIZED_ETH_REQUEST,
      privateKeyPem: PRIVATE_KEY_PEM,
      privyAppId: 'privy-app-id'
    })
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        apiBaseUrl: API_BASE_URL,
        apiBearerToken: API_BEARER_TOKEN,
        path: '/agent/transaction/sendEthTransaction'
      })
    )
  })
})
