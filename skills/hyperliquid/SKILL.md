---
name: hyperliquid
description: >-
  Everything on the Hyperliquid venue. Handles: market discovery (perp dexes, tradable perp/spot
  assets), account state (balances, positions, open orders, fills), and live execution (perp and
  Hyperliquid-spot orders, TWAP/scale orders, deposits, withdrawals, internal transfers, leverage
  and margin). Securities and commodities trade as Hyperliquid perps on named dexes, so ALL
  security and commodity perp trades route here. NOT for: opening a new position end-to-end with pre/post checks (use
  trade-execution); protecting, resizing, or closing existing positions (use
  position-management); on-chain DEX swaps or bridges — "spot" here means Hyperliquid's own spot
  exchange only (use spot-trading); wallet IDs, addresses, or cross-chain balances (use wallet);
  net worth or PnL history (use wallet-analyst); CEX/derivatives research (use research-analyst).
allowed-tools: bash read
---

# Hyperliquid

Backing command group: `tribes-cli hyperliquid` — market discovery, account state, and live
execution. Requires an auth token (`tribes-cli login` on auth errors) and `evmWalletId` + EVM
address from `wallet` for signed commands.

## When to use

- List perp dexes or tradable perp/spot assets — `list-exchanges`, `list-assets`.
- Read Hyperliquid balances, positions, open orders, or fills — the `list-*` account queries.
- Place, slice, or cancel perp and spot orders — `trade-*`, `scale-*`, `twap-*`, `cancel-*`.
- Move funds — `deposit`, `withdraw`, and the `transfer-*` commands.
- Trade a security or commodity — find the exact hosting dex and coin through
  `list-assets --all-dexes`, then `trade-perp --dex <name>`.
- NOT for on-chain DEX swaps or cross-chain bridges — use `spot-trading`.
- NOT for wallet IDs, addresses, or cross-chain token balances — use `wallet`.
- NOT for net worth over time, PnL, or transaction history — use `wallet-analyst`.
- NOT for the end-to-end trade playbook with pre/post checks — use `trade-execution`.

## Hard rules

1. Ambiguous fund movement: for withdraw/deposit/transfer/send requests, if the action
   ("transfer" may mean withdraw, send to another user, or an internal move), scope (perp vs
   spot, which tokens/dexes), exact amount, or destination is not pinned down, STOP and ask the
   user with concrete options BEFORE running any command, including read-only lookups. Applies
   ONLY to fund movement — never to cancel, close, or read-only queries.
2. NEVER mix wallet IDs: `--wallet-id` MUST be the `evmWalletId` whose `evmWalletAddress` you
   pass as `--from`.
3. Every signed command MUST carry an explicit `--from` and `--wallet-id`.
4. Review the full command payload internally before broadcasting; describe the action to the
   user in plain language — NEVER show them a command (AGENTS.md).
5. Gas is sponsored — NEVER preflight gas or ask the user to fund gas (see AGENTS.md).
6. Order `--amount` is BASE UNITS (contracts/tokens), NEVER USD — convert first (see Sizing).
7. NEVER hardcode a dex name — resolve it from `list-assets --all-dexes`; use
   `list-exchanges` only when its human-readable venue label is needed.
8. `transfer-usd` draws from the PERP balance only. If the USDC sits in spot, run
   `transfer-usd-class --direction spot-to-perp` first.

## Wallet setup (before any signed command)

Run `tribes-cli wallet list` (`wallet` skill). From its JSON output use:

- `evmWalletId` (for example `wxyz1abcd2efgh3ijkl4mnop`) → `--wallet-id`.
- `evmWalletAddress` (for example `0x1111111111111111111111111111111111111111`) → `--from` on
  signed commands and `--address` on read-only account queries.

## Command reference

Every subcommand accepts `--out <file>` to write JSON output to a file. Signed commands all
require `--from` and `--wallet-id`; the Required-flags column lists only the other required
flags. Defaults: `--dex main`, `--type market`, `--tif Gtc`, `--margin-mode cross`.

