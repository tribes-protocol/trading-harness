import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resetEnvCacheForTests } from '../../core/config.js';
import {
  EntitlementError,
  NotSupportedError,
  ProviderError,
  RateLimitError,
  ValidationError,
} from '../../core/errors.js';
import { resetBucketsForTests } from '../../core/ratelimit.js';
import { PriceSeriesSchema } from '../../schemas/market.js';
import { DexPairSchema, TokenPriceSchema, WalletBalancesSchema } from '../../schemas/onchain.js';
import { BirdeyeAdapter } from './adapter.js';

const TEST_KEY = 'test-key-birdeye-0123456789';
const SOL_MINT = 'So11111111111111111111111111111111111111112';
const WALLET = 'Gt4RRcMg2mzEN9SDtSUjEjezC9b1nXjEGDQyEVbrc7Sk';

function fixture(name: string): unknown {
  return JSON.parse(readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), 'utf8'));
}

interface RecordedCall {
  url: URL;
  init: RequestInit | undefined;
}

function makeFetch(
  respond: (url: URL, init: RequestInit | undefined) => Response,
): { impl: typeof fetch; calls: RecordedCall[] } {
  const calls: RecordedCall[] = [];
  const impl = (async (
    input: Parameters<typeof fetch>[0],
    init?: RequestInit,
  ): Promise<Response> => {
    const url =
      input instanceof URL ? input : new URL(typeof input === 'string' ? input : input.url);
    calls.push({ url, init });
    return respond(url, init);
  }) as typeof fetch;
  return { impl, calls };
}

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

function headersOf(call: RecordedCall): Record<string, string> {
  return (call.init?.headers ?? {}) as Record<string, string>;
}

beforeEach(() => {
  process.env.BIRDEYE_API_KEY = TEST_KEY;
  resetEnvCacheForTests();
  resetBucketsForTests();
});

afterEach(() => {
  delete process.env.BIRDEYE_API_KEY;
  resetEnvCacheForTests();
});

describe('BirdeyeAdapter.getTokenPrice', () => {
  it('returns schema-valid TokenPrice with truthful freshness/quality and preserved raw ids', async () => {
    const raw = fixture('price') as {
      data: { value: number; updateUnixTime: number; liquidity: number };
    };
    const { impl, calls } = makeFetch(() => jsonResponse(raw));
    const adapter = new BirdeyeAdapter({ fetchImpl: impl });

    const result = await adapter.getTokenPrice({
      token: { chain: 'solana', address: SOL_MINT, symbol: 'SOL' },
    });

    // Re-parses cleanly against the platform schema.
    expect(() => TokenPriceSchema.parse(result)).not.toThrow();
    expect(result.price).toBe(raw.data.value);
    expect(result.currency).toBe('USD');
    expect(result.asOf).toBe(new Date(raw.data.updateUnixTime * 1000).toISOString());
    expect(result.liquidityUsd).toBe(raw.data.liquidity);
    expect(result.token.chain).toBe('solana');
    expect(result.token.address).toBe(SOL_MINT);
    expect(result.token.providerIds).toEqual({ birdeye: SOL_MINT });
    // Freshness per registry; vendor real-time claim carries no SLA -> quality stays [].
    expect(result.source.provider).toBe('birdeye');
    expect(result.source.endpoint).toBe('/defi/price');
    expect(result.source.freshness).toBe('realtime');
    expect(result.quality).toEqual([]);
    expect(result.lineage.map((s) => s.step)).toContain('convert_timestamp');

    // URL / params / auth header construction.
    expect(calls).toHaveLength(1);
    const call = calls[0]!;
    expect(call.url.origin).toBe('https://public-api.birdeye.so');
    expect(call.url.pathname).toBe('/defi/price');
    expect(call.url.searchParams.get('address')).toBe(SOL_MINT);
    expect(call.url.searchParams.get('include_liquidity')).toBe('true');
    const headers = headersOf(call);
    expect(headers['X-API-KEY']).toBe(TEST_KEY);
    expect(headers['x-chain']).toBe('solana');
  });

  it('defaults the chain to solana when the token query has none', async () => {
    const { impl, calls } = makeFetch(() => jsonResponse(fixture('price')));
    const adapter = new BirdeyeAdapter({ fetchImpl: impl });
    const result = await adapter.getTokenPrice({ token: { address: SOL_MINT } });
    expect(result.token.chain).toBe('solana');
    expect(headersOf(calls[0]!)['x-chain']).toBe('solana');
  });

  it('rejects bare-symbol lookups without any network call', async () => {
    const { impl, calls } = makeFetch(() => jsonResponse(fixture('price')));
    const adapter = new BirdeyeAdapter({ fetchImpl: impl });
    await expect(adapter.getTokenPrice({ token: { symbol: 'SOL' } })).rejects.toBeInstanceOf(
      ValidationError,
    );
    expect(calls).toHaveLength(0);
  });

  it('rejects chains with no Birdeye x-chain equivalent', async () => {
    const { impl } = makeFetch(() => jsonResponse(fixture('price')));
    const adapter = new BirdeyeAdapter({ fetchImpl: impl });
    await expect(
      adapter.getTokenPrice({ token: { chain: 'bitcoin', address: 'xyz' } }),
    ).rejects.toBeInstanceOf(NotSupportedError);
  });
});

