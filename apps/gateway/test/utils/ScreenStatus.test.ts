import { describe, expect, it } from 'vitest'

import { deriveScreenStatus } from '@/utils/ScreenStatus'

const IDLE = {
  isRetrying: false,
  isCompacting: false,
  isStreaming: false,
  runEnded: false,
  willRetry: false
}

describe('deriveScreenStatus', () => {
  it('reports idle when nothing is happening', () => {
    expect(deriveScreenStatus(IDLE)).toBe('idle')
  })

  it('reports streaming mid-run', () => {
    expect(deriveScreenStatus({ ...IDLE, isStreaming: true })).toBe('streaming')
  })

  it('reports idle at agent_end even though Pi still says it is streaming', () => {
    // THE BUG: Pi dispatches `agent_end` BEFORE clearing `isStreaming`, and
    // `agent_end` is the last state-affecting event of the run — so a status read
    // from the live flag here is never corrected by a later frame. The operator was
    // left with an armed Stop button and a composer stuck on "Steer the run…" with
    // nothing running.
    expect(deriveScreenStatus({ ...IDLE, isStreaming: true, runEnded: true })).toBe('idle')
  })

  it('reports retrying when the run ended but Pi will run again', () => {
    expect(
      deriveScreenStatus({ ...IDLE, isStreaming: true, runEnded: true, willRetry: true })
    ).toBe('retrying')
  })

  it('lets compaction and retry outrank a finished run', () => {
    expect(deriveScreenStatus({ ...IDLE, isCompacting: true, runEnded: true })).toBe('compacting')
    expect(deriveScreenStatus({ ...IDLE, isRetrying: true, runEnded: true })).toBe('retrying')
  })

  it('still trusts the live flags when there is no triggering event', () => {
    // A snapshot is not a moment in the run, so `runEnded` is false and the flags
    // are the only truth available.
    expect(deriveScreenStatus({ ...IDLE, isStreaming: true })).toBe('streaming')
    expect(deriveScreenStatus({ ...IDLE, isCompacting: true })).toBe('compacting')
  })
})
