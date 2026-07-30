import { SCREEN_SOCKET_PATH } from '@tribes-harness/protocol/common/Constants'
import { describe, expect, it } from 'vitest'

import { GATEWAY_WS_URL } from '@/common/Env'

describe('GATEWAY_WS_URL', () => {
  it('takes its path from the protocol contract, not a local literal', () => {
    // This is a regression guard for a defect that survived both packages' full
    // test suites, a clean typecheck, a clean lint and a green `next build`: the
    // client dialled `/screens` while the gateway served `/ws`. Nothing failed —
    // the tab simply sat on "reconnecting" forever, and the gateway logged
    // nothing because no request ever reached a path it serves. Only running
    // both halves together surfaced it.
    expect(new URL(GATEWAY_WS_URL).pathname).toBe(SCREEN_SOCKET_PATH)
  })

  it('defaults to a loopback gateway', () => {
    const url = new URL(GATEWAY_WS_URL)
    expect(url.protocol).toBe('ws:')
    expect(url.hostname).toBe('127.0.0.1')
  })
})
