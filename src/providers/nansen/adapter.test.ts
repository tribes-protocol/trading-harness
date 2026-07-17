import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { envVarName, resetEnvCacheForTests } from '../../core/config.js';
import {
  EntitlementError,
  HttpError,
  NotSupportedError,
  RateLimitError,
  ValidationError,
} from '../../core/errors.js';
import { resetBucketsForTests } from '../../core/ratelimit.js';
import { LabeledFlowSchema, WalletBalancesSchema } from '../../schemas/onchain.js';
import { NansenAdapter } from './adapter.js';

const ENV = envVarName('nansen'); // NANSEN_API_KEY
const TEST_KEY = 'test-key-nansen-0123456789';

const NETFLOW_URL = 'https://api.nansen.ai/api/v1/smart-money/netflow';
const BALANCES_URL = 'https://api.nansen.ai/api/v1/profiler/address/current-balance';
const SEARCH_URL = 'https://api.nansen.ai/api/v1/search/general';

const WETH = '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2';
const WALLET = '0x1111111111111111111111111111111111111111';

function loadFixture<T = Record<string, unknown>>(name: string): T {
  return JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8')) as T;
}

interface CapturedCall {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: Record<string, unknown> | undefined;
}

/** Injected fetch that records every call and answers via `respond`. No network. */
function stubFetch(respond: (url: string, call: CapturedCall) => Response) {
  const calls: CapturedCall[] = [];
  const impl = (async (input: unknown, init?: RequestInit) => {
    const call: CapturedCall = {
      url: String(input),
      method: init?.method ?? 'GET',
      headers: (init?.headers ?? {}) as Record<string, string>,
      body:
        typeof init?.body === 'string'
          ? (JSON.parse(init.body) as Record<string, unknown>)
          : undefined,
    };
    calls.push(call);
    return respond(call.url, call);
  }) as typeof fetch;
  return { impl, calls };
}

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

function firstCall(calls: CapturedCall[]): CapturedCall {
  const call = calls[0];
  if (!call) throw new Error('no fetch call captured');
  return call;
}

beforeEach(() => {
  process.env[ENV] = TEST_KEY;
  resetEnvCacheForTests();
  resetBucketsForTests();
});

afterEach(() => {
  delete process.env[ENV];
  resetEnvCacheForTests();
});

