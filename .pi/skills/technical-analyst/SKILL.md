---
name: technical-analyst
description: >-
  The indicator and backtest COMPUTATION layer for any asset class (crypto tokens, securities,
  commodities, and perps). Handles: momentum, trend, volatility, and volume indicators (RSI, MACD, SMA/EMA,
  Bollinger, ADX, ATR, OBV, ROC) computed from OHLCV candles, multi-indicator confluence reads,
  and rule-based strategy backtests with entry/exit conditions. Call whenever the question is an
  indicator value, signal, setup, or backtest. NOT for: raw prices or candles with no indicator
  math (use stock-analyst, fundamentals-analyst, or token-analyst); stock quotes or snapshots
  (use stock-analyst); asset news (use news); pool OHLCV charts (use defi-analyst).
allowed-tools: bash read
---

# Technical Analyst

Backing command group: `tribes-cli technical-analyst`. Sends one natural-language query to a
backend TA specialist that computes indicators and runs backtests over OHLCV candles.
Requires: an auth token (run `tribes-cli login` once if commands fail with auth errors).

## When to use

- Need indicator values, signal reads, or multi-indicator confluence (RSI, MACD, SMA/EMA,
  Bollinger, ADX, ATR, OBV, ROC) on any crypto token, security, commodity, or perp — run `ask`.
- Need a rule-based backtest with explicit entry/exit conditions — run `ask`.
- NOT for raw candles or price history — use `fundamentals-analyst` or `stock-analyst`.
- NOT for one token's live price, safety, or on-chain trades — use `token-analyst`.
- NOT for stock quotes, snapshots, or movers — use `stock-analyst`; stock news — use `news`.
- NOT for pool or pair OHLCV charts — use `defi-analyst`.

## Hard rules

1. The ENTIRE surface is one command: `tribes-cli technical-analyst ask --query "<text>"`.
   `--query` is the ONLY flag and it is required — there is no `--out` and no filter flags.
2. Encode everything inside the query text: asset (plus chain for ambiguous tokens), timeframe
   (1m/15m/1H/4H/1D/1W/1M), indicator set or backtest rules, and any date range.
3. Always wrap the query in double quotes — queries contain spaces, commas, and `%`.
4. MUST set a bash timeout of at least 120 seconds (prefer 300) for this command.
5. IF the user gave no timeframe, THEN default to 4H and state that choice in your answer —
   NEVER bounce the question back to the user.
6. Output is one free-text analysis string on stdout, not JSON — read it as prose, never
   JSON-parse it. The CLI calls the API itself — NEVER call the endpoint or curl directly.
7. Before presenting TA output as an executable trade idea, verify Hyperliquid tradability
   first (see AGENTS.md guardrail; use the `hyperliquid` skill's discovery commands).

## Command reference

| Subcommand | Purpose                                     | Required flags | Read-only or signed |
| ---------- | ------------------------------------------- | -------------- | ------------------- |
| `ask`      | Natural-language query to the TA specialist | `--query`      | read-only           |

## Examples

### Crypto confluence read (perp or major token)

```bash
tribes-cli technical-analyst ask \
  --query "BTC 4H: RSI, MACD, and ATR — is momentum confirming the trend? Give numeric values."
```

### Stock technicals (daily)

```bash
tribes-cli technical-analyst ask \
  --query "TSLA daily: Bollinger Bands and ADX — is it trending or ranging right now?"
```

### Backtest with explicit entry/exit rules

```bash
tribes-cli technical-analyst ask \
  --query "Backtest on BTC 4H over the last 90 days: buy when RSI < 30, sell when RSI > 70. Report win rate, total return, and max drawdown."
```

Self-refine follow-up suggestions with at most 1–2 more `ask` calls (see AGENTS.md).

## Error recovery

| Symptom                                   | Action                                                                         |
| ----------------------------------------- | ------------------------------------------------------------------------------ |
| Auth error (unauthorized, expired token)  | Run `tribes-cli login`, retry the original command once, then stop and report. |
| `required option '--query'` error         | You omitted `--query` — rerun with the full query in double quotes.            |
| Stock query fails or lacks candle history | Retry the same question via `stock-analyst`.                                   |
| Timeout or any other API failure          | Retry once with a 300s timeout; if it fails again, stop and report the error.  |

## Related skills

- `stock-analyst` — stock prices, quotes, candles, snapshots, movers.
- `fundamentals-analyst` — raw coin OHLCV candles and historical charts (no indicator math).
- `strategize` — turns TA reads into a trade plan.
- `hyperliquid` — tradability check and execution for TA-based trade ideas.
