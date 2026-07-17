import { requireApiKey, type ProviderId } from '../../core/config.js';
import { NotSupportedError, ValidationError } from '../../core/errors.js';
import { HttpClient, type HttpResponse } from '../../core/http.js';
import type {
  Chain,
  DataSource,
  LineageStep,
  QualityFlag,
} from '../../schemas/common.js';
import {
  LabeledFlowSchema,
  WalletBalancesSchema,
  type LabeledFlow,
  type WalletBalances,
} from '../../schemas/onchain.js';
import { BaseAdapter } from '../base.js';
import type {
  LabeledFlowsSource,
  ProviderMeta,
  TokenQuery,
  WalletBalancesSource,
} from '../types.js';
import type {
  NansenEnvelope,
  NansenProfilerBalanceRequest,
  NansenProfilerBalanceRow,
  NansenSearchGeneralRequest,
  NansenSearchGeneralResponse,
  NansenSmartMoneyNetflowRequest,
  NansenSmartMoneyNetflowRow,
} from './types.js';

/**
 * Nansen adapter — smart-money labeled flow intelligence and profiler
 * wallet balances. Built strictly from the official-docs research record
 * (docs/research/providers/nansen.json).
 *
 * Endpoints consumed (all POST + JSON body, auth via lowercase `apikey`
 * header):
 *  - /api/v1/smart-money/netflow            → LabeledFlowsSource (5 credits)
 *  - /api/v1/profiler/address/current-balance → WalletBalancesSource (1 credit)
 *  - /api/v1/search/general                 → liveProbe only (0 credits)
 *
 * LICENSING: Nansen's Data Redistribution Guidelines restrict or prohibit
 * redistribution of smart-money data (netflow is Restricted — approval +
 * significant modification required). Treat everything this adapter
 * returns as INTERNAL-USE-ONLY by default; see docs/providers/nansen.md.
 *
 * Labels (the "smart money" cohort) are Nansen's proprietary model output,
 * so every LabeledFlow carries evidenceType 'model_estimate'.
 */

const BASE_URL = 'https://api.nansen.ai';
const NETFLOW_PATH = '/api/v1/smart-money/netflow';
const BALANCES_PATH = '/api/v1/profiler/address/current-balance';
const SEARCH_GENERAL_PATH = '/api/v1/search/general';

/** Netflow response field per supported rolling window. */
const WINDOW_FIELDS = {
  '1h': 'net_flow_1h_usd',
  '24h': 'net_flow_24h_usd',
  '7d': 'net_flow_7d_usd',
  '30d': 'net_flow_30d_usd',
} as const;
type FlowWindow = keyof typeof WINDOW_FIELDS;

/** Platform aliases accepted for the flow window parameter. */
const WINDOW_ALIASES: Record<string, FlowWindow> = {
  '1h': '1h',
  '24h': '24h',
  '1d': '24h',
  '7d': '7d',
  '1w': '7d',
  '30d': '30d',
  '1mo': '30d',
};

function normalizeWindow(window: string): FlowWindow {
  const normalized = WINDOW_ALIASES[window.toLowerCase()];
  if (normalized === undefined) {
    throw new ValidationError(
      `[nansen] unsupported flow window "${window}" — supported: 1h, 24h (1d), 7d (1w), 30d (1mo)`,
    );
  }
  return normalized;
}

/**
 * Platform chain → Nansen chain slug. Nansen calls BNB Chain "bnb" (the
 * platform uses "bsc"); 'other' has no Nansen equivalent.
 */
const TO_NANSEN_CHAIN: Partial<Record<Chain, string>> = {
  ethereum: 'ethereum',
  solana: 'solana',
  polygon: 'polygon',
  arbitrum: 'arbitrum',
  optimism: 'optimism',
  base: 'base',
  bsc: 'bnb',
  avalanche: 'avalanche',
  bitcoin: 'bitcoin',
};

/**
 * Platform chains present in the documented Smart Money chain enum
 * (Bitcoin is Profiler-only per the research record).
 */
const SMART_MONEY_NANSEN_CHAINS = new Set([
  'ethereum',
  'solana',
  'base',
  'bnb',
  'arbitrum',
  'polygon',
  'avalanche',
  'optimism',
]);

const FROM_NANSEN_CHAIN: Record<string, Chain> = {
  ethereum: 'ethereum',
  solana: 'solana',
  polygon: 'polygon',
  arbitrum: 'arbitrum',
  optimism: 'optimism',
  base: 'base',
  bnb: 'bsc',
  avalanche: 'avalanche',
  bitcoin: 'bitcoin',
};

/** Nansen chain slug → platform chain ('other' when not in the platform enum). */
function fromNansenChain(chain: string): Chain {
  return FROM_NANSEN_CHAIN[chain] ?? 'other';
}

