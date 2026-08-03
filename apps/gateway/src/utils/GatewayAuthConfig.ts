import {
  type GatewayAuthMode,
  GatewayAuthModeSchema,
  type GatewayAuthResolution,
  OwnerAddressSchema
} from '@/types/OwnerAuth'

/**
 * Turn raw environment strings into a validated auth configuration, or into an
 * error the process exits on.
 *
 * Pure and synchronous so the fail-closed property is testable without booting a
 * server. Every branch that cannot produce a safe configuration returns an error;
 * there is no path from a bad owner setup to a weaker mode.
 */

interface ResolveGatewayAuthConfigParams {
  // Raw GATEWAY_AUTH_MODE. Absent/empty means the default, which is `owner`.
  mode: string
  ownerAddress: string
  sandboxId: string
}

export function resolveGatewayAuthConfig(
  params: ResolveGatewayAuthConfigParams
): GatewayAuthResolution {
  const mode = parseMode(params.mode)
  if (mode === null) {
    return {
      ok: false,
      error:
        `GATEWAY_AUTH_MODE="${params.mode}" is not a mode. ` +
        'Use "owner" (require an owner signature) or "dev" (loopback only, no auth).'
    }
  }

  if (mode === 'dev') {
    return { ok: true, config: { mode: 'dev' } }
  }

  // Owner mode: both values are required and the address must actually be one.
  // A malformed address would otherwise arm owner mode and then fail every single
  // verification, bricking the front with no signature able to open it.
  const ownerAddress = OwnerAddressSchema.safeParse(params.ownerAddress)
  if (!ownerAddress.success) {
    return {
      ok: false,
      error:
        params.ownerAddress.length === 0
          ? 'GATEWAY_AUTH_MODE=owner requires TRIBES_OWNER_ADDRESS, which is unset. ' +
            'Set it, or pass GATEWAY_AUTH_MODE=dev for a loopback-only gateway.'
          : `TRIBES_OWNER_ADDRESS="${params.ownerAddress}" is not a 0x-prefixed EVM address.`
    }
  }
  if (params.sandboxId.length === 0) {
    return {
      ok: false,
      error:
        'GATEWAY_AUTH_MODE=owner requires TRIBES_SANDBOX_ID: without it a challenge ' +
        'signed for any other sandbox would verify here.'
    }
  }

  return {
    ok: true,
    config: { mode: 'owner', ownerAddress: ownerAddress.data, sandboxId: params.sandboxId }
  }
}

function parseMode(raw: string): GatewayAuthMode | null {
  // Unset defaults to the STRICT mode. Forgetting the variable must not be the
  // way a production box ends up unauthenticated.
  if (raw.length === 0) {
    return 'owner'
  }
  const parsed = GatewayAuthModeSchema.safeParse(raw)
  return parsed.success ? parsed.data : null
}
