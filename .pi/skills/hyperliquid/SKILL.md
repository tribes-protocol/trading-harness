---
name: hyperliquid
description: Hyperliquid market discovery (list exchanges/perp dexes and tradable perp/spot assets) plus live execution for deposits, withdrawals, perp/spot orders, and internal balance transfers. Use when listing Hyperliquid markets or placing/moving live Hyperliquid funds.
compatibility: Designed for the autonomous-trading-agent harness. Requires Bun, `API_BASE_URL` + `PRIVY_APP_ID`, the transaction skill, and wallet skill output for `evmWalletId` + signer address.
allowed-tools: bash read
---

# Hyperliquid

Use this skill to discover Hyperliquid markets (exchanges and assets) and to run
live Hyperliquid execution flows.

The `list-exchanges` and `list-assets` commands are read-only market discovery:
they hit Hyperliquid's public info API and need no wallet, signer, or
execution wallet context. Skip the wallet-discovery workflow below for them.

## Clarify ambiguous requests before acting

Before running ANY command (including read-only balance/help lookups) for a
fund-movement request, check whether the request is fully specified. If
required details are missing or ambiguous, STOP and ask the user with concrete
options. Do not start mapping a command path, running help, or reading balances
to "figure out what they meant" — asking first is faster and safer than
exploring.

A fund-movement request is only unambiguous when ALL of these are pinned down:

- **Action**: withdraw to an external chain vs. transfer to another Hyperliquid
  account vs. internal move (spot/perp class, between dexes). "Transfer" and
  "send" are ambiguous — confirm which one.
- **What funds**: which balances are in scope. Funds can live in perp USDC, spot
  USDC, and other spot tokens across multiple dexes. "All funds" is ambiguous —
  confirm whether it means only withdrawable USDC, every token, positions must
  be closed first, etc.
- **Amount**: an exact amount, or an explicit "everything" that you have
  confirmed maps to a specific computed total. The CLI requires exact amounts.
- **Destination**: a specific address, and whether it is an external chain
  withdrawal or another Hyperliquid user.

Examples that MUST trigger a clarifying question before any command runs:

- "transfer all my Hyperliquid funds to 0x..." — ambiguous action ("transfer"
  could mean withdraw or send to a Hyperliquid user) AND ambiguous scope ("all
  funds" spans perp/spot/other tokens, and may require class transfers or
  closing positions first).
- "move everything", "send my balance", "withdraw it all" — scope and exact
  amount are not pinned down.

When you ask, present the specific decisions as options (action, scope,
destination type) rather than silently picking one. Only after the user
confirms the exact action, scope, amount(s), and destination should you fetch
balances and build the command payload.

## Compatibility

- Depends on the `wallet` skill for wallet discovery.
- Depends on transaction signing via `the transaction skill`.
- Use wallet CLI output as the source of `walletId` and signer `from` address.
- Do not read `.pi/privy-wallets.json` directly in the workflow.

## Requirements

- `API_BASE_URL` and `PRIVY_APP_ID` must be available.
- Caller provides `walletId` (and signer `--from` where required) to execution commands.

## Workflow

1. Run wallet discovery with:
   - `tribes-cli wallet list`
2. Select the `evmWalletId` and matching EVM address for `--from`.
3. Build and review the exact command payload before broadcast.
4. Run the chosen Hyperliquid command with `--wallet-id`.

## CLI

```bash
tribes-cli hyperliquid --help
```

## Supported commands

Discovery (read-only, no wallet/signer):

- `list-exchanges` — list perp dexes (exchanges), including `main`
- `list-assets` — list tradable assets; scope with `--dex <name>` (perp) or
  `--market spot`
- `list-balances` — list perp account summary + spot token balances for an
  `--address` (read-only); scope perp with `--dex <name>`
- `list-positions` — list open perp positions for an `--address` (read-only);
  scope with `--dex <name>` or sweep everything with `--all-dexes`
