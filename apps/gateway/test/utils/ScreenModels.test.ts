import { describe, expect, it } from 'vitest'

import type { PiCatalogModel } from '@/types/ScreenModels'
import { toJsonText } from '@/utils/JsonText'
import { toScreenModels } from '@/utils/ScreenModels'

/**
 * The fixture is `PiCatalogModel`, not Pi's `Model<Api>`, because `Model` lives in
 * `@earendil-works/pi-ai` and the gateway does not depend on that package — see
 * the note on `PiCatalogModel` itself. The guard against an upstream rename is
 * therefore NOT here; it is the `Model<Api>[]` that `modelsFrame()` passes into
 * this signature, which fails `tsc` if Pi renames a field. What is tested here is
 * the projection: the fallback, the pairing, and what does not leak.
 */
function catalogModel(overrides: Partial<PiCatalogModel> = {}): PiCatalogModel {
  return {
    provider: 'openrouter',
    id: 'z-ai/glm-5.2',
    name: 'Z.AI: GLM 5.2',
    contextWindow: 200000,
    reasoning: false,
    ...overrides
  }
}

describe('toScreenModels', () => {
  it('carries the catalog entry through unchanged when Pi named it', () => {
    expect(toScreenModels([catalogModel()])).toEqual([
      {
        provider: 'openrouter',
        id: 'z-ai/glm-5.2',
        name: 'Z.AI: GLM 5.2',
        contextWindow: 200000,
        reasoning: false
      }
    ])
  })

  it('falls back to the id when Pi has no name for the model', () => {
    const models = toScreenModels([catalogModel({ id: 'acme/unnamed', name: '' })])

    // Not the empty string it was given: two blank rows in a picker are a picker
    // the operator cannot use.
    expect(models[0]?.name).toBe('acme/unnamed')
  })

  it('keeps a name that is only whitespace-adjacent rather than empty', () => {
    // The fallback triggers on EMPTY, not on falsy-looking. A name of '0' is a
    // name, and `model.name || model.id` would have thrown it away.
    expect(toScreenModels([catalogModel({ name: '0' })])[0]?.name).toBe('0')
  })

  it('carries reasoning as the boolean Pi already has, in both directions', () => {
    // `Model.reasoning` is a required boolean. It is NOT a ThinkingLevel — that is
    // `SimpleStreamOptions.reasoning`, a different type on a different object — so
    // there is no level here to leak, and no conversion to get wrong.
    const models = toScreenModels([
      catalogModel({ id: 'thinks', reasoning: true }),
      catalogModel({ id: 'does-not', reasoning: false })
    ])

    expect(models.map((model) => model.reasoning)).toEqual([true, false])
  })

  it('keeps provider and id paired on every entry, and joins neither', () => {
    // An id is unique only WITHIN a provider, so the two travel together. `id`
    // here also contains the `/` that a flattened `provider/id` would be split on.
    const models = toScreenModels([
      catalogModel({ provider: 'openrouter', id: 'z-ai/glm-5.2' }),
      catalogModel({ provider: 'anthropic', id: 'z-ai/glm-5.2' })
    ])

    expect(models.map((model) => [model.provider, model.id])).toEqual([
      ['openrouter', 'z-ai/glm-5.2'],
      ['anthropic', 'z-ai/glm-5.2']
    ])
  })

  it('drops everything the wire type does not name', () => {
    // The fixture MUST carry the extra fields for this to mean anything. A fixture
    // holding only the five output fields makes the assertion pass against a
    // straight `{...model}` spread — it was vacuous before, asserting that fields
    // it never supplied were absent.
    //
    // `cost`, `baseUrl`, `api` and `maxTokens` ride along on every entry Pi returns.
    // `baseUrl` in particular can name a host-local proxy.
    const leaky = {
      ...catalogModel(),
      api: 'openai-completions',
      baseUrl: 'http://127.0.0.1:8081/v1',
      maxTokens: 8192,
      cost: { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 }
    }
    const [model] = toScreenModels([leaky])

    expect(Object.keys(model ?? {}).sort()).toEqual([
      'contextWindow',
      'id',
      'name',
      'provider',
      'reasoning'
    ])
    // Named explicitly, so a future field added to the projection cannot quietly
    // carry the proxy host with it.
    expect(JSON.parse(toJsonText(model)).baseUrl).toBeUndefined()
  })

  it('returns an empty catalog when the box has credentials for nothing', () => {
    expect(toScreenModels([])).toEqual([])
  })
})
