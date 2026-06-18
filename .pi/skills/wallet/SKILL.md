---
name: wallet
description: Wallet address/ID discovery and token balance retrieval across EVM, Solana, and Hyperliquid via the shared wallet CLI. Use to list agent wallet addresses and IDs or fetch portfolio balances, including before transaction or hyperliquid commands that need a wallet ID.
allowed-tools: bash read
---

# Wallet - Addresses and Balances

Use this skill for wallet address discovery and balance retrieval through the shared wallet CLI.

## Requirements

- `API_BASE_URL` must point at the API worker.
- The wallet CLI exposes `list` and `assets`, for example:

```bash
tribes-cli wallet list
```

## 1. List wallet addresses

Use the wallet CLI to discover current wallet addresses and IDs:

```bash
tribes-cli wallet list
```

## 2. Fetch balances

Pass wallet addresses explicitly to the CLI:

```bash
tribes-cli wallet assets \
  --wallet-addresses <address1> <address2>
```

Limit EVM balance lookups to specific chains with `--chain-ids` (space-separated numeric chain IDs). Omit it to query all supported EVM chains.

```bash
tribes-cli wallet assets \
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

When all provided wallet addresses are Solana addresses, omit `--chain-ids`.
When Solana and EVM addresses are mixed, Solana balances are still returned and `--chain-ids` only filters EVM lookups.

```bash
tribes-cli wallet assets \
  --wallet-addresses <solana-address>
```

Write output to a file when needed:

```bash
tribes-cli wallet assets \
  --wallet-addresses <address1> <address2> \
  --chain-ids 8453
```

Pass addresses as separate arguments after `--wallet-addresses`.

## Error handling

| Symptom                        | Action                                                                  |
| ------------------------------ | ----------------------------------------------------------------------- |
| Need addresses                 | Run `tribes-cli wallet list`                                            |
| Need portfolio balances        | Run `tribes-cli wallet assets --wallet-addresses <address1> <address2>` |
| Need balances on one EVM chain | Add `--chain-ids <id>` (for example `--chain-ids 8453` for Base)        |
| Assets command failed          | Verify API bearer token and retry the same `assets` command             |
