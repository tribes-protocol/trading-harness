import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PROVIDER_IDS, isConfigured, type ProviderId } from '../core/config.js';
import { ValidationError } from '../core/errors.js';
import {
  ProviderRegistryFileSchema,
  type Operation,
  type ProviderRecord,
  type ProviderRegistryFile,
} from '../schemas/registry.js';

/**
 * Loads and validates the machine-readable provider capability registry
 * (providers.json — seeded from documentation research, updated by live
 * verification runs).
 */

const REGISTRY_PATH = join(dirname(fileURLToPath(import.meta.url)), 'providers.json');

let cached: ProviderRegistryFile | undefined;

export function loadRegistry(path: string = REGISTRY_PATH): ProviderRegistryFile {
  if (cached && path === REGISTRY_PATH) return cached;
  let raw: string;
  try {
    raw = readFileSync(path, 'utf8');
  } catch (err) {
    throw new ValidationError(`Provider registry not readable at ${path}`, { cause: err });
  }
  const parsed = ProviderRegistryFileSchema.safeParse(JSON.parse(raw));
  if (!parsed.success) {
    throw new ValidationError('Provider registry failed schema validation', {
      details: { issues: parsed.error.issues.slice(0, 10) },
    });
  }
  if (path === REGISTRY_PATH) cached = parsed.data;
  return parsed.data;
}

export function resetRegistryCacheForTests(): void {
  cached = undefined;
}

export function getProviderRecord(id: ProviderId | string): ProviderRecord | undefined {
  return loadRegistry().providers.find((p) => p.id === id);
}

export interface CapabilityMatch {
  provider: ProviderRecord;
  capability: ProviderRecord['capabilities'][number];
  configured: boolean;
}

/** All providers offering an operation, best-first. */
export function findCapabilities(
  operation: Operation,
  opts: { assetClass?: string; chain?: string; registry?: ProviderRegistryFile } = {},
): CapabilityMatch[] {
  const matches: CapabilityMatch[] = [];
  const registry = opts.registry ?? loadRegistry();
  for (const provider of registry.providers) {
    for (const capability of provider.capabilities) {
      if (capability.operation !== operation) continue;
      if (
        opts.assetClass !== undefined &&
        !capability.assetClasses.includes(opts.assetClass as never)
      ) {
        continue;
      }
      if (
        opts.chain !== undefined &&
        capability.chains !== undefined &&
        !capability.chains.includes(opts.chain as never)
      ) {
        continue;
      }
      matches.push({
        provider,
        capability,
        configured:
          (PROVIDER_IDS as readonly string[]).includes(provider.id) &&
          isConfigured(provider.id as ProviderId),
      });
    }
  }
  return matches.sort((a, b) => b.capability.priority - a.capability.priority);
}