- `list-open-orders` — list open resting orders (perp + spot) for an `--address`
  (read-only); scope with `--dex <name>` or sweep with `--all-dexes`
- `list-fills` — list trade fills for an `--address` (read-only); recent fills by
  default, or a time range with `--start-time` / `--end-time`

Execution (require `--wallet-id`; most also require signer `--from`):

- `deposit`
- `withdraw`
- `trade-perp` (single order, or atomic OCO bracket via `--tp-px`/`--sl-px`)
- `twap-perp` / `twap-spot` / `twap-cancel` / `twap-cancel-spot`
- `cancel-order` / `cancel-order-spot` (cancel resting limit/trigger orders by order id)
- `scale-perp` / `scale-spot` (ladder of limit orders across a price range)
- `trade-spot`
- `transfer-usd-class`
- `transfer-usd`
- `transfer-spot`
- `transfer-dex-cash`

## Command examples

### List exchanges (perp dexes)

```bash
tribes-cli hyperliquid list-exchanges
```

Returns `main` plus named dexes (for example: `xyz`, `flx`, `vntl`).

### List assets

```bash
# Perp assets on the main dex (default)
tribes-cli hyperliquid list-assets

# Perp assets on a named dex (exchange)
tribes-cli hyperliquid list-assets --dex xyz

# Spot pairs
tribes-cli hyperliquid list-assets --market spot
```

Each perp asset includes `name`, `szDecimals`, `maxLeverage`, and `markPx`; each
spot asset includes `pair`, `szDecimals`, and `markPx`. Use these names with
`trade-perp --coin` / `--dex`, `trade-spot --pair`, `scale-spot --pair`, and
`twap-spot --pair`.

### List balances

```bash
# Perp summary (main dex) + all spot token balances
tribes-cli hyperliquid list-balances \
  --address 0x1111111111111111111111111111111111111111

# Scope the perp summary to a named dex
tribes-cli hyperliquid list-balances \
  --address 0x1111111111111111111111111111111111111111 \
  --dex xyz
```

Returns `perp` (`accountValue`, `withdrawable`, `totalMarginUsed`, `totalNtlPos`)
and `spot` (per token: `coin`, `token`, `total`, `hold`, `available`, where
`available = total - hold`). This is a read-only info query — no wallet or
signer is required.

### List open positions

```bash
# Open positions on the main dex
tribes-cli hyperliquid list-positions \
  --address 0x1111111111111111111111111111111111111111

# Sweep main + every perp dex (use this before "close all positions")
tribes-cli hyperliquid list-positions \
  --address 0x1111111111111111111111111111111111111111 \
  --all-dexes
```

Returns an array of open positions (zero-size positions are filtered out), each
with `dex`, `coin`, `side` (`long`/`short`), `size` (absolute), `signedSize`,
`entryPx`, `positionValue`, `unrealizedPnl`, `returnOnEquity`, `liquidationPx`,
`leverage`, `leverageType` (`cross`/`isolated`), `marginUsed`, and `maxLeverage`.
Read-only — no wallet or signer required. Prefer this over ad-hoc inline scripts
when you need a per-position view (for example, to enumerate positions before
closing them with `trade-perp --reduce-only`).

### List open orders

```bash
# Open orders on the main dex (includes spot resting orders)
tribes-cli hyperliquid list-open-orders \
  --address 0x1111111111111111111111111111111111111111

# Perp open orders on a named dex (spot orders only appear on main)
tribes-cli hyperliquid list-open-orders \
  --address 0x1111111111111111111111111111111111111111 \
  --dex xyz

# Sweep main + every perp dex
tribes-cli hyperliquid list-open-orders \
  --address 0x1111111111111111111111111111111111111111 \
  --all-dexes
```

Returns an array of open orders, each with `dex`, `coin`, `market` (`perp`|`spot`),
`side` (`buy`|`sell`), `limitPx`, `size`, `origSize`, `orderId`, `timestamp`,
`orderType`, `tif`, `reduceOnly`, trigger/bracket fields, and optional `cloid`.
Use this to inspect resting limit/ trigger orders (including scale ladder legs).
Read-only — no wallet or signer required. Use the returned `orderId`, `coin`,
`market`, and `dex` to cancel a resting order with `cancel-order` or
`cancel-order-spot` (see below).

