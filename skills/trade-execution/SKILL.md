---
name: trade-execution
description: >-
  End-to-end trade playbook for opening a position on Hyperliquid. Handles: sequencing one trade
  from intent to verified fill — tradability check, wallet lookup, funding check, USD-to-base-unit
  sizing, risk defaults, one atomic order, mandatory post-trade verification, and the user report.
  Call it whenever the user wants to open a trade (long, short, buy, sell) on crypto perps,
  Hyperliquid spot, securities, or commodities. NOT for: single Hyperliquid commands or fund moves outside a trade
  (use hyperliquid); stops, leverage, or closing an existing position (use position-management);
  on-chain DEX swaps or bridges (use spot-trading).
allowed-tools: bash read
---

# Trade Execution

This skill is a playbook, not a command group: it sequences `tribes-cli wallet` and
`tribes-cli hyperliquid` commands in a fixed order and adds mandatory post-trade verification.
Requires: the `wallet` and `hyperliquid` skills (full flag lists and sizing rules live there).

## When to use

- The user wants to open a NEW trade — long/short a perp, buy/sell Hyperliquid spot, or trade a
  security or commodity (both trade as Hyperliquid perps, see AGENTS.md).
- The user says "just buy X" — still run every step below; the checks are the product.
- NOT for one-off Hyperliquid lookups, cancels, deposits, or withdrawals — use `hyperliquid`.
- NOT for stops, leverage, margin, or closing on an EXISTING position — use `position-management`.
- NOT for on-chain DEX swaps or cross-chain bridges — use `spot-trading`.
- NOT for deciding WHAT to trade — use `strategize` or the analyst skills first.

## Hard rules

1. NEVER place an order without the user's explicit confirmation of side + size + asset — OR
   a `thesis` auto-entry handoff under the user's standing authorization with every thesis
   gate passed (that authorization + gates replace the per-trade confirmation).
2. NEVER skip step 7 (verification) — an unverified order is an unfinished trade.
3. ONE atomic command per intent: bracket via `trade-perp --tp-px/--sl-px`, ladder via
   `scale-perp`, time-slice via `twap-perp`. NEVER split a bracket into separate orders.
4. Run steps 1–8 in order. MAY reuse a step's output already fetched this session; MAY NOT skip
   the step's check itself.

## The playbook

### 1. Tradability

```bash
tribes-cli hyperliquid list-assets --all-dexes --out /tmp/all-dexes.json
tribes-cli hyperliquid list-assets --market spot
```

- Write the all-dex sweep to a file (`--out`) and read every dex section in full — it is thousands
  of lines and truncates when read inline. Read the `xyz` dex FIRST (it hosts most stock and
  commodity perps). NEVER conclude the asset is "delisted" / "not tradable" from a section you did
  not fully read; a not-tradable verdict requires having actually inspected that asset's entry.
- Resolve the EXACT `coin` (perp) or `pair` (spot), the hosting `dex`, and the asset's
  `szDecimals`, `referencePx`, and `maxLeverage` — steps 4–6 need all of them. Use
  `list-exchanges` only if the all-dex result needs a venue label resolved.
- Before execution, require live market quality: coherent `referencePx`, `midPx`, and `oraclePx`
  when available; current nonzero `dayNtlVlm`, `dayBaseVlm`, and `openInterest`; plus `impactPxs`
  that make sense for the intended size. This is mandatory for every HIP-3 security or commodity.
- Reject an `isDelisted` market. Honor `requiresIsolatedMargin`, `onlyIsolated`, and `marginMode`
  from the venue when selecting the order's margin mode.
- IF the asset is not listed, or its quality data is missing, zero, stale, or inconsistent → STOP.
  Tell the user it is not currently actionable on Hyperliquid and offer watchlist context only.

### 1b. Execution quality (recommended for size)

For any order that is large relative to the market, or when entry method (market vs ladder vs
TWAP) is undecided, run the `execution-quality` read on the resolved dex+coin at the intended
notional before sizing — it computes spread, impact, size pressure, and funding drag, and
recommends go / reduce / slice. Mandatory when `thesis` hands off an auto-entry.

### 2. Wallet

```bash
tribes-cli wallet list
```

Take `evmWalletId` → `--wallet-id`, and `evmWalletAddress` → `--from` on signed commands and
`--address` on account queries (`wallet` skill).

### 3. Funding

```bash
tribes-cli hyperliquid list-balances --address <evm-address>
```

- Required margin = notional / leverage. Example: $500 notional at 5x needs $100.
- IF `withdrawable` covers the required margin → continue.
- IF short → tell the user, propose a deposit, and on their confirmation fund via the deposit
  paths in the `hyperliquid` skill (`references/funding-paths.md`), then re-check balances.

### 4. Sizing

