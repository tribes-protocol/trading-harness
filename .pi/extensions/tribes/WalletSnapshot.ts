import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

// Warm the wallet snapshot once at startup so the first wallet call is instant.
// Runs after writeAuthEnv has materialized .env, so tribes-cli reads
// API_BEARER_TOKEN / API_BASE_URL / PRIVY_APP_ID from .env (the compiled binary
// auto-loads .env from cwd, like bun does).
const WARMUP_COMMAND = 'tribes-cli wallet list >/dev/null'
const WARMUP_TIMEOUT_MS = 30_000
const WARMUP_MAX_BUFFER_BYTES = 1024 * 1024

export async function warmWalletSnapshot(cwd: string): Promise<void> {
  await execFileAsync('bash', ['-lc', WARMUP_COMMAND], {
    cwd,
    timeout: WARMUP_TIMEOUT_MS,
    maxBuffer: WARMUP_MAX_BUFFER_BYTES
  })
}
