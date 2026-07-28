import { readFileSync } from 'fs'
import { join } from 'path'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'

/**
 * Contract tests for the Pi model pin.
 *
 * Pi core reads TWO settings files and merges them: <agentDir>/settings.json
 * (global) and <cwd>/.pi/settings.json (project). Project WINS on any key both
 * set — verified against the pinned @earendil-works/pi-coding-agent@0.80.3,
 * dist/core/settings-manager.d.ts (globalSettingsPath / projectSettingsPath).
 *
 * So the model pin belongs in .pi/settings.json because project scope wins, NOT
 * because the agent file is ignored. Both are live. A pin in the agent file is
 * fragile config that any project-scope value silently overrides, which is the
 * bug 5f57b05 fixed and nothing but these assertions stops recurring.
 *
 * Do NOT read this as "delete .pi/agent/settings.json". `packages` is a real key
 * on the same Settings interface as defaultThinkingLevel (0.80.3 lines 81 / 62),
 * and that file is where this agent declares its Pi extensions. Deleting it
 * drops them.
 *
 * This value must stay in lockstep with HARNESS_LLM_ROUTING.ata in the control
 * plane (terminal packages/sandboxing/src/shared/types/Sandbox.ts, vendored into
 * apps/microvmd/src/types/HarnessCatalog.ts). The coupling is MANUAL and runs one
 * way only: ata never reads TRIBES_LLM_MODEL, so the control-plane constant sets
 * what is INJECTED AND BILLED while this file sets what actually RUNS. Changing
 * DEFAULT_PROXY_LLM_MODEL there does NOT move ata — it just starts billing a
 * model this repo never switched to.
 */

const REPO_ROOT = join(__dirname, '..', '..')
const PROJECT_SETTINGS = join(REPO_ROOT, '.pi', 'settings.json')
const AGENT_SETTINGS = join(REPO_ROOT, '.pi', 'agent', 'settings.json')

// Must stay in lockstep with HARNESS_LLM_ROUTING.ata in the control plane.
const ROUTED_MODEL = 'z-ai/glm-5.2'
const ROUTED_PROVIDER = 'openrouter'
const THINKING_LEVEL = 'medium'

// Keys pi core only honours from the PROJECT settings file in this repo.
const MODEL_KEYS = ['defaultModel', 'defaultProvider', 'defaultThinkingLevel'] as const

const projectSettingsSchema = z.object({
  defaultModel: z.string(),
  defaultProvider: z.string(),
  // Mirrors the Settings interface in @earendil-works/pi-coding-agent.
  defaultThinkingLevel: z.enum(['off', 'minimal', 'low', 'medium', 'high', 'xhigh'])
})

function readSettings(path: string): Record<string, unknown> {
  return z.record(z.unknown()).parse(JSON.parse(readFileSync(path, 'utf8')))
}

describe('.pi/settings.json — the file pi core actually reads', () => {
  it('pins the control-plane routed model, provider, and thinking level', () => {
    const settings = projectSettingsSchema.parse(readSettings(PROJECT_SETTINGS))

    expect(settings.defaultModel).toBe(ROUTED_MODEL)
    expect(settings.defaultProvider).toBe(ROUTED_PROVIDER)
    expect(settings.defaultThinkingLevel).toBe(THINKING_LEVEL)
  })
})

describe('.pi/agent/settings.json — global scope, loses to project on any shared key', () => {
  it('carries no model pin, so project scope cannot silently override it', () => {
    const settings = readSettings(AGENT_SETTINGS)

    for (const key of MODEL_KEYS) {
      expect(
        settings[key],
        `${key} in .pi/agent/settings.json is global-scope config that .pi/settings.json overrides — keep the pin in .pi/settings.json only`
      ).toBeUndefined()
    }
  })
})
