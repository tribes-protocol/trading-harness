import { describe, expect, it } from 'vitest'

import { stripAnsi } from '@/utils/AnsiText'

const ESC = String.fromCharCode(27)
const BEL = String.fromCharCode(7)

describe('stripAnsi', () => {
  it('leaves plain text untouched', () => {
    expect(stripAnsi('Open this URL and approve this agent:')).toBe(
      'Open this URL and approve this agent:'
    )
  })

  it('removes the bold and colour codes wrapping a login URL', () => {
    // The real shape of `tribes-cli login` output: the URL the operator must click
    // arrives wrapped in bold + blue, and forwarding it verbatim puts escape noise
    // either side of the one string that matters.
    const line = `${ESC}[1mURL:${ESC}[22m ${ESC}[34mhttp://localhost:3000/agents/login?id=abc${ESC}[39m`
    expect(stripAnsi(line)).toBe('URL: http://localhost:3000/agents/login?id=abc')
  })

  it('removes an OSC window-title write without eating the rest of the line', () => {
    // An OSC runs until BEL rather than a single letter, so a pattern that only
    // knows CSI leaves it intact and a pattern that is too greedy swallows
    // everything after it. The tribes extension emits exactly this on session end.
    const line = `before${ESC}]9;Trading agent session ended${BEL}after`
    expect(stripAnsi(line)).toBe('beforeafter')
  })

  it('removes an OSC terminated by string terminator rather than BEL', () => {
    const line = `before${ESC}]0;title${ESC}\\after`
    expect(stripAnsi(line)).toBe('beforeafter')
  })

  it('removes cursor movement, not just colour', () => {
    expect(stripAnsi(`a${ESC}[2Kb${ESC}[1Gc`)).toBe('abc')
  })

  it('preserves newlines so multi-line widget content keeps its shape', () => {
    expect(stripAnsi(`${ESC}[1mone${ESC}[22m\ntwo`)).toBe('one\ntwo')
  })
})