describe('NansenAdapter.getLabeledFlows', () => {
  it('returns schema-valid LabeledFlow[] from the netflow fixture (default 24h window)', async () => {
    const { impl } = stubFetch(() => jsonResponse(loadFixture('smart-money-netflow.json')));
    const adapter = new NansenAdapter({ fetchImpl: impl });

    const flows = await adapter.getLabeledFlows({
      token: { chain: 'ethereum', address: WETH },
    });

    expect(flows).toHaveLength(1);
    const flow = flows[0];
    if (!flow) throw new Error('expected one flow');
    // Re-validate the returned payload against the platform schema.
    expect(() => LabeledFlowSchema.parse(flow)).not.toThrow();

    expect(flow.window).toBe('24h');
    expect(flow.netFlowUsd).toBe(-2103450.12);
    expect(flow.labelCohort).toBe('smart_money');
    expect(flow.labelSource).toBe('nansen');
    expect(flow.evidenceType).toBe('model_estimate');
    expect(flow.token.chain).toBe('ethereum');
    expect(flow.token.address).toBe(WETH);
    // Raw provider identity preserved — never joined on bare symbols.
    expect(flow.token.providerIds.nansen).toBe(`ethereum:${WETH}`);
    expect(flow.lineage.length).toBeGreaterThanOrEqual(2);
  });

  it('sends documented POST body/path with the lowercase apikey header and maps bsc→bnb', async () => {
    const { impl, calls } = stubFetch(() => jsonResponse(loadFixture('smart-money-netflow.json')));
    const adapter = new NansenAdapter({ fetchImpl: impl });

    await adapter.getLabeledFlows({ token: { chain: 'bsc', address: WETH }, window: '7d' });

    const call = firstCall(calls);
    expect(call.url).toBe(NETFLOW_URL);
    expect(call.method).toBe('POST');
    expect(call.headers.apikey).toBe(TEST_KEY);
    expect(call.headers['content-type']).toBe('application/json');
    expect(call.body).toMatchObject({
      chains: ['bnb'],
      filters: { token_address: WETH },
      pagination: { page: 1, per_page: 100 },
    });
  });

  it('selects the documented rolling-window field for the requested window (incl. aliases)', async () => {
    const { impl } = stubFetch(() => jsonResponse(loadFixture('smart-money-netflow.json')));
    const adapter = new NansenAdapter({ fetchImpl: impl });
    const token = { chain: 'ethereum' as const, address: WETH };

    const [sevenDay] = await adapter.getLabeledFlows({ token, window: '7d' });
    expect(sevenDay?.netFlowUsd).toBe(8450230.9);
    expect(sevenDay?.window).toBe('7d');

    const [daily] = await adapter.getLabeledFlows({ token, window: '1d' });
    expect(daily?.netFlowUsd).toBe(-2103450.12);
    expect(daily?.window).toBe('24h');

    const [monthly] = await adapter.getLabeledFlows({ token, window: '30d' });
    expect(monthly?.netFlowUsd).toBe(15320800.25);
  });

  it('drops rows missing the selected window field and flags incomplete (never zero-fills)', async () => {
    const { impl } = stubFetch(() =>
      jsonResponse({
        data: [
          {
            chain: 'ethereum',
            token_address: WETH,
            token_symbol: 'WETH',
            net_flow_24h_usd: -2103450.12,
          },
          {
            // Documented field absent for this row — must be dropped, not
            // coerced to 0 (a zero net flow is a real, different signal).
            chain: 'ethereum',
            token_address: '0x3333333333333333333333333333333333333333',
            token_symbol: 'XYZ',
            net_flow_24h_usd: null,
          },
        ],
        pagination: { page: 1, per_page: 100, is_last_page: true },
      }),
    );
    const adapter = new NansenAdapter({ fetchImpl: impl });

    const flows = await adapter.getLabeledFlows({ token: { chain: 'ethereum', address: WETH } });
    expect(flows).toHaveLength(1);
    expect(flows[0]?.netFlowUsd).toBe(-2103450.12);
    expect(flows[0]?.quality).toContain('incomplete');
    const windowStep = flows[0]?.lineage.find((s) => s.step === 'select_window_field');
    expect(windowStep?.params).toMatchObject({ rowsReceived: 2, rowsMapped: 1 });
  });

  it('rejects unsupported windows, missing token identity, and unsupported chains', async () => {
    const { impl, calls } = stubFetch(() => jsonResponse(loadFixture('smart-money-netflow.json')));
    const adapter = new NansenAdapter({ fetchImpl: impl });

    await expect(
      adapter.getLabeledFlows({ token: { chain: 'ethereum', address: WETH }, window: 'weekly' }),
    ).rejects.toBeInstanceOf(ValidationError);
    // Bare symbol without chain+address must never be used as a join key.
    await expect(
      adapter.getLabeledFlows({ token: { symbol: 'WETH' } }),
    ).rejects.toBeInstanceOf(ValidationError);
    // Bitcoin is Profiler-only per the research record (no Smart Money support).
    await expect(
      adapter.getLabeledFlows({ token: { chain: 'bitcoin', address: 'bc1qxyz' } }),
    ).rejects.toBeInstanceOf(NotSupportedError);
    expect(calls).toHaveLength(0);
  });
});

