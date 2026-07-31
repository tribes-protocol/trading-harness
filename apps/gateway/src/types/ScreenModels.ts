/**
 * One entry of Pi's model catalog, as `ModelRegistry.getAvailable()` hands it over.
 *
 * Taken as a plain array rather than as an `AgentSession` for the same reason
 * `ScreenCommandSources` is: the mapping stays a pure function, and an
 * `AgentSession` cannot be constructed in a unit test without booting a real agent.
 *
 * This is a structural subset of Pi's `Model<Api>`, NOT that type imported. It has
 * to be: `Model` lives in `@earendil-works/pi-ai`, which the gateway does not
 * depend on — it arrives only underneath `pi-coding-agent`, and `pi-coding-agent`
 * re-exports `ModelRegistry` without re-exporting the type its methods return.
 * Reaching into it anyway would be a phantom dependency on a package nothing in
 * this workspace declares, and `ModelRegistry['getAvailable']` is barred by
 * `lucy/no-indexed-type-access`.
 *
 * The upstream-rename guarantee survives that, because it is enforced at the
 * ASSIGNMENT rather than here: `PiScreenService.modelsFrame()` passes a real
 * `Model<Api>[]` into this type, so a field Pi renames or drops fails the build at
 * that call, not silently at runtime in a picker the operator cannot use.
 */
export type PiCatalogModel = {
  provider: string
  id: string
  name: string
  contextWindow: number
  reasoning: boolean
}
