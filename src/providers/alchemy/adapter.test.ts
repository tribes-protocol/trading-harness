import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetEnvCacheForTests } from '../../core/config.js';
import {
  ConfigError,
  EntitlementError,
  NotSupportedError,
  ProviderError,
  RateLimitError,
  ValidationError,
} from '../../core/errors.js';
import { resetBucketsForTests } from '../../core/ratelimit.js';
import {
  TokenPriceSchema,
  TransferBatchSchema,
  WalletBalancesSchema,
} from '../../schemas/onchain.js';
import { AlchemyAdapter } from './adapter.js';

const TEST_KEY = 'test-key-alchemy-0123456789';
const WALLET = '0x1e6e8695fab3eb382534915ea8d7cc1d1994b152';
const USDC = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48';

function fixture(name: string): unknown {
  return JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8'));
}

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
    ...init,
  });
}

type FetchMock = ReturnType<typeof vi.fn>;

function adapterWith(fetchImpl: FetchMock): AlchemyAdapter {
  return new AlchemyAdapter({ fetchImpl: fetchImpl as unknown as typeof fetch });
}

function calledUrl(fetchImpl: FetchMock, call = 0): string {
  const args = fetchImpl.mock.calls[call] as unknown[];
  return String(args[0]);
}

function calledInit(fetchImpl: FetchMock, call = 0): RequestInit {
  const args = fetchImpl.mock.calls[call] as unknown[];
  return args[1] as RequestInit;
}

function calledBody(fetchImpl: FetchMock, call = 0): Record<string, unknown> {
  return JSON.parse(String(calledInit(fetchImpl, call).body)) as Record<string, unknown>;
}

beforeEach(() => {
  process.env.ALCHEMY_API_KEY = TEST_KEY;
  resetEnvCacheForTests();
  resetBucketsForTests();
});

afterEach(() => {
  delete process.env.ALCHEMY_API_KEY;
  resetEnvCacheForTests();
});

