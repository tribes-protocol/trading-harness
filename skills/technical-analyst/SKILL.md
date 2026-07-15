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

This is the **computation layer**.

**Preferred — one-shot indicator snapshot:**

```bash
tribes-cli indicators --kind token --asset BTC --chain ethereum --timeframe 1D --days 365
tribes-cli indicators --kind perp  --asset BTC --timeframe 4H --days 60 --indicators rsi,macd,atr
tribes-cli indicators --kind stock --asset NVDA --timeframe 1D --days 365
```

Fetches OHLCV once and returns the latest RSI(14, +signal), MACD(12/26/9), SMA(20/50/200),
EMA(12/26), Bollinger(20,2), ADX(14), ATR(14, +%), OBV, ROC(10), Momentum(10) — filter with
`--indicators`, choose the price basis with `--source` (close|hl2|hlc3|ohlc4). Same
`--kind/--asset/--chain/--timeframe/--days` contract as `candles`.

**For custom periods, non-standard indicators, or backtests:** fetch raw candles with
`tribes-cli candles …` (same flags) and compute over them yourself. Provider/auth details live in
`docs/inlined-provider-apis.md`.

## When to use

- Indicator values, signal reads, or multi-indicator confluence (RSI, MACD, SMA/EMA, Bollinger,
  ADX, ATR, OBV, ROC) on any crypto token, security, commodity, or perp.
- A rule-based backtest with explicit entry/exit conditions.
- NOT for raw candles or price history with no math — use `fundamentals-analyst`/`stock-analyst`.
- NOT for one token's live price, safety, or on-chain trades — use `token-analyst`.
- NOT for stock quotes, snapshots, or movers — use `stock-analyst`; stock news — use `news`.
- NOT for pool or pair OHLCV charts — use `defi-analyst`.

## Candle sources

**Preferred — one unified command** (handles symbol→address resolution, chain header, timestamps,
source-format differences, null-bar stripping, and rolls up non-native timeframes via aggregation;
returns a uniform `[{timestamp, open, high, low, close, volume}]`):

```bash
tribes-cli candles --kind token --asset BTC  --chain ethereum --timeframe 1D --days 45
tribes-cli candles --kind token --asset SOL  --chain solana   --timeframe 4H --days 10
tribes-cli candles --kind perp  --asset BTC                   --timeframe 4H --days 10
tribes-cli candles --kind stock --asset NVDA                  --timeframe 1D --days 45
```

Same `token|perp|stock` vocabulary as the `AssetIdentity` type / `news`. `--kind token` (BirdEye,
needs `--chain`) resolves majors like BTC→WBTC / SOL→wSOL for you; `--kind perp` (Hyperliquid —
pass the coin verbatim incl. any `xyz:` dex prefix; **no 6H**); `--kind stock` (Marketstack, USD
EOD/intraday). Timeframes: `1m,5m,15m,30m,1H,2H,4H,6H,8H,12H,1D,3D,1W,1M`.

**Fallback — raw provider curls** (keys from `.env`, loaded with `set -a; . ./.env; set +a`):

- **Crypto token** — BirdEye `GET /defi/ohlcv?address=&type=&time_from=&time_to=` (header `X-API-KEY` + `x-chain`).
- **Coin by id / longer history** — CoinGecko `GET /api/v3/coins/{id}/ohlc/range` (header `x-cg-pro-api-key`).
- **Stock** — Marketstack `GET /v2/eod` / `/v2/intraday`.

## Workflow patterns

- **Resolve first:** symbol/name → address via BirdEye `/defi/v3/search?chain=<net>&keyword=`
  (address given but chain missing → search by the address). Never guess chain/address or reuse a
  remembered identifier the user didn't give.
- **Indicators:** fetch OHLCV once (BirdEye `/defi/ohlcv` for a token, CoinGecko `/coins/{id}/ohlc`
  for a coin, Marketstack for a stock), then compute RSI/MACD/SMA/EMA/Bollinger/ADX/ATR/OBV/ROC
  from the candles and read overbought/oversold/neutral with exact numbers.
- **Perps:** pass the coin EXACTLY as written, keeping any dex prefix (e.g. `xyz:CL`, `flx:AAPL`) —
  the prefixed form is the real identifier; the bare symbol fails. `xyz:`/builder-dex assets are
  Hyperliquid HIP-3 perps (tokenized stocks/commodities/FX), not real-exchange listings.
- **Backtest:** define entry conditions (all true) + exit conditions (any triggers), run them
  bar-by-bar over the candles, and report trade count, win rate, PnL, and max drawdown. Win rate
  > 50% + positive avg PnL = viable; drawdown > 20% = risky; < 10 trades = widen the period.

Also: if the user gave **no** timeframe and a fetch returns too few candles, auto-retry the next
lower timeframe silently — **1W → 1D → 4H → 1H → 15m → 5m → 1m** — and note which was used; if all
are exhausted, report insufficient history and stop. If the user **did** specify a timeframe/window,
do NOT auto-downgrade — state the minimum needed and suggest a wider window. Never fabricate candles.

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
