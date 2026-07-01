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
- Do not read `.tribes/privy-wallets.json` directly in the workflow.

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

## Gas is sponsored

Gas for every transaction is sponsored by the harness, so the signer never needs
to hold native gas (ETH on EVM, SOL on Solana) to send. This applies to single
sends (`sendEthTransaction`), atomic batches (`sendCalls`), and Solana sends
(`sendSolTransaction`).

- Do not check native balances for gas before sending.
- Do not bridge or swap to acquire native gas.
- Do not ask the user to deposit native gas.

Proceed directly with the send.

## Workflow

1. Gas is sponsored; do no gas preflight and proceed directly to the send.
2. Resolve wallet context through the wallet CLI:
   - Run `wallet list` to get `evmWalletId` and `evmWalletAddress`.
   - If `chainId` is unknown, run `wallet assets` for the EVM address and select an EVM `chainId` from returned ERC-20 balances.
3. Confirm tx intent and payload with the user (`chainId`, `to`, `data`, `value`).
4. If handling multiple EVM txs, split them into contiguous same-`chainId` runs:
   - Run length >= 2 -> `sendCalls`.
   - Run length = 1 -> `sendEthTransaction`.
5. Run the transaction command with explicit tx data fields and `--wallet-id`.
6. Return the tx hash/signature to the user.
7. Optionally run `getTransactionStatus` to verify confirmation.

## CLI

```bash
tribes-cli transaction --help
```

## Common commands

### Send ETH transaction (EVM)

```bash
tribes-cli transaction sendEthTransaction \
  --chain-id 42161 \
  --to 0x1111111111111111111111111111111111111111 \
  --value 1000000 \
  --wallet-id "<evmWalletId>"
```

### Send a batch of EVM calls (atomic)

```bash
tribes-cli transaction sendCalls \
  --chain-id 8453 \
  --calls '[{"to":"0xTokenAddress","value":"0","data":"0xApproveCalldata"},{"to":"0xRouterAddress","value":"0","data":"0xSwapCalldata"}]' \
  --wallet-id "<evmWalletId>"
```

### Send Solana transaction

```bash
tribes-cli transaction sendSolTransaction \
  --transaction "<serializedSolanaInstruction>" \
  --wallet-id "<solWalletId>"
```

### Check transaction status

```bash
tribes-cli transaction getTransactionStatus \
  --chain-id 42161 \
  --hash 0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
```

### Example (sendEthTransaction)

```bash
tribes-cli transaction sendEthTransaction \
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
- Gas is sponsored; never acquire native gas or ask the user to deposit it.