### Cancel an open order

**Order vs position:** a resting **order** is an unfilled limit or trigger on
the book — cancel it with `cancel-order` / `cancel-order-spot`. A filled
**position** is an open long/short you are holding — close it with
`trade-perp --reduce-only` (see `list-positions`). Do not confuse the two.

When the user asks to "close/cancel an open order", run this two-step flow.
Do not explore help or balances first — go straight to listing and cancelling.

1. **List** resting orders to get `orderId`, `coin`/`pair`, `market`, and `dex`:

```bash
tribes-cli hyperliquid list-open-orders \
  --address 0x1111111111111111111111111111111111111111 \
  --all-dexes
```

2. **Cancel** the target order. Pick the command from `market`:

```bash
# Perp resting order (limit, trigger, scale leg, etc.)
tribes-cli hyperliquid cancel-order \
  --from 0x1111111111111111111111111111111111111111 \
  --coin BTC \
  --order-id 123456789 \
  --wallet-id "<evmWalletId from wallet list>"

# Perp on a named dex — pass --dex from list-open-orders
tribes-cli hyperliquid cancel-order \
  --from 0x1111111111111111111111111111111111111111 \
  --dex xyz \
  --coin MSFT \
  --order-id 123456789 \
  --wallet-id "<evmWalletId from wallet list>"

# Spot resting order — use the pair from list-open-orders (coin field)
tribes-cli hyperliquid cancel-order-spot \
  --from 0x1111111111111111111111111111111111111111 \
  --pair HYPE/USDC \
  --order-id 123456789 \
  --wallet-id "<evmWalletId from wallet list>"
```

To cancel multiple resting orders, repeat step 2 once per `orderId`. Running
TWAPs are **not** resting orders — cancel those with `twap-cancel` /
`twap-cancel-spot` using the `twapId` from `list-positions`.

### List fills

```bash
# Up to 2000 most recent fills
tribes-cli hyperliquid list-fills \
  --address 0x1111111111111111111111111111111111111111

# Fills in a time range (paginate with the last fill timestamp as the next startTime)
tribes-cli hyperliquid list-fills \
  --address 0x1111111111111111111111111111111111111111 \
  --start-time 1700000000000 \
  --end-time 1700086400000
```

Returns an array of fills in API order, each with `dex`, `coin`, `market`, `side`, `price`, `size`,
`closedPnl`, `fee`, `feeToken`, `orderId`, `tradeId`, `timestamp`, `crossed`
(taker), optional `twapId`, and optional `liquidation` details. Without
`--start-time`, Hyperliquid returns up to 2000 most recent fills via `userFills`
(order not guaranteed). With `--start-time`, `userFillsByTime` returns oldest
first by default; pass `--reversed` for newest first (paginate using the last
fill timestamp as the next `startTime`). Read-only — no wallet or signer required.

### Deposit Arbitrum USDC to Hyperliquid

```bash
tribes-cli hyperliquid deposit \
  --amount 25 \
  --from 0x1111111111111111111111111111111111111111 \
  --wallet-id "<evmWalletId from wallet list>"
```

### Withdraw USDC from Hyperliquid

```bash
tribes-cli hyperliquid withdraw \
  --amount 2 \
  --from 0x1111111111111111111111111111111111111111 \
  --destination 0x2222222222222222222222222222222222222222 \
  --wallet-id "<evmWalletId from wallet list>"
```

### Converting "$N worth" and percentage targets (do this before any order)

Trade commands take sizes and prices as literal numbers — there are no
`--notional` / `--percent` flags. Convert intent into concrete values yourself
before calling, using the live mark price from `list-assets`. This applies to
every order type below (single, trigger, and bracket) and to spot orders.