/** Expand JS exponential notation ("1e-7", "1.5e+21") to a plain decimal string. */
function expandExponential(value: number): string {
  const text = String(value);
  const match = /^(\d+)(?:\.(\d+))?[eE]([+-]?\d+)$/.exec(text);
  if (!match) return text;
  const intDigits = match[1] ?? '';
  const fracDigits = match[2] ?? '';
  const exponent = Number(match[3]);
  const digits = intDigits + fracDigits;
  const pointIndex = intDigits.length + exponent;
  if (pointIndex <= 0) return `0.${'0'.repeat(-pointIndex)}${digits}`;
  if (pointIndex >= digits.length) return digits + '0'.repeat(pointIndex - digits.length);
  return `${digits.slice(0, pointIndex)}.${digits.slice(pointIndex)}`;
}

/**
 * Nansen returns only decimal-adjusted `token_amount` (no raw base-unit
 * amount, no token decimals). Encode the exact decimal text losslessly as
 * a digit string for the platform's required rawAmount slot; the implied
 * scale is the fractional-digit count (recorded in lineage). Consumers
 * should use `amount` for human units.
 */
function deriveRawAmount(amount: number): string {
  const plain = expandExponential(amount);
  const [intPart = '0', fracPart = ''] = plain.split('.');
  return `${intPart}${fracPart}`.replace(/^0+(?=\d)/, '');
}

/** Preserve the raw provider identity (nansen chain slug + token address). */
function tokenRefFrom(
  nansenChain: string,
  tokenAddress: string,
  symbol?: string | null,
  name?: string | null,
): Record<string, unknown> {
  return {
    chain: fromNansenChain(nansenChain),
    address: tokenAddress,
    ...(symbol ? { symbol } : {}),
    ...(name ? { name } : {}),
    providerIds: { nansen: `${nansenChain}:${tokenAddress}` },
  };
}

export class NansenAdapter extends BaseAdapter implements LabeledFlowsSource, WalletBalancesSource {
  readonly id: ProviderId = 'nansen';
  readonly meta: ProviderMeta = {
    id: 'nansen',
    name: 'Nansen',
    docsUrl: 'https://docs.nansen.ai/',
    docsReviewDate: '2026-07-17',
    apiVersion: 'v1 (/api/v1/)',
    envVar: 'NANSEN_API_KEY',
  };

  private http: HttpClient | undefined;

  constructor(private readonly opts: { fetchImpl?: typeof fetch } = {}) {
    super();
  }

  /** Built lazily so importing/constructing never reads credentials. */
  private client(): HttpClient {
    if (this.http === undefined) {
      this.http = new HttpClient({
        provider: this.id,
        baseUrl: BASE_URL,
        // Auth: API key in the lowercase `apikey` request header.
        defaultHeaders: { apikey: requireApiKey(this.id) },
        // Conservative vs the documented Free-plan limits (15 rps / 300 rpm):
        // burst 5, sustained 4 rps (= 240 rpm).
        rateLimit: { capacity: 5, refillPerSecond: 4 },
        ...(this.opts.fetchImpl !== undefined ? { fetchImpl: this.opts.fetchImpl } : {}),
      });
    }
    return this.http;
  }

  /** One minimal-quota documented request: search/general costs 0 credits. */
  protected async liveProbe(): Promise<void> {
    const body: NansenSearchGeneralRequest = {
      search_query: 'ethereum',
      result_type: 'token',
      limit: 1,
    };
    await this.client().postJson<NansenSearchGeneralResponse>(SEARCH_GENERAL_PATH, body);
  }

  private sourceFor(endpoint: string, res: HttpResponse<unknown>): DataSource {
    return {
      provider: this.id,
      endpoint,
      apiVersion: 'v1',
      requestedAt: res.requestedAt,
      receivedAt: res.receivedAt,
      cacheHit: false,
      // Registry: onchain.labeled_flows / onchain.wallet_balances are
      // documented as realtime ("updated in realtime", "real-time token
      // balance information") — no delayed/EOD caveat in the record.
      freshness: 'realtime',
    };
  }

  /* ------------------------- LabeledFlowsSource ------------------------- */