| Subcommand           | Purpose                                                                | Required flags                                                       | Read-only or signed |
| -------------------- | ---------------------------------------------------------------------- | -------------------------------------------------------------------- | ------------------- |
| `list-exchanges`     | List perp dexes, including `main`                                      | none                                                                 | read-only           |
| `list-assets`        | Tradable assets; use `--all-dexes`, `--dex <name>`, or `--market spot` | none                                                                 | read-only           |
| `movers`             | Top 24h movers + funding extremes for one dex (live markets only)      | none (`--dex`, `--min-volume`, `--limit`)                            | read-only           |
| `list-balances`      | Perp account summary + spot token balances                             | `--address`                                                          | read-only           |
| `list-positions`     | Open perp positions AND active TWAPs (source of `twapId`)              | `--address`                                                          | read-only           |
| `list-open-orders`   | Resting orders, perp + spot                                            | `--address`                                                          | read-only           |
| `list-fills`         | Trade fills                                                            | `--address`                                                          | read-only           |
| `deposit`            | Arbitrum native USDC → Hyperliquid bridge                              | `--amount` (decimal USDC)                                            | signed              |
| `withdraw`           | USDC from Hyperliquid to an EVM address                                | `--amount`, `--destination`                                          | signed              |
| `trade-perp`         | Perp order; `--tp-px`/`--sl-px` attach an atomic OCO bracket           | `--coin`, `--amount`, `--side`                                       | signed              |
| `trade-spot`         | Hyperliquid spot order (market or limit)                               | `--pair`, `--amount`, `--side`                                       | signed              |
| `scale-perp`         | Ladder of 2–50 perp limit legs across a price range                    | `--coin`, `--amount`, `--side`, `--start-px`, `--end-px`, `--orders` | signed              |
| `scale-spot`         | Ladder of spot limit legs across a price range                         | `--pair`, `--amount`, `--side`, `--start-px`, `--end-px`, `--orders` | signed              |
| `twap-perp`          | Perp order sliced over 5–1440 minutes                                  | `--coin`, `--amount`, `--side`, `--duration-minutes`                 | signed              |
| `twap-spot`          | Spot order sliced over 5–1440 minutes                                  | `--pair`, `--amount`, `--side`, `--duration-minutes`                 | signed              |
| `twap-cancel`        | Cancel a running perp TWAP                                             | `--coin`, `--twap-id`                                                | signed              |
| `twap-cancel-spot`   | Cancel a running spot TWAP                                             | `--pair`, `--twap-id`                                                | signed              |
| `cancel-order`       | Cancel one resting perp order                                          | `--coin`, `--order-id`                                               | signed              |
| `cancel-order-spot`  | Cancel one resting spot order                                          | `--pair`, `--order-id`                                               | signed              |
| `set-leverage`       | Update perp leverage without placing an order                          | `--coin`, `--leverage`                                               | signed              |
| `adjust-margin`      | Add/remove isolated margin (`--direction`, default `add`)              | `--coin`, `--amount`, `--side`                                       | signed              |
| `transfer-usd-class` | Move USDC between spot and perp wallets                                | `--amount`, `--direction`                                            | signed              |
| `transfer-usd`       | Send USDC from the PERP balance to another Hyperliquid user            | `--amount`, `--destination`                                          | signed              |
| `transfer-spot`      | Send spot tokens to another Hyperliquid user                           | `--amount`, `--destination`, `--token`                               | signed              |
| `transfer-dex-cash`  | Move token balances between dexes (`spot` is a valid dex)              | `--amount`, `--source-dex`, `--destination-dex`                      | signed              |

Reference files — read on trigger:

- For limit, stop, take, or bracket orders and full option flags, read `references/order-types.md`.
- To fund Hyperliquid from any other chain or token, read `references/funding-paths.md`.
- Before any leverage or margin change, read `references/margin.md`.

## Order batching (fewest signed actions)

Map intent to the fewest atomic CLI calls. One command per mechanism, never one per leg.

| Intent                                   | Use                                                     | Do NOT split into                            |
| ---------------------------------------- | ------------------------------------------------------- | -------------------------------------------- |
| Entry + TP and/or SL on the entry size   | One `trade-perp` with `--tp-px`/`--sl-px` (OCO bracket) | Entry, then separate `stop_*`/`take_*` calls |
| Multiple limit legs across a price range | One `scale-perp` / `scale-spot` with `--orders N`       | N separate limit orders                      |
| Time-sliced execution                    | One `twap-perp` / `twap-spot`                           | Many manual market/limit clips               |

