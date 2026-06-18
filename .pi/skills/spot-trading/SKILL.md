---
name: spot-trading
description: Execute swaps and bridges by quoting with spot-trading and broadcasting with transaction-cli. Use when the user asks to swap, bridge, or trade between supported chains/tokens.
allowed-tools: bash read
---

# Spot Trading - Quote and Execute

Use this skill for swap/bridge execution flow. Wallet auth/session and balance discovery still come from the wallet skill.

## Required flow

1. Resolve wallet addresses (usually from `tribes-cli wallet list` or `.pi/privy-wallets.json`).
2. Fetch balances with `tribes-cli wallet assets`.
3. If chain/token intent is ambiguous, ask clarifying questions before any quote.
4. Resolve source and destination token metadata (`address`, `decimals`) from balance rows.
5. If destination token is missing from balances, search with `token-cli search` using the provided name/symbol and resolve `to-token` from search results.
6. Convert user amount from decimal units to base units.
7. Request quote with `spot-trading quote`.
8. Read `transactionRequests[]` from quote response.
9. Split `transactionRequests[]` into contiguous same-`chainId` runs (left to right, no reordering).
10. For each run:
    - run length `>= 2`: broadcast via `transaction-cli sendCalls`
    - run length `= 1`: broadcast via `transaction-cli sendEthTransaction`
11. After each broadcast, poll `getTransactionStatus` until `status: "success"`.
12. Do not send the next run unless the current run succeeds.

If any transaction/run returns `failed`, stop execution and report the failed hash/index.

## Input disambiguation (mandatory)

Never infer token identity from symbol alone.

If the user says something like `swap USDC to USDT` without chain/address details, stop and ask clarifying questions before quoting or broadcasting.

Required fields before execution:

- source chain (`from-chain`)
- destination chain (`to-chain`)
- source token exact address/mint (`from-token`)
- destination token exact address/mint (`to-token`)
- amount
- source wallet address (`from-address`)

## Address defaults (mandatory)

- Always set `from-address` to the user's wallet address.
- By default, set `to-address` to the same user wallet address.
- Only change `to-address` if the user explicitly provides a different destination address.
- If destination address is not explicitly provided, do not ask a follow-up question for it; use user address.

Ask these questions when ambiguous:

1. Which chain is the source token on (for example Base or Arbitrum)?
2. Which chain is the destination token on?
3. Which exact source token contract/mint should be used?
4. Which exact destination token contract/mint should be used?

If the user does not provide token addresses, run `tribes-cli wallet assets`, propose matching candidates from the balance rows, and ask the user to pick one exact token per side.

If `to-token` is not present in balance rows on the destination chain, run token search and use the results to resolve the destination token address/mint.

Do not run `spot-trading quote` until all required fields are explicit.

Do not broadcast until the final summary is confirmed in this format:
`swap <amount> <from-token-symbol> (<from-token-address>) on <from-chain> -> <to-token-symbol> (<to-token-address>) on <to-chain>`.

## Chain ID mapping for `--from-chain` / `--to-chain`

Use only these chain aliases/ids when building quote requests:

- `eth`, `mainnet` -> `1`
- `base` -> `8453`
- `arb`, `arbitrum` -> `42161`
- `bsc` -> `56`
- `pol`, `polygon` -> `137`
- `op`, `optimism` -> `10`
- `solana` -> `solana`

## 1) Fetch balances first

```bash
tribes-cli wallet assets \
  --wallet-addresses <evm-address> <solana-pubkey>
```

To narrow EVM lookups to the source or destination chain, pass `--chain-ids` with the numeric chain ID from the mapping below (for example `--chain-ids 8453` for Base). Omit `--chain-ids` to fetch all supported EVM chains.

Pass addresses as separate arguments after `--wallet-addresses`.

Find the source token by chain + symbol (or exact address). Use that row's:

- `address` as `--from-token`
- `decimals` to convert the user amount to base units

For destination token, use exact token address (or mint for Solana).

If destination token is not present in balances, search it by user-provided name/symbol:

