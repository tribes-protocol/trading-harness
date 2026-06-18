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

## Gas / native token preflight (conditional)

Do not evaluate gas on every transaction. When the signer already holds ample
native gas on the destination chain (clearly above this transaction's cost),
skip the acquisition flow below and proceed directly with the send.

Any transaction needs native gas on the chain it executes on. For a cross-chain
flow (a bridge/transfer followed by a transaction on the destination chain) this
means both the source/current chain (for the initial bridge leg) and the
destination chain (for the follow-up). Make sure each chain that runs a leg has
enough native gas for that leg.

Run the gas acquisition flow only when either is true:

- Native gas on a chain that will run a leg is low/insufficient for the operation.
- It is a cross-chain flow: a bridge/transfer from one chain to another that
  requires a follow-up transaction on the destination chain. The destination
  chain may have no native gas, so fund it before the follow-up.

When you do run it, follow the order below instead of improvising multi-step
workarounds.

- Native gas token is ETH on EVM chains and SOL on Solana.
- In `wallet assets`, the native balance is the row whose token `address` is
  `network` (EVM) or `So11111111111111111111111111111111111111111` (Solana).
  Treat those as the native gas token in quotes.
- Check the native balance on the destination chain first. If it already covers
  the operation, proceed with the send.
- Otherwise acquire gas on the destination chain in this priority order:
  1. No native gas token (ETH/SOL) on any chain at all -> STOP and ask the user
     to deposit the native gas token. Do not attempt swaps/bridges, because every
     transaction needs native gas to execute.
  2. Native gas held on the current (or another) chain -> bridge native -> native
     to the destination chain using the trade cli (`--from-token network`,
     `--to-token network` for an EVM destination).
  3. Only tradable ERC-20/SPL available (with enough native somewhere to pay the
     swap's own gas) -> swap the ERC-20 into the destination chain's native gas
     token using the trade cli.
  4. Sizing: whenever bridging or converting gas and there is plenty of
     gas/ERC-20 available, send enough native for at least ~5 trades on the
     destination chain. Avoid repeated tiny top-ups.
- trade cli `to-token` value when acquiring native gas:
  - EVM destination -> `network`
  - Solana destination -> `So11111111111111111111111111111111111111111`
- Use the trade cli (`spot-trading quote`) to retrieve the quote, then broadcast
  via the spot-trading execution flow (contiguous same-chain batching + status
  polling).

## Workflow

1. Only run the gas acquisition flow above when native gas on a chain that will
   run a leg is low/insufficient or for a cross-chain flow; otherwise proceed
   directly.
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
- When native gas is actually low/absent (or for a cross-chain flow), never
  improvise multi-step workarounds. Follow the gas
  acquisition order exactly, and stop to ask the user to deposit gas when no
  native gas token exists on any chain.
