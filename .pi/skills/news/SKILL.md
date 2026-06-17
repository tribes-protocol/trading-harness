---
name: news
description: API-backed market news and sentiment retrieval for trading research. Use whenever evaluating catalysts, macro context, or event-driven sentiment for token, perp, and stock assets.
allowed-tools: bash read
---

# News

Use this skill whenever trading decisions need current news, catalysts, macro context, sentiment, or event-driven analysis.

## Setup

From this skill directory (`skills/news`):

```bash
bun install
bun run build
```

Requires `API_BASE_URL` in the environment (or harness `.env` loaded in the shell before invoking the CLI).

## Core rule

Use the local news CLI as the default path. It calls the API, retries while analysis is in-flight, and keeps polling until sentiment is no longer unknown (or retry budget is exhausted).

If the CLI/API path is unavailable, switch to fallback web collection from public pages and feeds.

For fallback mode:

1. Build targeted queries:
   - Company/perp: ticker + company name + catalysts (`earnings`, `guidance`, `AI`, `antitrust`, `regulation`, `analyst`, `downgrade`, `supply`, `demand`).
   - Crypto: asset name + ticker + (`ETF`, `flows`, `regulation`, `hack`, `staking`, `ecosystem`, `funding`, `liquidations`).
   - Macro/commodities: asset + (`Fed`, `dollar`, `rates`, `inflation`, `geopolitical`, `inventory`, `OPEC`, `EIA`, `central bank`).
2. Turn that targeted query into one reusable encoded search string, then use the same string across all fallback sources.
3. Use free/open sources as fallback and cross-check: Google News RSS, Yahoo Finance RSS, Nasdaq/SEC/issuer feeds when relevant, CoinDesk/Cointelegraph/Decrypt RSS for crypto, Federal Reserve/market calendar feeds for macro.
4. Use browser fallback when the CLI path fails and normal HTTP is blocked, empty, JS-rendered, or returns 401/403/406/429/challenge pages.
5. Store temporary raw/cached/analysis artifacts under `runtime/news/`; keep only headlines, URLs, snippets, source names, timestamps, sentiment, and query metadata.

## Quick command

From a harness root with this skill at `.pi/skills/news`, write artifacts under the harness `runtime/news/`:

```bash
bun .pi/skills/news/src/cli/News.ts fetch \
  --kind perp \
  --coin BTC \
  --out runtime/news/btc.json
```

Token example:

```bash
bun .pi/skills/news/src/cli/News.ts fetch \
  --kind token \
  --chain-id 1 \
  --token-id 0xA0b86991c6218b36c1d19d4a2e9eb0ce3606eb48 \
  --out runtime/news/usdc.json
```

Stock example:

```bash
bun .pi/skills/news/src/cli/News.ts fetch \
  --kind stock \
  --ticker NVDA \
  --out runtime/news/nvda.json
```

From this skill directory (`skills/news`), paths are relative to the skill dir:

```bash
bun src/cli/News.ts fetch --kind perp --coin BTC --out runtime/news/btc.json
```

Built CLI (after `bun run build`, run from skill directory):

```bash
node dist/cli/News.js fetch --kind perp --coin BTC --out runtime/news/btc.json
```

CLI behavior:

- Polls every 30 seconds.
- Uses up to 10 retries.
- Retries while response state is `analyzing`.
- Retries while any returned item has `sentiment: "unknown"`.
- Writes JSON output to `--out` when provided.

## Browser fallback

Use the `browser` skill only when the CLI path fails and normal HTTP cannot retrieve usable content. Verify a realistic user agent first. Example extraction:

```bash
QUERY='AMD earnings guidance AI chip demand'
ENCODED_QUERY="$(python3 -c "import urllib.parse; print(urllib.parse.quote('''$QUERY'''))")"

PLAYWRIGHT_MCP_USER_AGENT='Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' \
PLAYWRIGHT_MCP_VIEWPORT_SIZE=1365x768 \
playwright-cli -s=news-open open "https://news.google.com/search?q=${ENCODED_QUERY}%20when%3A2d&hl=en-US&gl=US&ceid=US%3Aen"

playwright-cli -s=news-open run-code "async ({ page }) => ({ ua: await page.evaluate(() => navigator.userAgent), title: await page.title(), headlines: await page.locator('article').evaluateAll(els => els.slice(0,10).map(e => e.innerText)) })"
```

Do not use browser fallback to bypass paywalls, CAPTCHAs, or access controls.

## Output format for analysis artifacts

Write JSON to `runtime/news/<timestamp-or-topic>.json`:

```json
{
  "generatedAt": "ISO-8601",
  "queries": ["AMD AI chips"],
  "sourcesUsed": ["news_cli", "browser_fallback"],
  "items": [
    {
      "title": "...",
      "url": "...",
      "source": "...",
      "publishedAt": "...",
      "snippet": "...",
      "sentiment": "positive",
      "symbols": ["xyz:AMD"]
    }
  ],
  "summary": [
    {
      "topic": "xyz:AMD",
      "sentiment": "positive",
      "confidence": 0.7,
      "rationale": ["..."],
      "tradingImplication": "..."
    }
  ]
}
```
