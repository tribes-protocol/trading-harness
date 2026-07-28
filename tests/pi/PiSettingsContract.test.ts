import { readFileSync } from 'fs'
import { join } from 'path'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'

/**
 * Contract tests for the Pi model pin.
 *
 * Pi core merges ~/.pi/agent/settings.json (global) with <cwd>/.pi/settings.json
 * (project, wins). The repo's own .pi/agent/settings.json is NEVER read by pi
 * core, so a pin placed there is dead config — a fresh sandbox session silently
 * ignores it and falls back to pi's defaultModelPerProvider. That is exactly the
 * bug 5f57b05 fixed, and nothing but these assertions stops it recurring.
 *
 * The model is also the control plane's routed model for the `ata` harness
 * (terminal apps/microvmd/src/types/HarnessCatalog.ts — DEFAULT_PROXY_LLM_MODEL).
 * ata never reads TRIBES_LLM_MODEL, so this file is the ONLY place the routed
 * model takes effect; drift here silently bills a different model through the
 * egress tollbooth than the control plane thinks it routed.
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

describe('.pi/agent/settings.json — never read by pi core', () => {
  it('carries no model pin, so the pin cannot silently go dead again', () => {
    const settings = readSettings(AGENT_SETTINGS)

    for (const key of MODEL_KEYS) {
      expect(
        settings[key],
        `${key} in .pi/agent/settings.json is dead config — pi core reads the pin from .pi/settings.json`
      ).toBeUndefined()
    }
  })
})
