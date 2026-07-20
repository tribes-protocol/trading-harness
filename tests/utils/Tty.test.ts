import { describe, expect, it } from 'vitest'

import type { ProcessTable } from '@/utils/Tty'
import { findAncestorTerminal, isTerminalDevicePath, terminalWriteTargets } from '@/utils/Tty'

/** Build a table from a pid -> [ppid, tty] map, standing in for /proc. */
function tableOf(entries: Record<number, readonly [number, string | undefined]>): ProcessTable {
  return {
    parentOf: (pid) => entries[pid]?.[0],
    terminalOf: (pid) => entries[pid]?.[1]
  }
}

describe('isTerminalDevicePath', () => {
  it('accepts pts slaves and tty devices', () => {
    expect(isTerminalDevicePath('/dev/pts/0')).toBe(true)
    expect(isTerminalDevicePath('/dev/pts/12')).toBe(true)
    expect(isTerminalDevicePath('/dev/tty')).toBe(true)
    expect(isTerminalDevicePath('/dev/tty1')).toBe(true)
  })

  it('rejects anything that is not a terminal device', () => {
    expect(isTerminalDevicePath('/dev/null')).toBe(false)
    expect(isTerminalDevicePath('/etc/passwd')).toBe(false)
    // A pipe is what the agent hands us; it must never be treated as a terminal.
    expect(isTerminalDevicePath('pipe:[12345]')).toBe(false)
  })

  it('rejects a traversal dressed up as a tty path', () => {
    expect(isTerminalDevicePath('/dev/pts/../../etc/cron.d/x')).toBe(false)
    expect(isTerminalDevicePath('/dev/tty/../../tmp/x')).toBe(false)
  })
})

describe('findAncestorTerminal', () => {
  // The shape pi produces: our fds are pipes, the shell's are pipes, pi holds the pts.
  it('finds the pty held by the agent two levels up', () => {
    const table = tableOf({
      100: [90, undefined], // tribes-cli
      90: [80, undefined], // zsh
      80: [1, '/dev/pts/0'] // pi
    })
    expect(findAncestorTerminal(100, table)).toBe('/dev/pts/0')
  })

  it('ignores the starting process even when it holds a terminal', () => {
    // Our own fds are the agent's pipes by construction; starting at self would
    // let a nonsense self-report win over the real ancestor pty.
    const table = tableOf({
      100: [90, '/dev/pts/9'],
      90: [1, '/dev/pts/0']
    })
    expect(findAncestorTerminal(100, table)).toBe('/dev/pts/0')
  })

  it('returns undefined when no ancestor holds a terminal', () => {
    const table = tableOf({ 100: [90, undefined], 90: [1, undefined] })
    expect(findAncestorTerminal(100, table)).toBeUndefined()
  })

  it('stops at init rather than adopting its terminal', () => {
    const table = tableOf({ 100: [1, undefined], 1: [0, '/dev/tty1'] })
    expect(findAncestorTerminal(100, table)).toBeUndefined()
  })

  it('terminates on a cycle', () => {
    const table = tableOf({ 100: [90, undefined], 90: [100, undefined] })
    expect(findAncestorTerminal(100, table)).toBeUndefined()
  })

  it('gives up past the depth cap instead of walking forever', () => {
    // A 5-deep chain where only the 4th ancestor has a tty, capped at 2.
    const table = tableOf({
      100: [99, undefined],
      99: [98, undefined],
      98: [97, undefined],
      97: [96, '/dev/pts/0']
    })
    expect(findAncestorTerminal(100, table, 2)).toBeUndefined()
    expect(findAncestorTerminal(100, table, 8)).toBe('/dev/pts/0')
  })
})

describe('terminalWriteTargets', () => {
  const table = tableOf({ 100: [90, undefined], 90: [1, '/dev/pts/0'] })

  it('tries the controlling terminal first', () => {
    const targets = terminalWriteTargets({ env: {}, platform: 'linux', pid: 100, table })
    expect(targets[0]).toBe('/dev/tty')
  })

  it('falls back to the ancestor pty on linux', () => {
    const targets = terminalWriteTargets({ env: {}, platform: 'linux', pid: 100, table })
    expect(targets).toEqual(['/dev/tty', '/dev/pts/0'])
  })

  it('does not consult /proc on darwin', () => {
    const targets = terminalWriteTargets({ env: {}, platform: 'darwin', pid: 100, table })
    expect(targets).toEqual(['/dev/tty'])
  })

  it('honours a TRIBES_TTY override ahead of discovery', () => {
    const env = { TRIBES_TTY: '/dev/pts/7' }
    const targets = terminalWriteTargets({ env, platform: 'linux', pid: 100, table })
    expect(targets).toEqual(['/dev/tty', '/dev/pts/7', '/dev/pts/0'])
  })

  it('ignores a TRIBES_TTY that is not a terminal device path', () => {
    const env = { TRIBES_TTY: '/etc/cron.d/payload' }
    const targets = terminalWriteTargets({ env, platform: 'linux', pid: 100, table })
    expect(targets).not.toContain('/etc/cron.d/payload')
  })
})
