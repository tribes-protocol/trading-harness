import { z } from 'zod'

/**
 * The models a screen can be switched to.
 *
 * Only models the box has working credentials for — Pi knows ~1000 and this
 * harness can reach 256 of them, so an unfiltered catalog would offer the operator
 * models that fail on the first prompt.
 *
 * There is deliberately no allowlist here — the `.pi/settings.json` pin is the
 * DEFAULT a screen starts on, not a cage.
 *
 * BUT A SWITCH IS NOT SESSION-SCOPED, and it is worth knowing exactly what it
 * touches. `AgentSession.setModel` calls `settingsManager.setDefaultModelAndProvider`
 * (agent-session.js:1131), which writes GLOBAL `~/.pi/agent/settings.json` and saves
 * immediately. So switching here also changes the default for the next session on
 * this box and for the operator's own `pi` CLI runs in the same workspace.
 *
 * It does NOT rewrite the repo's `.pi/settings.json`, so the control-plane contract
 * test still passes — but the box will no longer be running the model the control
 * plane routes and bills on, and nothing reconciles that. That is acceptable for a
 * dev override and is NOT acceptable as-is for a real fleet; scoping it means giving
 * the gateway a settings manager that does not persist, which cannot be done without
 * also giving up the project settings that carry the pin and the skill filters.
 */

export const ScreenModelSchema = z.object({
  provider: z.string(),
  /** Provider-scoped id, e.g. `z-ai/glm-5.2`. Unique only WITH the provider. */
  id: z.string(),
  /** Display name from Pi's catalog; falls back to the id when absent. */
  name: z.string(),
  /** Tokens. Shown so an operator can tell a 200k model from a 8k one. */
  contextWindow: z.number(),
  /** Whether the model exposes reasoning, i.e. whether the thinking level bites. */
  reasoning: z.boolean()
})
export type ScreenModel = z.infer<typeof ScreenModelSchema>
