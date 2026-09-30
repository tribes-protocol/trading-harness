---
name: asset-data
description: >-
  DEFAULT path for price, candles, profile, search, trending, new listings, and top holders on
  ANY asset class — on-chain tokens, stocks, and Hyperliquid perps — through one
  capability-first command group with automatic provider fallback. Call it before reaching for a
  provider-named group (token-data, stocks): same payload shape no matter which provider answered,
  and the response says who answered and why others were skipped. NOT for: provider-unique depth
  (token security/trades → token-analyst, smart money → alpha-scout, indicators →
  technical-analyst) or anything that moves funds.
allowed-tools: bash read
---

# Asset Data

Backing command group: `tribes-cli asset` — capability-first market data with a primary
provider and automatic fallback (BirdEye ↔ Marketstack ↔ Hyperliquid), answering in seconds as
structured JSON. One payload shape per capability regardless of which provider answered, so
you never adapt your parsing to the provider.

## When to use

- Any "what's the price / chart / profile of X" question, for ANY asset class: token
  contract, stock ticker, or Hyperliquid perp.
- Candles for technical analysis on any asset class — `asset candles … --out` is the
  one-liner source for `ta`.
- Resolving a name/symbol to an asset (`search`), discovery (`trending`, `new`), and top
  holders of a token (`holders`).
- NOT for provider-unique depth: token security, trade feeds, holder cohorts
  (`token-analyst`); smart-money flows (`alpha-scout`); indicators/backtests (`technical-analyst`).

## Identifier semantics (exactly one form per call)

| Flag                | Identifier space             | Example                              |
| ------------------- | ---------------------------- | ------------------------------------ |
| `--address --chain` | Token contract on a chain    | `--address 0xc02a… --chain ethereum` |
| `--ticker`          | Stock ticker                 | `--ticker AAPL`                      |
| `--perp`            | Hyperliquid perp coin        | `--perp BTC`, `--perp xyz:AAPL`      |
| `--pool --chain`    | DEX pool/pair (candles only) | `--pool 8sLb… --chain solana`        |

Chains are canonical names: `solana`, `ethereum`, `base`, `bsc`, `arbitrum`, `polygon`,
`optimism`, `avalanche` — the router translates to each provider's own chain id. An
unsupported chain errors with the supported list.

## The envelope and the fallback story

Every response carries a routing envelope on top of the capability payload:

```json
{
  "source": "marketstack",
  "attempted": [
    { "provider": "birdeye", "outcome": "http_429", "detail": "…" },
    { "provider": "marketstack", "outcome": "ok" }
  ],
  "candles": [{ "t": 1784556400000, "o": 1, "h": 2, "l": 0.5, "c": 1.5, "v": 100 }]
}
```

**`source` says who answered; `attempted` says why.** The router tries providers in order and
moves to the next on: key unset, 401/403 (plan gate), 408/timeout, 429, any 5xx, an empty
payload, or a schema-parse failure. Outcomes: `ok`, `key_unset`, `http_<status>`, `timeout`,
`empty`, `parse_error`, `not_found`. One provider per response — never merged data.

- Asset-not-found is FINAL (not a fallback) when the provider owns the identifier space:
  Marketstack for `--ticker`, Hyperliquid for `--perp`. A wrong identifier is a
  wrong identifier — fix it (use `asset search --chain …`), don't retry.
- A stock price answered from the EOD close (stockprice is limited to 1 call/min) is labeled
  `"stale": true` — say so when you present it.

## Hard rules

1. Every subcommand prints structured JSON on stdout — parse it, never screen-scrape prose.
   All subcommands accept `--out <file>` to also write the JSON to a file.
2. Report `source` honestly when it matters (stale stock close, fallback provider after a
   rate limit). The `attempted` trail is your explanation, not noise.
3. Candle timeframes: `1m|5m|15m|1h|4h|1d|1w` for `--address`/`--pool`; `--ticker` is EOD
   daily only.
4. Before presenting results as actionable trade ideas, verify Hyperliquid tradability with
   `hyperliquid list-assets --all-dexes` (see AGENTS.md).

## Command reference

All under `tribes-cli asset`; every subcommand accepts `--out <file>`. All read-only.

| Subcommand | Purpose                                    | Identifier flags                                      | Useful flags                          |
| ---------- | ------------------------------------------ | ----------------------------------------------------- | ------------------------------------- |
| `price`    | Price quote for any asset                  | `--address --chain` \| `--ticker` \| `--perp`         |                                       |
| `candles`  | OHLCV candles `{t,o,h,l,c,v}` (t epoch ms) | `--address --chain` \| `--ticker` \| `--pool --chain` | `--timeframe` (default 1h)            |
| `profile`  | Identity + market block                    | `--address --chain` \| `--ticker`                     |                                       |
| `trending` | Trending on-chain tokens                   | (none)                                                | `--chain` (default solana), `--limit` |
| `new`      | New on-chain token listings                | (none)                                                | `--limit`                             |
| `search`   | Resolve names/symbols to on-chain tokens   | `--query`, `--chain` (required)                       | `--limit`                             |
| `holders`  | Top holders of a token contract            | `--address --chain`                                   | `--limit`                             |

## Examples

### Price across asset classes

```bash
tribes-cli asset price --address So11111111111111111111111111111111111111112 --chain solana
tribes-cli asset price --ticker AAPL
tribes-cli asset price --perp BTC
```

### Candles into technical analysis (any asset class)

```bash
tribes-cli asset candles --address 0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2 --chain ethereum --timeframe 4h --out /tmp/weth-4h.json
tribes-cli ta indicators --candles-file /tmp/weth-4h.json --rsi 14 --macd
```

### Resolve, profile, discover

```bash
tribes-cli asset search --query "render" --chain solana
tribes-cli asset profile --address So11111111111111111111111111111111111111112 --chain solana
tribes-cli asset trending --chain solana --limit 10
tribes-cli asset new --limit 20
tribes-cli asset holders --address So11111111111111111111111111111111111111112 --chain solana
```

## Error recovery

| Symptom                            | Action                                                                                                                                                               |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `all providers failed — …`         | The trail lists each provider's reason (`birdeye: key_unset; marketstack: http_429`). Report it plainly; retry once only if a reason is transient (429/5xx/timeout). |
| `not_found` on `--ticker`/`--perp` | Wrong identifier, final — resolve the right one with `asset search --chain …` (or `hyperliquid list-assets`).                                                        |
| `unsupported chain '…'`            | Use a canonical chain from the listed set.                                                                                                                           |
| `provide exactly one identifier`   | Pass exactly one identifier form; `--address`/`--pool` need `--chain`.                                                                                               |
| Any other API failure              | Retry the same command once; if it fails again, stop and report the error.                                                                                           |

## Related skills

- `token-analyst` — provider-unique token depth: security, trades, holder cohorts, mint/burn.
- `stock-analyst` — stock search and deeper Marketstack flows.
- `technical-analyst` — indicators/signals on the candles this skill produces.