- Standalone `stop_*`/`take_*` orders only adjust exits on an EXISTING position (`--reduce-only`).
- NEVER double-book the same exit on the same size (bracket TP plus a duplicate trigger order).

## All-dex discovery and market-quality review

Before presenting a perp as tradable or preparing an order, run:

```bash
tribes-cli hyperliquid list-assets --all-dexes --out /tmp/all-dexes.json
tribes-cli hyperliquid list-assets --market spot
```

Write the sweep to a file (`--out`) and read every dex section in full — inline reads truncate, and
a section you never reach is not evidence. Read the `xyz` dex FIRST (it hosts most stock and
commodity perps); never call an asset, class, or venue "delisted"/"not tradable" from an unread
section. Use `list-exchanges` only to resolve a venue label; never assume a dex. A HIP-3 market
needs usable `referencePx`, coherent `midPx`/`oraclePx`, nonzero `dayNtlVlm`/`dayBaseVlm`/
`openInterest`, tolerable `impactPxs`, exchange-enforced `maxLeverage`/min notional, and no
`isDelisted` flag; honor `requiresIsolatedMargin`/`onlyIsolated`/`marginMode`. Missing, zero, stale, or inconsistent data means `Listed but not currently actionable`; never infer liquidity externally.

## Sizing: convert "$N worth" and percentages first

There are no `--notional` or `--percent` flags. Convert intent to literal numbers before calling:

1. Get the reference price: `list-assets --dex <name>` (or `--market spot`); read `referencePx` and
   `szDecimals`.
2. Size from USD notional: `amount = round(usd / referencePx, szDecimals)`. Example: $500 of a
   resolved security at referencePx 382.605 with szDecimals 3 → `500 / 382.605 = 1.3068` →
   `--amount 1.307`.
3. Percent targets from the entry reference (referencePx for a market entry, `--price` for a limit
   entry): long TP `ref * (1 + pct)`, SL `ref * (1 - pct)`; short inverts both.
4. Every price flag (`--price`, `--trigger-px`, `--tp-px`, `--sl-px`, `--start-px`, `--end-px`,
   ...) is an absolute price; prices auto-format to valid ticks, so reasonable rounding is fine.

## Enter a perp with a bracket

Long a resolved security perp with a technical target and invalidation:

```bash
tribes-cli hyperliquid trade-perp \
  --dex <resolved-dex> \
  --coin <resolved-coin> \
  --side long \
  --type market \
  --amount <base-units> \
  --tp-px <technical-target-px> \
  --sl-px <technical-invalidation-px> \
  --from 0x1111111111111111111111111111111111111111 \
  --wallet-id <evmWalletId>
```

## TWAP an entry

Each of the `durationMinutes * 2` sub-orders (one per 30s) must be ≥ $10 notional; the CLI
rejects too-small TWAPs before signing — raise `--amount` or lower `--duration-minutes`.

```bash
tribes-cli hyperliquid twap-perp \
  --from 0x1111111111111111111111111111111111111111 \
  --coin BTC \
  --side long \
  --amount 0.5 \
  --duration-minutes 30 \
  --randomize \
  --wallet-id <evmWalletId>
```

Keep the returned `twapId`; cancel early with `twap-cancel --coin BTC --twap-id <twap-id>`.
Running TWAPs and their `twapId` also appear in `list-positions`.

## Scale (ladder) entry

Each leg must be ≥ $10 notional (rejected before signing) — raise `--amount` or cut `--orders`.

```bash
tribes-cli hyperliquid scale-perp \
  --from 0x1111111111111111111111111111111111111111 \
  --coin BTC \
  --side long \
  --amount 0.01 \
  --start-px 95000 \
  --end-px 98000 \
  --orders 5 \
  --size-skew 1.5 \
  --wallet-id <evmWalletId>
```

## Hyperliquid spot order

```bash
tribes-cli hyperliquid trade-spot \
  --from 0x1111111111111111111111111111111111111111 \
  --pair HYPE/USDC \
  --side buy \
  --type market \
  --amount 10 \
  --wallet-id <evmWalletId>
```

## Cancel a resting order (two steps)

A resting ORDER is unfilled — cancel it here. A filled POSITION is closed with
`trade-perp --reduce-only`, never with cancel.

