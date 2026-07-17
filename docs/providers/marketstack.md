# Marketstack

- **Official docs:** https://docs.apilayer.com/marketstack/docs/api-documentation
- **Docs review date:** 2026-07-17
- **API version:** v2 (`https://api.marketstack.com/v2`) — v1 is deprecated for use after 2025-06-30; this adapter is v2-only.
- **Auth:** HTTPS GET query parameter `access_key`; the key is read from the `MARKETSTACK_API_KEY` environment variable (never hardcoded, never logged).
- **Adapter:** `src/providers/marketstack/adapter.ts` (`MarketstackAdapter`)
- **Research record:** [`docs/research/providers/marketstack.json`](../research/providers/marketstack.json)

## Verified capabilities

| Platform operation | Endpoint(s) | Freshness | Quality flags | Notes |
|---|---|---|---|---|
| `market.quote` | `GET /eod/latest` | `eod` | `eod` | Quote = latest **end-of-day** record (raw close). NEVER real-time. |
| `market.daily_bars` | `GET /eod` | `eod` | `eod`, `adjusted` | Uses CRSP split+dividend adjusted `adj_*` fields when present on every bar (`adjustment: split_dividend_adjusted`); falls back to raw OHLC (`adjustment: raw`) otherwise. Mapping recorded in lineage. Offset pagination (limit ≤ 1000). |
| `market.intraday_bars` | `GET /intraday` | `delayed` | `delayed` (+`incomplete` if NULL bars dropped) | **US/IEX universe only**, polled REST — not consolidated tape. Intervals: 1m/5m/15m/30m/1h (`1min`…`1hour`). Symbols with periods are hyphenated for this endpoint per the documented convention (`BRK.B` → `BRK-B`). Offset pagination (limit ≤ 1000) up to the documented 10,000-bar rolling window. |
| `market.corporate_actions` | `GET /splits` + `GET /dividends` | `eod` | `eod` | `split_factor` → `splitFactor`, `dividend` → `amount`. Dividend currency is not documented and is omitted. US-listed venues (NASDAQ, PINK, SHG, NYSE, NYSE ARCA, OTCQB, BATS). Offset pagination on both endpoints — long dividend histories are drained, not truncated at one page. |
| `market.exchanges` | `GET /exchanges` | `eod` (reference data, per registry) | — | Name/MIC/country mapped; timezone & currency are not documented v2 fields and are omitted. |

Live health probe (`pi doctor --live`): exactly one minimal-quota request, `GET /exchanges?limit=1`.

## Freshness & history

- **EOD:** updated daily; adjusted prices follow CRSP methodology. Intraday closes differ from official auction-based EOD closes.
- **EOD history:** plan-gated — Free 1y, Basic 10y, Professional+ 15+y (FAQ markets "30 years"; discrepancy unresolved in official sources).
- **Intraday:** IEX universe only; rolling window of the last 10,000 bars per interval; sub-15min intervals require Professional+. Since IEX's 2025-02-01 policy change, `bid/ask/last/mid/size` fields are **NULL** without a direct IEX market data agreement — the adapter tolerates the NULLs and never uses those fields; `marketstack_last` is a derived reference price and is not used for bars.

## Rate limits

| Plan | Limit |
|---|---|
| All plans | 5 requests/second global (adapter throttles to ~4 rps); `/commodities` and `/companyratings` 1 call/minute (not used by this adapter) |
| Free | 100 requests/month |
| Basic | 10,000 requests/month (+ per-request overage) |
| Professional | 100,000 requests/month (+ per-request overage) |
| Business | 500,000 requests/month (+ per-request overage) |
| Enterprise | custom |

Request accounting: each symbol looked up consumes one request; API errors are not counted; ETF endpoints carry a 20x multiplier (not used here). No `Retry-After`/backoff guidance is documented — the shared HttpClient applies bounded exponential backoff.

## Entitlements

- Intraday (≥15min): Basic+; sub-15min intervals: Professional+.
- `/stockprice` real-time prices, commodities: Professional+ (not used by this adapter).
- EDGAR/company data, ratings: Business+ (not used by this adapter).
- **Commercial use is a paid-tier feature only** — the Free tier carries no documented commercial-use right.

## Licensing / attribution / storage

- US stock data is licensed/sourced from **Tiingo, Inc.**; IEX passthrough fields require a direct IEX agreement (see above).
- **Attribution:** none documented.
- **Storage/caching/redistribution:** not addressed in the developer docs; governing terms live in the Idera/APILayer Master SaaS Agreement. Treat as **internal-use only**; confirm the Master SaaS Agreement (and Tiingo/IEX passthrough terms) before persisting or re-serving data.
- Derived intraday prices (`marketstack_last`) must never be presented as consolidated real-time or exchange-official prices.

## Known limitations

- EOD is the core dataset; the platform quote from this provider is the latest EOD record — flagged `eod`, never real-time.
- Intraday is US/IEX-only, polled (no streaming), 10,000-bar rolling window — unsuitable for deep intraday backtests.
- Splits/dividends coverage is documented for US-listed venues only.
- LSE (XLON) prices may be quoted in GBX pence; the adapter preserves the reported `price_currency` (e.g. `GBX`) without conversion. `price_currency` is documented as a lower-case ISO code and is uppercased to the platform currency convention (disclosed in lineage).
- Vendor coverage figures conflict across official pages (125k+/170k+/500k+ tickers; 30+/70/72+ exchanges) — treat as marketing-grade.
- No options, futures, FX-rate, or crypto datasets.

## Institutional use

- **PRIMARY:** global equity/ETF/index EOD history (CRSP-adjusted), corporate actions (US venues), symbology enrichment, exchange reference data.
- **FALLBACK:** US intraday/near-real-time indication (IEX-derived, delayed/polled) — never a primary real-time feed.
- **NOT SUITABLE:** consolidated-tape real-time display, streaming architectures, options/futures/FX/crypto.