describe('NansenAdapter.getWalletBalances', () => {
  it('returns schema-valid WalletBalances with lossless rawAmount derivation', async () => {
    const { impl } = stubFetch(() =>
      jsonResponse(loadFixture('profiler-address-current-balance.json')),
    );
    const adapter = new NansenAdapter({ fetchImpl: impl });

    const result = await adapter.getWalletBalances({ chain: 'ethereum', address: WALLET });
    expect(() => WalletBalancesSchema.parse(result)).not.toThrow();

    expect(result.chain).toBe('ethereum');
    expect(result.address).toBe(WALLET);
    expect(result.balances).toHaveLength(2);

    const usdc = result.balances[0];
    if (!usdc) throw new Error('expected USDC balance');
    // token_amount 1523.75 → digit string "152375" (implied scale 2, per lineage).
    expect(usdc.rawAmount).toBe('152375');
    expect(usdc.amount).toBe(1523.75);
    expect(usdc.valueUsd).toBe(1523.75);
    expect(usdc.token.symbol).toBe('USDC');
    expect(usdc.token.name).toBe('USD Coin');
    expect(usdc.token.providerIds.nansen).toBe(
      'ethereum:0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
    );

    const weth = result.balances[1];
    if (!weth) throw new Error('expected WETH balance');
    expect(weth.rawAmount).toBe('125');
    expect(weth.amount).toBe(12.5);

    // The raw-amount derivation must be declared in lineage.
    expect(result.lineage.some((s) => s.step === 'derive_raw_amount')).toBe(true);
  });

  it('sends documented POST body/path with auth header, pinned hide_spam_token, and chain mapping', async () => {
    const fixture = loadFixture('profiler-address-current-balance.json');
    const { impl, calls } = stubFetch(() => jsonResponse(fixture));
    const adapter = new NansenAdapter({ fetchImpl: impl });

    await adapter.getWalletBalances({ chain: 'bsc', address: WALLET });

    const call = firstCall(calls);
    expect(call.url).toBe(BALANCES_URL);
    expect(call.method).toBe('POST');
    expect(call.headers.apikey).toBe(TEST_KEY);
    expect(call.body).toMatchObject({
      address: WALLET,
      chain: 'bnb', // platform 'bsc' maps to Nansen 'bnb'
      hide_spam_token: true,
      pagination: { page: 1, per_page: 1000 },
    });
  });

  it('preserves missing token_amount/value_usd honestly: drops + flags incomplete, never zero-fills', async () => {
    const { impl } = stubFetch(() =>
      jsonResponse({
        data: [
          {
            chain: 'ethereum',
            address: WALLET,
            token_address: '0x4444444444444444444444444444444444444444',
            token_symbol: 'NOVAL',
            token_name: 'No Value',
            token_amount: 7,
            price_usd: null,
            value_usd: null, // missing USD value must stay absent, not become 0
          },
          {
            chain: 'ethereum',
            address: WALLET,
            token_address: '0x5555555555555555555555555555555555555555',
            token_symbol: 'NOAMT',
            token_name: 'No Amount',
            token_amount: null, // unmappable row: TokenBalance requires an amount
            price_usd: 1,
            value_usd: 1,
          },
        ],
        pagination: { page: 1, per_page: 1000, is_last_page: true },
      }),
    );
    const adapter = new NansenAdapter({ fetchImpl: impl });

    const result = await adapter.getWalletBalances({ chain: 'ethereum', address: WALLET });
    expect(result.balances).toHaveLength(1);
    const balance = result.balances[0];
    if (!balance) throw new Error('expected one balance');
    expect(balance.token.symbol).toBe('NOVAL');
    expect(balance.valueUsd).toBeUndefined();
    expect(result.quality).toContain('incomplete');
    const deriveStep = result.lineage.find((s) => s.step === 'derive_raw_amount');
    expect(deriveStep?.params).toMatchObject({ rowsReceived: 2, balancesMapped: 1, dropped: 1 });
  });

  it('derives lossless digit-string rawAmount for exponential and sub-1 token_amounts', async () => {
    const row = (token_symbol: string, token_amount: number) => ({
      chain: 'ethereum',
      address: WALLET,
      token_address: `0x${token_symbol.padEnd(40, '0').toLowerCase()}`,
      token_symbol,
      token_name: token_symbol,
      token_amount,
    });
    const { impl } = stubFetch(() =>
      jsonResponse({
        data: [row('A', 1e-7), row('B', 0.000123), row('C', 1.5e21), row('D', 0)],
        pagination: { page: 1, per_page: 1000, is_last_page: true },
      }),
    );
    const adapter = new NansenAdapter({ fetchImpl: impl });

    const result = await adapter.getWalletBalances({ chain: 'ethereum', address: WALLET });
    const raw = result.balances.map((b) => b.rawAmount);
    // 1e-7 → "0.0000001" → "1"; 0.000123 → "123"; 1.5e21 → "15" + 20 zeros; 0 → "0".
    expect(raw).toEqual(['1', '123', `15${'0'.repeat(20)}`, '0']);
    // Every rawAmount satisfies the platform's raw integer-string contract.
    for (const value of raw) expect(value).toMatch(/^\d+$/);
    expect(result.quality).not.toContain('incomplete');
  });

  it('maps Nansen response chain slugs back to platform chains (bnb→bsc)', async () => {
    const { impl } = stubFetch(() =>
      jsonResponse({
        data: [
          {
            chain: 'bnb',
            address: WALLET,
            token_address: '0x2222222222222222222222222222222222222222',
            token_symbol: 'CAKE',
            token_name: 'PancakeSwap',
            token_amount: 100,
            price_usd: 2.5,
            value_usd: 250,
          },
        ],
        pagination: { page: 1, per_page: 1000, is_last_page: true },
      }),
    );
    const adapter = new NansenAdapter({ fetchImpl: impl });

    const result = await adapter.getWalletBalances({ chain: 'bsc', address: WALLET });
    const balance = result.balances[0];
    if (!balance) throw new Error('expected one balance');
    expect(balance.token.chain).toBe('bsc');
    expect(balance.rawAmount).toBe('100');
    expect(balance.token.providerIds.nansen).toBe(
      'bnb:0x2222222222222222222222222222222222222222',
    );
  });
});

