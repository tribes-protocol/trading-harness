import type { ScreenModel } from '@tribes-harness/protocol/types/ScreenModel'

import type { PiCatalogModel } from '@/types/ScreenModels'

/**
 * Project Pi's model catalog onto the wire.
 *
 * `provider` and `id` are always carried together and never joined into one
 * string: an id is unique only WITHIN a provider, so `openrouter` and a
 * hypothetical second provider can both offer `z-ai/glm-5.2`, and a client that
 * sent back a flattened `provider/id` would be asking the gateway to re-split a
 * string on a separator that appears inside the id itself.
 *
 * `reasoning` is a straight pass-through, not a conversion. `Model.reasoning` is
 * already a required boolean — it is `SimpleStreamOptions.reasoning` that is a
 * `ThinkingLevel`, and the two are unrelated. A model's thinking LEVEL is
 * per-session state and lives on `ScreenState.thinkingLevel`; this flag only says
 * whether setting that level does anything at all.
 *
 * Everything else is dropped on purpose. `cost`, `maxTokens`, `api` and `baseUrl`
 * ride along on every entry Pi returns, and `baseUrl` in particular can carry a
 * host-local proxy address — 256 entries of it is a catalog of the box's routing,
 * not a picker.
 */
export function toScreenModels(models: readonly PiCatalogModel[]): ScreenModel[] {
  return models.map((model) => ({
    provider: model.provider,
    id: model.id,
    // Pi types `name` as required, so it is never absent — but a model merged in
    // from a custom models.json can arrive with it blank, and a blank row in the
    // picker is one the operator cannot tell apart from the next blank row. The id
    // is always present and unique within the provider, so it is the fallback.
    name: model.name.length === 0 ? model.id : model.name,
    contextWindow: model.contextWindow,
    reasoning: model.reasoning
  }))
}
