import {
  closeSync,
  constants,
  fstatSync,
  openSync,
  readFileSync,
  readlinkSync,
  writeSync
} from 'node:fs'

/** Stop walking rather than follow an implausible chain, or a cycle in a lying /proc. */
const MAX_ANCESTRY_DEPTH = 32

/**
 * Only ever write an escape to something that looks like a terminal device.
 * Anchored, so an attacker-controlled `TRIBES_TTY` cannot name a regular file
 * under, say, `/dev/tty/../../etc/cron.d/x` and have us append to it.
 */
const TTY_DEVICE_PATTERN = /^\/dev\/(?:pts\/\d+|tty\d*)$/u

/** Indirection over `/proc` so the ancestry walk can be tested without one. */
export type ProcessTable = {
  readonly parentOf: (pid: number) => number | undefined
  readonly terminalOf: (pid: number) => string | undefined
}

export function isTerminalDevicePath(path: string): boolean {
  return TTY_DEVICE_PATTERN.test(path)
}

/**
 * Find the nearest ancestor process that still holds a terminal.
 *
 * The child of an agent has no controlling terminal of its own: pi spawns with
 * `detached: true`, which calls setsid(2), and hands the child pipes for fd
 * 0/1/2. Opening `/dev/tty` there fails with ENXIO and writing to stdout only
 * paints the escape into the agent's captured output. But the pty the user is
 * actually looking at is still open — held by an ancestor, typically pi itself,
 * whose fd 1 is the pts slave. Walking up the ppid chain finds it.
 *
 * Starts at the parent: our own fds are the agent's pipes by construction.
 */
export function findAncestorTerminal(
  startPid: number,
  table: ProcessTable,
  maxDepth: number = MAX_ANCESTRY_DEPTH
): string | undefined {
  const seen = new Set<number>()
  let pid = table.parentOf(startPid)

  for (let depth = 0; depth < maxDepth; depth += 1) {
    // pid 1 is the init/reaper; it owns no terminal worth writing to.
    if (pid === undefined || pid <= 1) return undefined
    if (seen.has(pid)) return undefined
    seen.add(pid)

    const terminal = table.terminalOf(pid)
    if (terminal) return terminal

    pid = table.parentOf(pid)
  }
  return undefined
}

/** Read the ppid and any tty-holding fd out of Linux `/proc`. */
function procProcessTable(): ProcessTable {
  return {
    parentOf: (pid) => {
      try {
        const stat = readFileSync(`/proc/${pid}/stat`, 'utf8')
        // Field 2 is the executable name, parenthesized, and may itself contain
        // spaces or ')' — so parse from the last ')', after which the fields are
        // state then ppid.
        const fields = stat
          .slice(stat.lastIndexOf(')') + 1)
          .trim()
          .split(/\s+/u)
        const ppid = Number(fields[1])
        return Number.isInteger(ppid) && ppid > 0 ? ppid : undefined
      } catch {
        return undefined
      }
    },
    terminalOf: (pid) => {
      for (const fd of [0, 1, 2]) {
        try {
          const target = readlinkSync(`/proc/${pid}/fd/${fd}`)
          if (isTerminalDevicePath(target)) return target
        } catch {
          // fd closed, or not ours to inspect: try the next one.
        }
      }
      return undefined
    }
  }
}

type TargetParams = {
  readonly env: Record<string, string | undefined>
  readonly platform: string
  readonly pid: number
  readonly table?: ProcessTable
}

/**
 * Where to write a terminal escape, most-preferred first.
 *
 * `/dev/tty` is the controlling terminal and the right answer whenever there is
 * one. `TRIBES_TTY` is an explicit override for a VM bridge that knows the pty
 * slave path and wants to hand it over. Failing both, on Linux we discover the
 * pty ourselves from the process ancestry, which is what makes `notify` reach a
 * browser-hosted terminal from inside an agent in a microVM.
 */
export function terminalWriteTargets(params: TargetParams): readonly string[] {
  const targets: string[] = ['/dev/tty']

  const override = params.env.TRIBES_TTY
  if (override && isTerminalDevicePath(override)) targets.push(override)

  // /proc is Linux-only; on macOS the controlling terminal is the whole story.
  if (params.platform === 'linux') {
    const table = params.table ?? procProcessTable()
    const inherited = findAncestorTerminal(params.pid, table)
    if (inherited) targets.push(inherited)
  }

  return targets
}

/**
 * Write to a terminal device, reporting whether it landed.
 *
 * Deliberately not `writeFileSync(path, ...)`: that opens with O_CREAT|O_TRUNC,
 * so a stale or wrong path silently becomes a new regular file and the write
 * "succeeds" while the notification goes nowhere. Opening O_WRONLY without
 * O_CREAT makes a missing path fail loudly, and the character-device check keeps
 * us from scribbling an escape sequence into a real file. O_NOCTTY so a write
 * can never acquire a controlling terminal as a side effect.
 */
export function writeToTerminalDevice(target: string, payload: string): boolean {
  let fd: number | undefined
  try {
    fd = openSync(target, constants.O_WRONLY | constants.O_NOCTTY)
    if (!fstatSync(fd).isCharacterDevice()) return false
    writeSync(fd, payload)
    return true
  } catch {
    return false
  } finally {
    if (fd !== undefined) closeSync(fd)
  }
}