```bash
# 1. Find orderId, coin/pair, market, and dex
tribes-cli hyperliquid list-open-orders \
  --address 0x1111111111111111111111111111111111111111 \
  --all-dexes

# 2. market "perp" → cancel-order (pass --dex from step 1); market "spot" → cancel-order-spot --pair
tribes-cli hyperliquid cancel-order \
  --from 0x1111111111111111111111111111111111111111 \
  --dex <resolved-dex> \
  --coin <resolved-coin> \
  --order-id <order-id> \
  --wallet-id <evmWalletId>
```

Repeat step 2 once per `orderId`. Running TWAPs are NOT resting orders — cancel them with
`twap-cancel` / `twap-cancel-spot`.

## Internal transfers

```bash
# Spot USDC → perp margin (required before transfer-usd when funds sit in spot)
tribes-cli hyperliquid transfer-usd-class \
  --amount 25 \
  --from 0x1111111111111111111111111111111111111111 \
  --direction spot-to-perp \
  --wallet-id <evmWalletId>

# Send USDC (perp balance) to another Hyperliquid user
tribes-cli hyperliquid transfer-usd \
  --amount 25 \
  --from 0x1111111111111111111111111111111111111111 \
  --destination 0x2222222222222222222222222222222222222222 \
  --wallet-id <evmWalletId>
```

`transfer-spot` sends spot tokens (`--token HYPE`) to another user. `transfer-dex-cash` moves
balances between dexes: `--source-dex`/`--destination-dex` accept `main`, `spot`, or any named
dex from `list-exchanges`, and must differ.

## Deposit and withdraw

Deposits are Arbitrum native USDC only: minimum 5 USDC, `--amount` in decimal units, credited to
the Hyperliquid account of the `--from` address. If the source funds are on another chain or in
another token, read `references/funding-paths.md` first.

```bash
# Deposit 25 USDC (Arbitrum → Hyperliquid bridge)
tribes-cli hyperliquid deposit \
  --amount 25 \
  --from 0x1111111111111111111111111111111111111111 \
  --wallet-id <evmWalletId>

# Withdraw 20 USDC from Hyperliquid to an EVM address
tribes-cli hyperliquid withdraw \
  --amount 20 \
  --from 0x1111111111111111111111111111111111111111 \
  --destination 0x2222222222222222222222222222222222222222 \
  --wallet-id <evmWalletId>
```

## Error recovery

| Symptom                                        | Action                                                                                                                                                                                                                                                                                                                            |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Auth error (unauthorized, expired token)       | Run `tribes-cli login`, retry the original command once, then stop and report.                                                                                                                                                                                                                                                    |
| Trade failed: insufficient balance/margin      | This is trading balance, not gas. 1) `tribes-cli wallet assets` to find fundable assets; 2) tell the user the trade needs more balance and propose a deposit, naming what you found; 3) on confirmation, fund via `references/funding-paths.md` and retry the trade once; 4) nothing fundable → STOP and ask the user to deposit. |
| TWAP/scale rejected before signing (< $10/leg) | Increase `--amount`, or lower `--duration-minutes` / `--orders`, then retry.                                                                                                                                                                                                                                                      |
| Order size or price rejected                   | Re-check the base-unit conversion and `szDecimals` rounding (see Sizing), then retry once.                                                                                                                                                                                                                                        |
| Leverage/margin change rejected                | Run the precheck in `references/margin.md`; add margin or reduce size, then retry once.                                                                                                                                                                                                                                           |
| Any other API failure                          | Retry the same command once; if it fails again, stop and report the error.                                                                                                                                                                                                                                                        |

## Related skills

- `wallet` — `evmWalletId` and addresses; run before any signed command.
- `spot-trading` + `transaction` — on-chain swaps/bridges and their broadcast (funding flow).
- `position-management` — stops, leverage policy, liquidation distance, closing positions.

## Before you finish

- [ ] Ambiguous fund movement was clarified with the user BEFORE any command ran.
- [ ] Every signed call used the `evmWalletId` matching its `--from`; payload reviewed internally.
- [ ] Intent was batched into the fewest atomic calls (bracket/scale/twap; no double-booked exits).
- [ ] Result verified with `list-open-orders` / `list-positions` / `list-fills`.
- [ ] User got a plain-language report — no commands, flags, or file paths.
