import type { ProviderId } from '../core/config.js';
import { NotSupportedError } from '../core/errors.js';
import {
  isDexPairsSource,
  isLabeledFlowsSource,
  isTokenOhlcvSource,
  isTokenPriceSource,
  isTransfersSource,
  isWalletBalancesSource,
  type TokenQuery,
} from '../providers/types.js';
import { executeWithFallback } from '../registry/routing.js';
import type { Chain, Frequency } from '../schemas/common.js';
import type { PriceSeries } from '../schemas/market.js';
import type {
  DexPair,
  LabeledFlow,
  TokenPrice,
  TransferBatch,
  WalletBalances,
} from '../schemas/onchain.js';
import { getAdapter } from './adapter-registry.js';
import { annotateRouting, annotateRoutingEach } from './quality.js';

/** On-chain / crypto data services. */

export async function getTokenPrice(params: {
  token: TokenQuery;
}): Promise<TokenPrice> {
  const route = await executeWithFallback(
    'onchain.token_price',
    { chain: params.token.chain },
    async (match) => {
      const adapter = getAdapter(match.provider.id as ProviderId);
      if (!isTokenPriceSource(adapter)) {
        throw new NotSupportedError(
          `Adapter "${match.provider.id}" does not implement token price — registry/adapter mismatch`,
        );
      }
      return adapter.getTokenPrice(params);
    },
  );
  return annotateRouting(route);
}

export async function getTokenOhlcv(params: {
  token: TokenQuery;
  interval: Frequency;
  from?: string;
  to?: string;
  limit?: number;
}): Promise<PriceSeries> {
  const route = await executeWithFallback(
    'onchain.token_ohlcv',
    { chain: params.token.chain },
    async (match) => {
      const adapter = getAdapter(match.provider.id as ProviderId);
      if (!isTokenOhlcvSource(adapter)) {
        throw new NotSupportedError(
          `Adapter "${match.provider.id}" does not implement token OHLCV — registry/adapter mismatch`,
        );
      }
      return adapter.getTokenOhlcv(params);
    },
  );
  return annotateRouting(route);
}

export async function getWalletBalances(params: {
  chain: Chain;
  address: string;
}): Promise<WalletBalances> {
  const route = await executeWithFallback(
    'onchain.wallet_balances',
    { chain: params.chain },
    async (match) => {
      const adapter = getAdapter(match.provider.id as ProviderId);
      if (!isWalletBalancesSource(adapter)) {
        throw new NotSupportedError(
          `Adapter "${match.provider.id}" does not implement wallet balances — registry/adapter mismatch`,
        );
      }
      return adapter.getWalletBalances(params);
    },
  );
  return annotateRouting(route);
}

export async function getTransfers(params: {
  chain: Chain;
  address: string;
  limit?: number;
  cursor?: string;
}): Promise<TransferBatch> {
  const route = await executeWithFallback(
    'onchain.transfers',
    { chain: params.chain },
    async (match) => {
      const adapter = getAdapter(match.provider.id as ProviderId);
      if (!isTransfersSource(adapter)) {
        throw new NotSupportedError(
          `Adapter "${match.provider.id}" does not implement transfers — registry/adapter mismatch`,
        );
      }
      return adapter.getTransfers(params);
    },
  );
  return annotateRouting(route);
}

export async function getDexPairs(params: {
  chain: Chain;
  tokenAddress: string;
  limit?: number;
}): Promise<DexPair[]> {
  const route = await executeWithFallback(
    'onchain.dex_pairs',
    { chain: params.chain },
    async (match) => {
      const adapter = getAdapter(match.provider.id as ProviderId);
      if (!isDexPairsSource(adapter)) {
        throw new NotSupportedError(
          `Adapter "${match.provider.id}" does not implement DEX pairs — registry/adapter mismatch`,
        );
      }
      return adapter.getDexPairs(params);
    },
  );
  return annotateRoutingEach(route);
}

export async function getLabeledFlows(params: {
  token: TokenQuery;
  window?: string;
}): Promise<LabeledFlow[]> {
  const route = await executeWithFallback(
    'onchain.labeled_flows',
    { chain: params.token.chain },
    async (match) => {
      const adapter = getAdapter(match.provider.id as ProviderId);
      if (!isLabeledFlowsSource(adapter)) {
        throw new NotSupportedError(
          `Adapter "${match.provider.id}" does not implement labeled flows — registry/adapter mismatch`,
        );
      }
      return adapter.getLabeledFlows(params);
    },
  );
  return annotateRoutingEach(route);
}
