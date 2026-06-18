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
   - `bun src/cli/Wallet.ts list`
2. Select the `evmWalletId` and matching EVM address for `--from`.
3. Build and review the exact command payload before broadcast.
4. Run the chosen Hyperliquid command with `--wallet-id`.

## CLI

```bash
bun src/cli/Hyperliquid.ts --help
```

## Supported commands

Discovery (read-only, no wallet/signer):

- `list-exchanges` — list perp dexes (exchanges), including `main`
- `list-assets` — list tradable assets; scope with `--dex <name>` (perp) or
  `--market spot`
- `list-balances` — list perp account summary + spot token balances for an
  `--address` (read-only); scope perp with `--dex <name>`

Execution (require `--wallet-id`; most also require signer `--from`):

- `deposit`
- `withdraw`
- `trade-perp`
- `trade-spot`
- `transfer-usd-class`
- `transfer-usd`
- `transfer-spot`
- `transfer-dex-cash`

## Command examples

### List exchanges (perp dexes)

```bash
bun src/cli/Hyperliquid.ts list-exchanges
```

Returns `main` plus named dexes (for example: `xyz`, `flx`, `vntl`).

### List assets

```bash
# Perp assets on the main dex (default)
bun src/cli/Hyperliquid.ts list-assets

# Perp assets on a named dex (exchange)
bun src/cli/Hyperliquid.ts list-assets --dex xyz

# Spot pairs
bun src/cli/Hyperliquid.ts list-assets --market spot
```

Each perp asset includes `name`, `szDecimals`, `maxLeverage`, and `markPx`; each
spot asset includes `pair`, `szDecimals`, and `markPx`. Use these names with
`trade-perp --coin` / `--dex` and `trade-spot --pair`.

### List balances

```bash
# Perp summary (main dex) + all spot token balances
bun src/cli/Hyperliquid.ts list-balances \
  --address 0x1111111111111111111111111111111111111111

# Scope the perp summary to a named dex
bun src/cli/Hyperliquid.ts list-balances \
  --address 0x1111111111111111111111111111111111111111 \
  --dex xyz
```

Returns `perp` (`accountValue`, `withdrawable`, `totalMarginUsed`, `totalNtlPos`)
and `spot` (per token: `coin`, `token`, `total`, `hold`, `available`, where
`available = total - hold`). This is a read-only info query — no wallet or
signer is required.

### Deposit Arbitrum USDC to Hyperliquid

```bash
bun src/cli/Hyperliquid.ts deposit \
  --amount 25 \
  --from 0x1111111111111111111111111111111111111111 \
  --wallet-id "<evmWalletId from wallet list>"
```

### Withdraw USDC from Hyperliquid

```bash
bun src/cli/Hyperliquid.ts withdraw \
  --amount 2 \
  --from 0x1111111111111111111111111111111111111111 \
  --destination 0x2222222222222222222222222222222222222222 \
  --wallet-id "<evmWalletId from wallet list>"
```

### Place a perp order

```bash
bun src/cli/Hyperliquid.ts trade-perp \
  --from 0x1111111111111111111111111111111111111111 \
  --coin BTC \
  --side long \
  --type market \
  --amount 0.001 \
  --wallet-id "<evmWalletId from wallet list>"
```

### Place a spot order

```bash
bun src/cli/Hyperliquid.ts trade-spot \
  --from 0x1111111111111111111111111111111111111111 \
  --pair HYPE/USDC \
  --side buy \
  --type market \
  --amount 10 \
  --wallet-id "<evmWalletId from wallet list>"
```

### Transfer USDC between spot and perp balances

```bash
bun src/cli/Hyperliquid.ts transfer-usd-class \
  --amount 2 \
  --from 0x1111111111111111111111111111111111111111 \
  --direction spot-to-perp \
  --wallet-id "<evmWalletId from wallet list>"
```

### Send USDC to another Hyperliquid user

```bash
bun src/cli/Hyperliquid.ts transfer-usd \
  --amount 2 \
  --from 0x1111111111111111111111111111111111111111 \
  --destination 0x2222222222222222222222222222222222222222 \
  --wallet-id "<evmWalletId from wallet list>"
```

### Send spot tokens to another Hyperliquid user

```bash
bun src/cli/Hyperliquid.ts transfer-spot \
  --amount 10 \
  --from 0x1111111111111111111111111111111111111111 \
  --destination 0x2222222222222222222222222222222222222222 \
  --token HYPE \
  --wallet-id "<evmWalletId from wallet list>"
```

