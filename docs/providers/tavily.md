# Tavily

- **Official docs:** https://docs.tavily.com
- **Docs review date:** 2026-07-17
- **API version:** unversioned (no version segment in URLs; changes announced via dated changelog only; `fast`/`ultra-fast` search depths are BETA)
- **Base URL:** `https://api.tavily.com`
- **Auth:** `Authorization: Bearer <key>` header (env var `TAVILY_API_KEY`)
- **Adapter:** `src/providers/tavily/adapter.ts` (`TavilyAdapter`, implements `WebSearchSource`, `NewsSource`)
- **Research record:** [docs/research/providers/tavily.json](../research/providers/tavily.json)

Tavily is a web search / content-extraction / research API optimized for LLM agents. It is **not a market-data provider and not a licensed news feed** — it serves live web pages, snippets, and web-derived answers. Nothing from Tavily may be presented as exchange or vendor market data.

## Verified capabilities

| Operation | Endpoint | Freshness | Notes |
| --- | --- | --- | --- |
| `search.web` (`webSearch`) | `POST /search` | realtime (live web retrieval) | `depth` maps to documented `search_depth` (`basic` = 1 credit, `advanced` = 2 credits); `max_results` clamped to the documented 0–20 range. `include_answer` sent only when `includeAnswer=true`; the returned `answer` is **LLM-generated** and surfaced only as `syntheticAnswer` (model output, never a primary source). Batches are stamped quality `["unverified"]` — web-derived snippets require source vetting. |
| `news.search` (`getNews`) | `POST /search` with `topic: "news"` | realtime (live web retrieval) | **FALLBACK news discovery only.** `from`/`to` normalized to the documented `start_date`/`end_date` (`YYYY-MM-DD`). Results map to `NewsItem` with `id = url` (no provider-native article id) and `publishedAt` from `published_date` when present and parseable (field appears with `topic=news` only; its format is undocumented, so unparseable dates are dropped rather than fabricated). Batches are stamped quality `["incomplete"]` because this is web-derived discovery over an index with no documented coverage guarantee — **not a licensed news feed**. `language` has no Tavily equivalent and is ignored; `category` is folded into the free-text query (no category filter exists). |

Health probe (`pi doctor --live`): one `POST /search` with `search_depth: "basic"`, `max_results: 0` (1 credit, minimal quota).

## Freshness & history

- "Real-time" means **live web retrieval at request time** — never exchange-grade real-time market data.
- Recency is controllable via `time_range` / `start_date` / `end_date` and `topic=news`.
- **No documented index-depth guarantee**; how publish/update dates are derived is undocumented — date-filtered results may miss or misdate content.
- No pagination: `/search` caps at 20 results per request.

## Rate limits per plan

| Plan | Standard endpoints (incl. `/search`) | Other |
| --- | --- | --- |
| Development keys | 100 RPM | crawl 100 RPM; research creation 20 RPM; `/usage` 10 req/10 min |
| Production keys (paid plan or PAYGO required) | 1,000 RPM | crawl 100 RPM; research creation 20 RPM; `/usage` 10 req/10 min |
| Enterprise | custom (not documented) | custom |

- On breach: HTTP 429 with a `retry-after` header (seconds). The shared `HttpClient` honors it; the adapter self-throttles at **1.5 req/s sustained (90 RPM, burst 4)** — conservative against the Development limit.
- Documented error envelope: `{ "detail": { "error": "<string>" } }`. Status mapping: 429 → `RateLimitError`; 401 → `EntitlementError`; **432 (key/plan limit) and 433 (PayGo limit) → `EntitlementError`**; other 4xx/5xx → `HttpError`.

## Entitlements

- Plans are credit-based: Researcher (free, 1,000 credits/mo), Project ($30/4k), Bootstrap ($100/15k), Startup ($220/38k), Growth ($500/100k), PAYGO ($0.008/credit), Enterprise (custom).
- Production API keys require an active paid plan or PAYGO enabled.
- Enterprise-only: `safe_search`, key-management API, `/org-usage`, SLAs, custom rate limits.

## Licensing / attribution / storage

- **Redistribution prohibited:** ToS §3.2(ii) forbids sublicensing/reselling/distributing the Services; the API grant is non-transferable and non-sublicensable (§2). Internal research use only.
- **Storage/caching:** not explicitly addressed in the ToS; long-term storage or redistribution of retrieved third-party web content is an open legal question (underlying content carries its own copyright). The adapter performs **no persistent caching** (`cacheHit` always `false`).
- **Attribution:** none required for search results.
- Vendor states zero data retention and SOC 2 certification.

## Known limitations

- Not a market-data provider: no quotes, OHLCV, fundamentals, reference data, or identifiers — unsuitable as any pricing/valuation source.
- Result `content` is snippet/chunk text with a relevance `score`; source authority varies — vet before institutional use (hence `unverified`).
- The `answer` field is LLM-generated (hallucination risk) — always labeled `syntheticAnswer`.
- `published_date` on news results is undocumented in format and provenance; treat news timestamps as best-effort.
- No API versioning or deprecation policy — behavior pinned via this adapter's fixture tests.
- `country` prioritizes rather than strictly filters by geography.

## Institutional use

- **PRIMARY** for: qualitative web research and event/controversy scanning (`webSearch`), news discovery with time filters, document/web content retrieval for research pipelines.
- **FALLBACK** for: breaking-news awareness when the licensed feed (NewsData) is unavailable (`getNews`, registry priority 30, quality `incomplete`).
- Never a source for: real-time/delayed quotes, historical prices, fundamentals, reference data — or anything redistributed to clients without an independent content-licensing review.
