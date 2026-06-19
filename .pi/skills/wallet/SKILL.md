---
name: wallet
description: Wallet address/ID discovery and token balance retrieval across EVM, Solana, and Hyperliquid via the shared wallet CLI. Use to list agent wallet addresses and IDs or fetch portfolio balances, including before transaction or hyperliquid commands that need a wallet ID.
allowed-tools: bash read
---

# Wallet - Addresses and Balances

Use this skill for wallet address discovery and balance retrieval through the shared wallet CLI.

## Requirements

- `API_BASE_URL` must point at the API worker.
- The wallet CLI exposes `list`, `assets`, `ethTransfer`, and `solTransfer`, for example:

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

## 3. Generate transfer payloads

Use `ethTransfer` and `solTransfer` to build unsigned payloads before broadcasting with the transaction CLI. Amounts are in base units (wei, token raw units, lamports).

### EVM native or ERC-20 transfer

```bash
tribes-cli wallet ethTransfer \
  --chain-id 8453 \
  --token-id network \
  --amount 1000000000000000000 \
  --to-address <recipient-evm-address>
```

For ERC-20, set `--token-id` to the token contract address. The output uses the token contract as `to` with encoded `transfer` calldata and `value: 0`.

```bash
tribes-cli wallet ethTransfer \
  --chain-id 42161 \
  --token-id 0xaf88d065e77c8cc2239327c5edb3a432268e5831 \
  --amount 5000000 \
  --to-address <recipient-evm-address>
```

The command returns a flat JSON object with `chainId`, `to`, `value`, and `data`. Pass those fields directly to the transaction CLI:

```bash
tribes-cli transaction sendEthTransaction \
  --chain-id <chainId> \
  --to <to> \
  --value <value> \
  --data <data> \
  --wallet-id <privy-evm-wallet-id>
```

### Solana native SOL or SPL transfer

Native SOL uses the native mint id `So11111111111111111111111111111111111111111`. `--from-address` is required (fee payer).

```bash
tribes-cli wallet solTransfer \
  --chain-id solana \
  --token-id So11111111111111111111111111111111111111111 \
  --amount 1000000 \
  --from-address <sender-solana-address> \
  --to-address <recipient-solana-address>
```

For SPL tokens, pass the mint address as `--token-id`. The builder adds an associated token account creation instruction when the recipient ATA does not exist.

The command returns a base64 serialized transaction string. Pass it directly to the transaction CLI:

```bash
tribes-cli transaction sendSolTransaction \
  --transaction <instruction> \
  --wallet-id <privy-sol-wallet-id>
```

## Error handling

| Symptom                        | Action                                                                  |
| ------------------------------ | ----------------------------------------------------------------------- |
| Need addresses                 | Run `tribes-cli wallet list`                                            |
| Need portfolio balances        | Run `tribes-cli wallet assets --wallet-addresses <address1> <address2>` |
| Need balances on one EVM chain | Add `--chain-ids <id>` (for example `--chain-ids 8453` for Base)        |
| Need EVM transfer payload      | Run `tribes-cli wallet ethTransfer --chain-id ... --token-id ...`       |
| Need Solana transfer payload   | Run `tribes-cli wallet solTransfer --chain-id solana --from-address ...` |
| Assets command failed          | Verify API bearer token and retry the same `assets` command             |
