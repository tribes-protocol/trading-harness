import { describe, expect, it } from 'vitest'

import { isOriginAllowed } from '@/utils/OriginPolicy'

const ALLOWED = ['http://127.0.0.1:3100', 'http://localhost:3100']

describe('isOriginAllowed', () => {
  it('admits the web app', () => {
    expect(isOriginAllowed('http://127.0.0.1:3100', ALLOWED)).toBe(true)
    expect(isOriginAllowed('http://localhost:3100', ALLOWED)).toBe(true)
  })

  it('rejects a drive-by from any other page the user has open', () => {
    // The attack this exists for: WebSocket handshakes skip the same-origin
    // policy, so without the check any site could open ws://127.0.0.1:4100/ws
    // and prompt an agent that holds bash and write over this checkout.
    expect(isOriginAllowed('https://evil.example', ALLOWED)).toBe(false)
    expect(isOriginAllowed('http://localhost:3000', ALLOWED)).toBe(false)
  })

  it('does not treat a near-miss origin as a match', () => {
    expect(isOriginAllowed('http://127.0.0.1:3100.evil.example', ALLOWED)).toBe(false)
    expect(isOriginAllowed('http://127.0.0.1:31000', ALLOWED)).toBe(false)
    expect(isOriginAllowed('https://127.0.0.1:3100', ALLOWED)).toBe(false)
  })

  it('admits a client that sends no Origin at all', () => {
    // Only non-browser clients omit it, and they can forge any value anyway —
    // rejecting here would block honest tooling while stopping nobody.
    expect(isOriginAllowed(null, ALLOWED)).toBe(true)
    expect(isOriginAllowed('', ALLOWED)).toBe(true)
  })
})
