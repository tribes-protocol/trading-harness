---
name: transaction
description: >-
  Low-level transaction plumbing. Handles: broadcasting Privy-signed single EVM transactions
  (sendEthTransaction), atomic EVM batches (sendCalls, EIP-5792), Solana transactions
  (sendSolTransaction), and cross-chain status checks (getTransactionStatus). Call it only AFTER
  wallet ethTransfer/solTransfer or a spot-trading quote has produced the payload — NEVER as the
  first choice for trade intent. NOT for: DEX swaps or bridges (use spot-trading); Hyperliquid
  orders, deposits, or withdrawals (use hyperliquid); building transfer payloads (use wallet).
allowed-tools: bash read
---

# Transaction

Backing command group: `tribes-cli transaction`. Broadcasts already-prepared transactions via
Privy signing and checks confirmation status. It never builds payloads itself.
Requires: an auth token (run `tribes-cli login` once if commands fail with auth errors) and a
wallet ID from `tribes-cli wallet list` (`wallet` skill) for every send command.

## When to use

- Broadcast one EVM payload (from `wallet ethTransfer` or a quote) — `sendEthTransaction`.
- Broadcast 2+ EVM calls atomically on one chain — `sendCalls`.
- Broadcast a Solana transaction (from `wallet solTransfer` or a quote) — `sendSolTransaction`.
- Check whether a broadcast confirmed — `getTransactionStatus`.
- NOT for trade intent ("buy X", "swap Y") — use `spot-trading` (DEX swaps/bridges) or
  `hyperliquid` (perps, HL spot, all stock trades).
- NOT for building transfer payloads or finding wallet IDs — use `wallet`.

## Hard rules

1. NEVER hand-craft calldata or Solana instructions. Payload sources: plain transfer →
   `wallet ethTransfer` / `wallet solTransfer`; swap or bridge → `spot-trading quote`.
2. Copy `--chain-id`, `--to`, `--value`, `--data` verbatim from the builder output. The chain id
   is set by the payload, never picked from balances.
3. Gas is sponsored — NEVER preflight gas, swap for gas, or ask the user to fund gas
   (see AGENTS.md).
4. NEVER mix wallet IDs across chains: `<evmWalletId>` signs EVM, `<solWalletId>` signs Solana.
5. Values are BASE UNITS. Wrong: `--value 0.01` (rejected). Right: `--value 10000000000000000`
   (0.01 ETH, 18 decimals). USDC has 6 decimals: 25 USDC → `25000000`. SOL has 9: 0.5 SOL →
   `500000000` lamports.
6. Confirm the outcome with the user in plain English (asset, amount, destination) before a
   signed send. NEVER show the user chain ids, calldata, hashes, or commands.
7. `sendCalls` returns a Privy `transaction_id`, NOT an on-chain hash. Report the batch result
   from that output; NEVER pass a `transaction_id` to `getTransactionStatus --hash`.

## Command reference

| Subcommand             | Purpose                                   | Required flags                                                                                | Read-only or signed |
| ---------------------- | ----------------------------------------- | --------------------------------------------------------------------------------------------- | ------------------- |
| `sendEthTransaction`   | Broadcast one EVM transaction             | `--chain-id`, `--to`, `--value`, `--wallet-id` (`--data` defaults to `0x`; `--from` optional) | signed              |
| `sendCalls`            | Broadcast an atomic EVM batch (EIP-5792)  | `--chain-id`, `--calls`, `--wallet-id`                                                        | signed              |
| `sendSolTransaction`   | Broadcast a serialized Solana transaction | `--transaction`, `--wallet-id`                                                                | signed              |
| `getTransactionStatus` | Cross-chain status by hash/signature      | `--chain-id`, `--hash` (`--timestamp`, `--check-safe-confirmations` optional)                 | read-only           |

All subcommands accept `--out <file>` to write the JSON output to a file instead of stdout.

## Batching algorithm (canonical statement — contiguous same-chain runs)

When broadcasting multiple EVM transactions, keep the given order and:

