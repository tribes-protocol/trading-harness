import { describe, expect, it } from 'vitest'

import type { GatewayAuthConfig } from '@/types/OwnerAuth'
import { decideUpgrade } from '@/utils/UpgradePolicy'

const OWNER_MODE: GatewayAuthConfig = {
  mode: 'owner',
  ownerAddress: '0x19E7E376E7C213B7E7e7e46cc70A5dD086DAff2A',
  sandboxId: 'sbx-1'
}
const DEV_MODE: GatewayAuthConfig = { mode: 'dev' }

describe('decideUpgrade', () => {
  describe('owner mode (running inside a sandbox VM)', () => {
    it('denies an upgrade that presents no signature', () => {
      expect(decideUpgrade({ auth: OWNER_MODE, ownerAuth: null, originAllowed: false })).toEqual({
        allowed: false,
        status: 401,
        reason: 'owner-signature-required'
      })
    })

    it('denies an unsigned upgrade even when the origin is on the allowlist', () => {
      // The hole this closes: the pi. front is a bare reverse_proxy, so anyone can
      // reach it and set any Origin they like. An allowlisted origin must never
      // stand in for the signature.
      expect(decideUpgrade({ auth: OWNER_MODE, ownerAuth: null, originAllowed: true })).toEqual({
        allowed: false,
        status: 401,
        reason: 'owner-signature-required'
      })
      expect(
        decideUpgrade({
          auth: OWNER_MODE,
          ownerAuth: { authorized: false, reason: 'no-credentials' },
          originAllowed: true
        })
      ).toEqual({ allowed: false, status: 401, reason: 'no-credentials' })
    })

    it('denies a failed signature check and reports why', () => {
      expect(
        decideUpgrade({
          auth: OWNER_MODE,
          ownerAuth: { authorized: false, reason: 'expired' },
          originAllowed: true
        })
      ).toEqual({ allowed: false, status: 401, reason: 'expired' })
      expect(
        decideUpgrade({
          auth: OWNER_MODE,
          ownerAuth: { authorized: false, reason: 'signature-not-owner' },
          originAllowed: true
        })
      ).toEqual({ allowed: false, status: 401, reason: 'signature-not-owner' })
    })

    it('allows a verified owner from an origin the allowlist has never heard of', () => {
      // The real browser origin is https://pi.<slug>.<domain>, which is not
      // knowable at boot — the signature is the whole boundary here.
      expect(
        decideUpgrade({ auth: OWNER_MODE, ownerAuth: { authorized: true }, originAllowed: false })
      ).toEqual({ allowed: true })
    })
  })

  describe('dev mode (explicitly opted into)', () => {
    it('allows an allowlisted origin', () => {
      expect(decideUpgrade({ auth: DEV_MODE, ownerAuth: null, originAllowed: true })).toEqual({
        allowed: true
      })
    })

    it('denies an origin that is not on the allowlist', () => {
      expect(decideUpgrade({ auth: DEV_MODE, ownerAuth: null, originAllowed: false })).toEqual({
        allowed: false,
        status: 403,
        reason: 'origin-not-allowed'
      })
    })
  })
})
