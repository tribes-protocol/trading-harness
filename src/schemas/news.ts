import { z } from 'zod';
import { EvidenceTypeSchema, IsoTimestamp, SourcedSchema } from './common.js';

/** News and event data. Sentiment is always labeled as a model estimate. */

export const NewsItemSchema = z.object({
  /** Provider-native article id when available, else the URL. */
  id: z.string().min(1),
  title: z.string().min(1),
  url: z.string().url(),
  sourceName: z.string().optional(),
  sourceDomain: z.string().optional(),
  publishedAt: IsoTimestamp.optional(),
  language: z.string().optional(),
  categories: z.array(z.string()).default([]),
  /** Tickers/entities as tagged by the provider — not verified mappings. */
  taggedInstruments: z.array(z.string()).default([]),
  description: z.string().optional(),
  sentiment: z
    .object({
      label: z.enum(['positive', 'negative', 'neutral']),
      score: z.number().min(-1).max(1).optional(),
      method: z.string(),
      evidenceType: EvidenceTypeSchema.default('model_estimate'),
    })
    .optional(),
});
export type NewsItem = z.infer<typeof NewsItemSchema>;

export const NewsBatchSchema = SourcedSchema.extend({
  query: z.record(z.unknown()).default({}),
  items: z.array(NewsItemSchema),
  totalAvailable: z.number().int().optional(),
});
export type NewsBatch = z.infer<typeof NewsBatchSchema>;

/** Generic web-search results (e.g. Tavily) used by research agents. */
export const SearchResultSchema = z.object({
  title: z.string(),
  url: z.string().url(),
  snippet: z.string().optional(),
  score: z.number().optional(),
  publishedAt: IsoTimestamp.optional(),
});
export type SearchResult = z.infer<typeof SearchResultSchema>;

export const SearchBatchSchema = SourcedSchema.extend({
  query: z.string(),
  results: z.array(SearchResultSchema),
  /** Provider-synthesized answer, if requested — treat as model output. */
  syntheticAnswer: z.string().optional(),
});
export type SearchBatch = z.infer<typeof SearchBatchSchema>;
