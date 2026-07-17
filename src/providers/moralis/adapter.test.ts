import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resetEnvCacheForTests } from '../../core/config.js';
import {
  EntitlementError,
  NotSupportedError,
  RateLimitError,
  ValidationError,
} from '../../core/errors.js';
import { resetBucketsForTests } from '../../core/ratelimit.js';
import {
  DexPairSchema,
  TokenPriceSchema,
  TransferBatchSchema,
  WalletBalancesSchema,
} from '../../schemas/onchain.js';
import { MoralisAdapter } from './adapter.js';

const here = dirname(fileURLToPath(import.meta.url));

function fixture<T = Record<string, unknown>>(name: string): T {
  return JSON.parse(readFileSync(join(here, 'fixtures', name), 'utf8')) as T;
}

const TEST_KEY = 'test-key-moralis-0123456789';
const WALLET = '0x1111111111111111111111111111111111111111';
const WETH = '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2';
const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const SOL_WALLET = '8Jyu6g6oyxr2eYqjqVSYWh7qE4BpjJ3Z8W1VgP7Kx1Aa';

interface RecordedCall {
  url: string;
  method: string;
  headers: Record<string, string>;
}

interface MockRoute {
  status?: number;
  body?: unknown;
  headers?: Record<string, string>;
}

/** Records every request and answers from a URL-driven handler. No network. */
function mockFetch(handler: (url: URL, call: number) => MockRoute): {
  impl: typeof fetch;
  calls: RecordedCall[];
} {
  const calls: RecordedCall[] = [];
  const impl = (async (input: unknown, init?: RequestInit): Promise<Response> => {
    const url = input instanceof URL ? input : new URL(String(input));
    calls.push({
      url: url.toString(),
      method: init?.method ?? 'GET',
      headers: { ...((init?.headers ?? {}) as Record<string, string>) },
    });
    const route = handler(url, calls.length);
    return new Response(JSON.stringify(route.body ?? {}), {
      status: route.status ?? 200,
      headers: { 'content-type': 'application/json', ...(route.headers ?? {}) },
    });
  }) as typeof fetch;
  return { impl, calls };
}

function adapterWith(handler: (url: URL, call: number) => MockRoute): {
  adapter: MoralisAdapter;
  calls: RecordedCall[];
} {
  const { impl, calls } = mockFetch(handler);
  return { adapter: new MoralisAdapter({ fetchImpl: impl }), calls };
}

