# FRED (Federal Reserve Bank of St. Louis)

- **Official docs:** https://fred.stlouisfed.org/docs/api/fred/
- **Docs review date:** 2026-07-17 (reviewed via Internet Archive captures of the official docs; the live site blocked the research environment — re-verify against live pages at sign-off)
- **API version:** v1 (`fred/*`, serves both FRED and ALFRED); a v2 exists only for bulk release observations and is not used by this adapter
- **Base URL:** `https://api.stlouisfed.org/fred/`
- **Auth:** query parameter `api_key` (env var `FRED_API_KEY`), plus `file_type=json` on every request
- **Adapter:** `src/providers/fred/adapter.ts` (`FredAdapter`, implements `MacroSeriesSource`)
- **Research record:** [docs/research/providers/fred.json](../research/providers/fred.json)

## Verified capabilities

| Operation | Endpoint(s) | Freshness | Notes |
| --- | --- | --- | --- |
| `macro.series` (`getMacroSeries`) | `GET /fred/series` + `GET /fred/series/observations` | eod | Series metadata + observations. `vintage: "latest"` uses FRED default realtime (today's best-known values); `vintage: "point_in_time"` requests the full ALFRED realtime range (`1776-07-04`..`9999-12-31`) and maps each observation's `realtime_start`/`realtime_end` vintage window onto the output. Missing observations (`"."`) become `value: null`. Observations follow the documented `limit`+`offset` pagination (page cap 100,000) until the echoed `count` is reached — long vintage ranges are never silently truncated (a `paginate_observations` lineage step records multi-page fetches). |
| `macro.series_search` (`searchMacroSeries`) | `GET /fred/series/search` | eod | Full-text search; `limit` clamped to the documented 1–1000 cap. |

Health probe (`pi doctor --live`): one `GET /fred/series?series_id=GNPCA` request.

## Freshness & history

- Macro data updated when source agencies publish/revise; highest native frequency is **daily**. No intraday or real-time market data — everything is stamped `eod`.
- Historical depth varies per series (e.g. GNPCA from 1929); each series carries `observation_start`/`observation_end` metadata.
- Data is heavily **revised**: any backtest or point-in-time analysis must use `vintage: "point_in_time"` (ALFRED realtime windows) or it will suffer look-ahead bias.

## Rate limits & plans

- Single **free** tier; no paid plans, no plan-gated capabilities.
- **No numeric rate limit is published** — the API returns HTTP 429 on breach ("contact us to exceed"). The adapter self-throttles conservatively at **2 requests/second** and backs off on 429.
- Documented status codes: 400, 404, 423 (unexplained), 429, 500. JSON error envelope: `{ "error_code", "error_message" }`.

## Entitlements

- Free registered API key (fredaccount.stlouisfed.org) unlocks the entire surface.
- Policy: one distinct API key **per application**, and every end user of an application must use their own key.

## Licensing / attribution / storage (CRITICAL)

- **No store / no cache / no archive:** FRED terms prohibit storing, caching, or archiving FRED content, and incorporating it into any database, without written permission. This adapter performs **no persistent caching** (DiskCache is not used anywhere); `cacheHit` is always `false`. Resolve with counsel before building any FRED-backed persistence.
- **Mandatory attribution** (exported as `FRED_ATTRIBUTION` from the adapter, must appear on any application/report using this data):
  > This product uses the FRED API but is not endorsed or certified by the Federal Reserve Bank of St. Louis.
- Displayed data must also cite the original source via FRED (e.g. "Source: BLS via FRED").
- **Per-series copyright tiers:** "Copyrighted: Pre-approval required" series may not be used commercially without the owner's permission; "Citation required" and "Public Domain: Citation requested" series allow internal commercial use with attribution. Check series `notes` / the `cc` tag group before client-facing use.
- Redistribution of third-party proprietary content is prohibited; do not use FRED/ALFRED/Federal Reserve Bank in hostnames or replicate the FRED user experience.

## Known limitations

- Observation values arrive as numeric strings; missing values are the string `"."` (mapped to `null`; any other non-numeric value raises `DataQualityError`).
- Macro release lag: data follows source-agency schedules; never present FRED values as real-time market data.
- Discontinued series remain in the database (title suffix "(DISCONTINUED)").
- No SLA; the Bank may change, limit, or terminate access at any time; HTTP 423 is documented but unexplained.

## Institutional use

- **PRIMARY** for: US + international macro series (GDP, CPI, employment, rates, credit spreads, FX reference rates), point-in-time (ALFRED) vintage data for revision-safe backtesting, macro series discovery.
- **FALLBACK** for: selected daily financial series when a licensed market-data provider is unavailable (subject to per-series copyright checks).
- Never a source for: intraday/real-time market data, equities/derivatives/crypto market data, fundamentals.
