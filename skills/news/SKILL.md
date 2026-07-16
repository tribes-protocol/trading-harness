---
name: news
description: >-
  Asset-scoped market news and sentiment. Handles: fetching analyzed news items with
  bullish/bearish sentiment for a specific token, perp coin, or stock ticker, plus a web fallback
  chain for macro or uncovered topics. Call it FIRST for any market/asset news, catalyst, or
  sentiment question. NOT for: numeric macro indicators like CPI, yields, VIX (use macros); event
  odds and market-implied probabilities (use prediction); general web lookups or topics this news
  API does not cover (use web-search).
allowed-tools: bash read
---

# News

Backing command group: `tribes-cli news`. Fetches analyzed news items with sentiment for one
token, perp, or stock, polling the backend until analysis completes.
Requires: an auth token (run `tribes-cli login` once if commands fail with auth errors).

## When to use

- Need headlines, catalysts, or sentiment for a specific token, perp coin, or stock — run `fetch`.
- Need macro, commodity, or keyword-topic headlines fast — run `headlines` (NewsData.io-backed,
  seconds, no polling) before reaching for the web fallback chain.
- NOT for numeric macro indicators (CPI, yields, VIX, DXY) — use `macros`.
- NOT for event odds or market-implied probabilities — use `prediction`.
- NOT for general non-asset web questions or reading one known URL — use `web-search`.
- NOT for source-backed deep research on protocols or companies — use `research-analyst`.

## Hard rules

1. MUST set a bash timeout of at least 120 seconds for every `tribes-cli news fetch` call
   (prefer 300 — the CLI polls every 30s with up to 10 retries, so worst case is ~300s).
2. The CLI calls the API itself — NEVER call the endpoint or curl directly.
3. Sentiment values in CLI output are `bullish | bearish | neutral | unknown` — use this
   vocabulary in your own notes. Wrong: `"sentiment": "positive"`. Right: `"sentiment": "bullish"`.
4. Raw JSON is internal working material — the user-facing answer MUST be a plain-language
   summary (headline themes, net sentiment, trading implication), never dumped JSON.

## Command reference

| Subcommand  | Purpose                                        | Required flags                                                                                    | Read-only or signed |
| ----------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------- | ------------------- |
| `fetch`     | Fetch asset news, poll while still analyzing   | `--kind token\|perp\|stock`; token: `--chain-id`, `--token-id`; perp: `--coin`; stock: `--ticker` | read-only           |
| `headlines` | Fast raw headlines (crypto, business, keyword) | one of `--query` / `--coin` / `--category`                                                        | read-only           |

`fetch` optional flags: `--cursor <cursor>` (pagination — pass the cursor from the previous
response to page further), `--out <file>` (write the JSON to a file, then Read it).

`headlines` optional flags: `--coin btc,eth` (≤5, routes to the crypto feed; not combinable with
`--category`/`--country`), `--category business,technology` (≤5), `--country us,gb` (≤5),
`--language en`, `--timeframe <1-48 hours>`, `--size <1-50>`, `--page <token from next_page>`,
`--out <file>`. Items are raw headlines with provider sentiment (`positive|negative|neutral` or
null) — NOT the analyzed bullish/bearish sentiment `fetch` produces; treat it as leads, and run
`fetch` when you need analyzed per-asset sentiment.

## Resolve the asset before calling fetch

- IF kind is token → you need the exact `chainId` + `tokenId` (address/mint). Resolve a bare
  symbol with `tribes-cli token search --query PEPE` (documented in `spot-trading`) and take
  `chainId` and the token address from the top match.
- IF kind is perp → use the exact coin symbol; keep any dex prefix (e.g. `<dex>:MSFT`). Confirm it
  with `tribes-cli hyperliquid list-assets --dex <name>` (`hyperliquid` skill) when unsure.
- IF kind is stock → uppercase the ticker and trim whitespace (Nvidia → `NVDA`).
- IF several assets plausibly match → ask one short, non-technical question, e.g. "There are a
  few tokens called PEPE — do you mean the big one on Ethereum?"

## Examples

### Perp news

```bash
tribes-cli news fetch \
  --kind perp \
  --coin BTC
```

Output is JSON on stdout: items (title, url, source, publishedAt, sentiment) plus a cursor.

### Token news (exact chain + address required)

```bash
tribes-cli news fetch \
  --kind token \
  --chain-id 1 \
  --token-id 0xA0b86991c6218b36c1d19d4a2e9eb0ce3606eb48
```

### Stock news, next page, written to a file

```bash
tribes-cli news fetch \
  --kind stock \
  --ticker NVDA \
  --cursor eyJwYWdlIjoyfQ \
  --out /tmp/nvda-news.json
```

### Fast headlines for macro / commodities / keyword topics

```bash
tribes-cli news headlines --query "OPEC production cut" --category business --size 10
tribes-cli news headlines --coin btc,eth --size 10
```

Sentiment rule 3 applies only to `fetch`; `headlines` sentiment is the provider's
`positive|negative|neutral` (or null) and is a lead, not an analyzed signal.

## Web fallback chain

Use only when both CLI paths are exhausted (see Error recovery) — `headlines` first for macro,
commodities, and sector-wide themes; then the web chain below.

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

| Symptom                                                                 | Action                                                                                  |
| ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Auth error (unauthorized, expired token)                                | Run `tribes-cli login`, retry the original command once, then stop and report.          |
| Non-auth API failure (5xx, network error)                               | Retry the same command once; if it fails again, try `headlines`, then the web fallback. |
| Bash timeout, or empty/`unknown`-only items after the CLI's own retries | Try `headlines` for the same asset/topic, then the web fallback chain.                  |
| `headlines` says NEWSDATAIO_API_KEY is not set                          | Skip straight to the web fallback chain.                                                |
| `command not found: tribes-cli`                                         | Run `sh bootstrap.sh` from the harness root, then retry.                                |

## Related skills

- `macros` — numeric macro indicators; this skill covers the macro narrative side only.
- `prediction` — event odds and market-implied probabilities.
- `web-search` — general web search and the first hop of the fallback chain.
- `browser` — JS-gated or fetch-blocked pages during fallback.
- `spot-trading` — documents `tribes-cli token search` (symbol → chainId + address).
- `strategize` — consumes this skill's output for full market briefings.