- Convert USD intent to base units: `amount = round(usd / referencePx, szDecimals)`.
  Example: $500 of a resolved market at referencePx 382.605, szDecimals 3 → `--amount 1.307`.
- Every order, ladder leg, and TWAP sub-order MUST be ≥ $10 notional — pre-check before placing.

### 5. Risk

- Apply the `position-management` defaults: every new perp entry carries a stop-loss (`--sl-px`)
  unless the user explicitly waives it.
- Sanity-check leverage: requested `--leverage` MUST be ≤ the asset's `maxLeverage` from step 1
  and consistent with the `position-management` leverage policy.

### 6. Place ONE atomic command

| Intent                              | Command                                            |
| ----------------------------------- | -------------------------------------------------- |
| Entry with TP and/or SL             | `trade-perp` with `--tp-px`/`--sl-px` (one action) |
| Ladder of limit legs across a range | `scale-perp`                                       |
| Time-sliced execution               | `twap-perp`                                        |
| Hyperliquid spot                    | `trade-spot` (ladder: `scale-spot`; `twap-spot`)   |

Example — long a resolved perp with a technical target and invalidation:

```bash
tribes-cli hyperliquid trade-perp \
  --dex <resolved-dex> \
  --coin <resolved-coin> \
  --side long \
  --type market \
  --amount <base-units> \
  --tp-px <technical-target-px> \
  --sl-px <technical-invalidation-px> \
  --from <evm-address> \
  --wallet-id <evmWalletId>
```

Flag details and order types live in the `hyperliquid` skill (`references/order-types.md`).

### 7. VERIFY (MANDATORY, immediately after placing)

```bash
tribes-cli hyperliquid list-positions --address <evm-address> --dex <resolved-dex>
tribes-cli hyperliquid list-open-orders --address <evm-address> --dex <resolved-dex>
tribes-cli hyperliquid list-fills --address <evm-address>
```

- Confirm the position exists at the expected size (`list-positions`), the bracket legs are
  resting (`list-open-orders`), and read the entry fill price (`list-fills`).
- IF partially filled → report filled vs resting size and ASK the user before chasing the rest.
- IF nothing filled and the order rests (limit/ladder) → report the resting `<order-id>`(s) and
  stop; that is a successful placement.
- IF the order was rejected → go to Error recovery.
- IF a TWAP is running → report the `twapId` and the slice schedule; it also shows in
  `list-positions`.

### 8. Report to the user

Plain language only — no commands, flags, or paths (AGENTS.md). Fill in this template:

```markdown
Opened <side> <size> <COIN> at <entry-fill-price>.

- Take-profit: <tp-px> · Stop-loss: <sl-px>
- Liquidation price: <liq-px> (<percent>% from entry)
- Margin used: $<margin> (<leverage>x <margin-mode>)
```

Take the liquidation price and margin used from the step-7 `list-positions` output. Omit the
TP/SL line only if the user explicitly waived exits.

## Error recovery

| Symptom                                  | Action                                                                                                                      |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Auth error (unauthorized, expired token) | Run `tribes-cli login`, retry the original command once, then stop and report.                                              |
| Insufficient balance/margin              | Run the `hyperliquid` skill funding flow (`references/funding-paths.md`) with user confirmation, then retry the order once. |
| Order/leg/sub-order below $10 minimum    | Raise the size, or reduce `--orders` (ladder) / `--duration-minutes` (TWAP), then retry.                                    |
| Size or price rejected                   | Re-check the `szDecimals` rounding from step 4 against step 1 data, then retry once.                                        |
| Any other API failure                    | Retry the same command once; if it fails again, stop and report the error.                                                  |

## Related skills

- `hyperliquid` — every command this playbook runs; funding paths, order types, margin rules.
- `wallet` — `evmWalletId` and addresses (step 2).
- `position-management` — stop-loss/leverage defaults (step 5) and everything after the entry.
- `execution-quality` — pre-order cost/liquidity read (step 1b).
- `token-diligence` — contract-safety gate before on-chain token buys (spot-trading path).
- `security-diligence` — catalyst/trend gate before stock-perp entries.
- `spot-trading` — the user wants an on-chain DEX swap or bridge instead of a Hyperliquid order.
- `strategize` — market briefing and trade ideas before there is a trade to execute.
- `thesis` — the bull-vs-bear judge-led debate that hands approved trades to this playbook.

## Before you finish

- [ ] Side + size + asset were explicitly confirmed by the user before placing (or came from
      a gated `thesis` auto-entry under standing authorization).
- [ ] Tradability, funding, and the $10-per-leg minimum were checked BEFORE the order.
- [ ] The intent went out as ONE atomic command (bracket/ladder/TWAP, never split).
- [ ] Step 7 verification ran: position size, resting bracket legs, entry fill price.
- [ ] The user got the plain-language report — side, size, entry, TP/SL, liquidation, margin.
