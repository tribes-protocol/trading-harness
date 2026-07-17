import { z } from 'zod';
import { CurrencySchema, IsoTimestamp, MoneySchema, SourcedSchema } from './common.js';
import { InstrumentSchema } from './market.js';

/** Portfolio, position, and trade-intent shapes. */

export const PositionSchema = z.object({
  instrument: InstrumentSchema,
  quantity: z.number().finite(),
  averageCost: MoneySchema.optional(),
  marketValue: MoneySchema.optional(),
  weightPct: z.number().finite().optional(),
  asOf: IsoTimestamp,
  notes: z.string().optional(),
});
export type Position = z.infer<typeof PositionSchema>;

export const PortfolioSchema = SourcedSchema.extend({
  id: z.string().min(1),
  name: z.string(),
  baseCurrency: CurrencySchema,
  asOf: IsoTimestamp,
  positions: z.array(PositionSchema),
  cash: MoneySchema.optional(),
});
export type Portfolio = z.infer<typeof PortfolioSchema>;

export const TradeIntentStatusSchema = z.enum([
  'proposed',
  'risk_reviewed',
  'compliance_reviewed',
  'approved',
  'rejected',
  'executed',
  'cancelled',
]);

export const TradeIntentSchema = z.object({
  id: z.string().min(1),
  createdAt: IsoTimestamp,
  instrument: InstrumentSchema,
  side: z.enum(['buy', 'sell']),
  quantity: z.number().positive().optional(),
  notional: MoneySchema.optional(),
  timeHorizon: z.string().optional(),
  /** Reference to the research note / IC memo motivating the trade. */
  rationaleRef: z.string(),
  status: TradeIntentStatusSchema.default('proposed'),
  /** Full status history — decisions must stay auditable. */
  statusHistory: z
    .array(
      z.object({
        status: TradeIntentStatusSchema,
        at: IsoTimestamp,
        by: z.string(),
        comment: z.string().optional(),
      }),
    )
    .default([]),
});
export type TradeIntent = z.infer<typeof TradeIntentSchema>;
