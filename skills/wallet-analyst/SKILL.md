---
name: wallet-analyst
description: >-
  Portfolio analytics for arbitrary third-party wallet addresses. Handles: current balances and
  net worth, 30-day trading PnL with top tokens, transaction history and transfer flows, wallet
  labels (fund, smart trader, exchange), top counterparties, and related-wallet discovery. Call
  when the question is what a wallet holds, how it performed, or who is behind it. NOT for: the
  agent's own tribes wallet addresses/IDs or raw pre-trade balances (use zipbox-wallet); live
  Hyperliquid positions, orders, or perp/spot balances (use hyperliquid).
allowed-tools: bash read
---

# Wallet Analyst

Backing command groups: `tribes-cli wallet-data` (Nansen wallet intelligence) plus
`tribes-cli token-data wallet-portfolio` (BirdEye portfolio detail, default Solana) — structured
JSON, answering in seconds. YOU are the analyst: pull the numbers with the subcommands below and
do the interpretation — performance reads, flow attribution, identity profiling — yourself.
There is no backend specialist behind this skill and no `ask` subcommand.

## When to use

- Current holdings and USD net worth of a wallet (`balances`, `wallet-portfolio` for Solana
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
2. `--wallet <address>` is required on every subcommand. NEVER assume a default wallet — an
   explicit address must come from the user or from `zipbox-wallet`.
3. Lookback windows are fixed: `counterparties`, `transactions`, and `pnl` cover the last 30
   days. There is no timeframe flag — do not promise arbitrary ranges; state the window in your
   answer.
4. Chain defaults differ: most subcommands default `--chain all`; `related` defaults `ethereum`
   and does not accept `all`; `token-data wallet-portfolio` defaults `solana`.
5. If a command reports the provider key is not set, the capability is unavailable on this box —
   report that plainly instead of retrying or working around it.

## Command reference

All read-only; every subcommand requires `--wallet <address>` and accepts `--out <file>`.

Under `tribes-cli wallet-data`:

| Subcommand       | Purpose                                                      | Useful flags                                          |
| ---------------- | ------------------------------------------------------------ | ----------------------------------------------------- |
| `balances`       | Current token balances, largest USD value first              | `--chain ethereum\|solana\|base\|all` (default all)   |
| `labels`         | Nansen labels on the wallet (fund, smart trader, exchange)   | `--chain` (default all)                               |
| `counterparties` | Top counterparties over the last 30 days by volume           | `--chain` (default all), `--limit` 1-100 (default 20) |
| `transactions`   | Recent transactions (last 30 days), newest first             | `--chain` (default all), `--limit` 1-100 (default 20) |
| `related`        | Related wallets (funding, first-in, common deployers)        | `--chain ethereum\|solana\|base` (default ethereum)   |
| `pnl`            | Trading PnL summary over the last 30 days, with top-5 tokens | `--chain` (default all)                               |

Under `tribes-cli token-data`:

| Subcommand         | Purpose                               | Useful flags                                      |
| ------------------ | ------------------------------------- | ------------------------------------------------- |
| `wallet-portfolio` | Wallet token balances with USD values | `--chain solana\|ethereum\|base` (default solana) |

## Examples

### Portfolio snapshot (holdings and net worth)

```bash
tribes-cli wallet-data balances --wallet <address>
tribes-cli token-data wallet-portfolio --wallet <address> --chain solana
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
