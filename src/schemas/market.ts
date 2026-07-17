import { z } from 'zod';
import {
  AssetClassSchema,
  CurrencySchema,
  FrequencySchema,
  IsoTimestamp,
  SourcedSchema,
} from './common.js';

/**
 * Market data shapes: instruments, quotes, OHLCV series. Identifiers are
 * never silently merged — an Instrument keeps every provider's native id
 * side by side under providerIds.
 */

export const InstrumentSchema = z.object({
  /** Platform-canonical symbol, e.g. "AAPL", "EURUSD", "BTC". */
  symbol: z.string().min(1),
  name: z.string().optional(),
  assetClass: AssetClassSchema,
  /** Exchange MIC or venue name when known (e.g. "XNAS"). */
  exchange: z.string().optional(),
  currency: CurrencySchema.optional(),
  /** Native identifier per provider, e.g. { coingecko: "bitcoin" }. */
  providerIds: z.record(z.string()).default({}),
});
export type Instrument = z.infer<typeof InstrumentSchema>;

export const QuoteSchema = SourcedSchema.extend({
  instrument: InstrumentSchema,
  price: z.number().finite(),
  currency: CurrencySchema,
  asOf: IsoTimestamp,
  change24hPct: z.number().finite().optional(),
  volume24h: z.number().finite().optional(),
  marketCap: z.number().finite().optional(),
});
export type Quote = z.infer<typeof QuoteSchema>;

export const OhlcvBarSchema = z.object({
  /** Bar open time, UTC ISO. */
  t: IsoTimestamp,
  o: z.number().finite(),
  h: z.number().finite(),
  l: z.number().finite(),
  c: z.number().finite(),
  v: z.number().finite().optional(),
});
export type OhlcvBar = z.infer<typeof OhlcvBarSchema>;

export const AdjustmentSchema = z.enum([
  'raw',
  'split_adjusted',
  'split_dividend_adjusted',
  'unknown',
]);
export type Adjustment = z.infer<typeof AdjustmentSchema>;

export const PriceSeriesSchema = SourcedSchema.extend({
  instrument: InstrumentSchema,
  frequency: FrequencySchema,
  /** Exchange/session timezone of the bar timestamps' trading day. */
  timezone: z.string().default('UTC'),
  currency: CurrencySchema.optional(),
  adjustment: AdjustmentSchema.default('unknown'),
  bars: z.array(OhlcvBarSchema),
});
export type PriceSeries = z.infer<typeof PriceSeriesSchema>;
