import type { ProviderId } from '../core/config.js';
import type { ProviderAdapter } from './types.js';
import { AlchemyAdapter } from './alchemy/adapter.js';
import { BirdeyeAdapter } from './birdeye/adapter.js';
import { CoinGeckoAdapter } from './coingecko/adapter.js';
import { FredAdapter } from './fred/adapter.js';
import { HeliusAdapter } from './helius/adapter.js';
import { MarketstackAdapter } from './marketstack/adapter.js';
import { MoralisAdapter } from './moralis/adapter.js';
import { NansenAdapter } from './nansen/adapter.js';
import { NewsDataAdapter } from './newsdata/adapter.js';
import { TavilyAdapter } from './tavily/adapter.js';

/**
 * Adapter factory map. Construction is lazy (adapters never read keys at
 * import/construct time), so importing the platform never requires
 * credentials.
 */
export const adapterFactories: Partial<Record<ProviderId, () => ProviderAdapter>> = {
  alchemy: () => new AlchemyAdapter(),
  birdeye: () => new BirdeyeAdapter(),
  coingecko: () => new CoinGeckoAdapter(),
  fred: () => new FredAdapter(),
  helius: () => new HeliusAdapter(),
  marketstack: () => new MarketstackAdapter(),
  moralis: () => new MoralisAdapter(),
  nansen: () => new NansenAdapter(),
  newsdata: () => new NewsDataAdapter(),
  tavily: () => new TavilyAdapter(),
};