describe('AlchemyAdapter.getTransfers', () => {
  it('returns schema-valid transfers and builds the JSON-RPC request correctly', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(fixture('asset-transfers.json')));
    const adapter = adapterWith(fetchImpl);
    const batch = await adapter.getTransfers({ chain: 'ethereum', address: WALLET, limit: 100 });

    // (a) schema-valid output
    expect(() => TransferBatchSchema.parse(batch)).not.toThrow();

    // (b) URL/path/params/auth construction (key in path — fake key only)
    expect(calledUrl(fetchImpl)).toBe(`https://eth-mainnet.g.alchemy.com/v2/${TEST_KEY}`);
    expect(calledInit(fetchImpl).method).toBe('POST');
    const body = calledBody(fetchImpl);
    expect(body.jsonrpc).toBe('2.0');
    expect(body.method).toBe('alchemy_getAssetTransfers');
    const rpcParams = (body.params as Record<string, unknown>[])[0]!;
    expect(rpcParams).toMatchObject({
      fromAddress: WALLET,
      maxCount: '0x64',
      withMetadata: true,
      order: 'asc',
      category: ['external', 'erc20'],
    });
    expect(rpcParams.toAddress).toBeUndefined();
    expect(rpcParams.pageKey).toBeUndefined();

    // field normalization: hex conversions, timestamps, token mapping
    expect(batch.chain).toBe('ethereum');
    expect(batch.transfers).toHaveLength(2);
    const native = batch.transfers[0]!;
    expect(native.blockNumber).toBe(0x12f5a1c);
    expect(native.rawAmount).toBe('1500000000000000000');
    expect(native.amount).toBe(1.5);
    expect(native.timestamp).toBe('2026-07-10T08:15:30.000Z');
    expect(native.token?.symbol).toBe('ETH');
    expect(native.token?.address).toBeUndefined();
    expect(native.token?.providerIds).toMatchObject({ alchemy: 'eth-mainnet:native' });
    const erc20 = batch.transfers[1]!;
    expect(erc20.rawAmount).toBe('2500750000');
    expect(erc20.token?.address).toBe(USDC);
    expect(erc20.token?.decimals).toBe(6);
    expect(erc20.category).toBe('erc20');

    // (c) freshness and quality per registry (indexed pipeline => delayed)
    expect(batch.source.freshness).toBe('delayed');
    expect(batch.quality).toContain('delayed');
    expect(batch.source.provider).toBe('alchemy');
    expect(batch.source.endpoint).toBe('alchemy_getAssetTransfers');
    expect(batch.lineage.length).toBeGreaterThan(0);

    // pageKey present => cursor continues the same leg
    expect(batch.nextCursor).toBeDefined();

    // key never appears in returned payloads
    expect(JSON.stringify(batch)).not.toContain(TEST_KEY);
  });

  it('sequences the fromAddress leg then the toAddress leg via the compound cursor', async () => {
    const noPage = structuredClone(fixture('asset-transfers.json')) as {
      result: { pageKey?: string };
    };
    delete noPage.result.pageKey;
    const fetchImpl = vi.fn(async () => jsonResponse(noPage));
    const adapter = adapterWith(fetchImpl);

    const first = await adapter.getTransfers({ chain: 'ethereum', address: WALLET });
    expect((calledBody(fetchImpl, 0).params as Record<string, unknown>[])[0]!.fromAddress).toBe(
      WALLET,
    );
    // from-leg exhausted -> cursor flips to the to-leg
    expect(first.nextCursor).toBeDefined();

    const second = await adapter.getTransfers({
      chain: 'ethereum',
      address: WALLET,
      cursor: first.nextCursor!,
    });
    const secondParams = (calledBody(fetchImpl, 1).params as Record<string, unknown>[])[0]!;
    expect(secondParams.toAddress).toBe(WALLET);
    expect(secondParams.fromAddress).toBeUndefined();
    // to-leg exhausted -> pagination complete
    expect(second.nextCursor).toBeUndefined();
  });

  it('rejects malformed cursors instead of guessing', async () => {
    const fetchImpl = vi.fn();
    const adapter = adapterWith(fetchImpl);
    await expect(
      adapter.getTransfers({ chain: 'ethereum', address: WALLET, cursor: '!!not-a-cursor!!' }),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('throws ProviderError when HTTP 200 carries a JSON-RPC error envelope', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ jsonrpc: '2.0', id: 1, error: { code: -32602, message: 'invalid params' } }),
    );
    const adapter = adapterWith(fetchImpl);
    const err = await adapter
      .getTransfers({ chain: 'ethereum', address: WALLET })
      .then(() => undefined)
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ProviderError);
    expect((err as ProviderError).message).toContain('-32602');
    expect((err as ProviderError).message).not.toContain(TEST_KEY);
  });

  it('throws NotSupportedError for chains without a documented network', async () => {
    const fetchImpl = vi.fn();
    const adapter = adapterWith(fetchImpl);
    await expect(
      adapter.getTransfers({ chain: 'bitcoin', address: WALLET }),
    ).rejects.toBeInstanceOf(NotSupportedError);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('clamps maxCount to the documented 1000 maximum (hex-encoded)', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(fixture('asset-transfers.json')));
    const adapter = adapterWith(fetchImpl);
    await adapter.getTransfers({ chain: 'ethereum', address: WALLET, limit: 5000 });
    const rpcParams = (calledBody(fetchImpl).params as Record<string, unknown>[])[0]!;
    expect(rpcParams.maxCount).toBe('0x3e8'); // 1000, the documented default/max
  });
});

