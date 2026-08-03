import { z } from 'zod'

// ---------------------------------------------------------------------------
// Owner-signature access control for the gateway's screen socket.
//
// VENDORED COPY. The canonical definition of the signed challenge is
// apps/microvmd/src/utils/SandboxChallenge.ts (with its
// apps/microvmd/src/types/SandboxChallenge.ts) in tribes-protocol/terminal; the
// control-plane copy of the same contract lives in
// @tribes-terminal/sandboxing/shared. The gateway keeps its own because it is a
// different repo and may not depend on terminal's packages.
//
// The two MUST stay compatible: the signed TEXT FORMAT and the TTL are the wire
// contract. The browser fetches ONE challenge from microvmd's GET /challenge,
// personal_signs it, and reuses that single (message, signature) pair for both
// the terminal socket and this gateway's socket — so any drift here does not
// degrade gracefully, it locks the owner out of the pi front while the terminal
// keeps working. Verification is stateless on purpose: every field needed to
// verify rides inside the signed text, so the gateway stores nothing.
// ---------------------------------------------------------------------------

// How long a signed challenge stays valid. Must equal the canonical TTL: the
// window is also range-checked below, so a shorter value here would reject
// microvmd-issued challenges outright.
export const SANDBOX_CHALLENGE_TTL_MS = 12 * 60 * 60 * 1000

// The parsed form of a challenge message (see utils/SandboxChallenge for the
// text the owner actually signs).
export const SandboxChallengeSchema = z.object({
  sandboxId: z.string().trim().min(1),
  issuedAtMs: z.number().int().positive(),
  expiresAtMs: z.number().int().positive(),
  nonce: z.string().regex(/^[0-9a-f]{16,64}$/)
})
export type SandboxChallenge = z.infer<typeof SandboxChallengeSchema>

// The owner EVM address injected into the VM at boot (TRIBES_OWNER_ADDRESS).
// Checksum-insensitive on purpose — viem recovers and compares case-insensitively,
// and the address arrives as an environment string of unknown casing.
export const OwnerAddressSchema = z.custom<`0x${string}`>(
  (value): value is `0x${string}` => typeof value === 'string' && /^0x[0-9a-fA-F]{40}$/.test(value)
)
export type OwnerAddress = z.infer<typeof OwnerAddressSchema>

// A personal_sign signature as the browser puts it on the URL.
export const HexSignatureSchema = z.custom<`0x${string}`>(
  (value): value is `0x${string}` => typeof value === 'string' && /^0x[0-9a-fA-F]+$/.test(value)
)
export type HexSignature = z.infer<typeof HexSignatureSchema>

// ---------------------------------------------------------------------------
// The auth boundary is DECLARED, never inferred.
//
// An earlier shape derived the mode from whether TRIBES_OWNER_ADDRESS happened to
// be set. That fails OPEN, which is the wrong direction for the only thing
// standing between the internet and an agent holding bash over the user's repo:
// a VM that boots without the variable — and the owner address does not always
// reach the process, since on a warm-pool-claimed box it lands in root-only
// /run/tribes/claim.env.json — would silently serve in dev mode, where a client
// that simply omits an Origin header is admitted.
//
// So the mode is an explicit enum defaulting to `owner`, and owner mode with a
// missing or malformed address REFUSES TO BOOT rather than downgrading. Running
// unauthenticated is something a developer has to ask for by name.
// ---------------------------------------------------------------------------

export const GatewayAuthModeSchema = z.enum(['owner', 'dev'])
export type GatewayAuthMode = z.infer<typeof GatewayAuthModeSchema>

// The resolved, already-validated auth configuration. Owner mode cannot be
// represented without both an address and a sandbox id, so no downstream code has
// to re-check them.
export type GatewayAuthConfig =
  | { mode: 'owner'; ownerAddress: OwnerAddress; sandboxId: string }
  | { mode: 'dev' }

// Resolving is fallible on purpose: a misconfigured owner mode must surface as an
// error the process exits on, never as a quiet fallback to something weaker.
export type GatewayAuthResolution =
  | { ok: true; config: GatewayAuthConfig }
  | { ok: false; error: string }

// Why a challenge text was refused. Reported for logs only; the client is never
// told which check failed.
export type ChallengeRejection =
  | 'malformed'
  | 'sandbox-mismatch'
  | 'expired'
  | 'not-yet-valid'
  | 'window-too-long'

// Result of the pure challenge check. A discriminated result rather than a
// throw: a bad challenge is an expected request, not an exception.
export type ChallengeCheck =
  | { valid: true; challenge: SandboxChallenge }
  | { valid: false; reason: ChallengeRejection }

export type OwnerAuthDenial =
  | ChallengeRejection
  | 'no-credentials'
  | 'sandbox-not-configured'
  | 'signature-not-owner'

// The verdict of checking a request's signed challenge against the CONFIGURED
// owner address. Deliberately carries no address: whatever the request supplied
// can never become the thing it is compared against.
export type OwnerAuthResult = { authorized: true } | { authorized: false; reason: OwnerAuthDenial }

export type UpgradeDenial = OwnerAuthDenial | 'owner-signature-required' | 'origin-not-allowed'

// 401 for a failed owner signature, 403 for a rejected origin — the same split
// microvmd's terminal listener uses.
export type UpgradeDecision =
  | { allowed: true }
  | { allowed: false; status: 401 | 403; reason: UpgradeDenial }
