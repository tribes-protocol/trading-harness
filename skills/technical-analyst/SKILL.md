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

This is the **computation layer**: fetch OHLCV candles from a provider (reading keys from `.env`),
then compute the indicators or run the backtest yourself over those candles. Candle sources and
full auth details live in `docs/inlined-provider-apis.md`.

## When to use

- Indicator values, signal reads, or multi-indicator confluence (RSI, MACD, SMA/EMA, Bollinger,
  ADX, ATR, OBV, ROC) on any crypto token, security, commodity, or perp.
- A rule-based backtest with explicit entry/exit conditions.
- NOT for raw candles or price history with no math — use `fundamentals-analyst`/`stock-analyst`.
- NOT for one token's live price, safety, or on-chain trades — use `token-analyst`.
- NOT for stock quotes, snapshots, or movers — use `stock-analyst`; stock news — use `news`.
- NOT for pool or pair OHLCV charts — use `defi-analyst`.

## Candle sources

These keys come from the environment — the same names the `src/common/Env.ts` constants
read (`process.env.*`), loaded from `.env`. Reference them directly by name in the calls below. In a bare shell, load them once with
`set -a; . ./.env; set +a`.

- **Crypto token** — BirdEye `GET /defi/ohlcv?address=&type=<1m|5m|15m|1H|4H|1D|1W>&time_from=&time_to=`
  (header `X-API-KEY` + `x-chain`).
- **Coin by id / longer history** — CoinGecko `GET /api/v3/coins/{id}/ohlc/range` or
  `/market_chart/range` (header `x-cg-pro-api-key`).
- **Stock/commodity perp** — get candles from `stock-analyst` (Marketstack) or the perp venue.

## Rules

1. Reference each key from the environment (`.env`, exposed as the `src/common/Env.ts` constants) — e.g. `$BIRDEYE_API_KEY`. Never hardcode a key.
2. Resolve asset (plus chain for ambiguous tokens) and timeframe first. IF the user gave no
   timeframe, default to 4H and say so — never bounce the question back.
3. Fetch enough candles for the longest lookback (e.g. ≥ 200 bars for a 200-period MA; ≥ 26 for
   MACD; ≥ 14 for RSI/ATR/ADX).
4. Compute indicators from the candles — do the math yourself, or a short `python3` snippet over
   the JSON. Report numeric values with the timeframe, then the signal read.
5. For a backtest, apply the stated entry/exit rules bar by bar and report win rate, total
   return, and max drawdown.
6. Before presenting TA output as an executable trade idea, verify Hyperliquid tradability first
   (AGENTS.md guardrail; use the `hyperliquid` skill's discovery commands).

## Examples

### Fetch 4H candles for a confluence read

```bash
# BTC (wrapped) on ethereum, last ~30 days of 4H candles
curl -s "https://public-api.birdeye.so/defi/ohlcv?address=0x2260fac5e5542a773aa44fbcfedf7c193bc2c599&type=4H&time_from=$(( $(date +%s) - 2592000 ))&time_to=$(date +%s)" \
  -H "X-API-KEY: $BIRDEYE_API_KEY" -H 'x-chain: ethereum' -H 'accept: application/json' -o /tmp/btc_4h.json
```

Then compute indicators over `/tmp/btc_4h.json` (RSI/MACD/ATR …) and report values + the signal.

### Coin candles from CoinGecko for a daily read

```bash
curl -s 'https://pro-api.coingecko.com/api/v3/coins/ethereum/ohlc?vs_currency=usd&days=30' \
  -H "x-cg-pro-api-key: $COIN_GECKO_PRO_API_KEY" -H 'accept: application/json'
```

## Error recovery

| Symptom                                   | Action                                                                        |
| ----------------------------------------- | ----------------------------------------------------------------------------- |
| 401 / 403 from a provider                 | The key in `.env` is missing/invalid — check it, then retry once.             |
| 429 / 5xx (rate limit or outage)          | Wait briefly, retry once; if it still fails, stop and report plainly.         |
| Too few candles for the lookback          | Widen `time_from`/`days` and refetch before computing.                        |
| Stock/commodity candles unavailable here  | Get the candles via `stock-analyst`, then compute the indicators.             |

## Related skills

- `stock-analyst` — stock prices, quotes, candles, snapshots, movers.
- `fundamentals-analyst` — raw coin OHLCV candles and historical charts (no indicator math).
- `strategize` — turns TA reads into a trade plan.
- `hyperliquid` — tradability check and execution for TA-based trade ideas.
