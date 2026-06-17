---
name: wallet
description: Wallet address/ID discovery and token balance retrieval across EVM, Solana, and Hyperliquid via the shared wallet CLI. Use to list agent wallet addresses and IDs or fetch portfolio balances, including before transaction or hyperliquid commands that need a wallet ID.
allowed-tools: bash read
---

# Wallet - Addresses and Balances

Use this skill for wallet address discovery and balance retrieval through the shared wallet CLI.

## Requirements

- `API_BASE_URL` must point at the API worker.
- `API_BEARER_TOKEN` is required for wallet API calls (`list` and `assets`), for example:

```bash
API_BEARER_TOKEN="$(bun src/cli/llm-token.ts)" bun .pi/skills/wallet/src/cli/Wallet.ts list
```

## 1. List wallet addresses

Use the wallet CLI to discover current wallet addresses and IDs:

```bash
API_BEARER_TOKEN="$(bun src/cli/llm-token.ts)" \
  bun .pi/skills/wallet/src/cli/Wallet.ts list
```

Write output to a file when needed:

```bash
API_BEARER_TOKEN="$(bun src/cli/llm-token.ts)" \
  bun .pi/skills/wallet/src/cli/Wallet.ts list \
  --out runtime/wallets/latest.json
```

## 2. Fetch balances

Pass wallet addresses explicitly to the CLI:

```bash
API_BEARER_TOKEN="$(bun src/cli/llm-token.ts)" \
  bun .pi/skills/wallet/src/cli/Wallet.ts assets \
  --wallet-addresses <address1> <address2>
```

Limit EVM balance lookups to specific chains with `--chain-ids` (comma-separated numeric chain IDs). Omit it to query all supported EVM chains.

```bash
API_BEARER_TOKEN="$(bun src/cli/llm-token.ts)" \
  bun .pi/skills/wallet/src/cli/Wallet.ts assets \
  --wallet-addresses <evm-address> \
  --chain-ids 1 8453
```

Supported EVM `chainIds`:

- `1` - Ethereum
- `8453` - Base
- `42161` - Arbitrum
- `56` - BSC
- `137` - Polygon
- `10` - Optimism

When a Solana wallet address is included, Solana balances are still returned. `--chain-ids` only filters EVM lookups.

Write output to a file when needed:

```bash
API_BEARER_TOKEN="$(bun src/cli/llm-token.ts)" \
  bun .pi/skills/wallet/src/cli/Wallet.ts assets \
  --wallet-addresses <address1> <address2> \
  --chain-ids 8453 \
  --out runtime/wallet-assets/latest.json
```

Pass addresses as separate arguments after `--wallet-addresses`.

## Error handling

| Symptom                        | Action                                                                                                                                       |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Need addresses                 | Run `API_BEARER_TOKEN="$(bun src/cli/llm-token.ts)" bun .pi/skills/wallet/src/cli/Wallet.ts list`                                            |
| Need portfolio balances        | Run `API_BEARER_TOKEN="$(bun src/cli/llm-token.ts)" bun .pi/skills/wallet/src/cli/Wallet.ts assets --wallet-addresses <address1> <address2>` |
| Need balances on one EVM chain | Add `--chain-ids <id>` (for example `--chain-ids 8453` for Base)                                                                             |
| Assets command failed          | Verify API bearer token and retry the same `assets` command                                                                                  |
