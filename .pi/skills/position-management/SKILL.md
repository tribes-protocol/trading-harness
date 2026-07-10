---
name: position-management
description: >-
  Risk policy and open-position management on Hyperliquid. Handles: portfolio position review
  and health checks, adding or moving stop-losses and take-profits on open positions, leverage
  and margin changes, liquidation-distance checks, and closing one or all positions. Call it
  when the user wants to review, protect, resize, or exit positions they already hold. NOT for:
  opening a new position end-to-end (use trade-execution); single Hyperliquid commands, order
  mechanics, or fund moves outside position care (use hyperliquid); net worth over time or PnL
  history (use wallet-analyst).
allowed-tools: bash read
---

# Position Management

Playbook layered on `tribes-cli hyperliquid`: enforce the desk risk policy on open perp
positions — review them, protect them with stops, adjust leverage and margin, and close cleanly.
Requires: an auth token (run `tribes-cli login` once if commands fail with auth errors) and
`evmWalletId` + EVM address from `wallet` — the address is `--address` on reads and `--from` on
signed commands.

## When to use

- Review open positions or run a portfolio health check.
- Add, move, or remove a stop-loss or take-profit on an EXISTING position.
- Change leverage or isolated margin, or fix a thin liquidation buffer.
- Close one position or the whole book.
- NOT for opening a new position — use `trade-execution`.
- NOT for single Hyperliquid command details, sizing math, or fund moves — use `hyperliquid`.
- NOT for net worth over time or PnL history — use `wallet-analyst`.

## Hard rules

1. Every closing or exit order MUST carry `--reduce-only`.
   Wrong: `trade-perp --side short --type market` on a long (a new opposite position opens if
   the size is off). Right: the same command with `--reduce-only` (it can only shrink the long).
2. The side of a closing/exit order is the OPPOSITE of the position side: close a long with
   `--side short`, close a short with `--side long`.
3. Cancel a position's old stop or TP (`list-open-orders` → `cancel-order`) BEFORE placing its
   replacement — two live exits double-book the same size.
4. Verify after EVERY change: re-run `list-positions` / `list-open-orders` and confirm the new
   state before reporting.
5. Every signed command MUST carry `--from` and its matching `--wallet-id` (rule in
   `hyperliquid`); add `--dex <name>` on every command for a position on a non-main dex.
6. `wallet-analyst ask` is slow — MUST set a bash timeout of at least 120 seconds for it.

## Risk policy defaults

These are DEFAULTS: the user MAY override any of them explicitly; record overrides in your report.

- Every new perp entry carries a stop-loss (bracket `--sl-px` on `trade-perp`) unless the user
  explicitly waives it.
- Liquidation distance: IF `|markPx - liquidationPx| / markPx < 10%`, THEN warn and propose
  `adjust-margin --direction add` or reducing size with a reduce-only order.
- Leverage: ≤ 5x on majors (BTC, ETH, SOL); ≤ 3x on alts and HIP-3 equity dexes; higher only on
  explicit user request, never above the asset's `maxLeverage` (from `list-assets`).
- Single-position size: warn when one position's margin exceeds ~25% of `accountValue`.
- Margin mode: isolated for high-leverage or illiquid perps, cross for hedged books.

## Procedures

### 1. Portfolio review / health check

1. `tribes-cli hyperliquid list-positions --all-dexes --address <evm-address>`
2. `tribes-cli hyperliquid list-open-orders --all-dexes --address <evm-address>`
3. `tribes-cli hyperliquid list-balances --address <evm-address>` — read `accountValue` and
   `withdrawable`.
4. PnL context (timeout ≥ 120s): `tribes-cli wallet-analyst ask --query "Realized and
unrealized PnL for wallet <evm-address> over the last 30 days, by token"`.
5. Fill this template per position and flag every risk-policy breach:

```markdown
| Coin (dex) | Side | Size | Entry | Mark | uPnL | Liq px | Margin | Flags |
| ---------- | ---- | ---- | ----- | ---- | ---- | ------ | ------ | ----- |
```

Flags: `NO-STOP`, `LIQ<10%`, `LEV>POLICY`, `SIZE>25%`.

### 2. Move or add a stop-loss on an existing position

Example position: long 0.5 ETH on main.

```bash
# 1. Find the old stop's order id (skip cancel if the position has no stop yet)
tribes-cli hyperliquid list-open-orders --address 0x1111111111111111111111111111111111111111

# 2. Cancel the old stop FIRST (hard rule 3)
tribes-cli hyperliquid cancel-order \
  --from 0x1111111111111111111111111111111111111111 \
  --coin ETH \
  --order-id <order-id> \
  --wallet-id <evmWalletId>

# 3. Place the new stop — side OPPOSITE the long, reduce-only
tribes-cli hyperliquid trade-perp \
  --from 0x1111111111111111111111111111111111111111 \
  --coin ETH \
  --amount 0.5 \
  --side short \
  --type stop_market \
  --trigger-px 3050 \
  --reduce-only \
  --wallet-id <evmWalletId>
```

