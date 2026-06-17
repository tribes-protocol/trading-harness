---
name: hyperliquid
description: Hyperliquid market discovery (list exchanges/perp dexes and tradable perp/spot assets) plus live execution for deposits, withdrawals, perp/spot orders, and internal balance transfers. Use when listing Hyperliquid markets or placing/moving live Hyperliquid funds.
compatibility: Designed for the autonomous-trading-agent harness. Requires Bun, `API_BASE_URL` + `API_BEARER_TOKEN` + `PRIVY_APP_ID`, the transaction skill package, and wallet skill output for `evmWalletId` + signer address.
allowed-tools: bash read
---

# Hyperliquid

Use this skill to discover Hyperliquid markets (exchanges and assets) and to run
live Hyperliquid execution flows.

The `list-exchanges` and `list-assets` commands are read-only market discovery:
they hit Hyperliquid's public info API and need no wallet, signer, or
`--private-key-pem`. Skip the wallet-discovery workflow below for them.

## Compatibility

- Depends on the `wallet` skill for wallet discovery.
- Depends on transaction signing via `the transaction skill`.
- Use wallet CLI output as the source of `walletId` and signer `from` address.
- Do not read `.pi/privy-wallets.json` directly in the workflow.

## Requirements

- `API_BASE_URL`, `API_BEARER_TOKEN`, and `PRIVY_APP_ID` must be available.
- Caller provides `walletId` and `privateKeyPem` explicitly to every execution command.

## Workflow

1. Run wallet discovery with:
   - `API_BEARER_TOKEN="$(bun src/cli/llm-token.ts)" bun src/cli/Wallet.ts list`
2. Select the `evmWalletId` and matching EVM address for `--from`.
3. Resolve `privateKeyPem` from runtime (`.pi/agent-authorization-key.json`).
4. Build and review the exact command payload before broadcast.
5. Run the chosen Hyperliquid command with `--wallet-id` and `--private-key-pem`.

## CLI

```bash
bun src/cli/Hyperliquid.ts --help
```

## Supported commands

Discovery (read-only, no wallet/signer):

- `list-exchanges` — list perp dexes (exchanges), including `main`
- `list-assets` — list tradable assets; scope with `--dex <name>` (perp) or
  `--market spot`

Execution (require `--wallet-id` and `--private-key-pem`):

- `deposit`
- `withdraw`
- `trade-perp`
- `trade-spot`
- `transfer-usd-class`
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

### Deposit Arbitrum USDC to Hyperliquid

```bash
API_BEARER_TOKEN="$(bun src/cli/llm-token.ts)" \
bun src/cli/Hyperliquid.ts deposit \
  --amount 25 \
  --from 0x1111111111111111111111111111111111111111 \
  --wallet-id "<evmWalletId from wallet list>" \
  --private-key-pem "<privateKeyPem from agent authorization key>"
```

### Withdraw USDC from Hyperliquid

```bash
API_BEARER_TOKEN="$(bun src/cli/llm-token.ts)" \
bun src/cli/Hyperliquid.ts withdraw \
  --amount 2 \
  --from 0x1111111111111111111111111111111111111111 \
  --destination 0x2222222222222222222222222222222222222222 \
  --wallet-id "<evmWalletId from wallet list>" \
  --private-key-pem "<privateKeyPem from agent authorization key>"
```

### Place a perp order

```bash
API_BEARER_TOKEN="$(bun src/cli/llm-token.ts)" \
bun src/cli/Hyperliquid.ts trade-perp \
  --from 0x1111111111111111111111111111111111111111 \
  --coin BTC \
  --side long \
  --type market \
  --amount 0.001 \
  --wallet-id "<evmWalletId from wallet list>" \
  --private-key-pem "<privateKeyPem from agent authorization key>"
```

### Place a spot order

```bash
API_BEARER_TOKEN="$(bun src/cli/llm-token.ts)" \
bun src/cli/Hyperliquid.ts trade-spot \
  --from 0x1111111111111111111111111111111111111111 \
  --pair HYPE/USDC \
  --side buy \
  --type market \
  --amount 10 \
  --wallet-id "<evmWalletId from wallet list>" \
  --private-key-pem "<privateKeyPem from agent authorization key>"
```

### Transfer USDC between spot and perp balances

```bash
API_BEARER_TOKEN="$(bun src/cli/llm-token.ts)" \
bun src/cli/Hyperliquid.ts transfer-usd-class \
  --amount 2 \
  --from 0x1111111111111111111111111111111111111111 \
  --direction spot-to-perp \
  --wallet-id "<evmWalletId from wallet list>" \
  --private-key-pem "<privateKeyPem from agent authorization key>"
```

### Transfer token balances between dexes

```bash
API_BEARER_TOKEN="$(bun src/cli/llm-token.ts)" \
bun src/cli/Hyperliquid.ts transfer-dex-cash \
  --amount 2 \
  --from 0x1111111111111111111111111111111111111111 \
  --source-dex main \
  --destination-dex xyz \
  --token USDC \
  --wallet-id "<evmWalletId from wallet list>" \
  --private-key-pem "<privateKeyPem from agent authorization key>"
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

## Any token -> Arbitrum USDC (spot-trading + transaction), then usual deposit flow

Use this bridge flow only for source-token-to-Arbitrum-USDC conversion before Hyperliquid deposit.

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
API_BEARER_TOKEN="$(bun src/cli/llm-token.ts)" \
bun src/cli/Transaction.ts sendEthTransaction \
  --chain-id <evm-chain-id> \
  --to <tx.to> \
  --data <tx.data> \
  --value <tx.value> \
  --wallet-id <evm-wallet-id> \
  --private-key-pem <agent-private-key-pem>

API_BEARER_TOKEN="$(bun src/cli/llm-token.ts)" \
bun src/cli/Transaction.ts getTransactionStatus \
  --chain-id <evm-chain-id> \
  --hash <tx-hash>

# kind: "solana"
API_BEARER_TOKEN="$(bun src/cli/llm-token.ts)" \
bun src/cli/Transaction.ts sendSolTransaction \
  --transaction <tx.data> \
  --wallet-id <sol-wallet-id> \
  --private-key-pem <agent-private-key-pem>

API_BEARER_TOKEN="$(bun src/cli/llm-token.ts)" \
bun src/cli/Transaction.ts getTransactionStatus \
  --chain-id solana \
  --hash <sol-signature>
```

If source chain is already Arbitrum and token is native USDC, skip this bridge flow and run `deposit` directly.

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
- `transfer-dex-cash` requires different source and destination dex values.

## Live broadcast safety

- Do not broadcast vague natural-language intent; always show and review the exact command payload first.
- Never mix wallet ids across chains; use the exact EVM wallet id that matches `--from`.
- Do not run live execution commands without explicit `--wallet-id` and `--private-key-pem`.
- In bridge mode, execute quote `transactionRequests[]` in order; never reorder or skip steps.
- Do not send the next bridge transaction until the current transaction is confirmed `success`.