1. Walk the transactions left to right.
2. Extend the current run while the next transaction shares the run's `chainId`.
3. When the `chainId` changes, close the run and start a new one.
4. Send each run of 2+ calls with one `sendCalls`; send each run of exactly 1 with
   `sendEthTransaction`.
5. NEVER reorder across chain boundaries to build bigger batches.

Worked example — order Base, Base, Arbitrum: one `sendCalls --chain-id 8453` with both Base
calls, then one `sendEthTransaction --chain-id 42161`. Solana never batches — send each alone.

## Examples

### Broadcast one EVM transaction (payload from `wallet ethTransfer` or a spot-trading quote)

```bash
tribes-cli transaction sendEthTransaction \
  --chain-id 8453 \
  --to 0xe784B1FB160249E36c514Dc7f21cADDf025aE69f \
  --value 0 \
  --data 0xa9059cbb000000000000000000000000222222222222222222222222222222222222222200000000000000000000000000000000000000000000000000000000004c4b40 \
  --wallet-id <evmWalletId>
```

Output JSON contains the transaction hash — save it for `getTransactionStatus`.

### Broadcast an atomic EVM batch (2+ calls, one chain — e.g. approve + swap)

```bash
tribes-cli transaction sendCalls \
  --chain-id 8453 \
  --calls '[{"to":"0x3333333333333333333333333333333333333333","value":"0","data":"0x095ea7b3..."},{"to":"0x4444444444444444444444444444444444444444","value":"0","data":"0x38ed1739..."}]' \
  --wallet-id <evmWalletId>
```

Each call is `{"to","value","data"}`; `value` is a wei string, `data` defaults to `0x`. All
calls land or the whole batch reverts. Output contains a Privy `transaction_id` (hard rule 7).

### Broadcast a Solana transaction (string from `wallet solTransfer` or a spot-trading quote)

```bash
tribes-cli transaction sendSolTransaction \
  --transaction <base64-transaction-from-solTransfer> \
  --wallet-id <solWalletId>
```

Output contains the transaction signature — use it as `--hash` for a Solana status check.

### Check an EVM transaction (`--check-safe-confirmations` asks if it is confirmed)

```bash
tribes-cli transaction getTransactionStatus \
  --chain-id 8453 \
  --hash 0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa \
  --check-safe-confirmations
```

### Check a Solana transaction (`--timestamp` = original broadcast time in ms)

```bash
tribes-cli transaction getTransactionStatus \
  --chain-id solana \
  --hash 4h1qgVFwzt9EEfXVLBLPfjEmZBS7Ld6ryzYcSaBAvQ8mCoJKA3q6bYzQ2rSgWnqp3V6dcJgcQ5xW9mM1UbT7hK2e \
  --timestamp 1752048000000
```

## Error recovery

| Symptom                                  | Action                                                                           |
| ---------------------------------------- | -------------------------------------------------------------------------------- |
| Auth error (unauthorized, expired token) | Run `tribes-cli login`, retry the original command once, then stop and report.   |
| Any other API failure                    | Retry the same command once; if it fails again, stop and report the error.       |
| Value or amount rejected                 | You passed decimals — convert to base units (wei/raw/lamports) and retry.        |
| Missing payload field or wallet ID       | Rebuild via `wallet` / `spot-trading quote`; ask the user only in plain English. |

## Related skills

- `wallet` — wallet IDs and the unsigned transfer payloads broadcast here.
- `spot-trading` — quotes DEX swaps/bridges; this skill broadcasts the quoted payloads.
- `hyperliquid` — all Hyperliquid orders, deposits, withdrawals (never broadcast here).
- `trade-execution` — end-to-end trade playbook that calls into this skill.

## Before you finish

- [ ] Payload came from `wallet` or `spot-trading quote` — never hand-crafted.
- [ ] Values in base units; `--wallet-id` matches the payload's chain.
- [ ] Multiple EVM txs split into contiguous same-chain runs (2+ → `sendCalls`, 1 →
      `sendEthTransaction`), order preserved.
- [ ] No gas preflight ran and none was suggested to the user.
- [ ] User got the plain-English outcome — no hashes, calldata, or commands shown.
