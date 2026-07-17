import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { envVarName, resetEnvCacheForTests } from '../../core/config.js';
import {
  ConfigError,
  EntitlementError,
  NotSupportedError,
  RateLimitError,
  ValidationError,
} from '../../core/errors.js';
import { resetBucketsForTests } from '../../core/ratelimit.js';
import { PriceSeriesSchema, QuoteSchema } from '../../schemas/market.js';
import { DexPairSchema, TokenPriceSchema } from '../../schemas/onchain.js';
import { CoinGeckoAdapter } from './adapter.js';

const ENV_VAR = envVarName('coingecko'); // COINGECKO_PRO_API_KEY
const TEST_KEY = 'test-key-coingecko-0123456789';
const USDC = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48';

const here = path.dirname(fileURLToPath(import.meta.url));
function loadFixture<T = unknown>(name: string): T {
  return JSON.parse(readFileSync(path.join(here, 'fixtures', name), 'utf8')) as T;
}

// Array-shaped responses are wrapped under "body" in their fixture files so
// the top-level _fixture metadata key can exist; unwrap them here.
const coinsMarketsBody = loadFixture<{ body: unknown[] }>('coins-markets.json').body;
const simplePriceBody = loadFixture<Record<string, unknown>>('simple-price.json');
const simpleTokenPriceBody = loadFixture<Record<string, unknown>>('simple-token-price.json');
const ohlcBody = loadFixture<{ body: unknown[] }>('coins-id-ohlc.json').body;
const tokenPoolsBody = loadFixture<Record<string, unknown>>('onchain-token-pools.json');

interface Route {
  match: (url: URL) => boolean;
  body?: unknown;
  status?: number;
  headers?: Record<string, string>;
}

interface RecordedCall {
  url: URL;
  init: RequestInit | undefined;
}

function makeFetch(routes: Route[]): { impl: typeof fetch; calls: RecordedCall[] } {
  const calls: RecordedCall[] = [];
  const impl = (async (input: unknown, init?: RequestInit) => {
    const url = input instanceof URL ? input : new URL(String(input));
    calls.push({ url, init });
    const route = routes.find((r) => r.match(url));
    if (!route) return new Response('unmatched route in test', { status: 404 });
    return new Response(JSON.stringify(route.body ?? {}), {
      status: route.status ?? 200,
      headers: { 'content-type': 'application/json', ...route.headers },
    });
  }) as typeof fetch;
  return { impl, calls };
}

function adapterWith(routes: Route[]): { adapter: CoinGeckoAdapter; calls: RecordedCall[] } {
  const { impl, calls } = makeFetch(routes);
  return { adapter: new CoinGeckoAdapter({ fetchImpl: impl }), calls };
}

function headerOf(call: RecordedCall | undefined, name: string): string | undefined {
  return (call?.init?.headers as Record<string, string> | undefined)?.[name];
}

beforeEach(() => {
  process.env[ENV_VAR] = TEST_KEY;
  resetEnvCacheForTests();
  resetBucketsForTests();
});

afterEach(() => {
  delete process.env[ENV_VAR];
  resetEnvCacheForTests();
  resetBucketsForTests();
});

