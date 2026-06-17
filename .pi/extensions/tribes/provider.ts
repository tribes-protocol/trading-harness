import type { ExtensionAPI } from '@earendil-works/pi-coding-agent'

/**
 * The `tribes-llm-proxy` model provider. Pi talks to it as an OpenAI-compatible
 * endpoint; requests are proxied by the Tribes API (/llm/proxy) to OpenRouter.
 * Auth is a short-lived ES256 JWT minted on demand by src/cli/llm-token.ts
 * (signed with the agent's P-256 key), so no shared secret lives here.
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
}

// `!command` apiKey: Pi runs this to mint a fresh bearer token. The harness dir
// is surfaced AS /workspace in the sandbox (see scripts/sandbox-agent-shell.sh).
const TOKEN_COMMAND = '!bun /workspace/src/cli/llm-token.ts'

const ZERO_COST: ProviderModelCost = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }

function resolveProxyBaseUrl(): string {
  return process.env.API_BASE_URL
    ? `${process.env.API_BASE_URL}/llm/proxy`
    : 'http://localhost:8787/llm/proxy'
}

export function registerTribesProvider(pi: TribesApi): void {
  pi.registerProvider('tribes-llm-proxy', {
    name: 'Tribes LLM Proxy',
    baseUrl: resolveProxyBaseUrl(),
    api: 'openai-completions',
    apiKey: TOKEN_COMMAND,
    authHeader: true,
    // Clean ids; the proxy maps them to OpenRouter slugs.
    models: [
      {
        id: 'deepseek-v4-pro',
        name: 'DeepSeek V4 Pro',
        reasoning: true,
        input: ['text'],
        cost: ZERO_COST,
        contextWindow: 1_000_000,
        maxTokens: 16_384
      },
      {
        id: 'kimi-k2.6',
        name: 'Kimi K2.6',
        reasoning: true,
        input: ['text'],
        cost: ZERO_COST,
        contextWindow: 1_000_000,
        maxTokens: 16_384
      }
    ]
  })
}
