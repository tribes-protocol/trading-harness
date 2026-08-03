import type { GatewayAuthConfig, OwnerAuthResult, UpgradeDecision } from '@/types/OwnerAuth'

/**
 * Who may upgrade the screen socket. Two modes, and only two.
 *
 * **Owner mode** — the gateway is inside a sandbox microVM.
 * `tribes-caddy add pi.<slug>.<domain>` renders a BARE `reverse_proxy` — no
 * `forward_auth`, unlike the ide./vnc. fronts — so that front is publicly
 * reachable and a valid owner signature is the ONLY thing standing between the
 * internet and a Pi agent holding bash and write over the user's checkout. A
 * missing, bad, expired or mismatched signature is a 401. The origin allowlist is
 * not consulted and cannot substitute: the real browser origin is
 * `https://pi.<slug>.<domain>`, which is not knowable at boot, and an allowlist
 * entry would be a weaker check standing in for a stronger one.
 *
 * **Dev mode** — a developer laptop, opted into explicitly by
 * `GATEWAY_AUTH_MODE=dev`. The origin allowlist alone, because the socket is on
 * loopback. Main warns loudly at startup that this build must not be exposed.
 *
 * The mode arrives as a validated `GatewayAuthConfig`, not as a boolean derived
 * from whether some environment variable was set. That is the point: a config that
 * cannot be built safely never reaches this function, because Main exits first.
 *
 * Pure and synchronous so the policy is testable without a socket. It takes the
 * VERDICT of signature verification, never an address — a request cannot hand in
 * the address it will be measured against.
 */

interface DecideUpgradeParams {
  auth: GatewayAuthConfig
  // The verdict from verifying the request's ?message/?signature against the
  // configured owner address. null when nothing was verified.
  ownerAuth: OwnerAuthResult | null
  originAllowed: boolean
}

export function decideUpgrade(params: DecideUpgradeParams): UpgradeDecision {
  switch (params.auth.mode) {
    case 'owner': {
      if (params.ownerAuth === null) {
        return { allowed: false, status: 401, reason: 'owner-signature-required' }
      }
      if (!params.ownerAuth.authorized) {
        return { allowed: false, status: 401, reason: params.ownerAuth.reason }
      }
      return { allowed: true }
    }
    case 'dev': {
      if (!params.originAllowed) {
        return { allowed: false, status: 403, reason: 'origin-not-allowed' }
      }
      return { allowed: true }
    }
  }
}