  async getLabeledFlows(params: { token: TokenQuery; window?: string }): Promise<LabeledFlow[]> {
    const { token } = params;
    const window = normalizeWindow(params.window ?? '24h');
    const field = WINDOW_FIELDS[window];

    if (!token.chain || !token.address) {
      throw new ValidationError(
        '[nansen] getLabeledFlows requires token.chain and token.address — token identity is chain + contract address; bare symbols are never used as join keys',
      );
    }
    const nansenChain = TO_NANSEN_CHAIN[token.chain];
    if (nansenChain === undefined || !SMART_MONEY_NANSEN_CHAINS.has(nansenChain)) {
      throw new NotSupportedError(
        `[nansen] smart-money netflow does not support chain "${token.chain}" (not in the documented Smart Money chain enum)`,
      );
    }

    const body: NansenSmartMoneyNetflowRequest = {
      chains: [nansenChain],
      filters: { token_address: token.address },
      pagination: { page: 1, per_page: 100 },
    };
    const res = await this.client().postJson<NansenEnvelope<NansenSmartMoneyNetflowRow>>(
      NETFLOW_PATH,
      body,
    );

    const rows = res.data.data ?? [];
    const usable = rows.filter((row) => {
      const value = row[field];
      return typeof value === 'number' && Number.isFinite(value);
    });

    const quality: QualityFlag[] = ['realtime', 'estimated'];
    if (res.data.pagination?.is_last_page === false || usable.length < rows.length) {
      quality.push('incomplete');
    }

    const lineage: LineageStep[] = [
      {
        step: 'map_chain',
        description: `mapped platform chain "${token.chain}" to Nansen chain "${nansenChain}"`,
        at: res.receivedAt,
        params: { platform: token.chain, nansen: nansenChain },
      },
      {
        step: 'select_window_field',
        description: `selected Nansen rolling-window aggregate field "${field}" for requested window "${window}"; rows missing that field were dropped`,
        at: res.receivedAt,
        params: { window, field, rowsReceived: rows.length, rowsMapped: usable.length },
      },
      {
        step: 'map_fields',
        description:
          'mapped Nansen netflow rows to platform LabeledFlow (token_address→token.address, token_symbol→token.symbol); raw "chain:token_address" identity preserved in token.providerIds.nansen; smart-money cohort labels are Nansen proprietary model output (evidenceType=model_estimate)',
        at: res.receivedAt,
      },
    ];

    return usable.map((row) =>
      LabeledFlowSchema.parse({
        token: tokenRefFrom(row.chain, row.token_address, row.token_symbol),
        window,
        netFlowUsd: row[field],
        labelCohort: 'smart_money',
        labelSource: 'nansen',
        evidenceType: 'model_estimate',
        asOf: res.receivedAt,
        source: this.sourceFor(NETFLOW_PATH, res),
        quality,
        lineage,
      }),
    );
  }

  /* ------------------------ WalletBalancesSource ------------------------ */

  async getWalletBalances(params: { chain: Chain; address: string }): Promise<WalletBalances> {
    const nansenChain = TO_NANSEN_CHAIN[params.chain];
    if (nansenChain === undefined) {
      throw new NotSupportedError(
        `[nansen] profiler current-balance does not support platform chain "${params.chain}"`,
      );
    }

    const body: NansenProfilerBalanceRequest = {
      address: params.address,
      chain: nansenChain,
      // Documented default is true; pinned explicitly so a provider-side
      // default change can never silently alter results.
      hide_spam_token: true,
      pagination: { page: 1, per_page: 1000 },
    };
    const res = await this.client().postJson<NansenEnvelope<NansenProfilerBalanceRow>>(
      BALANCES_PATH,
      body,
    );

    const rows = res.data.data ?? [];
    // Plain objects validated by WalletBalancesSchema.parse below.
    const balances: Array<Record<string, unknown>> = [];
    let dropped = 0;
    for (const row of rows) {
      const amount = row.token_amount;
      if (typeof amount !== 'number' || !Number.isFinite(amount) || amount < 0) {
        dropped += 1;
        continue;
      }
      balances.push({
        token: tokenRefFrom(row.chain, row.token_address, row.token_symbol, row.token_name),
        rawAmount: deriveRawAmount(amount),
        amount,
        ...(typeof row.value_usd === 'number' && Number.isFinite(row.value_usd)
          ? { valueUsd: row.value_usd }
          : {}),
      });
    }

    const quality: QualityFlag[] = ['realtime', 'converted'];
    if (res.data.pagination?.is_last_page === false || dropped > 0) {
      quality.push('incomplete');
    }

    const lineage: LineageStep[] = [
      {
        step: 'map_chain',
        description: `mapped platform chain "${params.chain}" to Nansen chain "${nansenChain}"`,
        at: res.receivedAt,
        params: { platform: params.chain, nansen: nansenChain },
      },
      {
        step: 'derive_raw_amount',
        description:
          'Nansen returns only decimal-adjusted token_amount (no raw base-unit amount, no token decimals); rawAmount is the exact digit string of token_amount with an implied scale equal to its fractional-digit count — NOT on-chain base units; use `amount` for human units',
        at: res.receivedAt,
        params: { rowsReceived: rows.length, balancesMapped: balances.length, dropped },
      },
      {
        step: 'map_fields',
        description:
          'mapped Nansen ProfilerBalance rows to platform TokenBalance (token_address→token.address, token_symbol→token.symbol, token_name→token.name, value_usd→valueUsd); raw "chain:token_address" identity preserved in token.providerIds.nansen; spam tokens hidden (hide_spam_token=true)',
        at: res.receivedAt,
      },
    ];

    return WalletBalancesSchema.parse({
      chain: params.chain,
      address: params.address,
      asOf: res.receivedAt,
      balances,
      source: this.sourceFor(BALANCES_PATH, res),
      quality,
      lineage,
    });
  }
}
