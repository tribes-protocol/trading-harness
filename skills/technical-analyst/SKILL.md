---
name: technical-analyst
description: >-
  The indicator and backtest COMPUTATION layer for any candle-bearing asset (crypto tokens,
  coins, DEX pools, stocks, and perps via the underlying coin's candles). Handles: trend,
  momentum, and volatility indicators (SMA/EMA, RSI, MACD, Bollinger, ATR, VWAP, Stochastic)
  computed locally from OHLCV candles, swing support/resistance levels, multi-indicator
  confluence reads, and long-only backtests of two built-in strategies (SMA cross,
  RSI mean-revert). Call whenever the question is an indicator value, signal, setup, level, or
  backtest. NOT for: raw prices or candles with no indicator math (use stock-analyst,
  fundamentals-analyst, or token-analyst); stock prices or candles (use stock-analyst); asset
  news (use news); pool OHLCV charts (use defi-analyst).
allowed-tools: bash read
---

# Technical Analyst

Backing command group: `tribes-cli ta` — pure local compute over a saved candles file, no
network. YOU are the analyst: fetch candles with any candle source below, run the `ta`
subcommands, and do the interpretation — signal reads, confluence, setup quality — yourself.
There is no backend specialist behind this skill.

## The two-step recipe

Every TA task is the same two steps:

1. Fetch candles from any source and save them: `tribes-cli <source> ... --out /tmp/<x>.json`.
2. Compute over the file: `tribes-cli ta <indicators|levels|backtest> --candles-file /tmp/<x>.json`.

Every candle source — the generic `asset candles` and each direct provider command — writes
the shared candle contract, which is exactly what `--candles-file` expects:

```json
{ "source": "<provider>", "candles": [{ "t": 0, "o": 0, "h": 0, "l": 0, "c": 0, "v": 0 }] }
```

`t` is epoch ms; `v` may be absent (coin-id candles — `asset candles --id` / `coin ohlc` —
have no volume; skip `vwap` on those files).

## When to use

- Indicator values, signal reads, or multi-indicator confluence (SMA/EMA, RSI, MACD,
  Bollinger, ATR, VWAP, Stochastic) on any asset you can get candles for — `ta indicators`.
- Support/resistance and range context — `ta levels`.
- A long-only backtest of an SMA cross or RSI mean-revert strategy — `ta backtest`.
- Perps: no Hyperliquid candles command exists — compute on the underlying coin's candles
  (`asset candles` with the coin id or token address) and say so in your answer.
- Commodities: no direct candle source — use an ETF proxy via `asset candles --ticker` (e.g.
  GLD for gold) and state the proxy in your answer.
- NOT for raw candles or price history as the answer itself — use `fundamentals-analyst` or
  `stock-analyst`.
- NOT for one token's live price, safety, or on-chain trades — use `token-analyst`.
- NOT for stock prices, candles, or ticker details — use `stock-analyst`; stock news — use `news`.
- NOT for pool or pair OHLCV charts as a deliverable — use `defi-analyst`.

## Hard rules

1. Every subcommand prints structured JSON on stdout — parse it, never screen-scrape prose.
   All subcommands accept `--out <file>` to also write the JSON to a file.
2. NEVER hand-build a candles file — always produce it with a candle source's `--out`. The
   `ta` commands validate the contract and reject anything else.
3. IF the user gave no timeframe, THEN default to 4H for crypto (`--timeframe 4H`) and daily
   for stocks (the only supported interval) and state that choice in your answer — NEVER
   bounce the question back to the user.
4. Backtests are long-only, bar-close, and limited to `ma-cross` and `rsi-revert`. If the user
   asks for other entry/exit rules, say the native backtester does not support them and offer
   the closest built-in strategy instead of faking it.
5. Before presenting TA output as an executable trade idea, verify Hyperliquid tradability
   first (see AGENTS.md guardrail; use the `hyperliquid` skill's discovery commands).
6. If a candle-source command reports the provider key is not set, that capability is
   unavailable on this box — report it plainly, or switch to a different candle source that
   covers the asset.

## Command reference

### Compute: `tribes-cli ta` (local, no network)

| Subcommand   | Purpose                                                       | Required flags                                      | Useful flags                                                                        |
| ------------ | ------------------------------------------------------------- | --------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `indicators` | Snapshot (latest, previous, last-10 series) + ema20/50 trend  | `--candles-file`                                    | `--set sma,ema,rsi,macd,bb,atr,vwap,stoch` (default all), `--length <n>` (override) |
| `levels`     | Swing support/resistance (top 3 by touches) + 52-period range | `--candles-file`                                    |                                                                                     |
| `backtest`   | Long-only bar-close backtest                                  | `--candles-file`, `--strategy ma-cross\|rsi-revert` | `--fast` (20) / `--slow` (50); `--rsi-low` (30) / `--rsi-high` (70)                 |

### Candle sources (fetch with `--out <file>`, then feed to `--candles-file`)

Default: `tribes-cli asset candles` — one line per asset class, automatic provider fallback,
`source` in the file says who answered (full docs in the `asset-data` skill):

```bash
tribes-cli asset candles --address <address> --chain <chain> --timeframe 4H --out <file>  # contract token
tribes-cli asset candles --id <coin-id> --days 90 --out <file>                            # CoinGecko coin
tribes-cli asset candles --ticker <SYMBOL> --out <file>                                   # stock (daily)
```

Fallback / manual path — the direct provider commands, for when you need one specific
provider or a source the router does not cover (DEX pools):

| Asset                  | Command                         | Required flags                                            | Useful flags                                               |
| ---------------------- | ------------------------------- | --------------------------------------------------------- | ---------------------------------------------------------- |
| Crypto token (address) | `tribes-cli token-data ohlcv`   | `--address`, `--timeframe 1m\|5m\|15m\|1H\|4H\|1D\|1W`    | `--chain` (default solana), `--from`/`--to` (epoch s)      |
| Coin (CoinGecko id)    | `tribes-cli coin ohlc`          | `--id`, `--days 1\|7\|14\|30\|90\|180\|365\|max`          | no volume — skip `vwap`                                    |
| DEX pool               | `tribes-cli onchain pool-ohlcv` | `--network`, `--address`, `--timeframe minute\|hour\|day` | `--aggregate <n>` (e.g. 4 for 4h), `--limit` (default 100) |
| Stock (daily only)     | `tribes-cli stocks candles`     | `--symbol`                                                | `--from`/`--to` (YYYY-MM-DD), `--limit` (default 100)      |

## Examples

### Crypto confluence read (major coin, 4H via token candles)

```bash
tribes-cli asset candles --address <token-address> --chain ethereum --timeframe 4H --out /tmp/tok-4h.json
tribes-cli ta indicators --candles-file /tmp/tok-4h.json --set rsi,macd,atr
tribes-cli ta levels --candles-file /tmp/tok-4h.json
```

Read momentum from `rsi`/`macd`, volatility from `atr`, and place price against the `levels`
support/resistance before calling the setup.

### Stock technicals (daily)

```bash
tribes-cli asset candles --ticker TSLA --out /tmp/tsla-1d.json
tribes-cli ta indicators --candles-file /tmp/tsla-1d.json --set bb,ema,stoch
```

### Backtest (RSI mean-revert on BTC, 90 days of daily candles)

```bash
tribes-cli asset candles --id bitcoin --days 90 --out /tmp/btc-90d.json
tribes-cli ta backtest --candles-file /tmp/btc-90d.json --strategy rsi-revert --rsi-low 30 --rsi-high 70
```

Report win rate, total return vs buy-and-hold, and max drawdown straight from the JSON.

## Error recovery

| Symptom                                   | Action                                                                             |
| ----------------------------------------- | ---------------------------------------------------------------------------------- |
| Key-not-set error from a candle source    | Provider unconfigured on this box — switch candle source or report it; no retries. |
| `asset candles` fails all providers       | Its `attempted` list names each provider and reason — report that precisely.       |
| `ta` rejects the candles file             | Refetch with the source command's `--out` — never hand-edit the file.              |
| Unknown option error                      | Drop the extra flag — see the command reference for each subcommand's flags.       |
| Stock query fails or lacks candle history | Retry the same question via `stock-analyst`.                                       |
| Any other API failure on a candle fetch   | Retry the same command once; if it fails again, stop and report the error.         |

## Related skills

- `stock-analyst` — stock daily candles, ticker details, and search (Marketstack).
- `fundamentals-analyst` — raw coin OHLCV candles and historical charts (no indicator math).
- `defi-analyst` — pool discovery and pool charts as a deliverable.
- `strategize` — turns TA reads into a trade plan.
- `hyperliquid` — tradability check and execution for TA-based trade ideas.