describe('MoralisAdapter', () => {
  beforeEach(() => {
    process.env.MORALIS_API_KEY = TEST_KEY;
    resetEnvCacheForTests();
    resetBucketsForTests();
  });

  afterEach(() => {
    delete process.env.MORALIS_API_KEY;
    resetEnvCacheForTests();
  });

  /* ------------------------------ token price ----------------------------- */

  it('getTokenPrice (EVM) returns schema-valid output with correct URL, auth header, quality and freshness', async () => {
    const { adapter, calls } = adapterWith(() => ({ body: fixture('erc20-price.json') }));
    const result = await adapter.getTokenPrice({
      token: { chain: 'ethereum', address: WETH },
    });

    expect(() => TokenPriceSchema.parse(result)).not.toThrow();
    expect(calls).toHaveLength(1);
    const call = calls[0]!;
    expect(call.url).toBe(`https://deep-index.moralis.io/api/v2.2/erc20/${WETH}/price?chain=0x1`);
    expect(call.method).toBe('GET');
    expect(call.headers['X-API-Key']).toBe(TEST_KEY);

    expect(result.price).toBe(3521.42);
    expect(result.currency).toBe('USD');
    expect(result.token.chain).toBe('ethereum');
    expect(result.token.address).toBe(WETH);
    expect(result.token.symbol).toBe('WETH');
    expect(result.token.decimals).toBe(18); // coerced from "18"
    expect(result.token.providerIds.moralis).toBe(WETH); // raw identifier preserved
    expect(result.liquidityUsd).toBeCloseTo(145678901.23); // coerced from string
    expect(result.source.provider).toBe('moralis');
    expect(result.source.endpoint).toBe('/erc20/{address}/price');
    expect(result.source.freshness).toBe('realtime');
    expect(result.source.requestedAt).toBeTruthy();
    expect(result.source.receivedAt).toBeTruthy();
    expect(result.quality).toContain('realtime');
    expect(result.quality).not.toContain('unverified');
    expect(result.asOf).toBe(result.source.receivedAt);
    expect(result.lineage.length).toBeGreaterThan(0);
  });

  it('getTokenPrice (Solana) routes to solana-gateway and returns schema-valid output', async () => {
    const { adapter, calls } = adapterWith(() => ({ body: fixture('solana-token-price.json') }));
    const result = await adapter.getTokenPrice({
      token: { chain: 'solana', address: USDC_MINT },
    });

    expect(() => TokenPriceSchema.parse(result)).not.toThrow();
    expect(calls[0]!.url).toBe(`https://solana-gateway.moralis.io/token/mainnet/${USDC_MINT}/price`);
    expect(calls[0]!.headers['X-API-Key']).toBe(TEST_KEY);
    expect(result.token.chain).toBe('solana');
    expect(result.token.address).toBe(USDC_MINT);
    expect(result.token.providerIds.moralis).toBe(USDC_MINT);
    expect(result.price).toBe(0.9998);
    expect(result.source.freshness).toBe('realtime');
    expect(result.quality).toContain('realtime');
  });

  it('getTokenPrice rejects symbol-only queries without any network call', async () => {
    const { adapter, calls } = adapterWith(() => ({ body: {} }));
    await expect(
      adapter.getTokenPrice({ token: { chain: 'ethereum', symbol: 'WETH' } }),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(calls).toHaveLength(0);
  });

  /* ---------------------------- wallet balances --------------------------- */

  it('getWalletBalances (EVM) maps native + ERC20 balances, preserving raw amounts and identifiers', async () => {
    const { adapter, calls } = adapterWith(() => ({ body: fixture('wallet-tokens.json') }));
    const result = await adapter.getWalletBalances({ chain: 'ethereum', address: WALLET });

    expect(() => WalletBalancesSchema.parse(result)).not.toThrow();
    expect(calls).toHaveLength(1); // fixture cursor is null -> single page
    expect(calls[0]!.url).toBe(
      `https://deep-index.moralis.io/api/v2.2/wallets/${WALLET}/tokens?chain=0x1`,
    );
    expect(calls[0]!.headers['X-API-Key']).toBe(TEST_KEY);

    expect(result.chain).toBe('ethereum');
    expect(result.address).toBe(WALLET);
    expect(result.balances).toHaveLength(2);

    const native = result.balances[0]!;
    expect(native.token.address).toBeUndefined(); // native asset carries no address
    expect(native.token.providerIds.moralis).toBe('0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee');
    expect(native.rawAmount).toBe('1250000000000000000');
    expect(native.amount).toBe(1.25);
    expect(native.valueUsd).toBe(4401.78);

    const usdc = result.balances[1]!;
    expect(usdc.token.address).toBe('0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48');
    expect(usdc.token.decimals).toBe(6);
    expect(usdc.rawAmount).toBe('1250000000');

    expect(result.source.freshness).toBe('realtime');
    expect(result.quality).toContain('realtime');
    expect(result.quality).not.toContain('incomplete');
  });

  it('getWalletBalances (EVM) drains cursor pages and flags truncation as incomplete', async () => {
    const base = fixture('wallet-tokens.json');
    // Every page reports another cursor: the bounded drain must stop and
    // truthfully mark the payload incomplete.
    const { adapter, calls } = adapterWith(() => ({ body: { ...base, cursor: 'MORE' } }));
    const result = await adapter.getWalletBalances({ chain: 'ethereum', address: WALLET });

    expect(calls).toHaveLength(10); // MAX_BALANCE_PAGES
    expect(new URL(calls[1]!.url).searchParams.get('cursor')).toBe('MORE');
    expect(result.balances).toHaveLength(20);
    expect(result.quality).toContain('incomplete');
  });

  it('getWalletBalances (Solana) maps portfolio native + SPL balances', async () => {
    const { adapter, calls } = adapterWith(() => ({ body: fixture('solana-portfolio.json') }));
    const result = await adapter.getWalletBalances({ chain: 'solana', address: SOL_WALLET });

    expect(() => WalletBalancesSchema.parse(result)).not.toThrow();
    expect(calls[0]!.url).toBe(
      `https://solana-gateway.moralis.io/account/mainnet/${SOL_WALLET}/portfolio`,
    );
    expect(result.balances).toHaveLength(2);
    const sol = result.balances[0]!;
    expect(sol.token.symbol).toBe('SOL');
    expect(sol.token.address).toBeUndefined();
    expect(sol.rawAmount).toBe('1500000000');
    expect(sol.amount).toBe(1.5);
    const usdc = result.balances[1]!;
    expect(usdc.token.address).toBe(USDC_MINT);
    expect(usdc.token.providerIds.moralis).toBe(USDC_MINT);
    expect(usdc.token.decimals).toBe(6); // documented number type, accepted as-is
    expect(usdc.rawAmount).toBe('250750000');
  });

  it('getWalletBalances throws NotSupportedError for undocumented chains', async () => {
    const { adapter, calls } = adapterWith(() => ({ body: {} }));
    await expect(
      adapter.getWalletBalances({ chain: 'bitcoin', address: 'bc1qxyz' }),
    ).rejects.toBeInstanceOf(NotSupportedError);
    expect(calls).toHaveLength(0);
  });

  /* ------------------------------- transfers ------------------------------ */

  it('getTransfers flattens wallet history with cursor pagination, param pass-through and ISO timestamps', async () => {
    const { adapter, calls } = adapterWith(() => ({ body: fixture('wallet-history.json') }));
    const result = await adapter.getTransfers({
      chain: 'ethereum',
      address: WALLET,
      limit: 25,
      cursor: 'abc',
    });

    expect(() => TransferBatchSchema.parse(result)).not.toThrow();
    expect(calls).toHaveLength(1);
    const url = new URL(calls[0]!.url);
    expect(url.origin + url.pathname).toBe(
      `https://deep-index.moralis.io/api/v2.2/wallets/${WALLET}/history`,
    );
    expect(url.searchParams.get('chain')).toBe('0x1');
    expect(url.searchParams.get('limit')).toBe('25');
    expect(url.searchParams.get('cursor')).toBe('abc');
    expect(calls[0]!.headers['X-API-Key']).toBe(TEST_KEY);

    // tx1 -> 1 erc20 + 1 native transfer; tx2 (no sub-transfers) -> 1 fallback.
    expect(result.transfers).toHaveLength(3);
    const erc20 = result.transfers[0]!;
    expect(erc20.txHash).toBe(
      '0x1111111111111111111111111111111111111111111111111111111111111111',
    );
    expect(erc20.token?.address).toBe('0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48');
    expect(erc20.token?.providerIds['moralis']).toBe(
      '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
    );
    expect(erc20.rawAmount).toBe('1250000000'); // raw integer preserved
    expect(erc20.amount).toBe(1250);
    expect(erc20.timestamp).toBe('2026-07-16T09:30:00.000Z');
    expect(erc20.blockNumber).toBe(23456700);
    expect(erc20.category).toBe('token receive');

    const native = result.transfers[1]!;
    expect(native.token?.symbol).toBe('ETH');
    expect(native.token?.address).toBeUndefined();
    expect(native.rawAmount).toBe('50000000000000000');

    const fallback = result.transfers[2]!;
    expect(fallback.txHash).toBe(
      '0x4444444444444444444444444444444444444444444444444444444444444444',
    );
    expect(fallback.rawAmount).toBe('10000000000000000');
    expect(fallback.token).toBeUndefined();

    expect(result.nextCursor).toBe('eyJwYWdlIjoyfQ');
    expect(result.source.freshness).toBe('realtime');
    expect(result.quality).toContain('realtime');
    expect(result.lineage.some((s) => s.step === 'flatten_history')).toBe(true);
    expect(result.lineage.some((s) => s.step === 'timestamp_to_utc_iso')).toBe(true);
  });

  it('getTransfers throws NotSupportedError on solana (no documented endpoint)', async () => {
    const { adapter, calls } = adapterWith(() => ({ body: {} }));
    await expect(
      adapter.getTransfers({ chain: 'solana', address: SOL_WALLET }),
    ).rejects.toBeInstanceOf(NotSupportedError);
    expect(calls).toHaveLength(0);
  });

  /* ------------------------------- DEX pairs ------------------------------ */

  it('getDexPairs maps pairs with base/quote resolution and flags inactive pairs stale', async () => {
    const { adapter, calls } = adapterWith(() => ({ body: fixture('token-pairs.json') }));
    const result = await adapter.getDexPairs({
      chain: 'ethereum',
      tokenAddress: WETH,
      limit: 25,
    });

    expect(result).toHaveLength(2);
    for (const pair of result) expect(() => DexPairSchema.parse(pair)).not.toThrow();

    const url = new URL(calls[0]!.url);
    expect(url.origin + url.pathname).toBe(
      `https://deep-index.moralis.io/api/v2.2/erc20/${WETH}/pairs`,
    );
    expect(url.searchParams.get('chain')).toBe('0x1');
    expect(url.searchParams.get('limit')).toBe('25');
    expect(calls[0]!.headers['X-API-Key']).toBe(TEST_KEY);

    const active = result[0]!;
    expect(active.pairAddress).toBe('0x88e6a0c2ddd26feeb64f039a2c41296fcb3f5640');
    expect(active.dex).toBe('Uniswap v3');
    expect(active.baseToken.address).toBe(WETH);
    expect(active.baseToken.symbol).toBe('WETH');
    expect(active.baseToken.decimals).toBe(18);
    expect(active.baseToken.providerIds.moralis).toBe(WETH);
    expect(active.quoteToken?.symbol).toBe('USDC');
    expect(active.priceUsd).toBe(3521.42);
    expect(active.liquidityUsd).toBeCloseTo(145678901.23);
    expect(active.volume24hUsd).toBeCloseTo(43467890.12);
    expect(active.source.freshness).toBe('realtime');
    expect(active.quality).toContain('realtime');
    expect(active.quality).not.toContain('stale');

    const inactive = result[1]!;
    expect(inactive.quality).toContain('stale'); // inactive_pair: no 24h volume
  });

  it('getDexPairs throws NotSupportedError on solana (no documented endpoint)', async () => {
    const { adapter, calls } = adapterWith(() => ({ body: {} }));
    await expect(
      adapter.getDexPairs({ chain: 'solana', tokenAddress: USDC_MINT }),
    ).rejects.toBeInstanceOf(NotSupportedError);
    expect(calls).toHaveLength(0);
  });

  /* ------------------------------ error mapping --------------------------- */

  it('maps HTTP 429 to RateLimitError', async () => {
    const { adapter } = adapterWith(() => ({
      status: 429,
      body: { message: 'Too many requests' },
      // Documented behavior: 429 Too Many Requests. retry-after 0 keeps the
      // client's bounded retries fast in tests.
      headers: { 'retry-after': '0' },
    }));
    await expect(
      adapter.getTokenPrice({ token: { chain: 'ethereum', address: WETH } }),
    ).rejects.toBeInstanceOf(RateLimitError);
  });

  it('maps HTTP 401 (missing/invalid API key) to EntitlementError', async () => {
    const { adapter, calls } = adapterWith(() => ({
      status: 401,
      body: { message: 'Invalid API key' },
    }));
    await expect(
      adapter.getWalletBalances({ chain: 'ethereum', address: WALLET }),
    ).rejects.toBeInstanceOf(EntitlementError);
    expect(calls).toHaveLength(1); // not retryable
  });

  /* ---------------------------- health / config --------------------------- */

  it('healthCheck({live:true}) performs exactly one minimal-quota documented request', async () => {
    // Probe = documented GET /erc20/{address}/price (WETH on eth); the
    // formerly used /web3-api-version is absent from the research record
    // and 400s live (observed 2026-07-17).
    const { adapter, calls } = adapterWith(() => ({ body: fixture('erc20-price.json') }));
    const result = await adapter.healthCheck({ live: true });

    expect(result.configured).toBe(true);
    expect(result.live).toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe(
      'https://deep-index.moralis.io/api/v2.2/erc20/0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2/price?chain=eth',
    );
    expect(calls[0]!.headers['X-API-Key']).toBe(TEST_KEY);
  });

  it('unconfigured: isConfigured() is false and healthCheck() reports it without throwing', async () => {
    delete process.env.MORALIS_API_KEY;
    resetEnvCacheForTests();

    const { adapter, calls } = adapterWith(() => ({ body: {} }));
    expect(adapter.isConfigured()).toBe(false);

    const result = await adapter.healthCheck();
    expect(result.configured).toBe(false);
    expect(result.live).toBeNull();
    expect(result.message).toContain('MORALIS_API_KEY');
    expect(calls).toHaveLength(0);
  });
});
