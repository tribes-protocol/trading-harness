#!/usr/bin/env bun
/**
 * Trade-journal server supervisor — keeps the Bun server alive.
 *
 * Long-running-process convention (AGENTS.md: detached process with redirected
 * stdio + explicit supervisor). Launches TradeJournalServer.ts, and if the
 * process exits (crash, kill, wedge), restarts it after a short backoff.
 * Single-flight: refuses to start a second instance.
 *
 * Invoke: nohup bun scripts/TradeJournalSupervisor.ts > /tmp/tj-supervisor.log 2>&1 &
 *         (or via an init/supervisor that restarts THIS on boot)
 */
import { execFileSync, spawn } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const PORT = process.argv[2] ?? '3100'
const DB_PATH = process.argv[3] ?? resolve('/root/workspace/data/trade-journal.sqlite')
const SERVER = resolve('scripts/TradeJournalServer.ts')
const FILL = resolve('scripts/TradeFillRealtime.ts')

// Single-flight guard: a lock file with the supervisor pid; refuse a duplicate.
const LOCK = resolve('/tmp/trade-journal-supervisor.lock')
if (existsSync(LOCK)) {
  const existing = Number(readFileSync(LOCK, 'utf8'))
  try {
    process.kill(existing, 0)
    console.error(`supervisor already running (pid ${existing}); refusing duplicate`)
    process.exit(1)
  } catch {
    // stale lock — overwrite
  }
}
writeFileSync(LOCK, String(process.pid))

let serverChild: ReturnType<typeof spawn> | null = null
let fillChild: ReturnType<typeof spawn> | null = null

/**
 * Reclaim :PORT so a server child can bind cleanly on a restart. If a foreign
 * process (a prior supervisor's server, or a leftover) still holds the port,
 * the child would fail to bind and the supervisor would restart-loop.
 */
async function reclaimPort(port: string): Promise<void> {
  try {
    const list = execFileSync('ps', ['aux'], { encoding: 'utf8' })
    for (const line of list.split('\n')) {
      if (!line.includes('TradeJournalServer') || !line.includes(port)) continue
      const pid = Number(line.trim().split(/\s+/)[0])
      if (Number.isNaN(pid) || pid === (serverChild?.pid ?? -1)) continue
      try {
        process.kill(pid, 0)
        console.error(`[supervisor] reclaiming port ${port}: killing stale server pid ${pid}`)
        process.kill(pid, 'SIGTERM')
      } catch {
        // process already gone
      }
    }
  } catch {
    // ps unavailable — server will fail to bind and retry; not fatal.
  }
}

function startServer(): void {
  console.error(`[supervisor] starting server :${PORT} db=${DB_PATH}`)
  serverChild = spawn('bun', [SERVER, PORT, DB_PATH], {
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: false
  })
  serverChild.stdout?.on('data', (chunk: Buffer) => process.stderr.write(`[server] ${chunk}`))
  serverChild.stderr?.on('data', (chunk: Buffer) => process.stderr.write(`[server] ${chunk}`))
  serverChild.on('exit', (code, signal) => {
    console.error(
      `[supervisor] server exited code=${code} signal=${signal}; reclaiming + restarting in 2s`
    )
    setTimeout(async () => {
      await reclaimPort(PORT)
      startServer()
    }, 2000)
  })
}

function startFill(): void {
  console.error('[supervisor] starting realtime fill capture')
  fillChild = spawn('bun', [FILL, DB_PATH], {
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: false
  })
  fillChild.stdout?.on('data', (chunk: Buffer) => process.stderr.write(`[fill] ${chunk}`))
  fillChild.stderr?.on('data', (chunk: Buffer) => process.stderr.write(`[fill] ${chunk}`))
  fillChild.on('exit', (code, signal) => {
    console.error(`[supervisor] fill exited code=${code} signal=${signal}; restarting in 2s`)
    setTimeout(startFill, 2000)
  })
}

startServer()
startFill()

process.on('SIGTERM', () => {
  console.error('[supervisor] SIGTERM; stopping children')
  serverChild?.kill('SIGTERM')
  fillChild?.kill('SIGTERM')
  process.exit(0)
})
process.on('SIGINT', () => {
  console.error('[supervisor] SIGINT; stopping children')
  serverChild?.kill('SIGTERM')
  fillChild?.kill('SIGTERM')
  process.exit(0)
})

console.error(`[supervisor] trade-journal supervisor pid=${process.pid}`)
