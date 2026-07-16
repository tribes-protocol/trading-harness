---
name: wallet-analyst
description: >-
  Portfolio analytics for any wallet address. Handles: token balances with USD values, current
  EVM net worth, realized PnL and win rate per wallet (Nansen), direction-labeled transfer
  history, ENS name-to-address resolution for the wallet under analysis, and the "how did this
  wallet perform" synthesis. Call when the question is how a wallet performed or what happened
  in it — the agent's own or any third-party address. NOT for: wallet addresses/IDs or raw
  pre-trade balances (use wallet); live Hyperliquid positions, orders, or perp/spot balances
  (use hyperliquid).
allowed-tools: bash read
---

# Wallet Analyst

A playbook over fast structured commands, not a remote analyst: `tribes-cli onchain`
(Moralis/Alchemy/Helius wallet forensics), `tribes-cli smart-money wallet-pnl` (Nansen),
`tribes-cli wallet resolve-ens`, and `tribes-cli token price` return JSON in seconds, and Pi
does the synthesis itself. Follows the market-data reliability invariants in AGENTS.md
(sources + timestamps, facts vs interpretation vs calculation, partial results). Research-only:
this skill never places orders. Requires an auth token (run `tribes-cli login` once if commands
fail with auth errors). Every command here is fast — no long bash timeouts needed.

## When to use

- Holdings and composition of any address: token balances with USD values.
- Current net worth (EVM chains — a single snapshot, not a trend; see Limitations).
- Realized PnL, win rate, and top tokens for a wallet (Nansen `wallet-pnl`).
- Transfer activity and transaction history, direction-labeled.
- "How did this wallet perform?" — the full recipe in Procedure below.
- Resolving an ENS name to an address (or reverse) before analyzing it.
- NOT for the agent's addresses, wallet IDs, or a raw balance snapshot before a trade — use
  `wallet`.
- NOT for Hyperliquid positions, open orders, or perp/spot balances — use `hyperliquid`.

## Command reference

Chain ids: `1 8453 56 42161 10 137 solana`. All commands below accept `--out <file>`.

| Command                  | Purpose                                              | Required flags                |
| ------------------------ | ---------------------------------------------------- | ----------------------------- |
| `onchain balances`       | Token balances with USD values (`--limit` ≤200)      | `--address`, `--chain`        |
| `onchain net-worth`      | Total USD net worth, EVM chains only (`--chains`)    | `--address`                   |
| `onchain transfers`      | Recent transfers, direction-labeled (`--limit` ≤100) | `--address`, `--chain`        |
| `smart-money wallet-pnl` | Realized PnL, win rate, top tokens (`--days`)        | `--address`, `--chain`        |
| `wallet resolve-ens`     | ENS forward/reverse resolution, mainnet              | `--name` OR `--address` (one) |
| `token price`            | Live price + liquidity, to value one holding         | `--address`, `--chain`        |

When the user means their own wallet ("my wallet", "our PnL"), get the address from
`tribes-cli wallet list` first — never assume a default address.

## Procedure: "how did this wallet perform?"

1. Resolve identity. An ENS name resolves on mainnet:

   ```bash
   tribes-cli wallet resolve-ens --name vitalik.eth
   ```

   The agent's own address comes from `tribes-cli wallet list`. A raw address is used as-is.

2. Snapshot + PnL + activity — the legs are independent, so run them as ONE parallel batch
   (example: an EVM wallet on Ethereum mainnet, `--chain 1`):

   ```bash
   tribes-cli onchain balances --address 0xd8dA6BF26964aF9D7eEd9e03E9153e2503B9EbA5 --chain 1 --limit 50 --out /tmp/wa-balances.json
   tribes-cli onchain net-worth --address 0xd8dA6BF26964aF9D7eEd9e03E9153e2503B9EbA5 --chains 1,8453 --out /tmp/wa-networth.json
   tribes-cli smart-money wallet-pnl --address 0xd8dA6BF26964aF9D7eEd9e03E9153e2503B9EbA5 --chain 1 --days 30 --out /tmp/wa-pnl.json
   tribes-cli onchain transfers --address 0xd8dA6BF26964aF9D7eEd9e03E9153e2503B9EbA5 --chain 1 --limit 50 --out /tmp/wa-transfers.json
   ```

   For a Solana wallet use `--chain solana` on `balances`, `transfers`, and `wallet-pnl`, and
   skip `net-worth` (EVM only) — total the USD values from `balances` instead and label the sum
   as computed.