describe('CoinGeckoAdapter.getQuote', () => {
  it('returns a schema-valid delayed quote keyed by CoinGecko coin id', async () => {
    const { adapter, calls } = adapterWith([
      { match: (u) => u.pathname === '/api/v3/coins/markets', body: coinsMarketsBody },
    ]);
    const quote = await adapter.getQuote({ symbol: 'bitcoin' });

    // (a) schema-valid
    expect(() => QuoteSchema.parse(quote)).not.toThrow();

    // (b) URL / params / auth header
    const call = calls[0];
    expect(call?.url.pathname).toBe('/api/v3/coins/markets');
    expect(call?.url.searchParams.get('vs_currency')).toBe('usd');
    expect(call?.url.searchParams.get('ids')).toBe('bitcoin');
    expect(headerOf(call, 'x-cg-pro-api-key')).toBe(TEST_KEY);

    // (c) quality/freshness stamped truthfully
    expect(quote.quality).toContain('delayed');
    expect(quote.source.freshness).toBe('delayed');
    expect(quote.source.provider).toBe('coingecko');
    expect(quote.source.endpoint).toBe('/coins/markets');
    expect(Date.parse(quote.source.receivedAt)).not.toBeNaN();

    // normalized payload with raw identifiers preserved
    expect(quote.price).toBe(118211.42);
    expect(quote.instrument.symbol).toBe('BTC');
    expect(quote.instrument.providerIds['coingecko']).toBe('bitcoin');
    expect(quote.asOf).toBe(new Date('2026-07-16T10:10:02.481Z').toISOString());
    expect(quote.change24hPct).toBeCloseTo(1.03853, 5);
    expect(quote.volume24h).toBe(46953265807);
    expect(quote.marketCap).toBe(2351650203845);
    expect(quote.lineage.length).toBeGreaterThan(0);
  });

  it('throws ValidationError for an unknown coin id (empty array response)', async () => {
    const { adapter } = adapterWith([
      { match: (u) => u.pathname === '/api/v3/coins/markets', body: [] },
    ]);
    await expect(adapter.getQuote({ symbol: 'BTC' })).rejects.toBeInstanceOf(ValidationError);
  });
});

describe('CoinGeckoAdapter.getTokenPrice', () => {
  it('resolves a providerId (coin id) via /simple/price', async () => {
    const { adapter, calls } = adapterWith([
      { match: (u) => u.pathname === '/api/v3/simple/price', body: simplePriceBody },
    ]);
    const price = await adapter.getTokenPrice({ token: { providerId: 'bitcoin' } });

    expect(() => TokenPriceSchema.parse(price)).not.toThrow();

    const call = calls[0];
    expect(call?.url.pathname).toBe('/api/v3/simple/price');
    expect(call?.url.searchParams.get('ids')).toBe('bitcoin');
    expect(call?.url.searchParams.get('vs_currencies')).toBe('usd');
    expect(call?.url.searchParams.get('include_market_cap')).toBe('true');
    expect(call?.url.searchParams.get('include_24hr_vol')).toBe('true');
    expect(call?.url.searchParams.get('include_last_updated_at')).toBe('true');
    expect(headerOf(call, 'x-cg-pro-api-key')).toBe(TEST_KEY);

    expect(price.token.chain).toBe('other'); // coin ids are chain-agnostic
    expect(price.token.providerIds['coingecko']).toBe('bitcoin');
    expect(price.price).toBeCloseTo(118211.42813786284, 6);
    expect(price.currency).toBe('USD');
    expect(price.asOf).toBe(new Date(1784196602 * 1000).toISOString());
    expect(price.marketCapUsd).toBeCloseTo(2351650203845.66, 1);
    expect(price.volume24hUsd).toBeCloseTo(46953265807.03, 1);
    expect(price.quality).toContain('delayed');
    expect(price.source.freshness).toBe('delayed');
  });

  it('resolves chain+address via /simple/token_price/{platform}, case-insensitively', async () => {
    const { adapter, calls } = adapterWith([
      {
        match: (u) => u.pathname === '/api/v3/simple/token_price/ethereum',
        body: simpleTokenPriceBody,
      },
    ]);
    // Mixed-case address: response keys are lowercase; the raw input is preserved.
    const mixedCase = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
    const price = await adapter.getTokenPrice({
      token: { chain: 'ethereum', address: mixedCase, symbol: 'USDC' },
    });

    expect(() => TokenPriceSchema.parse(price)).not.toThrow();

    const call = calls[0];
    expect(call?.url.pathname).toBe('/api/v3/simple/token_price/ethereum');
    expect(call?.url.searchParams.get('contract_addresses')).toBe(mixedCase);
    expect(call?.url.searchParams.get('vs_currencies')).toBe('usd');
    expect(headerOf(call, 'x-cg-pro-api-key')).toBe(TEST_KEY);

    expect(price.token.chain).toBe('ethereum');
    expect(price.token.address).toBe(mixedCase); // raw identifier preserved
    expect(price.token.providerIds['coingecko_asset_platform']).toBe('ethereum');
    expect(price.price).toBeCloseTo(0.999894, 6);
    expect(price.asOf).toBe(new Date(1784196602 * 1000).toISOString());
    expect(price.quality).toContain('delayed');
  });

  it('throws NotSupportedError for chains without a confirmed platform id, without calling out', async () => {
    const { adapter, calls } = adapterWith([]);
    await expect(
      adapter.getTokenPrice({ token: { chain: 'bitcoin', address: 'bc1qxyz' } }),
    ).rejects.toBeInstanceOf(NotSupportedError);
    expect(calls.length).toBe(0);
  });

  it('throws ValidationError when neither providerId nor chain+address is given', async () => {
    const { adapter } = adapterWith([]);
    await expect(adapter.getTokenPrice({ token: { symbol: 'BTC' } })).rejects.toBeInstanceOf(
      ValidationError,
    );
  });
});