Verify: `list-open-orders` shows exactly one stop at the new trigger.

### 3. Take profit on an existing position

Single TP — side opposite, reduce-only (`--type take_limit` rests a limit exit and needs BOTH
`--trigger-px` and `--price`):

```bash
tribes-cli hyperliquid trade-perp \
  --from 0x1111111111111111111111111111111111111111 \
  --coin ETH \
  --amount 0.5 \
  --side short \
  --type take_market \
  --trigger-px 3600 \
  --reduce-only \
  --wallet-id <evmWalletId>
```

Staged exits: `scale-perp` with `--reduce-only`, side opposite, and the position size split
across `--start-px` / `--end-px` / `--orders` (same `--from`/`--wallet-id` pattern as above).

### 4. Change leverage or margin

1. Precheck BEFORE `set-leverage` (lowering) or `adjust-margin --direction remove`:
   `requiredMargin = positionValue / targetLeverage`; IF `requiredMargin > marginUsed`, the
   difference must fit in perp `withdrawable`. Read the `hyperliquid` skill's
   `references/margin.md` before running either command — it has the full steps and examples.
2. Thin liquidation buffer (< 10%) → add isolated margin:

```bash
tribes-cli hyperliquid adjust-margin \
  --from 0x1111111111111111111111111111111111111111 \
  --coin ETH \
  --side long \
  --amount 50 \
  --direction add \
  --wallet-id <evmWalletId>
```

3. Verify: `list-positions` shows the new leverage/margin and a wider liquidation distance.

### 5. Close one position

1. Cancel its resting exit orders: `list-open-orders` → `cancel-order` per order id on that coin.
2. Cancel any running TWAP on that coin (TWAPs appear in `list-positions`):
   `twap-cancel --coin <coin> --twap-id <twap-id>` (plus `--from`/`--wallet-id`).
3. Market-close the FULL position size — side opposite, reduce-only:

```bash
tribes-cli hyperliquid trade-perp \
  --from 0x1111111111111111111111111111111111111111 \
  --coin ETH \
  --amount 0.5 \
  --side short \
  --type market \
  --reduce-only \
  --wallet-id <evmWalletId>
```

4. Verify: `list-positions` no longer lists the position and `list-open-orders` shows no
   leftover orders on that coin.

### 6. Close ALL positions

1. `list-positions --all-dexes` — record every position's dex, coin, side, and size.
2. Run procedure 5 for each position, adding `--dex <name>` for non-main dexes.
3. Verify: `list-positions --all-dexes` returns empty and `list-open-orders --all-dexes` shows
   no strays.

## Error recovery

| Symptom                                  | Action                                                                                                                                     |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Auth error (unauthorized, expired token) | Run `tribes-cli login`, retry the original command once, then stop and report.                                                             |
| Reduce-only order rejected               | Position already closed or side wrong — re-run `list-positions`, re-derive side and size, retry once.                                      |
| Leverage/margin change rejected          | Run the precheck in the `hyperliquid` skill's `references/margin.md`; add margin or reduce size, then retry once.                          |
| Stop/TP trigger rejected                 | Trigger is on the wrong side of mark: SL sits below mark for a long, above for a short; TP is the reverse. Fix `--trigger-px`, retry once. |
| Two exits resting on one position        | Double-booked — `cancel-order` the stale one immediately and keep the newest.                                                              |
| Any other API failure                    | Retry the same command once; if it fails again, stop and report the error.                                                                 |

## Related skills

- `hyperliquid` — command syntax, sizing, order types, and `references/margin.md`.
- `trade-execution` — opening a NEW position end-to-end with pre/post checks.
- `wallet-analyst` — realized/unrealized PnL and portfolio history context.
- `thesis` — debate whether the position should still exist (HOLD, ADD, or EXIT).

## Before you finish

- [ ] Every closing/exit order carried `--reduce-only` with side OPPOSITE the position.
- [ ] Old stops/TPs were cancelled before replacements — no double-booked exits.
- [ ] Re-ran `list-positions` / `list-open-orders` and confirmed the intended end state.
- [ ] Risk-policy breaches (no stop, liq < 10%, leverage or size over policy) flagged or fixed.
- [ ] User got a plain-language report — no commands, flags, or file paths (AGENTS.md).
