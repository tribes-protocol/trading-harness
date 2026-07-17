# NewsData.io

- **Official docs:** https://newsdata.io/documentation (machine-readable spec: https://newsdata.io/openapi.json)
- **Docs review date:** 2026-07-17
- **API version:** path v1 (all endpoints under `/api/1/`); no formal versioning policy — deprecations announced via the official changelog (~1 month notice precedent)
- **Base URL:** `https://newsdata.io/api/1`
- **Auth:** header `X-ACCESS-KEY` (env var `NEWSDATA_API_KEY`); the adapter uses the header form so the key never appears in URLs (the documented `apikey` query parameter alternative is not used)
- **Adapter:** `src/providers/newsdata/adapter.ts` (`NewsDataAdapter`, implements `NewsSource`)
- **Research record:** [docs/research/providers/newsdata.json](../research/providers/newsdata.json)

NEWS ONLY: this provider supplies no prices, quotes, fundamentals, or reference data.

## Verified capabilities

| Operation | Endpoint(s) | Freshness | Notes |
| --- | --- | --- | --- |
| `news.latest` / `news.search` (`getNews`, no `from`/`to`) | `GET /1/latest` | delayed | Rolling 48-hour window; `q`/`language`/`category` filters; 1 credit/page. Pagination via the documented `nextPage` → `page` opaque cursor, capped by `max` (default 50, hard cap 10,000). |
| `news.archive` (`getNews` with `from`/`to`) | `GET /1/archive` | historical | `from_date`/`to_date` (UTC); requires at least one content filter beside the dates (the adapter pre-validates this). Look-back depth is plan-gated (Basic 6mo / Professional 2y / Corporate 10y); **5 credits/page**. 403/422 map to `EntitlementError` with plan guidance. |

Health probe (`pi doctor --live`): one `GET /1/latest?size=1` request (1 credit).

Field mapping: `article_id` → `id` (provider-native id preserved verbatim), `link` → `url`, `source_name` → `sourceName`, `source_url` hostname → `sourceDomain`, `category[]` → `categories`, `pubDate` (+`pubDateTZ`) → `publishedAt` UTC ISO (lineage step recorded). Vendor 3-way `sentiment` (plan-gated) maps to `sentiment{method:"provider_model", evidenceType:"model_estimate"}` — model output, never observed fact. In the official schema only `article_id` is required (title/link are nullable): articles missing id/title/link are skipped and counted in lineage (`skippedIncomplete`), never fabricated; a non-UTC or unparseable `pubDate` omits `publishedAt` rather than guessing. Archive 401 (bad key) keeps the shared "check API key" error — only 403/422 get archive plan guidance.

## Freshness & history

- **Every batch is stamped `quality: ["delayed"]`** — free-tier articles are delayed 12 hours, and the vendor's Terms state real-time availability is **not guaranteed even on paid plans**. Never present NewsData output as real-time; measure actual collection latency via the `fetched_at` response field where it matters.
- `/1/latest` covers a rolling 48-hour window and takes no date bounds.
- `/1/archive`: historical corpus (~2016 onward per vendor); depth plan-gated — no free access, Basic 6 months, Professional 2 years, Corporate 10 years (custom ranges purchasable).
- AI/enrichment fields are date-gated regardless of plan: sentiment from 2024-01-12, ai_org from 2024-05-24, removeduplicate from 2024-07-24, datatype from 2025-11-28.
- No push delivery (webhooks/WebSocket/SSE) — polling only; WebSocket streaming announced "coming soon" (changelog 2026-06-23).

## Rate limits & plans

| Plan | Short window | Quota | Page size |
| --- | --- | --- | --- |
| Free ($0) | 30 credits / 15 min | 200 credits/day | 1–10 articles |
| Basic ($199.99/mo) | 1,800 credits / 15 min | 20,000 credits/month | 1–50 |
| Professional ($349.99/mo) | 1,800 credits / 15 min | 50,000 credits/month | 1–50 |
| Corporate ($1,299.99/mo) | 1,800 credits / 15 min | 1,000,000 credits/month | 1–50 |

- Credit accounting: 1 credit per `/latest` page, **5 per `/archive` page**, 50 per count-endpoint call (count endpoints not consumed by this adapter). Failed/zero-result requests are not counted per the vendor FAQ.
- On breach: HTTP 429, blocked until the 15-minute window resets. Response headers `X-RateLimit-Remaining` and `X-API-Limit-Remaining` are documented on 200 responses. `Retry-After` on 429 is described only in vendor llms.txt/SDKs, not the OpenAPI spec.
- The adapter self-throttles conservatively at **1 request/second (burst 5)** — half the documented paid sustained rate — and backs off on 429.
- The adapter only sends `size` when the requested `max` fits the free-plan 1–10 range (valid on every plan); otherwise `size` is omitted and the plan default (plan maximum) applies.

## Entitlements

- Plan-gated endpoints/params: archive + count endpoints, `timeframe`, full content, AI summary (paid); sentiment + `sentiment_score` + `tag` (Professional/Corporate); `region`/`organization` (Corporate).
- Free tier: 12-hour article delay; crypto/market endpoints limited to a 7-day window; no archive.
- The adapter maps `/1/archive` 403 (AccessDenied) and 422 (unsupported filter/date, e.g. beyond plan depth) to `EntitlementError` with plan guidance.

## Licensing / attribution / storage

- **Redistribution — unusually permissive with a copyright caveat:** the Terms explicitly allow customers to "sublicense, sell, syndicate or otherwise share the Data with any third party **on their own risk**", while simultaneously disclaiming ownership — article copyright remains with the original publishers. Full-content republication therefore requires downstream copyright clearance; prefer excerpt + `source_name` + link-back.
- **Storage/caching:** no restriction documented; vendor guidance actively recommends server-side caching. Long-term archival is not explicitly addressed.
- **Attribution:** not mandatory. Vendor best practice recommends displaying `source_name` and linking to the original article.
- Commercial use is permitted on the free tier per the vendor FAQ. Governing law: India (entity: NewsData.io/Bytesview; vendor-risk note for institutional due diligence).

## Known limitations

- News only — the `/1/market` endpoint is ticker-tagged **news**, not market data.
- Real-time delivery contractually best-effort even on paid plans; free tier delayed 12h — hence the blanket `delayed` quality flag.
- Symbol/coin tags (on endpoints not consumed here) are bare ticker strings with no exchange qualification or ISIN/FIGI — never join on bare symbols; map through the security master downstream.
- Vendor AI sentiment/tags have no documented accuracy metrics and incomplete historical backfill (date-gated fields).
- `sort=relevancy|source|fetched_at` result sets hard-capped at 10,000; archive sweeps are credit-expensive (5x).
- No public SLA/uptime commitment; no push delivery yet.
- Docs site is a client-side SPA; the authoritative machine-readable spec is `https://newsdata.io/openapi.json`.

## Institutional use

- **PRIMARY** for: broad multi-geography/multi-language news monitoring (200+ countries, ~89 languages, source-tier filtering), ticker-tagged equity/crypto news flow where seconds-level latency is not required, historical news corpus construction for NLP/backtesting (Corporate: 10-year archive).
- **FALLBACK** for: market-moving real-time news alerts (polling-only, uncommitted latency, no SLA) and sentiment signal generation (coarse 3-way vendor model — secondary/confirmation signal only).
- Never a source for: prices/quotes/reference/fundamental data, compliance-grade content audit trails, or sub-minute latency trading triggers.