3. Value a specific holding when `balances` lacks a USD figure for it (illiquid or long-tail
   token):

   ```bash
   tribes-cli token price --address 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2 --chain 1
   ```

   balance × live price is YOUR calculation — label it as such, with the price timestamp.

4. Synthesize, keeping facts, calculations, and interpretation visibly distinct. Facts: net
   worth and composition (snapshot), realized PnL/win rate/top tokens, transfer counts and
   notable in/out flows. Calculations: any totals or marks you computed. Interpretation: what
   the activity pattern suggests (accumulating, distributing, rotating). If a leg failed after
   one retry, present the rest and name the gap — never fabricate a value.

## Output template

```markdown
# Wallet review — <address or ENS> — <UTC timestamp>

- Net worth: $<v> across chains <list> [source: onchain net-worth (EVM), as-of <ts>] — single
  snapshot, no trend available
- Composition: <top holdings with USD> [source: onchain balances]
- Realized PnL (<days>d): $<v>, win rate <v>%, top tokens <list> [source: nansen wallet-pnl] —
  realized only; unrealized not available
- Activity: <n> in / <n> out; notable: <dated flows> [source: onchain transfers]
- Read: <interpretation, labeled as such>
- Gaps: <failed legs / unindexed data, or "none">
```

## Error recovery

| Symptom                                   | Action                                                                                                                                        |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Auth error (unauthorized/expired token)   | Run `tribes-cli login`, retry the original command once, then stop and report.                                                                |
| Non-auth failure (provider error/timeout) | Retry the same command once; if it fails again, stop and report — in the multi-leg recipe, continue with the remaining legs and name the gap. |
| `net-worth` asked for a Solana wallet     | By design, not an error: EVM only. Sum USD values from `balances --chain solana` and label the total computed.                                |
| `wallet-pnl` returns empty/no data        | Nansen has not indexed that wallet/chain — report the gap; do NOT infer PnL from balances.                                                    |
| `resolve-ens` finds no record             | Ask for the raw address; never guess one.                                                                                                     |
| A balance row has no USD value            | Value it via `token price` (step 3) and label the figure computed, or report it as unpriced.                                                  |

## Limitations

- No net-worth-over-time trend: the remote analyst that charted value history is gone.
  `net-worth` is one current snapshot; the story of a period comes from `transfers` (what moved
  in and out, when), not a value curve. Say so rather than implying a trend.
- Unrealized PnL is unavailable: `wallet-pnl` reports Nansen REALIZED PnL only (plus win rate
  and top tokens). Marking open holdings to market is your own balances × `token price`
  calculation and must be labeled as such.
- `net-worth` covers EVM chains only; Solana net worth is a computed sum of `balances` USD
  values.
- Attribution ("why did the value change?") is inference from transfers plus realized PnL —
  interpretation, never a provider fact, and never presented as certain.
- Coverage is bounded by the supported chains (`1 8453 56 42161 10 137 solana`) and by what
  Nansen/Moralis/Alchemy/Helius index; a quiet result is "not indexed", not "no activity".

## Related skills

- `wallet` — the agent's addresses, wallet IDs, and raw balance JSON needed before execution.
- `hyperliquid` — live Hyperliquid balances, positions, and open orders.
- `token-analyst` — deep dive on one token found in a wallet (safety, holders, trades).
- `alpha-scout` — market-wide smart-money flows (`netflows`, `holdings`, `dex-trades`), not one
  wallet.
- `transaction` — broadcast prepared transactions and check a transaction's status.
