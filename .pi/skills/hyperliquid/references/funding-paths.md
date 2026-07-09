# Funding paths: getting USDC onto Hyperliquid

Read this before any deposit where the source funds are NOT already Arbitrum native USDC, and
whenever you need the bridge parameters. The clarify-first rule and the deposit example live in
SKILL.md.

## Deposit parameters (every path ends at `deposit`)

- A deposit is an ERC-20 transfer of Arbitrum native USDC to the Hyperliquid bridge; the
  `deposit` command builds and broadcasts it for you.
- Chain: Arbitrum, chainId `42161`.
- Bridge contract: `0x2Df1c51E09aECF9cacB7bc98cB1742757f163dF7`.
- USDC contract: `0xaf88d065e77c8cC2239327C5EDb3A432268e5831`.
- Minimum deposit: 5 USDC. `--amount` is decimal USDC units, not base units.
- Funds are credited to the Hyperliquid account mapped to the sender (`--from`) address.

## Pick the path by where the source funds are

| Path | Source funds                        | Steps                                                                  |
| ---- | ----------------------------------- | ---------------------------------------------------------------------- |
| A    | Arbitrum (`42161`) native USDC      | Run `deposit` directly — no conversion                                 |
| B    | Arbitrum (`42161`), any other token | Same-chain swap to Arbitrum USDC via `spot-trading`, then `deposit`    |
| C    | Any other chain (EVM or Solana)     | Cross-chain bridge to Arbitrum USDC via `spot-trading`, then `deposit` |

## Paths B and C: convert with the spot-trading skill

Run the swap/bridge exactly as the `spot-trading` skill documents (quote, broadcast through the
`transaction` skill, poll status until success) — do not improvise that loop here. Quote with
these targets:

```bash
tribes-cli spot-trading quote \
  --from-chain <source-chain-id-or-solana> \
  --to-chain 42161 \
  --from-token <source-token-address-or-network> \
  --to-token 0xaf88d065e77c8cC2239327C5EDb3A432268e5831 \
  --from-amount <base-unit-amount> \
  --from-address 0x1111111111111111111111111111111111111111 \
  --to-address 0x1111111111111111111111111111111111111111
```

- Path B: `--from-chain 42161` (same-chain swap). Path C: `--from-chain <other-chain>`.
- If the source chain is Solana, `--from-address` is the Solana wallet address; `--to-address`
  stays the EVM address that will run `deposit`.
- IF every conversion transaction confirms success AND the Arbitrum USDC is credited, THEN run
  `deposit` (SKILL.md) with the same EVM wallet. The 5 USDC minimum applies to the converted
  amount.
- IF any conversion transaction fails, THEN stop and report the failed hash/index — do not
  deposit.