- `--amount` is in **base units** (contracts / shares / tokens), not USD.
- Every price flag is an **absolute price**: `--price`, `--trigger-px`,
  `--tp-px`, `--sl-px`, `--tp-limit-px`, `--sl-limit-px`.

Steps:

1. Get the mark price: `list-assets --dex <dex>` for perps (or
   `list-assets --market spot`), field `markPx` — e.g. MSFT on `xyz` ≈ `382.605`.
2. Size from USD notional: `amount = round(usd / markPx, szDecimals)`. For `$500`
   and `szDecimals: 3` → `500 / 382.605 = 1.3068 → 1.307`.
3. Targets from percentages, relative to the entry reference (use `markPx` for a
   market entry, or your `--price` for a limit entry):
   - Long: take-profit `ref * (1 + pct)`, stop-loss `ref * (1 - pct)`.
     `+6% → 382.605 * 1.06 = 405.56`; `-3% → 382.605 * 0.97 = 371.13`.
   - Short: invert — take-profit `ref * (1 - pct)`, stop-loss `ref * (1 + pct)`.

Prices auto-format to valid ticks, so reasonable rounding is fine.

### Place a perp order

```bash
tribes-cli hyperliquid trade-perp \
  --from 0x1111111111111111111111111111111111111111 \
  --coin BTC \
  --side long \
  --type market \
  --amount 0.001 \
  --wallet-id "<evmWalletId from wallet list>"
```

### Place a stop-market perp order

Triggers a market order once `--trigger-px` is crossed. Use `--reduce-only` for a
protective stop on an existing position.

```bash
tribes-cli hyperliquid trade-perp \
  --from 0x1111111111111111111111111111111111111111 \
  --coin BTC \
  --side short \
  --type stop_market \
  --trigger-px 58000 \
  --amount 0.001 \
  --reduce-only \
  --wallet-id "<evmWalletId from wallet list>"
```

### Place a stop-limit perp order

Triggers a limit order at `--price` once `--trigger-px` is crossed.

```bash
tribes-cli hyperliquid trade-perp \
  --from 0x1111111111111111111111111111111111111111 \
  --coin BTC \
  --side short \
  --type stop_limit \
  --trigger-px 58000 \
  --price 57900 \
  --amount 0.001 \
  --reduce-only \
  --wallet-id "<evmWalletId from wallet list>"
```

### Place a take-profit perp order (take-market or take-limit)

`take_market` fills at market once `--trigger-px` is crossed; `take_limit` rests a
limit order at `--price`. Use `--reduce-only` to take profit on an open position.

```bash
# Take-profit market: close a long when BTC rises to 72000
tribes-cli hyperliquid trade-perp \
  --from 0x1111111111111111111111111111111111111111 \
  --coin BTC \
  --side short \
  --type take_market \
  --trigger-px 72000 \
  --amount 0.001 \
  --reduce-only \
  --wallet-id "<evmWalletId from wallet list>"

# Take-profit limit: trigger at 72000, rest a limit at 71900
tribes-cli hyperliquid trade-perp \
  --from 0x1111111111111111111111111111111111111111 \
  --coin BTC \
  --side short \
  --type take_limit \
  --trigger-px 72000 \
  --price 71900 \
  --amount 0.001 \
  --reduce-only \
  --wallet-id "<evmWalletId from wallet list>"
```

### Place an atomic bracket (entry + linked TP/SL)

Add `--tp-px` and/or `--sl-px` to `trade-perp` to attach a bracket. It then
submits the entry and its take-profit and/or stop-loss in a single `order`
action with `grouping: normalTpsl`, so the TP/SL are linked OCO exits on the
resulting position (one fills, the other cancels — no dangling order, no
unprotected window). Bracket mode requires a `market` or `limit` entry (`--type`)
and is not reduce-only. TP/SL legs default to market exits; pass
`--tp-limit-px` / `--sl-limit-px` to rest them as limit orders instead.