describe('quality flags and freshness stamping', () => {
  it('stamps labeled flows as realtime + estimated (proprietary model labels)', async () => {
    const { impl } = stubFetch(() => jsonResponse(loadFixture('smart-money-netflow.json')));
    const adapter = new NansenAdapter({ fetchImpl: impl });

    const [flow] = await adapter.getLabeledFlows({ token: { chain: 'ethereum', address: WETH } });
    if (!flow) throw new Error('expected one flow');

    expect(flow.source.provider).toBe('nansen');
    expect(flow.source.endpoint).toBe('/api/v1/smart-money/netflow');
    expect(flow.source.freshness).toBe('realtime');
    expect(flow.source.cacheHit).toBe(false);
    expect(Date.parse(flow.source.requestedAt)).toBeLessThanOrEqual(
      Date.parse(flow.source.receivedAt),
    );
    expect(flow.quality).toContain('realtime');
    expect(flow.quality).toContain('estimated');
    expect(flow.quality).not.toContain('incomplete');
  });

  it('stamps wallet balances as realtime + converted (raw amount reconstruction)', async () => {
    const { impl } = stubFetch(() =>
      jsonResponse(loadFixture('profiler-address-current-balance.json')),
    );
    const adapter = new NansenAdapter({ fetchImpl: impl });

    const result = await adapter.getWalletBalances({ chain: 'ethereum', address: WALLET });
    expect(result.source.endpoint).toBe('/api/v1/profiler/address/current-balance');
    expect(result.source.freshness).toBe('realtime');
    expect(result.quality).toContain('realtime');
    expect(result.quality).toContain('converted');
    expect(result.quality).not.toContain('incomplete');
  });

  it('flags results incomplete when pagination reports more pages', async () => {
    const fixture = structuredClone(
      loadFixture<{ pagination: { is_last_page: boolean } }>(
        'profiler-address-current-balance.json',
      ),
    );
    fixture.pagination.is_last_page = false;
    const { impl } = stubFetch(() => jsonResponse(fixture));
    const adapter = new NansenAdapter({ fetchImpl: impl });

    const result = await adapter.getWalletBalances({ chain: 'ethereum', address: WALLET });
    expect(result.quality).toContain('incomplete');
  });
});

