import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const OPEN_URL_TIMEOUT_MS = 5_000

const execFileAsync = promisify(execFile)

export async function openUrlInBrowser(url: string): Promise<boolean> {
  try {
    if (process.platform === 'darwin') {
      await execFileAsync('open', [url], { timeout: OPEN_URL_TIMEOUT_MS })
      return true
    }
    if (process.platform === 'win32') {
      await execFileAsync('cmd', ['/c', 'start', '', url], { timeout: OPEN_URL_TIMEOUT_MS })
      return true
    }
    await execFileAsync('xdg-open', [url], { timeout: OPEN_URL_TIMEOUT_MS })
    return true
  } catch {
    return false
  }
}
