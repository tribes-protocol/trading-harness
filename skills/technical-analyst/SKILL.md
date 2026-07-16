---
name: technical-analyst
description: >-
  The indicator COMPUTATION layer for any asset class (crypto coins, on-chain tokens,
  securities, and perp underlyings). Handles: trend, momentum, and volatility indicators
  (SMA/EMA, RSI, MACD, Bollinger %B, ATR, ROC, swing levels) computed from OHLCV candles by
  `technicals indicators`, plus multi-timeframe confluence reads and stop/invalidation
  structure. Call whenever the question is an indicator value, signal, or setup. Backtesting
  is NOT available anywhere in the harness. NOT for: raw prices or candles with no indicator
  math (use stock-analyst, fundamentals-analyst, or token-analyst); stock quotes or snapshots
  (use stock-analyst); asset news (use news); pool OHLCV charts (use research-analyst).
allowed-tools: bash read
---

# Technical Analyst

Backing command group: `tribes-cli technicals` — a structured indicator engine that fetches
OHLCV candles from one provider per run and computes the pack itself. No remote analyst is
involved: every call returns in seconds, so no extended timeout is needed (only `news fetch`,
elsewhere, needs `timeout 300`). Follows the market-data reliability invariants in AGENTS.md
(sources + timestamps, facts vs interpretation, partial results). Research-only: it computes
and reads indicators — it never places orders.

**HARD GAP — no backtesting.** Rule-based backtests were removed with the analyst agent. The
harness cannot compute win rates, historical returns, or drawdowns for a strategy, and no
strategy claim may cite backtest results. Offer a current-state confluence read instead, and
say plainly that the backtest half of the request is not available.

## When to use

- Need indicator values, a signal read, or multi-indicator confluence (SMA/EMA, RSI, MACD,
  Bollinger %B, ATR, ROC, swing levels) on any coin, on-chain token, stock, or perp underlying.
- Need stop/invalidation structure for a trade idea: ATR-sized stops around swing levels.
- NOT for raw candles or price history — use `fundamentals-analyst` (coins) or
  `stock-analyst` (stocks).
- NOT for one token's live price, safety, or on-chain trades — use `token-analyst`.
- NOT for stock quotes, snapshots, or movers — use `stock-analyst`; asset news — use `news`.
- NOT for pool or pair OHLCV charts — use `research-analyst`.
- Backtest requests — disclose the gap (above); do not route them anywhere else.

## Command reference

One command, `tribes-cli technicals indicators`, with EXACTLY ONE source per run
(`--out <file>` supported on all of them):

- `--coin-id <id>` — CoinGecko candles for a listed coin. Optional
  `--days 1|7|14|30|90|180|365|max` (default 30) and `--vs usd`. Granularity is automatic and
  NOT selectable — the trap: 1–2d → 30min candles, 3–30d → 4h, 31d+ → 4-day. So the default
  `--days 30` is a 4h-candle pack (×180 candles, swing view) and `--days 365` is a 4-day-candle
  pack (position view). Resolve ids first with `tribes-cli market-data search --query <text>`.
- `--symbol <TICKER>` — Marketstack official EOD candles for a stock, DAILY only. Optional
  `--limit 30-500` (daily bars); use `--limit 250` or more when SMA200 matters. Resolve
  tickers with `tribes-cli stocks search --query <text>`.
- `--address <a> --chain <c>` — Birdeye on-chain candles for a token (chains: 1, 8453, 56,
  42161, 10, 137, solana). The only source with a selectable interval:
  `--interval 1m|3m|5m|15m|30m|1H|2H|4H|6H|8H|12H|1D|3D|1W|1M`, plus `--limit 30-500`. Pass
  `--interval` explicitly and state it. Resolve addresses with
  `tribes-cli token search --query <text>`.

Returned pack: SMA20/50/200, EMA12/26, RSI14 (Wilder), MACD(12,26,9), Bollinger(20,2) + %B,
ATR14 (absolute and % of price), ROC10, swing high/low (20 bars), and a factual
trend/momentum/volatility read.

If the user gave no timeframe, use the source default (coins: `--days 30` → 4h; stocks: daily;
tokens: pick `--interval 4H` or `1D` to match the holding horizon), state that choice in the
answer, and NEVER bounce the question back to the user.

## Reading the pack

Keep the three layers visibly distinct: provider candles, the computed indicator pack (facts),
and your setup read (interpretation). Every read carries its provider and the last-candle
timestamp; nothing here is a forecast or a guarantee.

- **Trend** — price vs SMA50 and SMA200: above both → uptrend, below both → downtrend, between
  them or a fresh SMA50/SMA200 cross → transitional. The pack's trend field states this
  factually; your call is whether the setup respects it.
