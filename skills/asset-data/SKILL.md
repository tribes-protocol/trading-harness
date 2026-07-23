---
name: asset-data
description: >-
  DEFAULT path for price, candles, profile, search, trending, new listings, and top holders on
  ANY asset class — on-chain tokens, CoinGecko coins, stocks, and Hyperliquid perps — through
  one capability-first command group with automatic provider fallback. Call it before reaching
  for a provider-named group (token-data, market, onchain, stocks): same payload shape no matter
  which provider answered, and the response says who answered and why others were skipped. NOT
  for: provider-unique depth (token security/trades → token-analyst, smart money → alpha-scout,
  market-wide aggregates → market-strategist, indicators → technical-analyst) or anything that
  moves funds.
allowed-tools: bash read
---

# Asset Data

Backing command group: `tribes-cli asset` — capability-first market data with a primary
provider and automatic fallback (BirdEye ↔ CoinGecko/GeckoTerminal ↔ Marketstack ↔
Hyperliquid), answering in seconds as structured JSON. One payload shape per capability
regardless of which provider answered, so you never adapt your parsing to the provider.

## When to use

- Any "what's the price / chart / profile of X" question, for ANY asset class: token
  contract, CoinGecko coin, stock ticker, or Hyperliquid perp.
- Candles for technical analysis on any asset class — `asset candles … --out` is the
  one-liner source for `ta`.
- Resolving a name/symbol to an asset (`search`), discovery (`trending`, `new`), and top
  holders of a token (`holders`).
- NOT for provider-unique depth: token security, trade feeds, holder cohorts
  (`token-analyst`); smart-money flows (`alpha-scout`); market-wide aggregates
  (`market-strategist`); indicators/backtests (`technical-analyst`).

## Identifier semantics (exactly one form per call)

| Flag                | Identifier space             | Example                               |
| ------------------- | ---------------------------- | ------------------------------------- |
| `--address --chain` | Token contract on a chain    | `--address 0xc02a… --chain ethereum`  |
| `--id`              | CoinGecko coin id            | `--id bitcoin` (resolve via `search`) |
| `--ticker`          | Stock ticker                 | `--ticker AAPL`                       |
| `--perp`            | Hyperliquid perp coin        | `--perp BTC`, `--perp xyz:AAPL`       |
| `--pool --chain`    | DEX pool/pair (candles only) | `--pool 8sLb… --chain solana`         |

Chains are canonical names: `solana`, `ethereum`, `base`, `bsc`, `arbitrum`, `polygon`,
`optimism`, `avalanche` — the router translates to each provider's own chain id. An
unsupported chain errors with the supported list.

## The envelope and the fallback story

Every response carries a routing envelope on top of the capability payload:

```json
{
  "source": "geckoterminal",
  "attempted": [
    { "provider": "birdeye", "outcome": "http_429", "detail": "…" },
    { "provider": "geckoterminal", "outcome": "ok" }
  ],
  "candles": [{ "t": 1784556400000, "o": 1, "h": 2, "l": 0.5, "c": 1.5, "v": 100 }]
}
```

**`source` says who answered; `attempted` says why.** The router tries providers in order and
moves to the next on: key unset, 401/403 (plan gate), 408/timeout, 429, any 5xx, an empty
payload, or a schema-parse failure. Outcomes: `ok`, `key_unset`, `http_<status>`, `timeout`,
`empty`, `parse_error`, `not_found`. One provider per response — never merged data.

- Asset-not-found is FINAL (not a fallback) when the provider owns the identifier space:
  CoinGecko for `--id`, Marketstack for `--ticker`, Hyperliquid for `--perp`. A wrong id is a
  wrong id — fix the identifier (use `asset search`), don't retry.
- A stock price answered from the EOD close (stockprice is limited to 1 call/min) is labeled
  `"stale": true` — say so when you present it.

## Hard rules

1. Every subcommand prints structured JSON on stdout — parse it, never screen-scrape prose.
   All subcommands accept `--out <file>` to also write the JSON to a file.
2. Report `source` honestly when it matters (stale stock close, fallback provider after a
   rate limit). The `attempted` trail is your explanation, not noise.
3. Coin ids are CoinGecko ids (`bitcoin`, not `BTC`) — resolve with `asset search` first
   when unsure.
4. Candle timeframes: `1m|5m|15m|1h|4h|1d|1w` for `--address`/`--pool`; `--id` uses `--days`
   instead (daily-ish OHLC, no volume); `--ticker` is EOD daily only.
5. Before presenting results as actionable trade ideas, verify Hyperliquid tradability with
   `hyperliquid list-assets --all-dexes` (see AGENTS.md).

## Command reference

All under `tribes-cli asset`; every subcommand accepts `--out <file>`. All read-only.

| Subcommand | Purpose                                      | Identifier flags                                        | Useful flags                              |
| ---------- | -------------------------------------------- | ------------------------------------------------------- | ----------------------------------------- |
| `price`    | Price quote for any asset                    | `--address --chain` \| `--id` \| `--ticker` \| `--perp` |                                           |
| `candles`  | OHLCV candles `{t,o,h,l,c,v}` (t epoch ms)   | same as price, plus `--pool --chain`; no `--perp`       | `--timeframe` (default 1h), `--days` (id) |
| `profile`  | Identity + market block (+links/description) | `--address --chain` \| `--id` \| `--ticker`             |                                           |
| `trending` | Trending assets                              | `--space onchain\|coins` (default onchain)              | `--chain` (onchain), `--limit`            |
| `new`      | New listings / recently added coins          | `--space onchain\|coins` (default onchain)              | `--limit`                                 |
| `search`   | Resolve names/symbols to assets              | `--query`; `--chain` → onchain token search first       | `--limit`                                 |
| `holders`  | Top holders of a token contract              | `--address --chain`                                     | `--limit`                                 |

## Examples

### Price across asset classes

```bash
tribes-cli asset price --address So11111111111111111111111111111111111111112 --chain solana
tribes-cli asset price --id bitcoin
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
tribes-cli asset search --query "render"
tribes-cli asset profile --id render-token
tribes-cli asset trending --space onchain --chain solana --limit 10
tribes-cli asset new --space coins --limit 20
tribes-cli asset holders --address So11111111111111111111111111111111111111112 --chain solana
```

## Error recovery

| Symptom                                   | Action                                                                                                                                                                 |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `all providers failed — …`                | The trail lists each provider's reason (`birdeye: key_unset; geckoterminal: http_429`). Report it plainly; retry once only if a reason is transient (429/5xx/timeout). |
| `not_found` on `--id`/`--ticker`/`--perp` | Wrong identifier, final — resolve the right one with `asset search` (or `hyperliquid list-assets`).                                                                    |
| `unsupported chain '…'`                   | Use a canonical chain from the listed set.                                                                                                                             |
| `provide exactly one identifier`          | Pass exactly one identifier form; `--address`/`--pool` need `--chain`.                                                                                                 |
| Any other API failure                     | Retry the same command once; if it fails again, stop and report the error.                                                                                             |

## Related skills

- `token-analyst` — provider-unique token depth: security, trades, holder cohorts, mint/burn.
- `market-strategist` — market-WIDE aggregates: global caps, movers, categories.
- `fundamentals-analyst` — deep single-coin research beyond the profile block.
- `stock-analyst` — stock search and deeper Marketstack flows.
- `technical-analyst` — indicators/signals on the candles this skill produces.
- `defi-analyst` — pool/DEX-level TVL and liquidity beyond pool candles.
