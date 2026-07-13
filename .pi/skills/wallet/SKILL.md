---
name: wallet
description: >-
  Operational wallet lookup. Handles: listing the agent's wallet addresses and Privy wallet IDs,
  raw current token balances on EVM and Solana chains, and building unsigned transfer payloads
  (EVM native/ERC-20, Solana SOL/SPL) for the transaction skill to broadcast. Call it before any
  transaction, hyperliquid, or spot-trading command that needs a wallet ID or address. NOT for:
  Hyperliquid perp/spot balances (use hyperliquid); net worth over time, PnL, or transaction
  history (use wallet-analyst); broadcasting transactions (use transaction).
allowed-tools: bash read
---

# Wallet

Backing command group: `tribes-cli wallet`. Discovers the agent's wallet addresses and IDs,
fetches raw balances, and builds unsigned transfer payloads.
Requires: an auth token (run `tribes-cli login` once if commands fail with auth errors).

## When to use

- Need a wallet ID or address for an execution command — run `list` first.
- Need current token balances on EVM or Solana chains — run `assets`.
- Need an unsigned transfer payload to hand to the `transaction` skill — run `ethTransfer` or
  `solTransfer`.
- NOT for Hyperliquid perp/spot balances — use `tribes-cli hyperliquid list-balances`
  (`hyperliquid` skill).
- NOT for historical net worth, PnL, or transfer history — use `wallet-analyst`.
- NOT for broadcasting — use `transaction`.

## Hard rules

1. NEVER read `.tribes/privy-wallets.json` directly. `tribes-cli wallet list` is the only
   source of wallet IDs and addresses.
2. Transfer amounts are BASE UNITS (wei, raw token units, lamports), never decimals.
   Wrong: `--amount 1.5` (rejected). Right: `--amount 1500000000000000000` (1.5 ETH, 18 decimals).
3. NEVER mix wallet IDs across chains: `evmWalletId` signs EVM, `solWalletId` signs Solana.

## Command reference

| Subcommand    | Purpose                                    | Required flags                                                           | Read-only or signed |
| ------------- | ------------------------------------------ | ------------------------------------------------------------------------ | ------------------- |
| `list`        | List wallet addresses and Privy wallet IDs | none                                                                     | read-only           |
| `assets`      | Token balances for given addresses         | `--wallet-addresses`                                                     | read-only           |
| `ethTransfer` | Build unsigned EVM native/ERC-20 transfer  | `--chain-id`, `--token-id`, `--amount`, `--to-address`                   | read-only (builds)  |
| `solTransfer` | Build unsigned Solana SOL/SPL transfer     | `--chain-id`, `--token-id`, `--amount`, `--from-address`, `--to-address` | read-only (builds)  |

All subcommands accept `--out <file>` to write the JSON output to a file instead of stdout.

## Examples

### Get wallet addresses and IDs (run this before any execution command)

```bash
tribes-cli wallet list
```

Output is a JSON array with the fields downstream commands need:

```json
[
  {
    "evmWalletId": "wxyz1abcd2efgh3ijkl4mnop",
    "evmWalletAddress": "0x1111111111111111111111111111111111111111",
    "solWalletId": "abcd1wxyz2efgh3ijkl4mnop",
    "solWalletAddress": "A1bC2dE3fG4hJ5kL6mN7pQ8rS9tU1vW2xY3zA4bC5dE"
  }
]
```

Use `evmWalletId` / `solWalletId` as `--wallet-id`, and the matching address as `--from`.

### Fetch balances

```bash
tribes-cli wallet assets \
  --wallet-addresses 0x1111111111111111111111111111111111111111 A1bC2dE3fG4hJ5kL6mN7pQ8rS9tU1vW2xY3zA4bC5dE
```

Pass addresses as separate space-separated arguments. `--chain-ids` filters EVM lookups:

- All addresses EVM: add `--chain-ids 1 8453` to limit chains, or omit to query all.
- All addresses Solana: omit `--chain-ids`.
- Mixed: Solana balances always return; `--chain-ids` only filters the EVM side.

Supported EVM chain IDs: `1` Ethereum, `8453` Base, `42161` Arbitrum, `56` BSC, `137` Polygon,
`10` Optimism.

### Build an EVM transfer payload

Native token uses `--token-id network`; ERC-20 uses the token contract address.

```bash
# 5 USDC (6 decimals) on Arbitrum
tribes-cli wallet ethTransfer \
  --chain-id 42161 \
  --token-id 0xaf88d065e77c8cc2239327c5edb3a432268e5831 \
  --amount 5000000 \
  --to-address 0x2222222222222222222222222222222222222222
```

Output is a flat JSON object `{ chainId, to, value, data }`. Broadcast it with:

```bash
tribes-cli transaction sendEthTransaction \
  --chain-id <chainId> \
  --to <to> \
  --value <value> \
  --data <data> \
  --wallet-id <evmWalletId>
```

### Build a Solana transfer payload

Native SOL uses mint id `So11111111111111111111111111111111111111111`; SPL tokens use the mint
address. `--from-address` is required (fee payer). The builder adds an associated-token-account
creation instruction when the recipient ATA does not exist.

```bash
# 0.001 SOL (1000000 lamports)
tribes-cli wallet solTransfer \
  --chain-id solana \
  --token-id So11111111111111111111111111111111111111111 \
  --amount 1000000 \
  --from-address A1bC2dE3fG4hJ5kL6mN7pQ8rS9tU1vW2xY3zA4bC5dE \
  --to-address B2cD3eF4gH5jK6lM7nP8qR9sT1uV2wX3yZ4aB5cD6eF
```

Output is a base64-serialized transaction string. Broadcast it with:

```bash
tribes-cli transaction sendSolTransaction \
  --transaction <base64-transaction-from-solTransfer> \
  --wallet-id <solWalletId>
```

## Error recovery

| Symptom                                  | Action                                                                         |
| ---------------------------------------- | ------------------------------------------------------------------------------ |
| Auth error (unauthorized, expired token) | Run `tribes-cli login`, retry the original command once, then stop and report. |
| Any other API failure                    | Retry the same command once; if it fails again, stop and report the error.     |
| Amount rejected                          | You passed decimals — convert to base units (wei/raw/lamports) and retry.      |

## Related skills

- `transaction` — broadcasts the payloads built here.
- `hyperliquid` — Hyperliquid balances, deposits, and orders (needs `evmWalletId` + `--from`).
- `spot-trading` — DEX swaps/bridges (needs addresses and balances from here).
- `wallet-analyst` — historical portfolio analytics (net worth, PnL, transfer history).
