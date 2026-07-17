import { PROVIDER_IDS, type ProviderId } from '../core/config.js';
import { NotSupportedError } from '../core/errors.js';
import { adapterFactories } from '../providers/index.js';
import type { ProviderAdapter } from '../providers/types.js';

/**
 * Lazily constructs and memoizes adapter instances.
 *
 * KNOWN LIMITATION: adapters (and the API keys baked into their HTTP
 * clients at first use) are memoized for the process lifetime. In-process
 * key rotation requires a restart (or resetAdaptersForTests()); routing's
 * isConfigured() reads the live environment and may disagree with a stale
 * memoized client until then.
 */

const instances = new Map<ProviderId, ProviderAdapter>();

export function getAdapter(id: ProviderId): ProviderAdapter {
  const existing = instances.get(id);
  if (existing) return existing;
  const factory = adapterFactories[id];
  if (!factory) {
    throw new NotSupportedError(`No adapter implemented for provider "${id}"`, {
      details: { provider: id },
    });
  }
  const adapter = factory();
  instances.set(id, adapter);
  return adapter;
}

export function implementedProviderIds(): ProviderId[] {
  return PROVIDER_IDS.filter((id) => adapterFactories[id] !== undefined);
}

export function allAdapters(): ProviderAdapter[] {
  return implementedProviderIds().map((id) => getAdapter(id));
}

export function resetAdaptersForTests(): void {
  instances.clear();
}
