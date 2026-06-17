import { type AssetIdentity } from '@shared/types/AssetIdentity'
import { normalizeHyperliquidCoin } from '@shared/types/Hyperliquid'
import { normalizeMassiveStocksTicker } from '@shared/types/MassiveStocks'
import { isNullish } from '@shared/utils/lang'

import type { FetchNewsCommandOptions } from '@/types/News'

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