describe('CoinGeckoAdapter.getTokenOhlcv', () => {
  it('fetches daily OHLC by coin id and returns a schema-valid series', async () => {
    const { adapter, calls } = adapterWith([
      { match: (u) => u.pathname === '/api/v3/coins/bitcoin/ohlc', body: ohlcBody },
    ]);
    const series = await adapter.getTokenOhlcv({
      token: { providerId: 'bitcoin', symbol: 'BTC' },
      interval: '1d',
      limit: 5,
    });

    expect(() => PriceSeriesSchema.parse(series)).not.toThrow();

    const call = calls[0];
    expect(call?.url.pathname).toBe('/api/v3/coins/bitcoin/ohlc');
    expect(call?.url.searchParams.get('vs_currency')).toBe('usd');
    expect(call?.url.searchParams.get('interval')).toBe('daily');
    expect(call?.url.searchParams.get('days')).toBe('7'); // smallest bucket >= limit 5
    expect(headerOf(call, 'x-cg-pro-api-key')).toBe(TEST_KEY);

    expect(series.frequency).toBe('1d');
    expect(series.adjustment).toBe('raw');
    expect(series.instrument.providerIds['coingecko']).toBe('bitcoin');
    expect(series.bars).toHaveLength(5);
    expect(series.bars[0]?.t).toBe(new Date(1783814400000).toISOString());
    expect(series.bars[4]?.c).toBe(118211.42);
    expect(series.bars[0]?.v).toBeUndefined(); // /ohlc carries no volume
    expect(series.quality).toContain('delayed');
    expect(series.quality).not.toContain('incomplete'); // range fits a documented bucket
    expect(series.source.freshness).toBe('delayed');
    expect(series.source.endpoint).toBe('/coins/bitcoin/ohlc');
  });

  it('maps 1h to interval=hourly and filters/limits client-side', async () => {
    const { adapter, calls } = adapterWith([
      { match: (u) => u.pathname === '/api/v3/coins/bitcoin/ohlc', body: ohlcBody },
    ]);
    const series = await adapter.getTokenOhlcv({
      token: { providerId: 'bitcoin' },
      interval: '1h',
      from: '2026-07-14T00:00:00Z',
      to: '2026-07-15T23:59:59Z',
    });
    expect(calls[0]?.url.searchParams.get('interval')).toBe('hourly');
    // Only the 2026-07-14 and 2026-07-15 bars survive the client-side filter.
    expect(series.bars.map((b) => b.t)).toEqual([
      new Date(1783987200000).toISOString(),
      new Date(1784073600000).toISOString(),
    ]);
  });

  it('applies a tail limit client-side', async () => {
    const { adapter } = adapterWith([
      { match: (u) => u.pathname === '/api/v3/coins/bitcoin/ohlc', body: ohlcBody },
    ]);
    const series = await adapter.getTokenOhlcv({
      token: { providerId: 'bitcoin' },
      interval: '1d',
      limit: 2,
    });
    expect(series.bars).toHaveLength(2);
    expect(series.bars[1]?.t).toBe(new Date(1784160000000).toISOString());
  });

  it('caps daily requests at the documented days=180 maximum and stamps incomplete', async () => {
    const { adapter, calls } = adapterWith([
      { match: (u) => u.pathname === '/api/v3/coins/bitcoin/ohlc', body: ohlcBody },
    ]);
    const series = await adapter.getTokenOhlcv({
      token: { providerId: 'bitcoin' },
      interval: '1d',
      limit: 365, // beyond the documented 180-day max for interval=daily
    });
    // days=365/max are NOT documented with an explicit interval — never sent.
    expect(calls[0]?.url.searchParams.get('interval')).toBe('daily');
    expect(calls[0]?.url.searchParams.get('days')).toBe('180');
    expect(series.quality).toContain('delayed');
    expect(series.quality).toContain('incomplete');
    expect(series.lineage.some((s) => s.step === 'cap_days_bucket')).toBe(true);
  });

  it('caps hourly requests at the documented days=90 maximum and stamps incomplete', async () => {
    const { adapter, calls } = adapterWith([
      { match: (u) => u.pathname === '/api/v3/coins/bitcoin/ohlc', body: ohlcBody },
    ]);
    const series = await adapter.getTokenOhlcv({
      token: { providerId: 'bitcoin' },
      interval: '1h',
      from: '2025-01-01T00:00:00Z', // far beyond the 90-day hourly window
    });
    expect(calls[0]?.url.searchParams.get('interval')).toBe('hourly');
    expect(calls[0]?.url.searchParams.get('days')).toBe('90');
    expect(series.quality).toContain('incomplete');
  });

  it('rejects undocumented intervals and missing coin ids', async () => {
    const { adapter, calls } = adapterWith([]);
    await expect(
      adapter.getTokenOhlcv({ token: { providerId: 'bitcoin' }, interval: '5m' }),
    ).rejects.toBeInstanceOf(NotSupportedError);
    await expect(
      adapter.getTokenOhlcv({ token: { chain: 'ethereum', address: USDC }, interval: '1d' }),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(calls.length).toBe(0);
  });
});

describe('CoinGeckoAdapter.getDexPairs', () => {
  const poolsPath = `/api/v3/onchain/networks/eth/tokens/${USDC}/pools`;

  it('fetches top pools for a token and maps them to schema-valid DexPairs', async () => {
    const { adapter, calls } = adapterWith([
      { match: (u) => u.pathname === poolsPath, body: tokenPoolsBody },
    ]);
    const pairs = await adapter.getDexPairs({ chain: 'ethereum', tokenAddress: USDC });

    expect(pairs).toHaveLength(2);
    for (const pair of pairs) expect(() => DexPairSchema.parse(pair)).not.toThrow();

    const call = calls[0];
    expect(call?.url.pathname).toBe(poolsPath);
    expect(call?.url.searchParams.get('include')).toBe('base_token,quote_token,dex');
    expect(call?.url.searchParams.get('page')).toBe('1');
    expect(headerOf(call, 'x-cg-pro-api-key')).toBe(TEST_KEY);

    const [first, second] = pairs;
    expect(first?.chain).toBe('ethereum');
    expect(first?.pairAddress).toBe('0x88e6a0c2ddd26feeb64f039a2c41296fcb3f5640');
    expect(first?.dex).toBe('Uniswap V3'); // resolved from included dex resource
    expect(first?.baseToken.symbol).toBe('USDC');
    expect(first?.baseToken.address).toBe(USDC);
    expect(first?.baseToken.decimals).toBe(6);
    expect(first?.baseToken.providerIds['coingecko']).toBe('usd-coin');
    expect(first?.baseToken.providerIds['geckoterminal']).toBe(`eth_${USDC}`);
    expect(first?.quoteToken?.symbol).toBe('WETH');
    // string-typed decimals converted to numbers
    expect(first?.priceUsd).toBeCloseTo(0.999894, 6);
    expect(first?.liquidityUsd).toBeCloseTo(545933958.0815, 3);
    expect(first?.volume24hUsd).toBeCloseTo(65665560.4792908, 4);
    expect(first?.asOf).toBe(first?.source.receivedAt);
    expect(first?.quality).toContain('delayed');
    expect(first?.source.freshness).toBe('delayed');

    // second pool has no included dex resource -> raw dex id is preserved
    expect(second?.dex).toBe('sushiswap');
  });

  it('honors the limit parameter', async () => {
    const { adapter } = adapterWith([
      { match: (u) => u.pathname === poolsPath, body: tokenPoolsBody },
    ]);
    const pairs = await adapter.getDexPairs({ chain: 'ethereum', tokenAddress: USDC, limit: 1 });
    expect(pairs).toHaveLength(1);
  });

  it('throws NotSupportedError for chains without a confirmed network id', async () => {
    const { adapter, calls } = adapterWith([]);
    await expect(
      adapter.getDexPairs({ chain: 'other', tokenAddress: USDC }),
    ).rejects.toBeInstanceOf(NotSupportedError);
    expect(calls.length).toBe(0);
  });
});

describe('CoinGeckoAdapter error mapping', () => {
  it('maps 429 to RateLimitError', async () => {
    const { adapter } = adapterWith([
      {
        match: () => true,
        status: 429,
        headers: { 'retry-after': '0' },
        body: { status: { error_message: 'Rate limit exceeded. Reduce call frequency or upgrade your plan' } },
      },
    ]);
    await expect(adapter.getQuote({ symbol: 'bitcoin' })).rejects.toBeInstanceOf(RateLimitError);
  });

  it('maps 401 (missing/invalid key, vendor code 10002) to EntitlementError', async () => {
    const { adapter, calls } = adapterWith([
      {
        match: () => true,
        status: 401,
        body: {
          status: {
            error_code: 10002,
            error_message:
              'No API key provided. Pro API requires x_cg_pro_api_key, Demo API requires x_cg_demo_api_key',
          },
        },
      },
    ]);
    await expect(adapter.getQuote({ symbol: 'bitcoin' })).rejects.toBeInstanceOf(EntitlementError);
    expect(calls.length).toBe(1); // 401 is not retried
  });
});

describe('CoinGeckoAdapter configuration and health', () => {
  it('reports unconfigured without throwing when the env var is absent', async () => {
    delete process.env[ENV_VAR];
    resetEnvCacheForTests();
    const { adapter, calls } = adapterWith([]);

    expect(adapter.isConfigured()).toBe(false);
    const health = await adapter.healthCheck();
    expect(health.configured).toBe(false);
    expect(health.live).toBeNull();
    expect(health.message).toContain(ENV_VAR);
    expect(calls.length).toBe(0);

    // Data calls surface a ConfigError (key read lazily, never at construct time).
    await expect(adapter.getQuote({ symbol: 'bitcoin' })).rejects.toBeInstanceOf(ConfigError);
  });

  it('constructs without env configured (lazy client, no key read)', () => {
    delete process.env[ENV_VAR];
    resetEnvCacheForTests();
    expect(() => new CoinGeckoAdapter()).not.toThrow();
  });

  it('healthCheck({live:true}) performs exactly one minimal-quota request', async () => {
    const { adapter, calls } = adapterWith([
      {
        match: (u) => u.pathname === '/api/v3/simple/price',
        body: { bitcoin: { usd: 118211.42 } },
      },
    ]);
    const health = await adapter.healthCheck({ live: true });
    expect(health.configured).toBe(true);
    expect(health.live).toBe(true);
    expect(calls.length).toBe(1);
    expect(calls[0]?.url.searchParams.get('ids')).toBe('bitcoin');
    expect(calls[0]?.url.searchParams.get('vs_currencies')).toBe('usd');
  });
});