describe('AlchemyAdapter.getWalletBalances', () => {
  it('returns schema-valid balances with raw amounts, decimals adjustment, and USD values', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(fixture('tokens-by-address.json')));
    const adapter = adapterWith(fetchImpl);
    const balances = await adapter.getWalletBalances({ chain: 'ethereum', address: WALLET });

    // (a) schema-valid output
    expect(() => WalletBalancesSchema.parse(balances)).not.toThrow();

    // (b) URL/body construction (key in path — fake key only)
    expect(calledUrl(fetchImpl)).toBe(
      `https://api.g.alchemy.com/data/v1/${TEST_KEY}/assets/tokens/by-address`,
    );
    expect(calledInit(fetchImpl).method).toBe('POST');
    expect(calledBody(fetchImpl)).toEqual({
      addresses: [{ address: WALLET, networks: ['eth-mainnet'] }],
      withMetadata: true,
      withPrices: true,
    });

    expect(balances.balances).toHaveLength(2);
    const eth = balances.balances[0]!;
    expect(eth.rawAmount).toBe('1500000000000000000');
    expect(eth.amount).toBeCloseTo(1.5, 10);
    expect(eth.valueUsd).toBeCloseTo(1.5 * 4608.2208671202, 6);
    expect(eth.token.address).toBeUndefined();
    expect(eth.token.providerIds).toMatchObject({ alchemy: 'eth-mainnet:native' });
    const usdc = balances.balances[1]!;
    expect(usdc.rawAmount).toBe('2500750000');
    expect(usdc.amount).toBeCloseTo(2500.75, 6);
    expect(usdc.token.address).toBe(USDC);
    expect(usdc.token.decimals).toBe(6);
    expect(usdc.token.providerIds).toMatchObject({ alchemy: `eth-mainnet:${USDC}` });

    // (c) freshness per registry; embedded USD prices flagged estimated
    expect(balances.source.freshness).toBe('realtime');
    expect(balances.quality).toContain('estimated');
    expect(balances.asOf).toBe(balances.source.receivedAt);
    expect(balances.lineage.length).toBeGreaterThan(0);

    expect(JSON.stringify(balances)).not.toContain(TEST_KEY);
  });

  it('maps polygon to the matic-mainnet Data API network identifier', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(fixture('tokens-by-address.json')));
    const adapter = adapterWith(fetchImpl);
    await adapter.getWalletBalances({ chain: 'polygon', address: WALLET });
    const body = calledBody(fetchImpl) as { addresses: { networks: string[] }[] };
    expect(body.addresses[0]!.networks).toEqual(['matic-mainnet']);
  });

  it('throws NotSupportedError for chains without a documented Data API network', async () => {
    const fetchImpl = vi.fn();
    const adapter = adapterWith(fetchImpl);
    await expect(
      adapter.getWalletBalances({ chain: 'bitcoin', address: WALLET }),
    ).rejects.toBeInstanceOf(NotSupportedError);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('tolerates hex balances, skips errored tokens, and flags truncation as incomplete', async () => {
    const body = structuredClone(fixture('tokens-by-address.json')) as {
      data: { tokens: Record<string, unknown>[]; pageKey?: string };
    };
    // docs show decimal strings; hex is tolerated defensively with a lineage step
    body.data.tokens[1]!.tokenBalance = '0x950e6ab0'; // 2500750000
    body.data.tokens.push({
      address: WALLET,
      network: 'eth-mainnet',
      tokenAddress: '0xdeaddeaddeaddeaddeaddeaddeaddeaddeaddead',
      tokenBalance: '0',
      tokenMetadata: null,
      tokenPrices: null,
      error: 'token metadata lookup failed',
    });
    body.data.pageKey = 'next-page-cursor';
    const fetchImpl = vi.fn(async () => jsonResponse(body));
    const adapter = adapterWith(fetchImpl);
    const balances = await adapter.getWalletBalances({ chain: 'ethereum', address: WALLET });

    // errored token dropped; hex balance converted to exact decimal string
    expect(balances.balances).toHaveLength(2);
    expect(balances.balances[1]!.rawAmount).toBe('2500750000');
    expect(balances.quality).toContain('incomplete');
    const steps = balances.lineage.map((l) => l.step);
    expect(steps).toContain('convert-hex-balance');
    expect(steps).toContain('drop-errored-tokens');
    expect(steps).toContain('pagination-truncated');
  });
});

