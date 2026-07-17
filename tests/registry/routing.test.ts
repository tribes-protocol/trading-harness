import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resetEnvCacheForTests } from '../../src/core/config.js';
import { NotSupportedError } from '../../src/core/errors.js';
import { executeWithFallback, routeCandidates } from '../../src/registry/routing.js';
import type { ProviderRegistryFile } from '../../src/schemas/registry.js';

const fixture: ProviderRegistryFile = {
  schemaVersion: '1.0.0',
  generatedAt: '2026-07-17T00:00:00Z',
  providers: [
    {
      id: 'marketstack',
      name: 'Marketstack',
      docsUrl: 'https://example.test/docs',
      docsReviewDate: '2026-07-17',
      apiVersion: 'test',
      baseUrl: 'https://example.test',
      authMechanism: 'query api key',
      envVar: 'MARKETSTACK_API_KEY',
      capabilities: [
        {
          operation: 'market.quote',
          assetClasses: ['equity'],
          freshness: 'eod',
          verification: 'docs-reviewed',
          priority: 80,
        },
      ],
      rateLimits: [],
      licensing: {},
      entitlementNotes: [],
      limitations: [],
      preferredUses: [],
      reviewConfidence: 'high',
    },
    {
      id: 'coingecko',
      name: 'CoinGecko Pro',
      docsUrl: 'https://example.test/docs2',
      docsReviewDate: '2026-07-17',
      apiVersion: 'test',
      baseUrl: 'https://example.test',
      authMechanism: 'header api key',
      envVar: 'COINGECKO_PRO_API_KEY',
      capabilities: [
        {
          operation: 'market.quote',
          assetClasses: ['equity', 'crypto'],
          freshness: 'delayed',
          verification: 'docs-reviewed',
          priority: 40,
        },
      ],
      rateLimits: [],
      licensing: {},
      entitlementNotes: [],
      limitations: [],
      preferredUses: [],
      reviewConfidence: 'high',
    },
  ],
};

beforeEach(() => {
  process.env.MARKETSTACK_API_KEY = 'test-key-marketstack-123';
  process.env.COINGECKO_PRO_API_KEY = 'test-key-coingecko-456';
  resetEnvCacheForTests();
});

afterEach(() => {
  delete process.env.MARKETSTACK_API_KEY;
  delete process.env.COINGECKO_PRO_API_KEY;
  resetEnvCacheForTests();
});

describe('routeCandidates', () => {
  it('orders by priority and filters by asset class', () => {
    const all = routeCandidates('market.quote', { registry: fixture, assetClass: 'equity' });
    expect(all.map((m) => m.provider.id)).toEqual(['marketstack', 'coingecko']);
    const cryptoOnly = routeCandidates('market.quote', { registry: fixture, assetClass: 'crypto' });
    expect(cryptoOnly.map((m) => m.provider.id)).toEqual(['coingecko']);
  });

  it('excludes unconfigured providers by default', () => {
    delete process.env.MARKETSTACK_API_KEY;
    resetEnvCacheForTests();
    const matches = routeCandidates('market.quote', { registry: fixture, assetClass: 'equity' });
    expect(matches.map((m) => m.provider.id)).toEqual(['coingecko']);
  });
});

describe('executeWithFallback', () => {
  it('uses the primary when it succeeds', async () => {
    const result = await executeWithFallback(
      'market.quote',
      { registry: fixture, assetClass: 'equity' },
      async (match) => match.provider.id,
    );
    expect(result.providerUsed).toBe('marketstack');
    expect(result.fallbackUsed).toBe(false);
    expect(result.failures).toEqual([]);
  });

  it('falls back on primary failure and records it', async () => {
    const result = await executeWithFallback(
      'market.quote',
      { registry: fixture, assetClass: 'equity' },
      async (match) => {
        if (match.provider.id === 'marketstack') throw new Error('primary down');
        return match.provider.id;
      },
    );
    expect(result.providerUsed).toBe('coingecko');
    expect(result.fallbackUsed).toBe(true);
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0]?.provider).toBe('marketstack');
  });

  it('throws NotSupportedError when nothing matches', async () => {
    await expect(
      executeWithFallback('macro.series', { registry: fixture }, async () => 'x'),
    ).rejects.toBeInstanceOf(NotSupportedError);
  });

  it('rethrows the last error when every candidate fails', async () => {
    await expect(
      executeWithFallback('market.quote', { registry: fixture, assetClass: 'equity' }, async () => {
        throw new Error('all down');
      }),
    ).rejects.toThrow('all down');
  });
});
