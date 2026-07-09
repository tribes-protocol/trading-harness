---
name: wallet-analyst
description: >-
  Portfolio analytics for any wallet address. Handles: net worth and its trend over time,
  realized and unrealized PnL (overall and per-token), balance changes, transfer tracking, and
  transaction history. Call when the question is how a wallet performed or what happened in it —
  the agent's own or any third-party address. NOT for: wallet addresses/IDs or raw pre-trade
  balances (use wallet); live Hyperliquid positions, orders, or perp/spot balances (use
  hyperliquid).
allowed-tools: bash read
---

# Wallet Analyst

Backing command group: `tribes-cli wallet-analyst`. One subcommand, `ask`, sends a
natural-language query to the specialist; output is one free-text analysis string, not JSON.
Requires: an auth token (run `tribes-cli login` once if commands fail with auth errors).

## When to use

- Net worth now or its trend over time (24h/7d/30d).
- Realized and unrealized PnL, overall or per-token.
- Transfer activity, transaction history, balance changes.
- Attribution: why a wallet's value changed over a period.
- NOT for the agent's addresses, wallet IDs, or a raw balance snapshot before a trade — use
  `wallet`.
- NOT for Hyperliquid positions, open orders, or perp/spot balances — use `hyperliquid`.

## Hard rules

1. MUST set a bash timeout of at least 120 seconds (prefer 300) — `ask` polls a backend agent.
2. The ONLY flag is `--query`. There is no `--out`, no `--address`, no timeframe flag — write
   the wallet address, timeframe, and focus into the query text itself.
3. MUST run `tribes-cli wallet list` first and embed the returned address in the query. NEVER
   assume a default wallet.
   Wrong: `--query "my PnL last 30d"` (no address — may analyze the wrong or no wallet).
   Right: `--query "realized and unrealized PnL for <evm-address> over the last 30d"`.
4. The CLI calls the API itself — NEVER call the endpoint or curl directly.
5. Treat the specialist's trailing "want me to…" suggestions as your own TODO: run at most 1–2
   refinement asks, then present the sharpened answer (see AGENTS.md).

## Command reference

| Subcommand | Purpose                                    | Required flags | Read-only or signed |
| ---------- | ------------------------------------------ | -------------- | ------------------- |
| `ask`      | Natural-language portfolio analytics query | `--query`      | read-only           |

## Examples

### Portfolio snapshot (holdings and net worth)

```bash
tribes-cli wallet-analyst ask \
  --query "current holdings and total USD net worth for <evm-address> across all chains, with composition breakdown"
```

### Performance review (PnL)

```bash
tribes-cli wallet-analyst ask \
  --query "realized and unrealized PnL for <evm-address> over the last 30d, overall and per-token"
```

### Activity and flows

```bash
tribes-cli wallet-analyst ask \
  --query "all transfers in and out of <evm-address> in the last 7d, with totals per token"
```

### Net worth change attribution

```bash
tribes-cli wallet-analyst ask \
  --query "why did the net worth of <evm-address> change over the last 7d — balance changes and PnL context"
```

## Error recovery

| Symptom                                              | Action                                                                                       |
| ---------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Auth error (unauthorized/expired token)              | Run `tribes-cli login`, retry the original command once, then stop and report.               |
| `Wallet analyst request failed: <status>` (non-auth) | Retry the same command once; if it fails again, stop and report the error.                   |
| Answer covers the wrong or no wallet                 | You omitted the address — rerun with the address from `tribes-cli wallet list` in the query. |

## Related skills

- `wallet` — addresses, wallet IDs, and raw balance JSON needed before execution.
- `hyperliquid` — live Hyperliquid balances, positions, and open orders.
- `transaction` — broadcast prepared transactions and check a transaction's status.