describe('AlchemyAdapter.getTokenPrice', () => {
  it('looks up by network+address with Bearer auth and propagates lastUpdatedAt to asOf', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(fixture('prices-by-address.json')));
    const adapter = adapterWith(fetchImpl);
    const price = await adapter.getTokenPrice({
      token: { chain: 'ethereum', address: USDC },
    });

    // (a) schema-valid output
    expect(() => TokenPriceSchema.parse(price)).not.toThrow();

    // (b) URL/body/auth-header construction
    expect(calledUrl(fetchImpl)).toBe('https://api.g.alchemy.com/prices/v1/tokens/by-address');
    const init = calledInit(fetchImpl);
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>).authorization).toBe(`Bearer ${TEST_KEY}`);
    expect(calledBody(fetchImpl)).toEqual({
      addresses: [{ network: 'eth-mainnet', address: USDC }],
    });

    expect(price.price).toBe(1.0001);
    expect(price.currency).toBe('USD');
    // lastUpdatedAt -> asOf
    expect(price.asOf).toBe('2026-07-17T08:20:00.000Z');
    expect(price.token.address).toBe(USDC);
    // by-address responses carry network+address, never symbol — absence is preserved
    expect(price.token.symbol).toBeUndefined();
    expect(price.token.providerIds).toMatchObject({ alchemy: `eth-mainnet:${USDC}` });

    // (c) mandated flags: refresh cadence undocumented
    expect(price.source.freshness).toBe('unknown');
    expect(price.quality).toEqual(['unverified']);

    expect(JSON.stringify(price)).not.toContain(TEST_KEY);
  });

  it('falls back to by-symbol lookup with Bearer auth', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(fixture('prices-by-symbol.json')));
    const adapter = adapterWith(fetchImpl);
    const price = await adapter.getTokenPrice({ token: { symbol: 'ETH' } });

    expect(() => TokenPriceSchema.parse(price)).not.toThrow();
    expect(calledUrl(fetchImpl)).toBe(
      'https://api.g.alchemy.com/prices/v1/tokens/by-symbol?symbols=ETH',
    );
    const init = calledInit(fetchImpl);
    expect(init.method).toBe('GET');
    expect((init.headers as Record<string, string>).authorization).toBe(`Bearer ${TEST_KEY}`);

    expect(price.price).toBeCloseTo(4608.2208671202, 8);
    expect(price.asOf).toBe('2026-07-17T08:20:27.000Z');
    expect(price.token.symbol).toBe('ETH');
    expect(price.token.providerIds).toMatchObject({ alchemy: 'symbol:ETH' });
    expect(price.source.freshness).toBe('unknown');
    expect(price.quality).toEqual(['unverified']);
  });

  it('throws ProviderError when the Prices API reports a per-token error', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ data: [{ symbol: 'XYZ', prices: [], error: 'Token not found' }] }),
    );
    const adapter = adapterWith(fetchImpl);
    await expect(adapter.getTokenPrice({ token: { symbol: 'XYZ' } })).rejects.toBeInstanceOf(
      ProviderError,
    );
  });

  it('requires chain+address or symbol', async () => {
    const fetchImpl = vi.fn();
    const adapter = adapterWith(fetchImpl);
    await expect(adapter.getTokenPrice({ token: {} })).rejects.toBeInstanceOf(ValidationError);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe('AlchemyAdapter error mapping', () => {
  it('maps HTTP 429 to RateLimitError', async () => {
    const fetchImpl = vi.fn(async () =>
      new Response('rate limited', { status: 429, headers: { 'retry-after': '0' } }),
    );
    const adapter = adapterWith(fetchImpl);
    const err = await adapter
      .getTransfers({ chain: 'ethereum', address: WALLET })
      .then(() => undefined)
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(RateLimitError);
    expect((err as RateLimitError).message).not.toContain(TEST_KEY);
  });

  it('maps HTTP 401 to EntitlementError', async () => {
    const fetchImpl = vi.fn(async () => new Response('unauthorized', { status: 401 }));
    const adapter = adapterWith(fetchImpl);
    const err = await adapter
      .getTokenPrice({ token: { symbol: 'ETH' } })
      .then(() => undefined)
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(EntitlementError);
    expect((err as EntitlementError).message).not.toContain(TEST_KEY);
  });

  it('never leaks the path-embedded API key in error messages, endpoints, or serialized errors', async () => {
    const fetchImpl = vi.fn(async () => new Response('{"message":"bad request"}', { status: 400 }));
    const adapter = adapterWith(fetchImpl);
    try {
      await adapter.getWalletBalances({ chain: 'ethereum', address: WALLET });
      expect.unreachable('should have thrown');
    } catch (error) {
      const err = error as ProviderError;
      expect(err.message).not.toContain(TEST_KEY);
      expect(err.endpoint ?? '').not.toContain(TEST_KEY);
      expect(JSON.stringify(err.toJSON())).not.toContain(TEST_KEY);
    }
  });
});

describe('AlchemyAdapter health and configuration', () => {
  it('is unconfigured without the env var and healthCheck reports it without throwing', async () => {
    delete process.env.ALCHEMY_API_KEY;
    resetEnvCacheForTests();
    const fetchImpl = vi.fn();
    const adapter = adapterWith(fetchImpl);

    expect(adapter.isConfigured()).toBe(false);
    const health = await adapter.healthCheck();
    expect(health.configured).toBe(false);
    expect(health.live).toBeNull();
    expect(health.message).toContain('ALCHEMY_API_KEY');

    await expect(
      adapter.getTransfers({ chain: 'ethereum', address: WALLET }),
    ).rejects.toBeInstanceOf(ConfigError);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('liveProbe makes exactly one minimal JSON-RPC request (eth_blockNumber)', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(fixture('block-number.json')));
    const adapter = adapterWith(fetchImpl);
    const health = await adapter.healthCheck({ live: true });

    expect(health.configured).toBe(true);
    expect(health.live).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(calledUrl(fetchImpl)).toBe(`https://eth-mainnet.g.alchemy.com/v2/${TEST_KEY}`);
    expect(calledBody(fetchImpl)).toMatchObject({ method: 'eth_blockNumber', params: [] });
  });

  it('folds live-probe failures into the health result without leaking the key', async () => {
    const fetchImpl = vi.fn(async () => new Response('unauthorized', { status: 401 }));
    const adapter = adapterWith(fetchImpl);
    const health = await adapter.healthCheck({ live: true });
    expect(health.live).toBe(false);
    expect(health.message).not.toContain(TEST_KEY);
  });
});