```bash
# Long ~$500 of MSFT at market, take-profit +6%, stop-loss -3%
tribes-cli hyperliquid trade-perp \
  --dex xyz \
  --coin MSFT \
  --side long \
  --type market \
  --amount 1.307 \
  --tp-px 405.56 \
  --sl-px 371.13 \
  --from 0x1111111111111111111111111111111111111111 \
  --wallet-id "<evmWalletId from wallet list>"
```

### Place a TWAP perp order

A TWAP (time-weighted average price) order slices `--amount` into sub-orders
executed evenly over `--duration-minutes` (5–1440), reducing market impact. Add
`--randomize` to jitter the sub-order timing, `--reduce-only` to only close an
existing position, and `--leverage` / `--margin-mode` to set leverage first (same
as `trade-perp`). The response includes a `twapId` — keep it to cancel early.

Minimum size: Hyperliquid runs one sub-order every 30s, so a TWAP is split into
`durationMinutes * 2` sub-orders, and **each sub-order must be ≥ $10 notional**.
The CLI computes this up front and rejects the request (before signing) if
`amount / (durationMinutes * 2) * markPx < $10`, telling you the minimum
`--amount` needed. To fix, increase `--amount` or lower `--duration-minutes`.
For example, a 30-minute TWAP = 60 sub-orders, so it needs ≥ $600 total notional
(60 × $10).

```bash
# Buy 0.5 BTC spread over 30 minutes with randomized timing
tribes-cli hyperliquid twap-perp \
  --from 0x1111111111111111111111111111111111111111 \
  --coin BTC \
  --side long \
  --amount 0.5 \
  --duration-minutes 30 \
  --randomize \
  --wallet-id "<evmWalletId from wallet list>"
```

### Cancel a running TWAP order

```bash
# Cancel a perp TWAP
tribes-cli hyperliquid twap-cancel \
  --from 0x1111111111111111111111111111111111111111 \
  --coin BTC \
  --twap-id 1234 \
  --wallet-id "<evmWalletId from wallet list>"

# Cancel a spot TWAP
tribes-cli hyperliquid twap-cancel-spot \
  --from 0x1111111111111111111111111111111111111111 \
  --pair HYPE/USDC \
  --twap-id 1234 \
  --wallet-id "<evmWalletId from wallet list>"
```

### Place a scale (ladder) perp order

A scale order splits `--amount` into `--orders` resting limit legs whose prices
step linearly from `--start-px` to `--end-px`. Use `--size-skew` to tilt more
size toward the end of the range (`1` = uniform legs). All legs are submitted
atomically in one signed action. Each leg must be ≥ $10 notional; the CLI
rejects too-small scales before signing — increase `--amount` or reduce
`--orders` if you hit this.

```bash
# Long 0.01 BTC across 5 limit orders from 95000 to 98000, skewed toward higher prices
tribes-cli hyperliquid scale-perp \
  --from 0x1111111111111111111111111111111111111111 \
  --coin BTC \
  --side long \
  --amount 0.01 \
  --start-px 95000 \
  --end-px 98000 \
  --orders 5 \
  --size-skew 1.5 \
  --wallet-id "<evmWalletId from wallet list>"
```

### Place a spot order

```bash
tribes-cli hyperliquid trade-spot \
  --from 0x1111111111111111111111111111111111111111 \
  --pair HYPE/USDC \
  --side buy \
  --type market \
  --amount 10 \
  --wallet-id "<evmWalletId from wallet list>"
```

### Place a TWAP spot order

Same slicing rules as `twap-perp` (one sub-order every 30s, each ≥ $10 notional).
The response includes a `twapId` — cancel with `twap-cancel-spot --pair <pair> --twap-id <id>`.

```bash
tribes-cli hyperliquid twap-spot \
  --from 0x1111111111111111111111111111111111111111 \
  --pair HYPE/USDC \
  --side buy \
  --amount 100 \
  --duration-minutes 30 \
  --randomize \
  --wallet-id "<evmWalletId from wallet list>"
```

### Place a scale (ladder) spot order

