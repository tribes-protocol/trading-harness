import { z } from 'zod';
import { CurrencySchema, IsoDate, SourcedSchema } from './common.js';
import { InstrumentSchema } from './market.js';

/** Corporate actions and listing reference data. */

export const SplitSchema = z.object({
  date: IsoDate,
  /** e.g. 4 for a 4:1 split. */
  splitFactor: z.number().positive(),
});
export type Split = z.infer<typeof SplitSchema>;

export const DividendSchema = z.object({
  date: IsoDate,
  amount: z.number().finite(),
  currency: CurrencySchema.optional(),
});
export type Dividend = z.infer<typeof DividendSchema>;

export const CorporateActionsSchema = SourcedSchema.extend({
  instrument: InstrumentSchema,
  splits: z.array(SplitSchema).default([]),
  dividends: z.array(DividendSchema).default([]),
});
export type CorporateActions = z.infer<typeof CorporateActionsSchema>;

export const ExchangeInfoSchema = z.object({
  name: z.string(),
  mic: z.string().optional(),
  country: z.string().optional(),
  timezone: z.string().optional(),
  currency: CurrencySchema.optional(),
});
export type ExchangeInfo = z.infer<typeof ExchangeInfoSchema>;