```bash
tribes-cli token search \
  --query <to-token-name-or-symbol>
```

Then resolve `--to-token` from search results with this order:

1. Filter to destination `chainId`.
2. Prefer exact symbol match (case-insensitive) to the user input.
3. If no exact symbol match, use exact name match (case-insensitive).
4. If still ambiguous (multiple candidates), ask the user to pick one exact token address/mint before quoting.

## 2) Convert decimal amount to base units

Use decimal-string arithmetic, never floating-point math for onchain quantities.

Example:

- `0.12` USDC with `6` decimals -> `120000`

Node example:

```bash
node -e "const amount='0.12'; const decimals=6; const [i,f='']=amount.split('.'); const frac=(f+'0'.repeat(decimals)).slice(0,decimals); if (f.length>decimals) throw new Error('Too many decimals'); console.log(BigInt(i+frac).toString())"
```

## 3) Quote with spot-trading

```bash
tribes-cli spot-trading quote \
  --from-chain <from-chain-id-or-solana> \
  --to-chain <to-chain-id-or-solana> \
  --from-token <from-token-address-or-network> \
  --to-token <to-token-address-or-network> \
  --from-amount <base-unit-amount> \
  --from-address <user-wallet-address> \
  --to-address <user-wallet-address-or-explicit-destination>
```

The quote output shape is defined by `QuoteResponseSchema` and includes:

- `kind`
- `fromAmount`
- `toAmountMin`
- `transactionRequests[]`

## Acquiring native gas (top-up)

Use this flow to fund the native gas token on a destination chain. It is needed
only when destination-chain gas is low/insufficient or for a cross-chain flow,
not on every trade. See the transaction skill's gas / native token
preflight for the full decision order (bridge native, swap ERC-20, or ask the
user to deposit when no native gas exists anywhere).

- Set `--to-chain` to the destination chain that needs gas.
- Set `--to-token` to the destination chain's native gas token:
  - EVM destination -> `network`
  - Solana destination -> `So11111111111111111111111111111111111111111`
- `--from-token` is `network` to bridge native -> native, or an ERC-20/SPL
  address/mint to convert a tradable token into native gas.
- Size `--from-amount` so the received native covers at least ~5 trades on the
  destination chain when plenty of gas/ERC-20 is available; avoid tiny top-ups.

## 4) Broadcast transactions with contiguous chain batching

Apply this pattern to EVM `transactionRequests[]` in quote order:

1. Walk the array from left to right.
2. Build a run while consecutive requests share the same `chainId`.
3. Run length `>= 2` -> one `sendCalls` for that run.
4. Run length `= 1` -> one `sendEthTransaction`.
5. On chain change, close the current run and start a new run.
6. Do not reorder requests across chain boundaries to create larger batches.

### Single request in a run (`sendEthTransaction`)

```bash
tribes-cli transaction sendEthTransaction \
  --chain-id <evm-chain-id> \
  --to <tx.to> \
  --data <tx.data> \
  --value <hex-value>
```

### Multi-request run (`sendCalls`)

```bash
tribes-cli transaction sendCalls \
  --chain-id <evm-chain-id> \
  --calls '[{"to":"<tx0.to>","value":"<tx0.value>","data":"<tx0.data>"},{"to":"<tx1.to>","value":"<tx1.value>","data":"<tx1.data>"}]'
```

Then poll status after each send:

```bash
tribes-cli transaction getTransactionStatus \
  --chain-id <evm-chain-id> \
  --hash <tx-hash> \
  --check-safe-confirmations
```

Repeat status polling until:

- `status: "success"` -> proceed to next transaction
- `status: "failed"` -> stop immediately
- `status: "pending"` -> keep polling

Run this loop for each run in order.

## Execution guardrails

- Never reorder transactions from quote output.
- Never skip approval/setup transactions in the array.
- Never continue after a failed transaction.
- Always default `to-address` to the user wallet unless user explicitly overrides it.
- Always show exact transaction payload details before broadcast.
