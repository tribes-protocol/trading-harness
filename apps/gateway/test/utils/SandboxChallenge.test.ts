import { describe, expect, it } from 'vitest'

import { type ChallengeCheck, SANDBOX_CHALLENGE_TTL_MS } from '@/types/OwnerAuth'
import { checkSandboxChallenge } from '@/utils/SandboxChallenge'

const SANDBOX_ID = 'sbx-7f3a91'
const NONCE = '0f1e2d3c4b5a6978'
const NOW_MS = Date.parse('2026-07-30T12:00:00.000Z')
const MINUTE_MS = 60 * 1000

type ChallengeParts = {
  sandboxId: string
  issuedAtMs: number
  expiresAtMs: number
  nonce: string
}

// The exact text microvmd's composeSandboxChallenge emits. Written out by hand
// rather than imported: if the canonical format ever drifts, this test is the
// thing that has to fail.
function challengeText(parts: ChallengeParts): string {
  return [
    'Tribes Sandbox Access',
    '',
    `Sandbox: ${parts.sandboxId}`,
    `Issued At: ${new Date(parts.issuedAtMs).toISOString()}`,
    `Expires At: ${new Date(parts.expiresAtMs).toISOString()}`,
    `Nonce: ${parts.nonce}`
  ].join('\n')
}

const FRESH: ChallengeParts = {
  sandboxId: SANDBOX_ID,
  issuedAtMs: NOW_MS - MINUTE_MS,
  expiresAtMs: NOW_MS - MINUTE_MS + SANDBOX_CHALLENGE_TTL_MS,
  nonce: NONCE
}

function check(message: string): ChallengeCheck {
  return checkSandboxChallenge({ message, sandboxId: SANDBOX_ID, nowMs: NOW_MS })
}

describe('checkSandboxChallenge', () => {
  it('accepts a well-formed challenge for this sandbox', () => {
    const result = check(challengeText(FRESH))
    expect(result).toEqual({
      valid: true,
      challenge: {
        sandboxId: SANDBOX_ID,
        issuedAtMs: FRESH.issuedAtMs,
        expiresAtMs: FRESH.expiresAtMs,
        nonce: NONCE
      }
    })
  })

  it('accepts a challenge issued slightly ahead of this clock', () => {
    // The host issues the timestamps; a couple of minutes of drift between the
    // VM's clock and the signer's view must not lock the owner out.
    const issuedAtMs = NOW_MS + 2 * MINUTE_MS
    const result = check(
      challengeText({ ...FRESH, issuedAtMs, expiresAtMs: issuedAtMs + SANDBOX_CHALLENGE_TTL_MS })
    )
    expect(result.valid).toBe(true)
  })

  it('rejects a challenge signed for a different sandbox', () => {
    // The whole point of binding the id: an owner of sandbox B holds a perfectly
    // valid signature, and it must not open this one.
    const result = check(challengeText({ ...FRESH, sandboxId: 'sbx-other' }))
    expect(result).toEqual({ valid: false, reason: 'sandbox-mismatch' })
  })

  it('rejects an expired challenge', () => {
    const expiresAtMs = NOW_MS - MINUTE_MS
    const result = check(
      challengeText({ ...FRESH, issuedAtMs: expiresAtMs - SANDBOX_CHALLENGE_TTL_MS, expiresAtMs })
    )
    expect(result).toEqual({ valid: false, reason: 'expired' })
  })

  it('rejects a challenge issued beyond the tolerated clock skew', () => {
    const issuedAtMs = NOW_MS + 30 * MINUTE_MS
    const result = check(
      challengeText({ ...FRESH, issuedAtMs, expiresAtMs: issuedAtMs + SANDBOX_CHALLENGE_TTL_MS })
    )
    expect(result).toEqual({ valid: false, reason: 'not-yet-valid' })
  })

  it('rejects a hand-rolled challenge claiming a longer window than the host issues', () => {
    const result = check(
      challengeText({ ...FRESH, expiresAtMs: FRESH.issuedAtMs + SANDBOX_CHALLENGE_TTL_MS + 1 })
    )
    expect(result).toEqual({ valid: false, reason: 'window-too-long' })
  })

  it('rejects a malformed nonce', () => {
    expect(check(challengeText({ ...FRESH, nonce: '0F1E2D3C4B5A6978' }))).toEqual({
      valid: false,
      reason: 'malformed'
    })
    expect(check(challengeText({ ...FRESH, nonce: 'deadbeef' }))).toEqual({
      valid: false,
      reason: 'malformed'
    })
    expect(check(challengeText({ ...FRESH, nonce: 'not-hex-at-all-xyz' }))).toEqual({
      valid: false,
      reason: 'malformed'
    })
    expect(check(challengeText({ ...FRESH, nonce: `${NONCE} ${NONCE}` }))).toEqual({
      valid: false,
      reason: 'malformed'
    })
  })

  it('rejects truncated text', () => {
    const full = challengeText(FRESH)
    expect(check(full.split('\nNonce:')[0] ?? '')).toEqual({ valid: false, reason: 'malformed' })
    expect(check('Tribes Sandbox Access')).toEqual({ valid: false, reason: 'malformed' })
    expect(check('')).toEqual({ valid: false, reason: 'malformed' })
  })

  it('rejects text with an injected extra line', () => {
    // Nothing may be smuggled into the signed text — not before the fields, not
    // between them, not after the nonce.
    const full = challengeText(FRESH)
    expect(check(`${full}\nSandbox: sbx-attacker`)).toEqual({
      valid: false,
      reason: 'malformed'
    })
    expect(check(full.replace('Sandbox:', 'Grant: root\nSandbox:'))).toEqual({
      valid: false,
      reason: 'malformed'
    })
    expect(check(`Grant: root\n${full}`)).toEqual({ valid: false, reason: 'malformed' })
  })

  it('rejects an unparseable timestamp', () => {
    const result = check(
      challengeText(FRESH).replace(new Date(FRESH.issuedAtMs).toISOString(), 'soon')
    )
    expect(result).toEqual({ valid: false, reason: 'malformed' })
  })
})