Same ladder mechanics as `scale-perp`: `--amount` split across `--orders` limit
legs from `--start-px` to `--end-px`. Each leg must be ≥ $10 notional.

```bash
tribes-cli hyperliquid scale-spot \
  --from 0x1111111111111111111111111111111111111111 \
  --pair HYPE/USDC \
  --side buy \
  --amount 100 \
  --start-px 20 \
  --end-px 22 \
  --orders 5 \
  --size-skew 1.5 \
  --wallet-id "<evmWalletId from wallet list>"
```

### Transfer USDC between spot and perp balances

```bash
tribes-cli hyperliquid transfer-usd-class \
  --amount 2 \
  --from 0x1111111111111111111111111111111111111111 \
  --direction spot-to-perp \
  --wallet-id "<evmWalletId from wallet list>"
```

### Send USDC to another Hyperliquid user

```bash
tribes-cli hyperliquid transfer-usd \
  --amount 2 \
  --from 0x1111111111111111111111111111111111111111 \
  --destination 0x2222222222222222222222222222222222222222 \
  --wallet-id "<evmWalletId from wallet list>"
```

### Send spot tokens to another Hyperliquid user

```bash
tribes-cli hyperliquid transfer-spot \
  --amount 10 \
  --from 0x1111111111111111111111111111111111111111 \
  --destination 0x2222222222222222222222222222222222222222 \
  --token HYPE \
  --wallet-id "<evmWalletId from wallet list>"
```

### Transfer token balances between dexes

```bash
tribes-cli hyperliquid transfer-dex-cash \
  --amount 2 \
  --from 0x1111111111111111111111111111111111111111 \
  --source-dex main \
  --destination-dex xyz \
  --token USDC \
  --wallet-id "<evmWalletId from wallet list>"
```

## Order options

- `trade-perp` supports:
  - `--type market|limit|stop_market|stop_limit|take_market|take_limit`
  - `--price` (required for `--type limit`, `stop_limit`, and `take_limit`)
  - `--trigger-px` (required for `--type stop_market`, `stop_limit`,
    `take_market`, and `take_limit`)
  - the trigger direction is implied by the type: `stop_*` = stop-loss,
    `take_*` = take-profit; pair with `--reduce-only` for protective exits
  - `--tif Gtc|Ioc|Alo`
  - `--reduce-only`
  - `--margin-mode cross|isolated`
  - `--leverage <int>`
  - `--dex <name>` (`main` default, `xyz` supported)
  - bracket mode (attach linked TP/SL to the entry):
    - `--tp-px` / `--sl-px` (trigger prices; either or both turns on the bracket)
    - `--tp-limit-px` / `--sl-limit-px` (optional; rest that leg as a limit instead
      of a market exit — each requires its matching `--tp-px` / `--sl-px`)
    - requires a `market` or `limit` entry (`--type`) and cannot be `--reduce-only`
  - `--margin-mode cross|isolated`, `--leverage <int>`, `--dex <name>`
  - entry + TP/SL are sent atomically with `grouping: normalTpsl`; TP/SL are
    reduce-only OCO exits sized to the entry
- `twap-perp` supports:
  - `--amount` (total size, base units), `--side long|short`
  - `--duration-minutes <5-1440>` (slices the order evenly over this window)
  - `--randomize` (jitter sub-order timing), `--reduce-only`
  - `--margin-mode cross|isolated`, `--leverage <int>`, `--dex <name>`
  - each sub-order must be ≥ $10 notional (split is `durationMinutes * 2`
    sub-orders); the CLI rejects too-small TWAPs before signing
  - returns a `twapId`; cancel early with `twap-cancel --coin <c> --twap-id <id>`
- `twap-spot` supports:
  - `--amount` (total size, base units), `--side buy|sell`, `--pair <pair>`
  - `--duration-minutes <5-1440>`, `--randomize`
  - same $10-per-sub-order minimum as `twap-perp`
  - returns a `twapId`; cancel with `twap-cancel-spot --pair <pair> --twap-id <id>`
