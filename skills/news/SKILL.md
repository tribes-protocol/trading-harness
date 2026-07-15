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
- Need macro or commodity news narrative — no CLI kind exists; use the web fallback chain below.
- NOT for numeric macro indicators (CPI, yields, VIX, DXY) — use `macros`.
- NOT for event odds or market-implied probabilities — use `prediction`.
- NOT for general non-asset web questions or reading one known URL — use `web-search`.
- NOT for source-backed deep research on protocols or companies — use `research-analyst`.

## Hard rules

1. MUST set a bash timeout of at least 120 seconds for every `tribes-cli news fetch` call
   (prefer 300 — the CLI polls every 30s with up to 10 retries, so worst case is ~300s).
2. Prefer `tribes-cli news fetch` for the primary path. Only call NewsData.io directly when the
   CLI fails — via the **NewsData.io fallback** section below (read the key from `.env`, never hardcode).
3. Sentiment values in CLI output are `bullish | bearish | neutral | unknown` — use this
   vocabulary in your own notes. Wrong: `"sentiment": "positive"`. Right: `"sentiment": "bullish"`.
4. Raw JSON is internal working material — the user-facing answer MUST be a plain-language
   summary (headline themes, net sentiment, trading implication), never dumped JSON.

## Command reference

| Subcommand | Purpose                                      | Required flags                                                                                    | Read-only or signed |
| ---------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------- | ------------------- |
| `fetch`    | Fetch asset news, poll while still analyzing | `--kind token\|perp\|stock`; token: `--chain-id`, `--token-id`; perp: `--coin`; stock: `--ticker` | read-only           |

Optional flags: `--cursor <cursor>` (pagination — pass the cursor from the previous response to
page further), `--out <file>` (write the JSON to a file, then Read it — use for long payloads).

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

## NewsData.io fallback (direct API)

When `tribes-cli news fetch` fails (backend 5xx/timeout, or `command not found`), hit the same
source — **NewsData.io** — directly. Read the key from `.env` (never hardcode). This returns raw
articles with **no** sentiment scoring, so derive the bullish/bearish read yourself.

- **Endpoint by kind:** perp/token → `GET https://newsdata.io/api/1/crypto`; stock →
  `GET https://newsdata.io/api/1/market`; macro/uncovered → `GET https://newsdata.io/api/1/latest`.
- **`qInTitle` mapping:** perp → the coin (`BTC`); stock → company + ticker (`Nvidia NVDA`);
  token → the resolved symbol (`PEPE`), not the address.
- **Params:** `apikey=$NEWSDATAIO_API_KEY`, `qInTitle=<terms>`, `removeduplicate=1`, `language=en`.
- Keep only `title`, `link`, `pubDate` from each `results[]` item.

```bash
NEWSDATAIO_API_KEY=$(grep -E '^NEWSDATAIO_API_KEY=' .env | cut -d= -f2-)
# stock example (NVDA): use /api/1/crypto with qInTitle=<coin> for perp/token instead
curl -s "https://newsdata.io/api/1/market?apikey=$NEWSDATAIO_API_KEY&qInTitle=Nvidia%20NVDA&removeduplicate=1&language=en" \
  | jq -r '.results[]? | "\(.pubDate)  \(.title)  \(.link)"'
```

If NewsData.io also fails or returns nothing useful, drop to the web fallback chain below.

## Web fallback chain

Use when the CLI path and the NewsData.io fallback are exhausted, or the topic has no CLI kind
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

| Symptom                                                                 | Action                                                                         |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Auth error (unauthorized, expired token)                                | Run `tribes-cli login`, retry the original command once, then stop and report. |
| Non-auth API failure (5xx, network error)                               | Retry once; if it fails again, use the NewsData.io fallback, then the web fallback. |
| Bash timeout, or empty/`unknown`-only items after the CLI's own retries | Use the NewsData.io fallback; if still empty, the web fallback chain.           |
| `command not found: tribes-cli`                                         | Run `sh bootstrap.sh`, then retry; if it still fails, use the NewsData.io fallback. |

## Related skills

- `macros` — numeric macro indicators; this skill covers the macro narrative side only.
- `prediction` — event odds and market-implied probabilities.
- `web-search` — general web search and the first hop of the fallback chain.
- `browser` — JS-gated or fetch-blocked pages during fallback.
- `spot-trading` — documents `tribes-cli token search` (symbol → chainId + address).
- `strategize` — consumes this skill's output for full market briefings.
