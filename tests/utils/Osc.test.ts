import { describe, expect, it } from 'vitest'

import { buildOscBareNotification, buildOscNotification } from '@/utils/Osc'

describe('buildOscNotification', () => {
  it('builds a BEL-terminated OSC 777 notify sequence', () => {
    expect(buildOscNotification({ title: 'Tribes Agent', body: 'build done' })).toBe(
      '\x1b]777;notify;Tribes Agent;build done\x07'
    )
  })

  it('rewrites semicolons so the receiver does not truncate the body', () => {
    // The receiver splits OSC 777 on ';' and reads field 3 as the body.
    expect(buildOscNotification({ title: 'a;b', body: 'ran x; then y' })).toBe(
      '\x1b]777;notify;a,b;ran x, then y\x07'
    )
  })

  it('neutralizes an escape-injection attempt in the body', () => {
    const sequence = buildOscNotification({ title: 'Tribes Agent', body: '\x1b]0;pwned\x07done' })
    expect(sequence).toBe('\x1b]777;notify;Tribes Agent;]0,pwned done\x07')
    // Exactly one OSC introducer, and the only BEL is the terminator — the
    // payload's own BEL was sanitized, so nothing broke out.
    expect(sequence.match(/\x1b\]/gu)).toHaveLength(1)
    expect(sequence.match(/\x07/gu)).toHaveLength(1)
    expect(sequence.endsWith('\x07')).toBe(true)
  })

  it('collapses control bytes and trims the result', () => {
    expect(buildOscNotification({ title: 'T', body: '\ndone\t' })).toBe(
      '\x1b]777;notify;T;done\x07'
    )
  })

  it('clamps an over-long title and body', () => {
    const sequence = buildOscNotification({ title: 'T'.repeat(80), body: 'b'.repeat(250) })
    expect(sequence).toBe(`\x1b]777;notify;${'T'.repeat(64)};${'b'.repeat(200)}\x07`)
  })
})

describe('buildOscBareNotification', () => {
  it('builds a BEL-terminated OSC 9 sequence', () => {
    expect(buildOscBareNotification('build done')).toBe('\x1b]9;build done\x07')
  })

  it('sanitizes the message so it cannot terminate the sequence early', () => {
    const sequence = buildOscBareNotification('\x1b]0;pwned\x07done')
    expect(sequence.match(/\x1b\]/gu)).toHaveLength(1)
    expect(sequence.match(/\x07/gu)).toHaveLength(1)
    expect(sequence.endsWith('\x07')).toBe(true)
  })

  it('clamps an over-long message', () => {
    expect(buildOscBareNotification('b'.repeat(250))).toBe(`\x1b]9;${'b'.repeat(200)}\x07`)
  })
})
