---
name: spot-trading
description: >-
  On-chain DEX swaps and cross-chain bridges on EVM chains and Solana. Handles: quoting with
  `tribes-cli spot-trading quote`, symbol-to-address resolution with `tribes-cli token search`,
  and broadcasting the quoted transactions through the zipbox-wallet skill. Call when the user
  wants to swap or bridge tokens on-chain. NOT for: Hyperliquid perp or HL-spot orders (use
  hyperliquid); stock trades (use hyperliquid — stocks are Hyperliquid perps); plain transfers
  of a token the user already holds (use zipbox-wallet).
allowed-tools: bash read
---

# Spot Trading

Backing command group: `tribes-cli spot-trading`. Quotes on-chain swaps and bridges; the
`zipbox-wallet` skill broadcasts the result. Canonical home of `tribes-cli token search`.
Requires: wallet addresses and Privy wallet IDs from `tribes-cli wallet list` (`zipbox-wallet` skill).

## When to use

- Swap one token for another on the same chain (EVM or Solana).
- Bridge a token between supported chains (EVM ↔ EVM, EVM ↔ Solana).
- Resolve a token symbol or name to a contract address or mint — `tribes-cli token search`.
- NOT for any Hyperliquid order or stock trade — use `hyperliquid` (stocks are Hyperliquid perps).
- NOT for sending a token the user already holds — use `zipbox-wallet`.

## Hard rules

1. NEVER infer token identity from a symbol — resolve the address/mint (balances → search → ask).
2. NEVER run `quote` until every required field is explicit: from-chain, to-chain, from-token,
   to-token, amount, from-address.
3. NEVER broadcast until the user confirms a plain-language trade summary (format below).
4. NEVER reorder, skip, or drop `transactionRequests[]` entries — quote order, stop on failure.
5. `--from-amount` is BASE UNITS. Wrong: `--from-amount 0.12`. Right: `--from-amount 120000`
   (0.12 USDC, 6 decimals).
6. Gas is sponsored — NEVER preflight gas or ask the user to fund gas (see AGENTS.md).

## Command reference

| Subcommand           | Purpose                                            | Required flags                                                                                                | Read-only or signed |
| -------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ------------------- |
| `spot-trading quote` | Quote a swap/bridge; returns `transactionRequests` | `--from-chain`, `--to-chain`, `--from-token`, `--to-token`, `--from-amount`, `--from-address`, `--to-address` | read-only (quotes)  |
| `token search`       | Resolve symbol/name to token addresses per chain   | `--query`                                                                                                     | read-only           |

Both accept `--out <file>` to write JSON to a file. `quote` also accepts `--slippage <value>`:
omit it for the default; set it only when the user asks for a specific slippage or a quote fails.

## Required flow

1. `tribes-cli wallet list` — source address plus `evmWalletId` / `solWalletId` for broadcast.
2. `tribes-cli wallet assets` — the source token row gives `--from-token` and its `decimals`.
3. Resolve any token address not found in balances with token search (section below).
4. Convert the decimal amount to base units (section below).
5. Request the quote (section below).
6. Confirm with the user (format below).
7. Broadcast `transactionRequests[]` in order and poll status after each send (section below).

## Resolve inputs

- Native asset (ETH, BNB, POL, SOL) → pass the literal string `network` as the token flag.
- `--from-address` is always the user's own wallet address on the source chain.
- `--to-address` defaults to the user's own wallet address. Change it only if the user
  explicitly names a different recipient — NEVER ask about it otherwise.
- IF chain or token intent is ambiguous → ask in plain language (no addresses):
  1. Which network is the token you're selling on (for example Base or Arbitrum)?
  2. Which network do you want to receive on?
  3. Which token exactly? Offer named candidates; the user picks by name, you keep the address.

Chain values for `--from-chain` / `--to-chain`: `1` Ethereum, `8453` Base, `42161` Arbitrum,
`56` BSC/BNB, `137` Polygon, `10` Optimism, `solana` Solana (map aliases like eth, arb, op).

## Token search (symbol → address)

```bash
tribes-cli token search --query PEPE
```

Resolve the address/mint from the results in this order:

1. Filter to the destination `chainId`.
2. Take the exact symbol match (case-insensitive).
3. Else take the exact name match (case-insensitive).
4. Else (multiple candidates remain) ask the user to pick one by name before quoting.

## Convert amounts

Decimal-string arithmetic only — NEVER floating-point math for on-chain quantities.