describe('provider error mapping', () => {
  it('maps 429 with documented retry_after body to RateLimitError', async () => {
    const { impl } = stubFetch(() =>
      jsonResponse({ detail: 'rate limit exceeded', retry_after: 0 }, 429, {
        'retry-after': '0',
      }),
    );
    const adapter = new NansenAdapter({ fetchImpl: impl });

    await expect(
      adapter.getLabeledFlows({ token: { chain: 'ethereum', address: WETH } }),
    ).rejects.toBeInstanceOf(RateLimitError);
  });

  it('maps 401 with the documented error envelope to EntitlementError without retrying', async () => {
    const { impl, calls } = stubFetch(() =>
      jsonResponse({ error: { code: 'UNAUTHORIZED', message: 'Invalid or missing API key' } }, 401),
    );
    const adapter = new NansenAdapter({ fetchImpl: impl });

    await expect(
      adapter.getWalletBalances({ chain: 'ethereum', address: WALLET }),
    ).rejects.toBeInstanceOf(EntitlementError);
    expect(calls).toHaveLength(1);
  });

  it('maps 422 FastAPI-style validation envelope to HttpError with status', async () => {
    const { impl } = stubFetch(() =>
      jsonResponse(
        { detail: [{ loc: ['body', 'chains'], msg: 'Field required', type: 'missing' }] },
        422,
      ),
    );
    const adapter = new NansenAdapter({ fetchImpl: impl });

    const failure = adapter.getLabeledFlows({ token: { chain: 'ethereum', address: WETH } });
    await expect(failure).rejects.toBeInstanceOf(HttpError);
    await failure.catch((error: unknown) => {
      expect((error as HttpError).status).toBe(422);
    });
  });
});

describe('configuration and health checks', () => {
  it('reports unconfigured without throwing when the env var is absent', async () => {
    delete process.env[ENV];
    resetEnvCacheForTests();

    const { impl, calls } = stubFetch(() => jsonResponse({}));
    const adapter = new NansenAdapter({ fetchImpl: impl });

    expect(adapter.isConfigured()).toBe(false);
    const health = await adapter.healthCheck();
    expect(health.provider).toBe('nansen');
    expect(health.configured).toBe(false);
    expect(health.live).toBeNull();
    expect(health.message).toContain('NANSEN_API_KEY');
    expect(calls).toHaveLength(0);
  });

  it('liveProbe makes exactly one minimal-quota search/general request', async () => {
    const { impl, calls } = stubFetch(() => jsonResponse(loadFixture('search-general.json')));
    const adapter = new NansenAdapter({ fetchImpl: impl });

    const health = await adapter.healthCheck({ live: true });
    expect(health.configured).toBe(true);
    expect(health.live).toBe(true);

    expect(calls).toHaveLength(1);
    const call = firstCall(calls);
    expect(call.url).toBe(SEARCH_URL);
    expect(call.method).toBe('POST');
    expect(call.headers.apikey).toBe(TEST_KEY);
    expect(call.body).toMatchObject({ search_query: 'ethereum', result_type: 'token', limit: 1 });
  });

  it('folds live-probe failures into the health result instead of throwing', async () => {
    const { impl } = stubFetch(() =>
      jsonResponse({ error: { code: 'UNAUTHORIZED', message: 'Invalid or missing API key' } }, 401),
    );
    const adapter = new NansenAdapter({ fetchImpl: impl });

    const health = await adapter.healthCheck({ live: true });
    expect(health.configured).toBe(true);
    expect(health.live).toBe(false);
    expect(health.message).toContain('401');
  });
});
