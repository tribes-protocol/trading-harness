import { type AssetIdentity } from '@/types/AssetIdentity'
import { normalizeHyperliquidCoin } from '@/types/Hyperliquid'
import { normalizeMassiveStocksTicker } from '@/types/MassiveStocks'
import type { FetchNewsCommandOptions } from '@/types/News'
import { isNullish } from '@/utils/lang'

export function toAssetIdentity(options: FetchNewsCommandOptions): AssetIdentity {
  switch (options.kind) {
    case 'token': {
      if (isNullish(options.chainId) || isNullish(options.tokenId)) {
        throw new Error('Token news requests require both chainId and tokenId')
      }
      return {
        kind: 'token',
        chainId: options.chainId,
        tokenId: options.tokenId
      }
    }
    case 'perp': {
      if (isNullish(options.coin)) {
        throw new Error('Perp news requests require coin')
      }
      return {
        kind: 'perp',
        coin: normalizeHyperliquidCoin(options.coin)
      }
    }
    case 'stock': {
      if (isNullish(options.ticker)) {
        throw new Error('Stock news requests require ticker')
      }
      return {
        kind: 'stock',
        ticker: normalizeMassiveStocksTicker(options.ticker)
      }
    }
  }
}
