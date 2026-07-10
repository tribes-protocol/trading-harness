import { describe, expect, it } from 'vitest'

import { buildOscNotification } from '@/utils/Osc'

describe('buildOscNotification', () => {
  it('builds an ST-terminated OSC 777 notify sequence', () => {
    expect(buildOscNotification({ title: 'Tribes Agent', body: 'build done' })).toBe(
      '\x1b]777;notify;Tribes Agent;build done\x1b\\'
    )
  })

  it('rewrites semicolons so the receiver does not truncate the body', () => {
    // The receiver splits OSC 777 on ';' and reads field 3 as the body.
    expect(buildOscNotification({ title: 'a;b', body: 'ran x; then y' })).toBe(
      '\x1b]777;notify;a,b;ran x, then y\x1b\\'
    )
  })

  it('neutralizes an escape-injection attempt in the body', () => {
    const sequence = buildOscNotification({ title: 'Tribes Agent', body: '\x1b]0;pwned\x07done' })
    expect(sequence).toBe('\x1b]777;notify;Tribes Agent;]0,pwned done\x1b\\')
    // Exactly one OSC introducer and one ST — nothing broke out.
    expect(sequence.match(/\x1b\]/gu)).toHaveLength(1)
    expect(sequence).not.toContain('\x07')
  })

  it('collapses control bytes and trims the result', () => {
    expect(buildOscNotification({ title: 'T', body: '\ndone\t' })).toBe(
      '\x1b]777;notify;T;done\x1b\\'
    )
  })

  it('clamps an over-long title and body', () => {
    const sequence = buildOscNotification({ title: 'T'.repeat(80), body: 'b'.repeat(250) })
    expect(sequence).toBe(`\x1b]777;notify;${'T'.repeat(64)};${'b'.repeat(200)}\x1b\\`)
  })
})
