---
name: news
description: >-
  Asset-scoped market news and sentiment. Handles: fetching news items for a specific token, perp
  coin, or stock ticker and forming a bullish/bearish read, plus a web fallback chain for macro or
  uncovered topics. Call it FIRST for any market/asset news, catalyst, or sentiment question. NOT
  for: numeric macro indicators like CPI, yields, VIX (use macros); event odds and market-implied
  probabilities (use prediction); general web lookups or topics NewsData does not cover (use
  web-search).
allowed-tools: bash read
---

# News

Fetch headlines **directly** from **NewsData.io** (reading the key from `.env`), then form your
own sentiment read. Endpoints below; full auth details live in `docs/inlined-provider-apis.md`.

## When to use

- Need headlines, catalysts, or sentiment for a specific token, perp coin, or stock.
- Need macro or commodity news narrative — use the web fallback chain below.
- NOT for numeric macro indicators (CPI, yields, VIX, DXY) — use `macros`.
- NOT for event odds or market-implied probabilities — use `prediction`.
- NOT for general non-asset web questions or reading one known URL — use `web-search`.
- NOT for source-backed deep research on protocols or companies — use `research-analyst`.

## Data source

These keys come from the environment — the same names the `src/common/Env.ts` constants
read (`process.env.*`), loaded from `.env`. Reference them directly by name in the calls below. In a bare shell, load them once with
`set -a; . ./.env; set +a`.

NewsData.io — `https://newsdata.io`, key as a query param.

Endpoints (query: `apikey=$NEWSDATAIO_API_KEY`, `qInTitle=<terms>`, `removeduplicate=1`, optional
`language=en`):

- `GET /api/1/crypto` — crypto news.
- `GET /api/1/latest` — latest headlines.
- `GET /api/1/market` — market news.

## Resolve the query terms

NewsData searches by title terms, so scope with the asset's name/ticker rather than an address:

- Token/coin → asset name + ticker (e.g. `PEPE`), on `/api/1/crypto`.
- Perp → the coin symbol; drop any dex prefix for the search (`<dex>:MSFT` → `MSFT`).
- Stock → the ticker and/or company name (`NVDA` / `Nvidia`), on `/api/1/market` or `/api/1/latest`.

## Rules

1. Reference each key from the environment (`.env`, exposed as the `src/common/Env.ts` constants) — e.g. `$BIRDEYE_API_KEY`. Never hardcode a key.
2. Derive sentiment yourself and use the vocabulary `bullish | bearish | neutral | unknown`.
   Wrong: `"positive"`. Right: `"bullish"`.
3. The user-facing answer is a plain-language summary (headline themes, net sentiment, trading
   implication) — never dumped JSON.
4. If NewsData returns nothing useful for the asset, switch to the web fallback chain.

## Examples

### Crypto news for one coin

```bash
curl -s "https://newsdata.io/api/1/crypto?apikey=$NEWSDATAIO_API_KEY&qInTitle=bitcoin&removeduplicate=1&language=en"
```

### Stock/market news for a ticker

```bash
curl -s "https://newsdata.io/api/1/market?apikey=$NEWSDATAIO_API_KEY&qInTitle=NVDA&removeduplicate=1&language=en"
```

## Web fallback chain

Use when NewsData is exhausted (see Error recovery) or the topic has no good NewsData coverage
(macro, commodities, sector-wide themes).

1. Build one targeted query and reuse it across sources:
   - Stock/perp: ticker + company name + catalysts (`earnings`, `guidance`, `analyst`, `demand`).
   - Crypto: asset name + ticker + (`ETF`, `flows`, `regulation`, `hack`, `liquidations`).
   - Macro/commodities: asset + (`Fed`, `rates`, `inflation`, `OPEC`, `EIA`, `central bank`).
2. Run it through `web-search` first; cross-check with free feeds (Google News RSS, Yahoo
   Finance RSS, SEC/issuer feeds, CoinDesk/Cointelegraph RSS for crypto).
3. IF HTTP fetch is blocked (401/403/406/429, challenge page, empty JS-rendered HTML) → use the
   `browser` skill; it owns the playwright setup. NEVER bypass paywalls or CAPTCHAs.
4. Keep only headlines, URLs, source names, timestamps, snippets, and your sentiment read.

## Error recovery

| Symptom                                   | Action                                                                        |
| ----------------------------------------- | ----------------------------------------------------------------------------- |
| 401 / 403 / "Invalid API key"             | The `NEWSDATAIO_API_KEY` in `.env` is missing/invalid — check it, then retry. |
| 429 / 5xx (rate limit or outage)          | Wait briefly, retry once; if it still fails, switch to the web fallback.      |
| Empty results for the asset               | Broaden `qInTitle`, try `/api/1/latest`, else switch to the web fallback.     |

## Related skills

- `macros` — numeric macro indicators; this skill covers the macro narrative side only.
- `prediction` — event odds and market-implied probabilities.
- `web-search` — general web search and the first hop of the fallback chain.
- `browser` — JS-gated or fetch-blocked pages during fallback.
- `strategize` — consumes this skill's output for full market briefings.
