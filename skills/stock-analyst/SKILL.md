---
name: stock-analyst
description: >-
  Expert on stock market DATA. Handles: real-time/latest prices, OHLCV candles (intraday and
  end-of-day), ticker search and details. Call for any stock/equity data question. NOT for:
  indicator values, signals, or backtests (use technical-analyst); stock news and sentiment
  (use news); executing stock trades (use hyperliquid — stocks are Hyperliquid perps); crypto
  movers or rankings (use market-strategist).
allowed-tools: bash read
---

# Stock Analyst

Answer by calling **Marketstack** directly, reading the key from `.env`. Endpoints below; full
auth details live in `docs/inlined-provider-apis.md`.

> The former `tribes-cli stock-analyst ask` backend proxy is **deprecated** — the backend is being
> retired. Run the pulls yourself.

## When to use

- Latest price/quote, or intraday/EOD candles, for a stock ticker.
- Ticker search or ticker details (name, exchange).
- NOT for indicator values, signals, backtests, or any indicator math — use `technical-analyst`.
- NOT for stock news, catalysts, or sentiment — use `news`.
- NOT for placing or sizing stock trades — use `hyperliquid` (stocks are Hyperliquid perps).
- NOT for crypto movers or market-wide crypto data — use `market-strategist`.

## Data source

These keys come from the environment — the same names the `src/common/Env.ts` constants
read (`process.env.*`), loaded from `.env`. Reference them directly by name in the calls below. In a bare shell, load them once with
`set -a; . ./.env; set +a`.

Marketstack — `https://api.marketstack.com`, key as a query param.

Endpoints (all take `access_key=$MARKETSTACK_API_KEY`):

- Search/details: `/v2/tickerslist?search=<name>`, `/v2/tickers/{ticker}`.
- Price/quote: `/v2/stockprice?ticker=<TICKER>`, `/v2/eod/latest?symbols=<TICKER>`,
  `/v2/intraday/latest?symbols=<TICKER>`.
- Candles: `/v2/eod?symbols=&date_from=&date_to=&sort=DESC&limit=`,
  `/v2/intraday?symbols=&interval=<1min|5min|15min|1hour>&date_from=&date_to=`.

## Rules

1. Reference each key from the environment (`.env`, exposed as the `src/common/Env.ts` constants) — e.g. `$BIRDEYE_API_KEY`. Never hardcode a key.
2. Uppercase and trim tickers (Nvidia → `NVDA`). Resolve an unknown name via `/v2/tickerslist`.
3. Relay exact figures with the timeframe and direction of change, never approximations.
4. **Coverage gap:** Marketstack has no market-wide movers, market open/closed status, or NBBO
   quote (those need a Massive key, not configured). If asked, say the data source doesn't cover
   it rather than guessing.
5. For unscoped movers/discovery, run crypto via `market-strategist` and commodities via
   `commodity-analyst` (AGENTS.md), and note the stock-movers gap.
6. Apply the Hyperliquid tradability guardrail before pitching trade ideas (AGENTS.md).

## Examples

### Latest price/quote

```bash
curl -s "https://api.marketstack.com/v2/stockprice?access_key=$MARKETSTACK_API_KEY&ticker=AAPL"
```

### Daily (EOD) candles over a range

```bash
curl -s "https://api.marketstack.com/v2/eod?access_key=$MARKETSTACK_API_KEY&symbols=NVDA&date_from=2026-06-15&date_to=2026-07-15&sort=DESC&limit=30"
```

### Ticker search

```bash
curl -s "https://api.marketstack.com/v2/tickerslist?access_key=$MARKETSTACK_API_KEY&search=microsoft&limit=5"
```

## Error recovery

| Symptom                                   | Action                                                                       |
| ----------------------------------------- | ---------------------------------------------------------------------------- |
| 401 / 403 / "access_key" error            | The `MARKETSTACK_API_KEY` in `.env` is missing/invalid — check it, then retry.|
| 429 / 5xx (rate limit or outage)          | Wait briefly, retry once; if it still fails, stop and report plainly.        |
| Empty result / unknown ticker             | Resolve the symbol via `/v2/tickerslist`, then rerun with the exact ticker.  |
| Movers / market-status / NBBO requested   | Not available via Marketstack — say so plainly (needs a Massive key).        |

## Related skills

- `technical-analyst` — indicator computation, signals, and backtests across asset classes.
- `news` — stock news, catalysts, and sentiment for a ticker.
- `hyperliquid` — discover the hosting dex and execute stock trades as Hyperliquid perps.
- `market-strategist` — crypto movers, rankings, and market-wide aggregates.
