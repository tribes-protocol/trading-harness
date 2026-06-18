---
name: transaction
description: Execute blockchain transactions and check status through the local transaction CLI.
compatibility: Designed for the autonomous-trading-agent harness; requires wallet skill (`.pi/skills/wallet`) to resolve wallet IDs before transaction commands.
allowed-tools: bash read
---

# Transaction

Use this skill when the agent must send a transaction or check transaction status.

## Compatibility

- Depends on the `wallet` skill for wallet discovery.
- Use wallet CLI output as the source of `walletId` / `walletAddress` context.
- Do not read `.pi/privy-wallets.json` directly in the workflow.

## Requirements

- Caller provides `walletId` for signed send endpoints.

## Required EVM tx data

For `sendEthTransaction`, gather the full tx payload:

- `chainId`
- `to`
- `data`
- `value`

Use `0x` for empty calldata. `value` must be raw wei.

## Batch calls (atomic)

Use `sendCalls` to execute several EVM calls in one atomic transaction (Privy
`wallet_sendCalls`, EIP-5792) — e.g. an ERC-20 `approve` plus a swap. Either all
calls land or the whole batch reverts.

- All calls share one `chainId`.
- Pass `--calls` as a JSON array of `{ to, value, data }`; `value` is raw wei as
  a string, `data` defaults to `0x`.
- Returns a Privy `transaction_id` (track it with `getTransactionStatus` once the
  on-chain hash is known).
- For multi-transaction requests, batch by contiguous same-chain runs (preserve
  full user order):
  - Walk transactions from left to right.
  - Build a run while consecutive transactions share the same `chainId`.
  - If a run has 2 or more calls, send that run via one `sendCalls`.
  - If a run has exactly 1 call, send it via `sendEthTransaction`.
  - When `chainId` changes, close the current run and start a new run.
- Never reorder across chain boundaries to create bigger batches.

## Workflow

1. Resolve wallet context through the wallet CLI:
   - Run `wallet list` to get `evmWalletId` and `evmWalletAddress`.
   - If `chainId` is unknown, run `wallet assets` for the EVM address and select an EVM `chainId` from returned ERC-20 balances.
2. Confirm tx intent and payload with the user (`chainId`, `to`, `data`, `value`).
3. If handling multiple EVM txs, split them into contiguous same-`chainId` runs:
   - Run length >= 2 -> `sendCalls`.
   - Run length = 1 -> `sendEthTransaction`.
4. Run the transaction command with explicit tx data fields and `--wallet-id`.
5. Return the tx hash/signature to the user.
6. Optionally run `getTransactionStatus` to verify confirmation.

## CLI

```bash
bun src/cli/Transaction.ts --help
```

## Common commands

### Send ETH transaction (EVM)

```bash
bun src/cli/Transaction.ts sendEthTransaction \
  --chain-id 42161 \
  --to 0x1111111111111111111111111111111111111111 \
  --value 1000000 \
  --wallet-id "<evmWalletId>"
```

### Send a batch of EVM calls (atomic)

```bash
bun src/cli/Transaction.ts sendCalls \
  --chain-id 8453 \
  --calls '[{"to":"0xTokenAddress","value":"0","data":"0xApproveCalldata"},{"to":"0xRouterAddress","value":"0","data":"0xSwapCalldata"}]' \
  --wallet-id "<evmWalletId>"
```

### Send Solana transaction

```bash
bun src/cli/Transaction.ts sendSolTransaction \
  --transaction "<serializedSolanaInstruction>" \
  --wallet-id "<solWalletId>"
```

### Check transaction status

```bash
bun src/cli/Transaction.ts getTransactionStatus \
  --chain-id 42161 \
  --hash 0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
```

### Example (sendEthTransaction)

```bash
bun src/cli/Transaction.ts sendEthTransaction \
  --chain-id 8453 \
  --to 0xe784B1FB160249E36c514Dc7f21cADDf025aE69f \
  --value 21200000000 \
  --data 0x \
  --wallet-id "<evmWalletId from wallet list>"
```

## Guardrails

- Never guess decimal conversions; explicitly convert to wei/lamports first.
- Never swap wallet ids across chains (`evmWalletId` vs `solWalletId`).
- Do not proceed if required inputs are missing; ask for confirmation
  instead.