- `scale-perp` supports:
  - `--amount` (total size, base units), `--side long|short`
  - `--start-px` / `--end-px` (price range endpoints; must differ)
  - `--orders <2-50>` (number of evenly spaced limit legs)
  - `--size-skew <ratio>` (last-leg size / first-leg size; `1` = uniform)
  - `--tif Gtc|Ioc|Alo`, `--reduce-only`
  - `--margin-mode cross|isolated`, `--leverage <int>`, `--dex <name>`
  - each leg must be ≥ $10 notional; the CLI rejects too-small scales before signing
- `scale-spot` supports:
  - `--amount` (total size, base units), `--side buy|sell`, `--pair <pair>`
  - `--start-px` / `--end-px`, `--orders <2-50>`, `--size-skew <ratio>`
  - `--tif Gtc|Ioc|Alo`
  - each leg must be ≥ $10 notional; the CLI rejects too-small scales before signing
- `trade-spot` supports:
  - `--type market|limit`
  - `--price` (required for `--type limit`)
  - `--tif Gtc|Ioc|Alo`
- `cancel-order` supports:
  - `--coin`, `--order-id` (from `list-open-orders`), `--dex <name>` (main default)
  - cancels one resting perp order; requires `--from` and `--wallet-id`
- `cancel-order-spot` supports:
  - `--pair`, `--order-id` (from `list-open-orders`)
  - cancels one resting spot order; requires `--from` and `--wallet-id`

## Gas is sponsored

Hyperliquid deposits and on-chain trades are broadcast as transactions, but gas
is sponsored by the harness, so they need no native gas (ETH on Arbitrum, chain
id `42161`) on the chain they run on. Do no gas preflight, never bridge/swap to
fund gas, and never ask the user to deposit native gas; proceed directly.

## Trade failed for insufficient balance

A trade can fail because the Hyperliquid account lacks enough margin/USDC (this
is the trading balance, not gas — gas is sponsored). When a trade fails with a
no/low balance error:

1. Run `wallet assets` to check what the wallet holds across chains.
2. If there are fundable assets (Arbitrum USDC, another token, or funds on
   another chain), tell the user the trade needs more balance on Hyperliquid and
   suggest depositing, naming the assets you found.
3. With the user's confirmation, fund the Hyperliquid account by following the
   deposit path below (pick Path A/B/C by where the source funds are), then
   retry the trade.
4. If the wallet has no fundable assets anywhere, STOP and ask the user to
   deposit funds; do not improvise workarounds.

## Choose the deposit path (where the source funds are)

Make the funding path explicit before any quote/deposit. Pick one:

- Path A - Arbitrum (`42161`), already native USDC: run `deposit` directly. No
  swap/bridge needed.
- Path B - Arbitrum (`42161`), different token (ETH, other ERC-20): same-chain
  swap to Arbitrum USDC via `spot-trading quote` with `--from-chain 42161
--to-chain 42161`, then `deposit`.
- Path C - any other chain (EVM or Solana): cross-chain swap/bridge to Arbitrum
  USDC with `--from-chain <other> --to-chain 42161`, then `deposit`.

Paths B and C use the conversion flow below; after conversion the `5` USDC
minimum deposit still applies. Path A skips straight to `deposit`.

## Convert to Arbitrum USDC (same-chain swap or cross-chain bridge), then usual deposit flow

Use this conversion flow for Path B (same-chain swap, `--from-chain 42161`) and
Path C (cross-chain bridge, `--from-chain <other>`) before a Hyperliquid deposit.

1. Quote to Arbitrum native USDC:

```bash
tribes-cli spot-trading quote \
  --from-chain <from-chain-id-or-solana> \
  --to-chain 42161 \
  --from-token <from-token-address-or-network> \
  --to-token 0xaf88d065e77c8cC2239327C5EDb3A432268e5831 \
  --from-amount <base-unit-amount> \
  --from-address <user-wallet-address> \
  --to-address <user-wallet-address>
```

