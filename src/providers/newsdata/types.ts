/**
 * Raw NewsData.io API (path v1, /api/1/) response shapes, derived strictly
 * from the documented response fields in
 * docs/research/providers/newsdata.json (official docs:
 * https://newsdata.io/documentation; machine-readable spec:
 * https://newsdata.io/openapi.json).
 *
 * Notes from the docs:
 *  - Success envelope: { status: "success", totalResults, results[], nextPage }.
 *  - `nextPage` is an opaque cursor (null when exhausted) passed back as the
 *    `page` query parameter.
 *  - `pubDate` is "YYYY-MM-DD HH:MM:SS"; `pubDateTZ` names the timezone the
 *    payload was rendered in (UTC unless a `timezone` request param is sent —
 *    this adapter never sends one).
 *  - Several article fields are plan-gated (content, sentiment,
 *    sentiment_stats, ai_tag, ai_region, ai_org, ai_summary) and may be
 *    absent or null depending on the account's plan.
 */

/**
 * Documented error envelope:
 * { "status": "error", "results": { "message": "...", "code": "<ErrorCode>" } }
 * Per the official spec, `results` is oneOf ErrorDetail | InvalidFilterDetail
 * | InvalidFilterDetail[]. The InvalidFilterDetail variant adds invalid_*
 * fields and a suggestion[] array; those are carried by the index signature.
 */
export interface NewsDataErrorDetail {
  message?: string;
  code?: string;
  [key: string]: unknown;
}

export interface NewsDataErrorEnvelope {
  status: 'error';
  results: NewsDataErrorDetail | NewsDataErrorDetail[];
}

/**
 * One entry of `results[]` on /1/latest and /1/archive (Article object).
 * Per the official spec only `article_id` is required — every other field
 * (including title and link) is nullable/omittable.
 */
export interface NewsDataArticle {
  article_id: string;
  link?: string | null;
  title?: string | null;
  description?: string | null;
  /** Plan-gated (full-content access). */
  content?: string | null;
  keywords?: string[] | null;
  creator?: string[] | null;
  language?: string | null;
  country?: string[] | null;
  category?: string[] | null;
  /** news | blog | multimedia | ... (data from 2025-11-28 onward). */
  datatype?: string | null;
  /** "YYYY-MM-DD HH:MM:SS" in the timezone named by pubDateTZ. */
  pubDate?: string | null;
  /** Timezone of pubDate; "UTC" unless a timezone request param was sent. */
  pubDateTZ?: string | null;
  /** Collection time (added 2025-12-19); enables latency measurement. */
  fetched_at?: string | null;
  image_url?: string | null;
  video_url?: string | null;
  source_id?: string | null;
  source_name?: string | null;
  source_priority?: number | null;
  source_url?: string | null;
  source_icon?: string | null;
  /** Plan-gated (Professional/Corporate): "positive" | "neutral" | "negative". */
  sentiment?: string | null;
  /** Plan-gated: per-label sentiment probabilities/stats (or a plan-notice string). */
  sentiment_stats?: Record<string, number> | string | null;
  /** Plan-gated AI enrichment fields. */
  ai_tag?: string[] | string | null;
  ai_region?: string[] | string | null;
  ai_org?: string[] | string | null;
  ai_summary?: string | null;
  duplicate?: boolean | null;
}

/**
 * GET /1/latest and GET /1/archive success response.
 * Fixture files add a top-level "_fixture" annotation key; keys starting
 * with "_" are never read by the adapter.
 */
export interface NewsDataNewsResponse {
  status: string;
  totalResults?: number;
  results: NewsDataArticle[];
  nextPage?: string | null;
  [key: `_${string}`]: unknown;
}
