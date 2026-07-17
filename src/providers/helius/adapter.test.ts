import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetEnvCacheForTests } from '../../core/config.js';
import {
  EntitlementError,
  NotSupportedError,
  ProviderError,
  RateLimitError,
} from '../../core/errors.js';
import { resetBucketsForTests } from '../../core/ratelimit.js';
import { TransferBatchSchema, WalletBalancesSchema } from '../../schemas/onchain.js';
import { HeliusAdapter } from './adapter.js';

const TEST_KEY = 'test-key-helius-0123456789';
const OWNER = '86xCnPeV69n6t3DnyGvkKobf9FdN2H9oiVDdaMpo2MMY';
const JITOSOL_MINT = 'J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn';
const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const NATIVE_SOL_MINT = 'So11111111111111111111111111111111111111111';

function fixture(name: string): unknown {
  return JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf-8'));
}

const balancesFixture = fixture('getAssetsByOwner.json');
const transfersFixture = fixture('getTransfersByAddress.json');
const healthFixture = fixture('getHealth.json');

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
    ...init,
  });
}

type FetchMock = ReturnType<typeof vi.fn>;

function fetchReturning(body: unknown): FetchMock {
  return vi.fn(async () => jsonResponse(body));
}

function adapterWith(fetchImpl: FetchMock): HeliusAdapter {
  return new HeliusAdapter({ fetchImpl: fetchImpl as unknown as typeof fetch });
}

/** Decode the URL + parsed JSON body of the nth request the mock received. */
function requestOf(fetchImpl: FetchMock, index = 0): { url: string; body: Record<string, unknown> } {
  const call = fetchImpl.mock.calls[index] as unknown[];
  const url = String(call[0]);
  const init = call[1] as { body?: string };
  return { url, body: JSON.parse(init.body ?? '{}') as Record<string, unknown> };
}

beforeEach(() => {
  process.env.HELIUS_API_KEY = TEST_KEY;
  resetEnvCacheForTests();
  resetBucketsForTests();
});

afterEach(() => {
  delete process.env.HELIUS_API_KEY;
  resetEnvCacheForTests();
});