```bash
# decimal → base units: 0.12 with 6 decimals → 120000
node -e "const amount='0.12'; const decimals=6; const [i,f='']=amount.split('.'); if (f.length>decimals) throw new Error('Too many decimals'); console.log(BigInt(i+(f+'0'.repeat(decimals)).slice(0,decimals)).toString())"
# base units → decimal (for user-facing summaries): 119280 with 6 decimals → 0.11928
node -e "const raw='119280'; const d=6; const s=raw.padStart(d+1,'0'); console.log((s.slice(0,-d)+'.'+s.slice(-d)).replace(/\.?0+$/,''))"
```

## Quote

0.12 USDC on Base → USDT on Arbitrum:

```bash
tribes-cli spot-trading quote \
  --from-chain 8453 \
  --to-chain 42161 \
  --from-token 0x833589fcd6edb6e08f4c7c32d4f71b54bda02913 \
  --to-token 0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9 \
  --from-amount 120000 \
  --from-address <evm-address> \
  --to-address <evm-address>
```

Output fields you must use (sample shape):

```
{ "kind": "bridge", "fromAmount": "120000", "toAmountMin": "119280",
  "transactionRequests": [
    { "chainId": 8453, "to": "0x1231deb6...", "value": "0", "data": "0x095ea7b3..." },
    { "chainId": 8453, "to": "0x1231deb6...", "value": "0", "data": "0xae328590..." } ] }
```

## Confirm with the user

Summarize in plain language: decimal amounts, token names as tribes.xyz links, chain names, and
the minimum received (`toAmountMin` as decimal). NEVER show raw addresses, calldata, or JSON.

> Swap 0.12 [USDC](https://tribes.xyz/8453/token/0x833589fcd6edb6e08f4c7c32d4f71b54bda02913) on
> Base for [USDT](https://tribes.xyz/42161/token/0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9) on
> Arbitrum — you'll receive at least 0.11928 USDT. Go ahead?

## Broadcast

Split EVM `transactionRequests[]` into contiguous same-`chainId` runs: a run of 2+ goes through
one `sendCalls`, a run of 1 through `sendEthTransaction`; the full batching algorithm lives in
AGENTS.md. `--wallet-id` is the `evmWalletId` / `solWalletId` from step 1.

Single EVM request (`--value` is a decimal wei string like `1000000000000000000`, never hex):

```bash
tribes-cli transaction sendEthTransaction \
  --chain-id 8453 \
  --to <tx.to> \
  --value <tx.value> \
  --data <tx.data> \
  --from <evm-address> \
  --wallet-id <evmWalletId>
```

Run of 2+ EVM requests on one chain:

```bash
tribes-cli transaction sendCalls \
  --chain-id 8453 \
  --calls '[{"to":"<tx0.to>","value":"<tx0.value>","data":"<tx0.data>"},{"to":"<tx1.to>","value":"<tx1.value>","data":"<tx1.data>"}]' \
  --wallet-id <evmWalletId>
```

Solana leg (a request on chain `solana` carries a serialized transaction string, not to/data):

```bash
tribes-cli transaction sendSolTransaction \
  --transaction <serialized-transaction> \
  --wallet-id <solWalletId>
```

Poll after every send — `--chain-id` accepts numeric EVM ids or `solana`:

```bash
tribes-cli transaction getTransactionStatus \
  --chain-id 8453 \
  --hash <tx-hash> \
  --timestamp <send-time-ms> \
  --check-safe-confirmations
```

- `status: "success"` → send the next run.
- `status: "pending"` → sleep 5 seconds, poll again; after 24 attempts stop, report still pending.
- `status: "failed"` → stop immediately; report which step failed in plain language.

## Error recovery

| Symptom                                  | Action                                                                                                                      |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Auth error (unauthorized, expired token) | Run `tribes-cli login`, retry the original command once, then stop and report.                                              |
| Quote returns an error or no route       | Retry once (adjust `--slippage` if the error mentions slippage); if it fails again, tell the user the route is unsupported. |
| Amount rejected                          | You passed decimals — convert to base units and retry.                                                                      |
| A run failed mid-sequence                | Stop; report what completed and what did not. NEVER re-send earlier runs.                                                   |

## Related skills

- `zipbox-wallet` — run first for addresses, wallet IDs, and pre-trade balances; broadcasts the quoted transactions.
- `hyperliquid` — Hyperliquid perp/spot orders and all stock trades.
- `trade-execution` — end-to-end trade playbook with pre/post checks.

## Before you finish

- [ ] Every required field was explicit before quoting; no token identity was guessed from a symbol.
- [ ] The user confirmed a plain-language summary (no raw addresses or calldata) before any broadcast.
- [ ] `transactionRequests[]` went out in quote order with `--wallet-id` on every send.
- [ ] Amounts were base units on-chain and decimals in everything shown to the user.
- [ ] Gas was never preflighted or requested from the user.