describe('BirdeyeAdapter.getTokenOhlcv', () => {
  it('returns schema-valid PriceSeries with mapped interval, converted timestamps, and USD prices', async () => {
    const raw = fixture('ohlcv') as {
      data: { items: Array<{ o: number; h: number; l: number; c: number; v: number; unix_time: number }> };
    };
    const { impl, calls } = makeFetch(() => jsonResponse(raw));
    const adapter = new BirdeyeAdapter({ fetchImpl: impl });

    const result = await adapter.getTokenOhlcv({
      token: { chain: 'solana', address: SOL_MINT, symbol: 'SOL' },
      interval: '1h',
      from: '2026-07-17T06:00:00Z',
      to: '2026-07-17T08:00:00Z',
    });

    expect(() => PriceSeriesSchema.parse(result)).not.toThrow();
    expect(result.frequency).toBe('1h');
    expect(result.currency).toBe('USD');
    expect(result.adjustment).toBe('raw');
    expect(result.bars).toHaveLength(raw.data.items.length);
    const first = raw.data.items[0]!;
    expect(result.bars[0]).toEqual({
      t: new Date(first.unix_time * 1000).toISOString(),
      o: first.o,
      h: first.h,
      l: first.l,
      c: first.c,
      v: first.v,
    });
    expect(result.instrument.providerIds).toEqual({ birdeye: SOL_MINT });
    expect(result.source.endpoint).toBe('/defi/v3/ohlcv');
    expect(result.source.freshness).toBe('realtime');
    expect(result.quality).toEqual([]);
    expect(result.lineage.map((s) => s.step)).toEqual(
      expect.arrayContaining(['map_interval', 'convert_timestamp', 'map_fields']),
    );

    // URL / params: platform '1h' -> Birdeye '1H'; ISO from/to -> epoch seconds.
    const call = calls[0]!;
    expect(call.url.pathname).toBe('/defi/v3/ohlcv');
    expect(call.url.searchParams.get('address')).toBe(SOL_MINT);
    expect(call.url.searchParams.get('type')).toBe('1H');
    expect(call.url.searchParams.get('time_from')).toBe('1784268000');
    expect(call.url.searchParams.get('time_to')).toBe('1784275200');
    expect(call.url.searchParams.get('currency')).toBe('usd');
    expect(headersOf(call)['x-chain']).toBe('solana');
    expect(headersOf(call)['X-API-KEY']).toBe(TEST_KEY);
  });

  it('rejects intervals without a documented Birdeye OHLCV type', async () => {
    const { impl, calls } = makeFetch(() => jsonResponse(fixture('ohlcv')));
    const adapter = new BirdeyeAdapter({ fetchImpl: impl });
    await expect(
      adapter.getTokenOhlcv({ token: { chain: 'solana', address: SOL_MINT }, interval: 'tick' }),
    ).rejects.toBeInstanceOf(NotSupportedError);
    expect(calls).toHaveLength(0);
  });

  it('rejects a non-positive limit instead of silently returning all candles', async () => {
    const { impl, calls } = makeFetch(() => jsonResponse(fixture('ohlcv')));
    const adapter = new BirdeyeAdapter({ fetchImpl: impl });
    await expect(
      adapter.getTokenOhlcv({
        token: { chain: 'solana', address: SOL_MINT },
        interval: '1h',
        from: '2026-07-17T06:00:00Z',
        to: '2026-07-17T08:00:00Z',
        limit: 0,
      }),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(calls).toHaveLength(0);
  });

  it('rejects chains outside the documented /defi/v3/ohlcv subset', async () => {
    const { impl, calls } = makeFetch(() => jsonResponse(fixture('ohlcv')));
    const adapter = new BirdeyeAdapter({ fetchImpl: impl });
    await expect(
      adapter.getTokenOhlcv({ token: { chain: 'polygon', address: '0xabc' }, interval: '1h' }),
    ).rejects.toBeInstanceOf(NotSupportedError);
    expect(calls).toHaveLength(0);
  });
});

describe('BirdeyeAdapter.getDexPairs', () => {
  it('returns schema-valid DexPair[] with pair/base/quote identifiers preserved', async () => {
    const { impl, calls } = makeFetch(() => jsonResponse(fixture('markets')));
    const adapter = new BirdeyeAdapter({ fetchImpl: impl });

    const pairs = await adapter.getDexPairs({ chain: 'solana', tokenAddress: SOL_MINT });

    expect(pairs).toHaveLength(2);
    for (const pair of pairs) expect(() => DexPairSchema.parse(pair)).not.toThrow();
    const [raydium, orca] = pairs;
    expect(raydium!.pairAddress).toBe('58oQChx4yWmvKdwLLZzBi4ChoCc2fqCUWBkwMihLYQo2');
    expect(raydium!.dex).toBe('Raydium');
    expect(raydium!.baseToken.address).toBe(SOL_MINT);
    expect(raydium!.baseToken.providerIds).toEqual({ birdeye: SOL_MINT });
    expect(raydium!.quoteToken?.symbol).toBe('USDC');
    expect(raydium!.priceUsd).toBe(161.21);
    expect(raydium!.liquidityUsd).toBe(18923441.02);
    expect(raydium!.volume24hUsd).toBe(90211433.8);
    expect(raydium!.source.endpoint).toBe('/defi/v2/markets');
    expect(raydium!.source.freshness).toBe('realtime');
    expect(raydium!.quality).toEqual([]);
    // Documented nullable price maps to absent priceUsd.
    expect(orca!.priceUsd).toBeUndefined();
    // asOf stamped from receivedAt (endpoint has no update timestamp).
    expect(raydium!.asOf).toBe(raydium!.source.receivedAt);

    const call = calls[0]!;
    expect(call.url.pathname).toBe('/defi/v2/markets');
    expect(call.url.searchParams.get('address')).toBe(SOL_MINT);
    expect(call.url.searchParams.get('sort_by')).toBe('liquidity');
    expect(call.url.searchParams.get('sort_type')).toBe('desc');
    expect(call.url.searchParams.get('limit')).toBe('10');
    expect(headersOf(call)['x-chain']).toBe('solana');
  });

  it('clamps limit to the documented 1-20 range', async () => {
    const { impl, calls } = makeFetch(() => jsonResponse(fixture('markets')));
    const adapter = new BirdeyeAdapter({ fetchImpl: impl });
    await adapter.getDexPairs({ chain: 'ethereum', tokenAddress: '0xabc', limit: 50 });
    const call = calls[0]!;
    expect(call.url.searchParams.get('limit')).toBe('20');
    expect(headersOf(call)['x-chain']).toBe('ethereum');
  });
});

describe('BirdeyeAdapter.getWalletBalances', () => {
  it('returns schema-valid WalletBalances with raw integer amounts preserved as strings', async () => {
    const { impl, calls } = makeFetch(() => jsonResponse(fixture('wallet_token_list')));
    const adapter = new BirdeyeAdapter({ fetchImpl: impl });

    const result = await adapter.getWalletBalances({ chain: 'solana', address: WALLET });

    expect(() => WalletBalancesSchema.parse(result)).not.toThrow();
    expect(result.chain).toBe('solana');
    expect(result.address).toBe(WALLET);
    expect(result.balances).toHaveLength(2);
    const usdc = result.balances[0]!;
    expect(usdc.rawAmount).toBe('47289918');
    expect(usdc.amount).toBe(47.289918);
    expect(usdc.valueUsd).toBe(47.28979693780992);
    expect(usdc.token.address).toBe('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
    expect(usdc.token.decimals).toBe(6);
    expect(usdc.token.providerIds).toEqual({
      birdeye: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    });
    expect(result.source.endpoint).toBe('/v1/wallet/token_list');
    expect(result.source.freshness).toBe('realtime');
    expect(result.quality).toEqual([]);
    expect(result.asOf).toBe(result.source.receivedAt);

    const call = calls[0]!;
    expect(call.url.pathname).toBe('/v1/wallet/token_list');
    expect(call.url.searchParams.get('wallet')).toBe(WALLET);
    expect(headersOf(call)['x-chain']).toBe('solana');
    expect(headersOf(call)['X-API-KEY']).toBe(TEST_KEY);
  });

  it('preserves digit-string balances exactly and renders huge numeric balances as plain decimal strings', async () => {
    // Official reference examples show balance as a number (Solana) and as a
    // digit string (EVM); both must survive as exact decimal strings.
    const body = {
      success: true,
      data: {
        wallet: WALLET,
        items: [
          {
            address: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
            decimals: 6,
            balance: '340282366920938463463374607431768211455', // > 2^53, string form
          },
          {
            address: 'So11111111111111111111111111111111111111112',
            decimals: 9,
            balance: 18014398509481984, // 2^54, exceeds Number.isSafeInteger
          },
        ],
      },
    };
    const { impl } = makeFetch(() => jsonResponse(body));
    const adapter = new BirdeyeAdapter({ fetchImpl: impl });
    const result = await adapter.getWalletBalances({ chain: 'solana', address: WALLET });
    expect(result.balances[0]!.rawAmount).toBe('340282366920938463463374607431768211455');
    expect(result.balances[1]!.rawAmount).toBe('18014398509481984');
    // Never scientific notation, digits only (schema also enforces this).
    for (const b of result.balances) expect(b.rawAmount).toMatch(/^\d+$/);
  });

  it('rejects malformed balance strings instead of coercing them', async () => {
    const body = {
      success: true,
      data: {
        wallet: WALLET,
        items: [
          { address: 'So11111111111111111111111111111111111111112', balance: '1.5e9' },
        ],
      },
    };
    const { impl } = makeFetch(() => jsonResponse(body));
    const adapter = new BirdeyeAdapter({ fetchImpl: impl });
    await expect(
      adapter.getWalletBalances({ chain: 'solana', address: WALLET }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('rejects non-solana chains (endpoint documents x-chain solana only)', async () => {
    const { impl, calls } = makeFetch(() => jsonResponse(fixture('wallet_token_list')));
    const adapter = new BirdeyeAdapter({ fetchImpl: impl });
    await expect(
      adapter.getWalletBalances({ chain: 'ethereum', address: '0xabc' }),
    ).rejects.toBeInstanceOf(NotSupportedError);
    expect(calls).toHaveLength(0);
  });
});

describe('BirdeyeAdapter error mapping', () => {
  it('maps 429 to RateLimitError', async () => {
    const { impl } = makeFetch(() =>
      jsonResponse({ success: false, message: 'Too Many Requests' }, 429, { 'retry-after': '0' }),
    );
    const adapter = new BirdeyeAdapter({ fetchImpl: impl });
    const err = await adapter
      .getTokenPrice({ token: { chain: 'solana', address: SOL_MINT } })
      .then(() => null)
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(RateLimitError);
    expect((err as RateLimitError).code).toBe('RATE_LIMIT');
  });

  it('maps 401 to EntitlementError', async () => {
    const { impl } = makeFetch(() =>
      jsonResponse({ success: false, message: 'Unauthorized' }, 401),
    );
    const adapter = new BirdeyeAdapter({ fetchImpl: impl });
    const err = await adapter
      .getTokenPrice({ token: { chain: 'solana', address: SOL_MINT } })
      .then(() => null)
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(EntitlementError);
    expect((err as EntitlementError).code).toBe('ENTITLEMENT');
  });

  it('maps the documented success:false envelope on HTTP 200 to ProviderError', async () => {
    const { impl } = makeFetch(() =>
      jsonResponse({ success: false, message: 'address is invalid format' }, 200),
    );
    const adapter = new BirdeyeAdapter({ fetchImpl: impl });
    const err = await adapter
      .getTokenPrice({ token: { chain: 'solana', address: 'not-an-address' } })
      .then(() => null)
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ProviderError);
    expect((err as ProviderError).code).toBe('PROVIDER');
  });
});

describe('BirdeyeAdapter configuration and health', () => {
  it('is safely unconfigured without the env var: no throw from constructor, isConfigured false, healthCheck reports it', async () => {
    delete process.env.BIRDEYE_API_KEY;
    resetEnvCacheForTests();
    const { impl, calls } = makeFetch(() => jsonResponse(fixture('networks')));
    const adapter = new BirdeyeAdapter({ fetchImpl: impl });

    expect(adapter.isConfigured()).toBe(false);
    const health = await adapter.healthCheck();
    expect(health.provider).toBe('birdeye');
    expect(health.configured).toBe(false);
    expect(health.live).toBeNull();
    expect(health.message).toContain('BIRDEYE_API_KEY');
    expect(calls).toHaveLength(0);
  });

  it('live health check makes exactly one minimal request to /defi/networks', async () => {
    const { impl, calls } = makeFetch(() => jsonResponse(fixture('networks')));
    const adapter = new BirdeyeAdapter({ fetchImpl: impl });

    const health = await adapter.healthCheck({ live: true });

    expect(health.configured).toBe(true);
    expect(health.live).toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url.pathname).toBe('/defi/networks');
    expect(headersOf(calls[0]!)['X-API-KEY']).toBe(TEST_KEY);
  });

  it('folds live probe failures into the health result without throwing', async () => {
    const { impl } = makeFetch(() => jsonResponse({ success: false, message: 'nope' }, 200));
    const adapter = new BirdeyeAdapter({ fetchImpl: impl });
    const health = await adapter.healthCheck({ live: true });
    expect(health.configured).toBe(true);
    expect(health.live).toBe(false);
    expect(health.message.length).toBeGreaterThan(0);
  });
});