describe('HeliusAdapter.getWalletBalances', () => {
  it('returns schema-valid balances with raw identifiers and decimal-adjusted amounts', async () => {
    const fetchImpl = fetchReturning(balancesFixture);
    const result = await adapterWith(fetchImpl).getWalletBalances({
      chain: 'solana',
      address: OWNER,
    });

    expect(() => WalletBalancesSchema.parse(result)).not.toThrow();
    expect(result.chain).toBe('solana');
    expect(result.address).toBe(OWNER);
    // Native SOL + one fungible token; the NFT (no token_info.balance) is excluded.
    expect(result.balances).toHaveLength(2);

    const sol = result.balances[0]!;
    expect(sol.token.symbol).toBe('SOL');
    expect(sol.token.decimals).toBe(9);
    expect(sol.rawAmount).toBe('5000000000');
    expect(sol.amount).toBe(5);
    expect(sol.valueUsd).toBe(751.25);

    const jito = result.balances[1]!;
    expect(jito.token.address).toBe(JITOSOL_MINT);
    expect(jito.token.providerIds['helius']).toBe(JITOSOL_MINT);
    expect(jito.token.symbol).toBe('JitoSOL');
    expect(jito.token.decimals).toBe(9);
    expect(jito.rawAmount).toBe('35688813508');
    expect(jito.amount).toBeCloseTo(35.688813508, 9);
    expect(jito.valueUsd).toBeCloseTo(2015.6838854339217, 6);
  });

  it('builds the documented JSON-RPC request with api-key query auth', async () => {
    const fetchImpl = fetchReturning(balancesFixture);
    await adapterWith(fetchImpl).getWalletBalances({ chain: 'solana', address: OWNER });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const { url, body } = requestOf(fetchImpl);
    expect(url).toBe(`https://mainnet.helius-rpc.com/?api-key=${TEST_KEY}`);
    expect(body['jsonrpc']).toBe('2.0');
    expect(body['method']).toBe('getAssetsByOwner');
    expect(body['params']).toMatchObject({
      ownerAddress: OWNER,
      page: 1,
      limit: 1000,
      options: { showFungible: true, showNativeBalance: true, showZeroBalance: false },
    });
  });

  it('stamps source, freshness, and estimated-quality flags truthfully', async () => {
    const fetchImpl = fetchReturning(balancesFixture);
    const result = await adapterWith(fetchImpl).getWalletBalances({
      chain: 'solana',
      address: OWNER,
    });

    expect(result.source.provider).toBe('helius');
    expect(result.source.endpoint).toBe('getAssetsByOwner');
    expect(result.source.freshness).toBe('realtime');
    expect(Date.parse(result.source.requestedAt)).toBeLessThanOrEqual(
      Date.parse(result.source.receivedAt),
    );
    // Embedded USD prices are hourly top-10k estimates -> batch flagged.
    expect(result.quality).toContain('estimated');
    expect(result.quality).not.toContain('incomplete');
    const steps = result.lineage.map((l) => l.step);
    expect(steps).toContain('decimal_adjustment');
    expect(steps).toContain('usd_valuation_flagging');
  });

  it('throws NotSupportedError for non-Solana chains without any network call', async () => {
    const fetchImpl = fetchReturning(balancesFixture);
    const adapter = adapterWith(fetchImpl);
    await expect(
      adapter.getWalletBalances({ chain: 'ethereum', address: '0xabc' }),
    ).rejects.toBeInstanceOf(NotSupportedError);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('follows page-based DAS pagination until a short page and merges items', async () => {
    const fullPageItems = Array.from({ length: 1000 }, (_, i) => ({
      interface: 'FungibleToken',
      id: `Mint${String(i).padStart(40, '1')}`,
      token_info: { symbol: `TK${i}`, balance: 1_000_000, decimals: 6 },
    }));
    const page1 = {
      jsonrpc: '2.0',
      id: 'pi-getAssetsByOwner',
      result: {
        total: 1001,
        limit: 1000,
        page: 1,
        items: fullPageItems,
        nativeBalance: { lamports: 1_000_000_000, price_per_sol: 150, total_price: 150 },
      },
    };
    const page2 = {
      jsonrpc: '2.0',
      id: 'pi-getAssetsByOwner',
      result: {
        total: 1001,
        limit: 1000,
        page: 2,
        items: [
          {
            interface: 'FungibleToken',
            id: JITOSOL_MINT,
            token_info: { symbol: 'JitoSOL', balance: 42, decimals: 9 },
          },
        ],
      },
    };
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(jsonResponse(page1))
      .mockResolvedValueOnce(jsonResponse(page2));

    const result = await adapterWith(fetchImpl).getWalletBalances({
      chain: 'solana',
      address: OWNER,
    });

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect((requestOf(fetchImpl, 0).body['params'] as { page: number }).page).toBe(1);
    expect((requestOf(fetchImpl, 1).body['params'] as { page: number }).page).toBe(2);
    // native SOL (page 1 only) + 1000 + 1 fungibles, nothing double-counted.
    expect(result.balances).toHaveLength(1002);
    expect(result.balances[0]!.token.symbol).toBe('SOL');
    expect(result.balances.at(-1)!.token.address).toBe(JITOSOL_MINT);
    expect(result.balances.at(-1)!.rawAmount).toBe('42');
    // Short page 2 ends the crawl before the safety cap: not truncated.
    expect(result.quality).not.toContain('incomplete');
  });

  it('maps a malformed result (items not an array) to ProviderError, not a TypeError', async () => {
    const fetchImpl = fetchReturning({
      jsonrpc: '2.0',
      id: 'pi-getAssetsByOwner',
      result: { total: 0 },
    });
    await expect(
      adapterWith(fetchImpl).getWalletBalances({ chain: 'solana', address: OWNER }),
    ).rejects.toMatchObject({ code: 'PROVIDER' });
  });
});

describe('HeliusAdapter.getTransfers', () => {
  it('returns schema-valid transfers preserving raw amounts and identifiers', async () => {
    const fetchImpl = fetchReturning(transfersFixture);
    const result = await adapterWith(fetchImpl).getTransfers({
      chain: 'solana',
      address: OWNER,
    });

    expect(() => TransferBatchSchema.parse(result)).not.toThrow();
    expect(result.chain).toBe('solana');
    expect(result.address).toBe(OWNER);
    expect(result.transfers).toHaveLength(2);
    expect(result.nextCursor).toBe('312345100:4');

    const usdc = result.transfers[0]!;
    expect(usdc.txHash).toBe(
      '5h6xBEauJ3PK6SWCZ1PGjBvj8vDdWG3KpwATGy1ARAXFSDwt8GFXM7W5Ncn16wmqRYdtRAyeSNMifPEToRuw2kNa',
    );
    expect(usdc.blockNumber).toBe(312345600);
    expect(usdc.timestamp).toBe(new Date(1752700000 * 1000).toISOString());
    expect(usdc.from).toBe(OWNER);
    expect(usdc.to).toBe('GLtAGLxi9RdBQZUCGF7VnbdvPXwSFsCUCG4RRRWhkPPn');
    expect(usdc.token?.address).toBe(USDC_MINT);
    expect(usdc.token?.providerIds['helius']).toBe(USDC_MINT);
    expect(usdc.token?.decimals).toBe(6);
    expect(usdc.rawAmount).toBe('2500000'); // provider raw base-unit string, verbatim
    expect(usdc.amount).toBe(2.5); // provider uiAmount (decimals-adjusted)
    expect(usdc.category).toBe('transfer');

    const sol = result.transfers[1]!;
    expect(sol.token?.address).toBe(NATIVE_SOL_MINT);
    expect(sol.token?.symbol).toBe('SOL');
    expect(sol.token?.decimals).toBe(9);
    expect(sol.rawAmount).toBe('1000000000');
    expect(sol.amount).toBe(1);

    expect(result.source.endpoint).toBe('getTransfersByAddress');
    expect(result.source.freshness).toBe('realtime');
    expect(result.quality).toEqual([]);
    expect(result.lineage.map((l) => l.step)).toContain('timestamp_conversion');
  });

  it('sends the documented positional [address, config] params with cursor and clamped limit', async () => {
    const fetchImpl = fetchReturning(transfersFixture);
    await adapterWith(fetchImpl).getTransfers({
      chain: 'solana',
      address: OWNER,
      limit: 25,
      cursor: 'cursor-abc',
    });

    const { url, body } = requestOf(fetchImpl);
    expect(url).toBe(`https://mainnet.helius-rpc.com/?api-key=${TEST_KEY}`);
    expect(body['method']).toBe('getTransfersByAddress');
    const params = body['params'] as unknown[];
    expect(Array.isArray(params)).toBe(true);
    expect(params[0]).toBe(OWNER);
    expect(params[1]).toMatchObject({
      limit: 25,
      paginationToken: 'cursor-abc',
      commitment: 'finalized',
      sortOrder: 'desc',
      solMode: 'merged',
    });
  });

  it('clamps limit to the documented 1-100 range', async () => {
    const fetchImpl = fetchReturning(transfersFixture);
    await adapterWith(fetchImpl).getTransfers({ chain: 'solana', address: OWNER, limit: 5000 });
    const params = requestOf(fetchImpl).body['params'] as unknown[];
    expect((params[1] as Record<string, unknown>)['limit']).toBe(100);
  });

  it('throws NotSupportedError for non-Solana chains', async () => {
    const fetchImpl = fetchReturning(transfersFixture);
    await expect(
      adapterWith(fetchImpl).getTransfers({ chain: 'bitcoin', address: 'bc1q...' }),
    ).rejects.toBeInstanceOf(NotSupportedError);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe('HeliusAdapter error mapping', () => {
  it('maps HTTP 429 to RateLimitError', async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response('max usage reached', { status: 429, headers: { 'retry-after': '0' } }),
    );
    await expect(
      adapterWith(fetchImpl).getWalletBalances({ chain: 'solana', address: OWNER }),
    ).rejects.toBeInstanceOf(RateLimitError);
  });

  it('maps HTTP 401 to EntitlementError without retrying', async () => {
    const fetchImpl = vi.fn(async () => new Response('unauthorized', { status: 401 }));
    await expect(
      adapterWith(fetchImpl).getTransfers({ chain: 'solana', address: OWNER }),
    ).rejects.toBeInstanceOf(EntitlementError);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('maps a JSON-RPC error envelope to ProviderError', async () => {
    const fetchImpl = fetchReturning({
      jsonrpc: '2.0',
      id: 'pi-getAssetsByOwner',
      error: { code: -32602, message: 'Invalid params' },
    });
    const promise = adapterWith(fetchImpl).getWalletBalances({ chain: 'solana', address: OWNER });
    await expect(promise).rejects.toBeInstanceOf(ProviderError);
    await expect(promise).rejects.toMatchObject({ code: 'PROVIDER' });
  });

  it('maps a missing JSON-RPC result to ProviderError', async () => {
    const fetchImpl = fetchReturning({ jsonrpc: '2.0', id: 'x' });
    await expect(
      adapterWith(fetchImpl).getTransfers({ chain: 'solana', address: OWNER }),
    ).rejects.toBeInstanceOf(ProviderError);
  });

  it('maps a malformed transfers result (data not an array) to ProviderError', async () => {
    const fetchImpl = fetchReturning({ jsonrpc: '2.0', id: 'x', result: { paginationToken: null } });
    await expect(
      adapterWith(fetchImpl).getTransfers({ chain: 'solana', address: OWNER }),
    ).rejects.toMatchObject({ code: 'PROVIDER' });
  });

  it('never leaks the API key through error messages or details', async () => {
    // Simulate a provider error body that echoes the full request URL + key.
    const fetchImpl = vi.fn(
      async () =>
        new Response(
          `unauthorized: https://mainnet.helius-rpc.com/?api-key=${TEST_KEY} rejected`,
          { status: 401 },
        ),
    );
    const err = await adapterWith(fetchImpl)
      .getTransfers({ chain: 'solana', address: OWNER })
      .then(
        () => {
          throw new Error('expected rejection');
        },
        (e: unknown) => e as EntitlementError,
      );
    expect(err).toBeInstanceOf(EntitlementError);
    expect(err.message).not.toContain(TEST_KEY);
    expect(JSON.stringify(err.toJSON())).not.toContain(TEST_KEY);
  });
});

describe('HeliusAdapter configuration and health', () => {
  it('constructs without credentials and only fails on first use', async () => {
    delete process.env.HELIUS_API_KEY;
    resetEnvCacheForTests();
    const adapter = new HeliusAdapter(); // must not throw
    await expect(
      adapter.getWalletBalances({ chain: 'solana', address: OWNER }),
    ).rejects.toMatchObject({ code: 'CONFIG' });
  });

  it('reports unconfigured state via isConfigured and healthCheck without throwing', async () => {
    delete process.env.HELIUS_API_KEY;
    resetEnvCacheForTests();
    const adapter = new HeliusAdapter();
    expect(adapter.isConfigured()).toBe(false);
    const health = await adapter.healthCheck();
    expect(health.provider).toBe('helius');
    expect(health.configured).toBe(false);
    expect(health.live).toBeNull();
    expect(health.message).toContain('HELIUS_API_KEY');
  });

  it('live healthCheck issues exactly one minimal-quota getHealth probe', async () => {
    const fetchImpl = fetchReturning(healthFixture);
    const adapter = adapterWith(fetchImpl);
    expect(adapter.isConfigured()).toBe(true);
    const health = await adapter.healthCheck({ live: true });
    expect(health.configured).toBe(true);
    expect(health.live).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const { body } = requestOf(fetchImpl);
    expect(body['method']).toBe('getHealth');
  });

  it('folds live probe failures into the health result instead of throwing', async () => {
    const fetchImpl = vi.fn(async () => new Response('unauthorized', { status: 401 }));
    const health = await adapterWith(fetchImpl).healthCheck({ live: true });
    expect(health.live).toBe(false);
    expect(health.message).toContain('401');
  });
});