### Transfer token balances between dexes

```bash
bun src/cli/Hyperliquid.ts transfer-dex-cash \
  --amount 2 \
  --from 0x1111111111111111111111111111111111111111 \
  --source-dex main \
  --destination-dex xyz \
  --token USDC \
  --wallet-id "<evmWalletId from wallet list>"
```

## Order options

- `trade-perp` supports:
  - `--type market|limit`
  - `--price` (required for `--type limit`)
  - `--tif Gtc|Ioc|Alo`
  - `--reduce-only`
  - `--margin-mode cross|isolated`
  - `--leverage <int>`
  - `--dex <name>` (`main` default, `xyz` supported)
- `trade-spot` supports:
  - `--type market|limit`
  - `--price` (required for `--type limit`)
  - `--tif Gtc|Ioc|Alo`

## Gas preflight (conditional)

Hyperliquid deposits and on-chain trades are broadcast as transactions and need
native gas (ETH on Arbitrum, chain id `42161`) on the chain they run on. Do not
re-check gas on every step. Run the transaction skill's gas acquisition flow
only when native gas on the destination chain is low/insufficient or for a
cross-chain flow; otherwise proceed. If no native gas token exists
on any chain, STOP and ask the user to deposit native gas instead of improvising
workarounds.

## Choose the deposit path (where the source funds are)

Make the funding path explicit before any quote/deposit. Pick one:

- Path A - Arbitrum (`42161`), already native USDC: run `deposit` directly. No
  swap/bridge, no cross-chain gas funding.
- Path B - Arbitrum (`42161`), different token (ETH, other ERC-20): same-chain
  swap to Arbitrum USDC via `spot-trading quote` with `--from-chain 42161
  --to-chain 42161`, then `deposit`. Same-chain, so the gas preflight only acts
  if ETH on Arbitrum is low.
- Path C - any other chain (EVM or Solana): cross-chain swap/bridge to Arbitrum
  USDC with `--from-chain <other> --to-chain 42161`, then `deposit`. This is a
  cross-chain flow, so ensure gas on the source chain for the bridge leg and ETH
  on Arbitrum for the deposit leg (gas preflight).

Paths B and C use the conversion flow below; after conversion the `5` USDC
minimum deposit still applies. Path A skips straight to `deposit`.

## Convert to Arbitrum USDC (same-chain swap or cross-chain bridge), then usual deposit flow

Use this conversion flow for Path B (same-chain swap, `--from-chain 42161`) and
Path C (cross-chain bridge, `--from-chain <other>`) before a Hyperliquid deposit.

1. Quote to Arbitrum native USDC:

```bash
bun src/cli/SpotTrading.ts quote \
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
bun src/cli/Transaction.ts sendEthTransaction \
  --chain-id <evm-chain-id> \
  --to <tx.to> \
  --data <tx.data> \
  --value <tx.value> \
  --wallet-id <evm-wallet-id>

bun src/cli/Transaction.ts getTransactionStatus \
  --chain-id <evm-chain-id> \
  --hash <tx-hash>

# kind: "solana"
bun src/cli/Transaction.ts sendSolTransaction \
  --transaction <tx.data> \
  --wallet-id <sol-wallet-id>

bun src/cli/Transaction.ts getTransactionStatus \
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
- `trade-perp` and `trade-spot` support `market` and `limit`:
  - For `--type limit`, `--price` is required and must be > 0.
  - For `--type market`, the service submits an aggressive IOC-style price around reference price.
- `transfer-usd` and `transfer-spot` send funds to another Hyperliquid account
  (`--destination`); they do not withdraw to an external chain.
- `transfer-dex-cash` requires different source and destination dex values.

## Live broadcast safety

- Run the transaction skill's gas acquisition flow only when native gas (ETH on Arbitrum) on the destination chain is low/insufficient or for a cross-chain flow; otherwise proceed, and stop to ask the user to deposit gas if none exists anywhere.
- Do not broadcast vague natural-language intent; always show and review the exact command payload first.
- For any ambiguous fund-movement request (e.g. "transfer/move/send all funds"), STOP and ask for the missing action/scope/amount/destination details before running any command, including read-only balance or help lookups. See "Clarify ambiguous requests before acting".
- Never mix wallet ids across chains; use the exact EVM wallet id that matches `--from`.
- Do not run live execution commands without explicit `--wallet-id`.
- In conversion mode (Path B/C), execute quote `transactionRequests[]` in order; never reorder or skip steps.
- Do not send the next conversion transaction until the current transaction is confirmed `success`.
