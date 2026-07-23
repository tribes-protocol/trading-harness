---
name: wallet-analyst
description: >-
  Portfolio analytics for arbitrary third-party wallet addresses. Handles: current balances and
  net worth, historical balances and DeFi holdings (Nansen, multi-chain), net-worth history and
  balance-change deltas (BirdEye-backed, Solana-only), 30-day trading PnL with top tokens,
  transaction history and transfer flows, wallet labels (fund, smart trader, exchange), entity
  name search, top counterparties, and related-wallet discovery. Call
  when the question is what a wallet holds, how it performed, or who is behind it. NOT for: the
  agent's own tribes wallet addresses/IDs or raw pre-trade balances (use zipbox-wallet); live
  Hyperliquid positions, orders, or perp/spot balances (use hyperliquid).
allowed-tools: bash read
---

# Wallet Analyst

Backing command group: `tribes-cli wallet-data` (Nansen wallet intelligence plus BirdEye
Solana wallet analytics) — structured
JSON, answering in seconds. YOU are the analyst: pull the numbers with the subcommands below and
do the interpretation — performance reads, flow attribution, identity profiling — yourself.
There is no backend specialist behind this skill and no `ask` subcommand.

## When to use

- Current holdings and USD net worth of a wallet (`balances`, `net-worth` for Solana
  detail).
- Trading PnL over the last 30 days, overall and per top token (`pnl`).
- Transfer activity and transaction history (`transactions`), top counterparties by volume
  (`counterparties`).
- Who is behind a wallet: labels (`labels`) and related addresses via funding, first-in, and
  common deployers (`related`).
- This skill analyses ARBITRARY third-party wallets. NOT for the agent's own addresses, wallet
  IDs, or a raw balance snapshot before a trade — use `zipbox-wallet`. To analyse one of the
  agent's own wallets, get its address from `zipbox-wallet` first, then run these commands on it.
- NOT for Hyperliquid positions, open orders, or perp/spot balances — use `hyperliquid`.

## Hard rules

1. Every subcommand prints structured JSON on stdout — parse it, never screen-scrape prose.
   All subcommands accept `--out <file>` to also write the JSON to a file.
2. `--wallet <address>` is required on every subcommand except `entity-search` (which takes
   `--query <text>` instead). NEVER assume a default wallet — an explicit address must come
   from the user or from `zipbox-wallet`.
3. Lookback windows are fixed: `counterparties`, `transactions`, `pnl`, and
   `historical-balances` cover the last 30 days with no timeframe flag; only `balance-change`
   takes `--from`/`--to` epoch bounds. Do not promise arbitrary ranges; state the window in
   your answer.
4. Chain defaults differ: most Nansen subcommands default `--chain all`; `related` defaults
   `ethereum` and does not accept `all`. The
   BirdEye-backed subcommands (`net-worth`, `net-worth-details`, `net-worth-chart`,
   `balance-change`, `transfer-total`) are Solana-only and take no `--chain` flag.
5. If a command reports the provider key is not set, the capability is unavailable on this box —
   report that plainly instead of retrying or working around it.

## Command reference

All read-only; every subcommand requires `--wallet <address>` (except `entity-search`, which
requires `--query <text>` instead) and accepts `--out <file>`.

Under `tribes-cli wallet-data` — Nansen-backed, multi-chain:

| Subcommand            | Purpose                                                             | Useful flags                                           |
| --------------------- | ------------------------------------------------------------------- | ------------------------------------------------------ |
| `balances`            | Current token balances, largest USD value first                     | `--chain ethereum\|solana\|base\|all` (default all)    |
| `labels`              | Nansen labels on the wallet (fund, smart trader, exchange)          | `--chain` (default all)                                |
| `counterparties`      | Top counterparties over the last 30 days by volume                  | `--chain` (default all), `--limit` 1-100 (default 20)  |
| `transactions`        | Recent transactions (last 30 days), newest first                    | `--chain` (default all), `--limit` 1-100 (default 20)  |
| `related`             | Related wallets (funding, first-in, common deployers)               | `--chain ethereum\|solana\|base` (default ethereum)    |
| `pnl`                 | Trading PnL summary over the last 30 days, with top-5 tokens        | `--chain` (default all)                                |
| `historical-balances` | Historical token balance snapshots (last 30 days), newest first     | `--chain` (default all), `--limit` 1-100 (default 20)  |
| `defi-holdings`       | DeFi holdings grouped by protocol, with summary totals (all chains) | none                                                   |
| `entity-search`       | Search canonical Nansen entity names (funds, exchanges, protocols)  | requires `--query <text>` (min 2 chars), no `--wallet` |

Also under `tribes-cli wallet-data` — BirdEye-backed, Solana-only (no `--chain` flag):

| Subcommand          | Purpose                                                      | Useful flags                                                                           |
| ------------------- | ------------------------------------------------------------ | -------------------------------------------------------------------------------------- |
| `net-worth`         | Current portfolio: holdings + total USD value, largest first | `--limit` 1-100 (default 20)                                                           |
| `net-worth-details` | Asset-level net-worth composition at a timepoint             | `--type 1h\|1d` (default 1d), `--time` YYYY-MM-DD HH:MM:SS (default latest), `--limit` |
| `net-worth-chart`   | Historical net-worth points across hourly/daily intervals    | `--type 1h\|1d` (default 1d), `--count` 1-30 (default 7)                               |
| `balance-change`    | Balance delta history (increases/decreases)                  | `--from`/`--to` (epoch seconds), `--limit` 1-100 (default 20)                          |
| `transfer-total`    | Aggregate transfer totals without full transfer rows         | none                                                                                   |

## Examples

### Portfolio snapshot (holdings and net worth)

```bash
tribes-cli wallet-data balances --wallet <address>
tribes-cli wallet-data net-worth --wallet <address>
```

Sum USD values for net worth; report composition from the largest positions.

### Performance review (30-day PnL)

```bash
tribes-cli wallet-data pnl --wallet <address>
tribes-cli wallet-data transactions --wallet <address> --limit 50
```

Lead with realized/unrealized totals and top tokens from `pnl`; use `transactions` to explain
what drove the result.

### Activity and flows

```bash
tribes-cli wallet-data transactions --wallet <address> --limit 100
tribes-cli wallet-data counterparties --wallet <address> --limit 20
```

### Who is this wallet?

```bash
tribes-cli wallet-data labels --wallet <address>
tribes-cli wallet-data related --wallet <address> --chain ethereum
tribes-cli wallet-data counterparties --wallet <address>
```

Combine labels, related addresses, and counterparties into an identity read: entity type,
likely operators, and notable flow partners.

## Error recovery

| Symptom               | Action                                                                       |
| --------------------- | ---------------------------------------------------------------------------- |
| Key-not-set error     | Provider unconfigured on this box — report it; do not retry or work around.  |
| Unknown option error  | Drop the extra flag — see the command reference for each subcommand's flags. |
| Any other API failure | Retry the same command once; if it fails again, stop and report the error.   |

## Related skills

- `zipbox-wallet` — the agent's own addresses, wallet IDs, raw balance JSON, and broadcasting
  prepared transactions.
- `hyperliquid` — live Hyperliquid balances, positions, and open orders.
