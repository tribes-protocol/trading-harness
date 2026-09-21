import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { promisify } from 'node:util'

import { ensureJsonTreeString } from '../hyperliquid/EnsureJson.ts'
import { resolveTradesStateDir, resolveWorkspaceRoot } from '../WorkspacePaths.ts'
import type { WalletAsset, WalletAssetPnl, WalletChainId, WalletStatus } from './StatusTypes.ts'

const execFileAsync = promisify(execFile)
const STATUS_PATH = 'runtime/tribes/wallet/live-status.json'
const WALLET_SNAPSHOT_FILENAME = 'privy-wallets.json'
const AUTH_KEY_FILENAME = 'agent-authorization-key.json'
const FETCH_TIMEOUT_MS = 30_000
const FETCH_MAX_BUFFER_BYTES = 4 * 1024 * 1024

type WalletAccountState =
  | { readonly kind: 'ready'; readonly addresses: readonly string[] }
  | { readonly kind: 'pending' }
  | { readonly kind: 'unauthenticated' }
  | { readonly kind: 'missing' }

interface WalletAssetsResponse {
  readonly assets: readonly WalletAsset[]
  readonly totalPnlUsd: number | null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null
}

function numberValue(value: unknown): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function nullableNumberValue(value: unknown): number | null {
  if (value === null || value === undefined) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function chainIdValue(value: unknown): WalletChainId | null {
  if (value === 'solana') return value
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

function normalizePnl(value: unknown): WalletAssetPnl | null {
  if (!isRecord(value)) return null
  const metrics = isRecord(value.pnl) ? value.pnl : value
  const realizedUsd = nullableNumberValue(metrics.realized_profit_usd ?? metrics.realizedUsd)
  const realizedPercent = nullableNumberValue(
    metrics.realized_profit_percent ?? metrics.realizedPercent
  )
  const unrealizedUsd = nullableNumberValue(metrics.unrealized_usd ?? metrics.unrealizedUsd)
  const totalUsd = nullableNumberValue(metrics.total_usd ?? metrics.totalUsd)
  if (
    realizedUsd === null ||
    realizedPercent === null ||
    unrealizedUsd === null ||
    totalUsd === null
  ) {
    return null
  }
  return {
    realizedUsd,
    realizedPercent,
    unrealizedUsd,
    unrealizedPercent: nullableNumberValue(metrics.unrealized_percent ?? metrics.unrealizedPercent),
    totalUsd,
    totalPercent: nullableNumberValue(metrics.total_percent ?? metrics.totalPercent)
  }
}

function normalizeAsset(value: unknown): WalletAsset | null {
  if (!isRecord(value)) return null
  const kind = value.kind === 'erc20' || value.kind === 'spl' ? value.kind : null
  const address = stringValue(value.address)
  const name = stringValue(value.name)
  const symbol = stringValue(value.symbol)
  const chainId = chainIdValue(value.chainId)
  if (kind === null || address === null || name === null || symbol === null || chainId === null) {
    return null
  }
  return {
    kind,
    address,
    name,
    symbol,
    chainId,
    wallet: stringValue(value.wallet),
    balance: numberValue(value.balance),
    balanceUsd: numberValue(value.balanceUsd),
    usdPrice: numberValue(value.usdPrice),
    usdPrice24hrPercentChange: nullableNumberValue(value.usdPrice24hrPercentChange),
    verified: stringValue(value.verified) ?? 'unknown',
    pnl: normalizePnl(value.pnl)
  }
}

function normalizeAssets(value: unknown): readonly WalletAsset[] {
  if (!Array.isArray(value)) throw new Error('Wallet assets response was not an array')
  return value
    .map(normalizeAsset)
    .filter((asset): asset is WalletAsset => asset !== null)
    .filter((asset) => asset.balance !== 0 || asset.balanceUsd !== 0 || asset.pnl !== null)
    .sort((left, right) => right.balanceUsd - left.balanceUsd)
}

function normalizeAssetsResponse(value: unknown): WalletAssetsResponse {
  if (Array.isArray(value)) {
    const assets = normalizeAssets(value)
    return { assets, totalPnlUsd: totalPnlUsd(assets) }
  }
  if (!isRecord(value) || !Array.isArray(value.assets)) {
    throw new Error('Wallet assets response was not a valid object')
  }
  const assets = normalizeAssets(value.assets)
  const summary = isRecord(value.summary) ? value.summary : null
  const summaryPnl = summary !== null && isRecord(summary.pnl) ? summary.pnl : null
  return {
    assets,
    totalPnlUsd:
      nullableNumberValue(summaryPnl?.total_usd ?? summaryPnl?.totalUsd) ?? totalPnlUsd(assets)
  }
}

function addressesFromRows(rows: readonly unknown[]): string[] {
  const addresses = new Set<string>()
  for (const row of rows) {
    if (!isRecord(row)) continue
    const evm = stringValue(row.evmWalletAddress)
    const solana = stringValue(row.solWalletAddress)
    if (evm !== null) addresses.add(evm)
    if (solana !== null) addresses.add(solana)
  }
  return [...addresses]
}

// The routed wallet surface is the baked `tribes-wallet` CLI (zipbox-wallet
// skill). Prefer it so the panel resolves the account even when the harness
// bearer is stale; an older sandbox without the baked CLI falls through to the
// harness snapshot below.
async function readWalletAccountsFromCli(cwd: string): Promise<string[] | null> {
  try {
    const { stdout } = await execFileAsync('tribes-wallet', ['wallet', 'list'], {
      cwd,
      timeout: FETCH_TIMEOUT_MS,
      maxBuffer: FETCH_MAX_BUFFER_BYTES,
      encoding: 'utf8'
    })
    const parsed: unknown = JSON.parse(stdout)
    if (!Array.isArray(parsed)) return null
    const addresses = addressesFromRows(parsed)
    return addresses.length > 0 ? addresses : null
  } catch {
    return null
  }
}

async function resolveWalletAccounts(cwd: string): Promise<WalletAccountState> {
  const fromCli = await readWalletAccountsFromCli(cwd)
  if (fromCli !== null) return { kind: 'ready', addresses: fromCli }

  const stateDir = resolveTradesStateDir(cwd)
  let raw: string
  try {
    raw = await readFile(join(stateDir, WALLET_SNAPSHOT_FILENAME), 'utf8')
  } catch {
    return existsSync(join(stateDir, AUTH_KEY_FILENAME))
      ? { kind: 'pending' }
      : { kind: 'unauthenticated' }
  }
  let snapshot: unknown
  try {
    snapshot = JSON.parse(raw)
  } catch {
    return { kind: 'pending' }
  }
  if (!Array.isArray(snapshot)) return { kind: 'missing' }
  const addresses = addressesFromRows(snapshot)
  return addresses.length > 0 ? { kind: 'ready', addresses } : { kind: 'missing' }
}

function unavailableStatus(
  message: string,
  options: { readonly initializing: boolean; readonly unauthenticated: boolean }
): WalletStatus {
  return {
    ok: false,
    schema: 'wallet-status.v1',
    updatedAt: new Date().toISOString(),
    accountSource: 'unavailable',
    wallets: [],
    assets: [],
    totalUsd: 0,
    totalPnlUsd: null,
    initializing: options.initializing,
    unauthenticated: options.unauthenticated,
    stale: false,
    error: message
  }
}

function totalPnlUsd(assets: readonly WalletAsset[]): number | null {
  const values = assets.flatMap((asset) => (asset.pnl === null ? [] : [asset.pnl.totalUsd]))
  return values.length === 0 ? null : values.reduce((sum, value) => sum + value, 0)
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function hasSameWallets(left: readonly string[], right: readonly string[]): boolean {
  if (left.length !== right.length) return false
  const expected = new Set(right.map((wallet) => wallet.toLowerCase()))
  return left.every((wallet) => expected.has(wallet.toLowerCase()))
}

async function runWalletAssetsCli(
  command: string,
  cwd: string,
  addresses: readonly string[]
): Promise<WalletAssetsResponse> {
  const { stdout } = await execFileAsync(
    command,
    ['wallet', 'assets', '--wallet-addresses', ...addresses],
    {
      cwd,
      timeout: FETCH_TIMEOUT_MS,
      maxBuffer: FETCH_MAX_BUFFER_BYTES,
      encoding: 'utf8'
    }
  )
  const parsed: unknown = JSON.parse(stdout)
  return normalizeAssetsResponse(parsed)
}

// zipbox-wallet (`tribes-wallet`) is the routed balance surface; the harness
// `tribes-cli wallet assets` stays the fallback for older sandboxes without the
// baked CLI. Both serve the same underlying Privy wallet.
async function fetchWalletAssets(
  cwd: string,
  addresses: readonly string[]
): Promise<WalletAssetsResponse> {
  try {
    return await runWalletAssetsCli('tribes-wallet', cwd, addresses)
  } catch (primaryError) {
    try {
      return await runWalletAssetsCli('tribes-cli', cwd, addresses)
    } catch {
      throw primaryError
    }
  }
}

async function writeCachedStatus(cwd: string, status: WalletStatus): Promise<void> {
  const path = resolve(resolveWorkspaceRoot(cwd), STATUS_PATH)
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, `${ensureJsonTreeString(status)}\n`, 'utf8')
}

function cachedStatusFromUnknown(value: unknown): WalletStatus | null {
  if (!isRecord(value) || value.schema !== 'wallet-status.v1' || !Array.isArray(value.assets)) {
    return null
  }
  const assets = normalizeAssets(value.assets)
  const wallets = Array.isArray(value.wallets)
    ? value.wallets.map(stringValue).filter((wallet): wallet is string => wallet !== null)
    : []
  return {
    ok: true,
    schema: 'wallet-status.v1',
    updatedAt: stringValue(value.updatedAt) ?? new Date(0).toISOString(),
    accountSource: 'cache',
    wallets,
    assets,
    totalUsd: assets.reduce((sum, asset) => sum + asset.balanceUsd, 0),
    totalPnlUsd: nullableNumberValue(value.totalPnlUsd) ?? totalPnlUsd(assets),
    initializing: false,
    unauthenticated: false,
    stale: true,
    error: stringValue(value.error)
  }
}

export async function readCachedWalletStatus(cwd: string): Promise<WalletStatus | null> {
  try {
    const parsed: unknown = JSON.parse(
      await readFile(resolve(resolveWorkspaceRoot(cwd), STATUS_PATH), 'utf8')
    )
    return cachedStatusFromUnknown(parsed)
  } catch {
    return null
  }
}

export async function refreshWalletStatus(cwd: string): Promise<WalletStatus> {
  const account = await resolveWalletAccounts(cwd)
  if (account.kind === 'pending') {
    return unavailableStatus('Loading wallet accounts…', {
      initializing: true,
      unauthenticated: false
    })
  }
  if (account.kind === 'unauthenticated') {
    return unavailableStatus('Log in to load wallet balances', {
      initializing: false,
      unauthenticated: true
    })
  }
  if (account.kind === 'missing') {
    return unavailableStatus('Wallet addresses are unavailable', {
      initializing: false,
      unauthenticated: false
    })
  }

  try {
    const response = await fetchWalletAssets(cwd, account.addresses)
    const { assets } = response
    const status: WalletStatus = {
      ok: true,
      schema: 'wallet-status.v1',
      updatedAt: new Date().toISOString(),
      accountSource: 'agent-assets',
      wallets: account.addresses,
      assets,
      totalUsd: assets.reduce((sum, asset) => sum + asset.balanceUsd, 0),
      totalPnlUsd: response.totalPnlUsd,
      initializing: false,
      unauthenticated: false,
      stale: false,
      error: null
    }
    await writeCachedStatus(cwd, status)
    return status
  } catch (error) {
    const cached = await readCachedWalletStatus(cwd)
    if (cached !== null && hasSameWallets(cached.wallets, account.addresses)) {
      return {
        ...cached,
        error: `Refresh failed: ${errorMessage(error)}`
      }
    }
    return unavailableStatus(`Unable to load wallet balances: ${errorMessage(error)}`, {
      initializing: false,
      unauthenticated: false
    })
  }
}
