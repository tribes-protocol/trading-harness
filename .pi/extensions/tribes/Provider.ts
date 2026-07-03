import { execFile } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { promisify } from 'node:util'

import type { ExtensionAPI } from '@earendil-works/pi-coding-agent'

/**
 * The `tribes-llm-proxy` model provider. Pi talks to it as an OpenAI-compatible
 * endpoint; requests are proxied by the Tribes API (/llm/proxy) to OpenRouter.
 * Auth is the bearer token in .env (API_BEARER_TOKEN) — the single source the
 * tribes extension mints from the agent's P-256 key and refreshes every 24h.
 * AgentProxyToken.ts serves that .env value, so no shared secret lives here.
 *
 * `registerProvider` is a runtime method not in the published ExtensionAPI type,
 * so the provider shape is declared structurally to stay decoupled from a
 * specific Pi version.
 */

interface ProviderModelCost {
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
}

interface ProviderModel {
  id: string
  name: string
  reasoning: boolean
  input: ('text' | 'image')[]
  cost: ProviderModelCost
  contextWindow: number
  maxTokens: number
}

interface ProviderConfig {
  name: string
  baseUrl: string
  api: string
  apiKey: string
  authHeader: boolean
  models: ProviderModel[]
}

export type TribesApi = ExtensionAPI & {
  registerProvider(name: string, config: ProviderConfig): void
  setModel(model: unknown): Promise<boolean>
}

const execFileAsync = promisify(execFile)

// `!command` apiKey: Pi runs this to read the bearer token. AgentProxyToken.ts
// serves API_BEARER_TOKEN from .env (the single source the tribes extension
// refreshes every 24h). Use a cwd-relative path so this works both in sandboxed
// /workspace sessions and local desktop paths.
const TOKEN_COMMAND = '!bun .pi/extensions/tribes/AgentProxyToken.ts'

// Production API base URL, matching @/common/Env.ts's production default.
const PRODUCTION_API_BASE_URL = 'https://api.tribes.xyz'

const ZERO_COST: ProviderModelCost = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }
const MODEL_FETCH_TIMEOUT_MS = 30_000
const MODEL_FETCH_MAX_BUFFER_BYTES = 1024 * 1024

function readDotEnvValue(key: string): string | null {
  try {
    const text = readFileSync(resolve(process.cwd(), '.env'), 'utf8')
    for (const line of text.split(/\r?\n/u)) {
      const separator = line.indexOf('=')
      const k = line.slice(0, separator).trim()
      if (separator > 0 && k === key && !k.startsWith('#')) {
        return line.slice(separator + 1)
      }
    }
  } catch {
    // No .env or unreadable.
  }
  return null
}

function resolveApiBaseUrl(): string {
  // Check process.env first (set by the host via bridge runtime env or manual
  // export), then .env (persisted by writeAuthEnv), then the production default.
  return (
    process.env.API_BASE_URL ??
    readDotEnvValue('API_BASE_URL') ??
    PRODUCTION_API_BASE_URL
  )
}

function resolveProxyBaseUrl(): string {
  return `${resolveApiBaseUrl().replace(/\/$/u, '')}/llm/proxy`
}

function resolveModelsUrl(): string {
  return `${resolveProxyBaseUrl().replace(/\/$/, '')}/models`
}

async function readBearerToken(): Promise<string> {
  const { stdout } = await execFileAsync('bun', ['.pi/extensions/tribes/AgentProxyToken.ts'], {
    cwd: process.cwd(),
    timeout: MODEL_FETCH_TIMEOUT_MS,
    maxBuffer: MODEL_FETCH_MAX_BUFFER_BYTES
  })
  return stdout.trim()
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function readNumberLike(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value !== 'string' || value.length === 0) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function readBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback
}

function readInput(value: unknown): ('text' | 'image')[] {
  if (!Array.isArray(value)) return ['text']
  const input = value.filter(
    (item): item is 'text' | 'image' => item === 'text' || item === 'image'
  )
  return input.length > 0 ? input : ['text']
}

function readOpenRouterPricing(value: unknown): ProviderModelCost | null {
  if (!isRecord(value)) return null

  const prompt = readNumberLike(value.prompt)
  const completion = readNumberLike(value.completion)
  const inputCacheRead = readNumberLike(value.input_cache_read)
  const inputCacheWrite = readNumberLike(value.input_cache_write)

  if (
    prompt === null &&
    completion === null &&
    inputCacheRead === null &&
    inputCacheWrite === null
  ) {
    return null
  }

  return {
    input: (prompt ?? 0) * 1_000_000,
    output: (completion ?? 0) * 1_000_000,
    cacheRead: (inputCacheRead ?? 0) * 1_000_000,
    cacheWrite: (inputCacheWrite ?? 0) * 1_000_000
  }
}

function readCost(value: unknown, pricing: unknown): ProviderModelCost {
  const openRouterPricing = readOpenRouterPricing(pricing)
  if (!isRecord(value)) return openRouterPricing ?? ZERO_COST
  return {
    input: readNumber(value.input, openRouterPricing?.input ?? ZERO_COST.input),
    output: readNumber(value.output, openRouterPricing?.output ?? ZERO_COST.output),
    cacheRead: readNumber(value.cacheRead, openRouterPricing?.cacheRead ?? ZERO_COST.cacheRead),
    cacheWrite: readNumber(value.cacheWrite, openRouterPricing?.cacheWrite ?? ZERO_COST.cacheWrite)
  }
}

function normalizeModel(value: unknown): ProviderModel | null {
  if (!isRecord(value) || typeof value.id !== 'string' || value.id.length === 0) return null

  return {
    id: value.id,
    name: typeof value.name === 'string' && value.name.length > 0 ? value.name : value.id,
    reasoning: readBoolean(value.reasoning, false),
    input: readInput(value.input),
    cost: readCost(value.cost, value.pricing),
    contextWindow: readNumber(
      value.contextWindow,
      readNumber(value.context_window, readNumber(value.context_length, 128_000))
    ),
    maxTokens: readNumber(value.maxTokens, readNumber(value.max_tokens, 16_384))
  }
}

function readModelsPayload(payload: unknown): ProviderModel[] {
  const rawModels = isRecord(payload) && Array.isArray(payload.data) ? payload.data : payload
  if (!Array.isArray(rawModels)) {
    throw new Error('/models response must be an array or an object with a data array')
  }

  const models = rawModels.flatMap((model) => {
    const normalized = normalizeModel(model)
    return normalized ? [normalized] : []
  })

  if (models.length === 0) {
    throw new Error('/models response did not include any valid models')
  }
  return models
}

async function fetchProviderModels(): Promise<ProviderModel[]> {
  const response = await fetch(resolveModelsUrl(), {
    headers: {
      Authorization: `Bearer ${await readBearerToken()}`
    }
  })

  if (!response.ok) {
    throw new Error(`Failed to fetch /models: ${response.status} ${response.statusText}`)
  }

  const payload: unknown = await response.json()
  return readModelsPayload(payload)
}

export async function registerTribesProvider(pi: TribesApi): Promise<void> {
  pi.registerProvider('tribes-llm-proxy', {
    name: 'Tribes LLM Proxy',
    baseUrl: resolveProxyBaseUrl(),
    api: 'openai-completions',
    apiKey: TOKEN_COMMAND,
    authHeader: true,
    models: await fetchProviderModels()
  })
}
