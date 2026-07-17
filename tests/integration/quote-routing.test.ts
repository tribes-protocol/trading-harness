import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetEnvCacheForTests } from '../../src/core/config.js';
import { resetAdaptersForTests } from '../../src/services/adapter-registry.js';
import * as marketData from '../../src/services/market-data.js';
import { QuoteSchema } from '../../src/schemas/market.js';

/**
 * True end-to-end wiring test: registry (providers.json) -> routing ->
 * adapter factory -> HttpClient -> normalization, with global fetch mocked
 * using the adapter's own doc-derived fixture. Verifies the layers agree
 * with each other, which per-adapter unit tests cannot.
 */

const fixture = JSON.parse(
  readFileSync('src/providers/marketstack/fixtures/eod_latest.json', 'utf8'),
) as Record<string, unknown>;

describe('quote routing end-to-end (mocked HTTP)', () => {
  beforeEach(() => {
    process.env.MARKETSTACK_API_KEY = 'test-key-marketstack-integration-1';
    resetEnvCacheForTests();
    resetAdaptersForTests();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: URL | string) => {
        const u = url.toString();
        if (!u.includes('api.marketstack.com')) {
          throw new Error(`unexpected host in integration test: ${u}`);
        }
        return new Response(JSON.stringify(fixture), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.MARKETSTACK_API_KEY;
    resetEnvCacheForTests();
    resetAdaptersForTests();
  });

  it('routes an equity quote to marketstack and returns schema-valid, eod-flagged data', async () => {
    const quote = await marketData.getQuote({ symbol: 'AAPL', assetClass: 'equity' });
    expect(() => QuoteSchema.parse(quote)).not.toThrow();
    expect(quote.source.provider).toBe('marketstack');
    expect(quote.source.freshness).toBe('eod');
    expect(quote.quality).toContain('eod');
    expect(quote.quality).not.toContain('fallback_source');
  });

  it('never leaks the API key through the returned payload', async () => {
    const quote = await marketData.getQuote({ symbol: 'AAPL', assetClass: 'equity' });
    expect(JSON.stringify(quote)).not.toContain('test-key-marketstack-integration-1');
  });
});