2. Read quote `kind` and branch before broadcasting:
   - If `kind: "evm"`, broadcast each `transactionRequests[]` item with `sendEthTransaction`.
   - If `kind: "solana"`, broadcast each `transactionRequests[]` item with `sendSolTransaction`.
3. Broadcast transactions sequentially in response order, and poll `getTransactionStatus` after each broadcast.
4. Continue only when `status: "success"`; if any transaction fails, stop immediately and report the failed hash/index.
5. After final success and Arbitrum USDC credit, run the usual `deposit` flow with the same EVM wallet.

Example branch commands:

```bash
# kind: "evm"
tribes-cli transaction sendEthTransaction \
  --chain-id <evm-chain-id> \
  --to <tx.to> \
  --data <tx.data> \
  --value <tx.value> \
  --wallet-id <evm-wallet-id>

tribes-cli transaction getTransactionStatus \
  --chain-id <evm-chain-id> \
  --hash <tx-hash>

# kind: "solana"
tribes-cli transaction sendSolTransaction \
  --transaction <tx.data> \
  --wallet-id <sol-wallet-id>

tribes-cli transaction getTransactionStatus \
  --chain-id solana \
  --hash <sol-signature>
```

If the source is already Arbitrum native USDC (Path A), skip this conversion flow and run `deposit` directly.

## Deposits from Arbitrum USDC

A Hyperliquid deposit is an ERC-20 `transfer` of Arbitrum native USDC to the Hyperliquid bridge contract. This skill's `deposit` command broadcasts that transfer via `sendEthTransaction`.

Mainnet parameters used by current implementation:

- chainId: `42161`
- bridge: `0x2Df1c51E09aECF9cacB7bc98cB1742757f163dF7`
- USDC: `0xaf88d065e77c8cC2239327C5EDb3A432268e5831`
- minimum deposit: `5` USDC

Operational notes:

- Funds are credited to the Hyperliquid account mapped to the sender EOA (`--from`).
- Do not use an amount below `5` USDC.
- `deposit --amount` is decimal USDC units, not base units.

## Execution notes

- `trade-perp --dex` defaults to `main`; pass `--dex xyz` for HIP-3 perps.
- `trade-spot` supports `market` and `limit`; `trade-perp` also supports
  `stop_market`, `stop_limit`, `take_market`, and `take_limit`:
  - For `--type limit`, `--price` is required and must be > 0.
  - For `--type market`, the service submits an aggressive IOC-style price around reference price.
  - For `--type stop_market` / `take_market`, `--trigger-px` is required; once
    triggered it fills at market (aggressive price derived from the trigger price).
  - For `--type stop_limit` / `take_limit`, both `--trigger-px` and `--price` are
    required; once triggered it rests as a limit order at `--price`.
  - `stop_*` orders trigger as stop-loss and `take_*` as take-profit; pair with
    `--reduce-only` for protective exits on an open position.
- `cancel-order` / `cancel-order-spot` cancel a single resting order by
  `orderId` from `list-open-orders`. They do not close filled positions — use
  `trade-perp --reduce-only` for that.
- `transfer-usd` and `transfer-spot` send funds to another Hyperliquid account
  (`--destination`); they do not withdraw to an external chain.
- `transfer-dex-cash` requires different source and destination dex values.

## Live broadcast safety

- Gas is sponsored; do no gas preflight and never ask the user to deposit native gas.
- Do not broadcast vague natural-language intent; always show and review the exact command payload first.
- For any ambiguous fund-movement request (e.g. "transfer/move/send all funds"), STOP and ask for the missing action/scope/amount/destination details before running any command, including read-only balance or help lookups. See "Clarify ambiguous requests before acting".
- Never mix wallet ids across chains; use the exact EVM wallet id that matches `--from`.
- Do not run live execution commands without explicit `--wallet-id`.
- In conversion mode (Path B/C), execute quote `transactionRequests[]` in order; never reorder or skip steps.
- Do not send the next conversion transaction until the current transaction is confirmed `success`.
