import { privateKeyToAccount } from 'viem/accounts'
import { beforeAll, describe, expect, it } from 'vitest'

import { verifyOwnerSignature } from '@/helpers/OwnerSignature'

// Local-only keys: signing happens in-process, nothing here touches a network.
const OWNER = privateKeyToAccount(`0x${'11'.repeat(32)}`)
const IMPOSTOR = privateKeyToAccount(`0x${'22'.repeat(32)}`)

const MESSAGE = [
  'Tribes Sandbox Access',
  '',
  'Sandbox: sbx-7f3a91',
  'Issued At: 2026-07-30T12:00:00.000Z',
  'Expires At: 2026-07-31T00:00:00.000Z',
  'Nonce: 0f1e2d3c4b5a6978'
].join('\n')

let ownerSignature = '0x'
let impostorSignature = '0x'

describe('verifyOwnerSignature', () => {
  beforeAll(async () => {
    ownerSignature = await OWNER.signMessage({ message: MESSAGE })
    impostorSignature = await IMPOSTOR.signMessage({ message: MESSAGE })
  })

  it('accepts a personal_sign signature made by the owner wallet', async () => {
    const verified = await verifyOwnerSignature({
      message: MESSAGE,
      signature: ownerSignature,
      ownerAddress: OWNER.address
    })
    expect(verified).toBe(true)
  })

  it('accepts a lowercased owner address', async () => {
    // TRIBES_OWNER_ADDRESS arrives as an environment string of unknown casing.
    const verified = await verifyOwnerSignature({
      message: MESSAGE,
      signature: ownerSignature,
      ownerAddress: OWNER.address.toLowerCase()
    })
    expect(verified).toBe(true)
  })

  it('rejects a signature over a tampered message', async () => {
    // The sandbox id is inside the signed bytes, so swapping it invalidates the
    // signature rather than redirecting a valid one.
    const tampered = MESSAGE.replace('sbx-7f3a91', 'sbx-attacker')
    const verified = await verifyOwnerSignature({
      message: tampered,
      signature: ownerSignature,
      ownerAddress: OWNER.address
    })
    expect(verified).toBe(false)
  })

  it('rejects a valid signature from someone who is not the owner', async () => {
    const verified = await verifyOwnerSignature({
      message: MESSAGE,
      signature: impostorSignature,
      ownerAddress: OWNER.address
    })
    expect(verified).toBe(false)
  })

  it('rejects junk instead of throwing', async () => {
    await expect(
      verifyOwnerSignature({ message: MESSAGE, signature: 'nope', ownerAddress: OWNER.address })
    ).resolves.toBe(false)
    await expect(
      verifyOwnerSignature({
        message: MESSAGE,
        signature: '0xdeadbeef',
        ownerAddress: OWNER.address
      })
    ).resolves.toBe(false)
    await expect(
      verifyOwnerSignature({ message: MESSAGE, signature: ownerSignature, ownerAddress: '' })
    ).resolves.toBe(false)
    await expect(
      verifyOwnerSignature({
        message: MESSAGE,
        signature: ownerSignature,
        ownerAddress: 'not-an-address'
      })
    ).resolves.toBe(false)
  })
})