- **Momentum** — RSI14 zones: > 70 stretched/overbought, < 30 oversold, 40–60 neutral; in an
  uptrend RSI typically holds 40–80, in a downtrend 20–60, so a "hot" RSI inside a strong trend
  is confirmation before it is a fade. MACD histogram: the sign gives direction, successive
  bars give acceleration (positive and growing = building; shrinking toward zero = fading).
- **Volatility** — ATR% is the sizing input: place stops ~1.5–2× ATR beyond the entry or the
  swing level so normal noise does not trigger them; higher ATR% → smaller position for the
  same account risk.
- **Bollinger %B** — > 1 means the close is above the upper band, < 0 below the lower, ≈ 0.5 at
  the mid-band. Persistent %B > 1 inside an uptrend is strength (riding the band), not
  automatically a short signal.
- **Structure** — the 20-bar swing high/low frame entry and invalidation: a long is
  structurally invalid below the swing low, a short above the swing high. Pair the level with
  ATR to place the actual stop.

### Multi-timeframe confluence (recipe)

Run the same asset on two horizons and require agreement before calling anything
high-confidence:

```bash
tribes-cli technicals indicators --coin-id bitcoin --days 30 --out /tmp/ta-btc-30d.json
tribes-cli technicals indicators --coin-id bitcoin --days 365 --out /tmp/ta-btc-365d.json
```

- Both trends agree and the shorter timeframe's momentum confirms → high confidence.
- Long horizon up, short horizon oversold (low RSI, %B near 0) → pullback-in-uptrend read.
- Disagreement → report the conflict and lower confidence; never average the two horizons into
  one false signal.

On-chain tokens: vary `--interval` (e.g. `4H` vs `1D`). Stocks: daily candles only, so vary
lookback with `--limit` — and disclose that both runs share daily granularity.

## Examples

Crypto coin, default horizon (30d → 4h candles):

```bash
tribes-cli technicals indicators --coin-id bitcoin
```

Stock, enough daily bars to populate SMA200:

```bash
tribes-cli technicals indicators --symbol TSLA --limit 250
```

On-chain token with an explicit interval (WETH on Ethereum):

```bash
tribes-cli technicals indicators --address 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2 --chain 1 --interval 4H --limit 200
```

Before presenting any read as an executable trade idea, verify Hyperliquid tradability first
(see the AGENTS.md guardrail; use the `hyperliquid` skill's discovery commands).

## Error recovery

| Symptom                                  | Action                                                                                                    |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Auth error (unauthorized, expired token) | Run `tribes-cli login`, retry the original command once, then stop and report.                            |
| Any other API failure                    | Retry once; if it fails again, stop and report the error plainly.                                         |
| Long-window fields null (e.g. SMA200)    | Not an error — too few candles for the window; rerun with a larger `--days` or `--limit` (max 500).       |
| Unknown coin id / ticker / address       | Resolve first: `market-data search`, `stocks search`, or `token search`; then rerun.                      |
| Passed two source flags                  | The command takes exactly one source — rerun with only `--coin-id`, `--symbol`, or `--address`+`--chain`. |
| User asked for a backtest                | Capability removed — disclose the gap and offer a current-state confluence read instead.                  |

## Limitations

- **No backtesting** (removed with the analyst agent): no win rates, historical returns,
  drawdowns, or entry/exit-rule simulations. Strategy claims must not cite backtest results.
- Fixed indicator set — no ADX, OBV, or any volume-based indicator. CoinGecko OHLC carries no
  volume at all, so volume signals are impossible for the coin source.
- CoinGecko granularity is auto-selected by `--days` (never choose it); the stock source is
  daily EOD only, so intraday stock indicators are unavailable; the on-chain source depends on
  Birdeye pool coverage — thin tokens produce gappy candles and unstable indicator values.
- Commodities and index perps have no direct candle source here — indicator reads for them run
  on proxies (a related ETF ticker via `--symbol`, or a wrapped/underlying listed coin via
  `--coin-id`); name the proxy and its divergence risk when you do this.
- Indicators are descriptive statistics of past candles, not predictions; state assumptions,
  missing data, and confidence with every verdict.

## Related skills

- `stock-analyst` — raw stock prices, quotes, candles, and movers.
- `fundamentals-analyst` — raw coin OHLCV candles and historical charts (no indicator math).
- `token-analyst` — one token's live price, safety, holders, and on-chain trades.
- `hyperliquid` — tradability check and execution venue for TA-based trade ideas.
- `thesis` — stress-tests a candidate that a confluence read surfaced.
- `strategize` — turns TA reads into a trade plan inside the full briefing.
