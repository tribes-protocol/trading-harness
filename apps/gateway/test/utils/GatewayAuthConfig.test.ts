import { describe, expect, it } from 'vitest'

import { resolveGatewayAuthConfig } from '@/utils/GatewayAuthConfig'

const OWNER = '0x19E7E376E7C213B7E7e7e46cc70A5dD086DAff2A'

/**
 * These tests exist because the first version of this gateway INFERRED its auth
 * mode from whether `TRIBES_OWNER_ADDRESS` happened to be set, which fails OPEN: a
 * VM that boots without the variable — and on a warm-pool-claimed box the owner
 * address lands in root-only /run/tribes/claim.env.json, so that is not
 * hypothetical — would serve in dev mode, admitting any client that omits an
 * Origin header. Behind a Caddy front with no forward_auth, that is remote code
 * execution against the user's checkout.
 *
 * Every assertion below is about the direction of failure: an unclear
 * configuration must refuse to boot, never quietly weaken.
 */
describe('resolveGatewayAuthConfig', () => {
  it('defaults to owner mode when the variable is unset', () => {
    // Forgetting GATEWAY_AUTH_MODE must not be how a box ends up unauthenticated.
    const resolved = resolveGatewayAuthConfig({ mode: '', ownerAddress: OWNER, sandboxId: 'sbx-1' })
    expect(resolved).toEqual({
      ok: true,
      config: { mode: 'owner', ownerAddress: OWNER, sandboxId: 'sbx-1' }
    })
  })

  it('refuses to start in owner mode with no owner address, instead of dropping to dev', () => {
    const resolved = resolveGatewayAuthConfig({ mode: '', ownerAddress: '', sandboxId: 'sbx-1' })
    expect(resolved.ok).toBe(false)
    expect(resolved.ok ? '' : resolved.error).toContain('TRIBES_OWNER_ADDRESS')
  })

  it('refuses a malformed owner address rather than bricking every request', () => {
    // A bad address would otherwise arm owner mode and then fail verification
    // forever — no signature could ever open the front.
    for (const ownerAddress of ['not-an-address', '0x1234', OWNER.slice(0, -1), `${OWNER}00`]) {
      const resolved = resolveGatewayAuthConfig({ mode: 'owner', ownerAddress, sandboxId: 'sbx-1' })
      expect(resolved.ok, `${ownerAddress} must be refused`).toBe(false)
    }
  })

  it('accepts an owner address in either casing', () => {
    // viem recovers and compares case-insensitively, and the value arrives as an
    // environment string of unknown casing.
    for (const ownerAddress of [
      OWNER,
      OWNER.toLowerCase(),
      OWNER.toUpperCase().replace('0X', '0x')
    ])
      expect(
        resolveGatewayAuthConfig({ mode: 'owner', ownerAddress, sandboxId: 'sbx-1' }).ok,
        ownerAddress
      ).toBe(true)
  })

  it('refuses owner mode with no sandbox id', () => {
    // Without it, a challenge signed for ANY other sandbox would verify here.
    const resolved = resolveGatewayAuthConfig({ mode: 'owner', ownerAddress: OWNER, sandboxId: '' })
    expect(resolved.ok).toBe(false)
    expect(resolved.ok ? '' : resolved.error).toContain('TRIBES_SANDBOX_ID')
  })

  it('allows dev mode only when it is asked for by name', () => {
    const resolved = resolveGatewayAuthConfig({ mode: 'dev', ownerAddress: '', sandboxId: '' })
    expect(resolved).toEqual({ ok: true, config: { mode: 'dev' } })
  })

  it('refuses an unrecognised mode instead of guessing', () => {
    for (const mode of ['owner ', 'DEV', 'none', 'off', 'true', 'production']) {
      const resolved = resolveGatewayAuthConfig({ mode, ownerAddress: OWNER, sandboxId: 'sbx-1' })
      expect(resolved.ok, `${mode} must be refused`).toBe(false)
    }
  })
})
