# Leverage and isolated margin

Read this before running `set-leverage` or `adjust-margin`, and before lowering leverage or
removing isolated margin on an open position.

## Precheck before lowering leverage or removing margin

From `list-positions`, select the exact position (`dex`, `coin`, `side`), then:

1. `requiredMargin = positionValue / targetLeverage`
2. `extraNeeded = requiredMargin - marginUsed`
3. IF `extraNeeded > 0`, THEN read perp `withdrawable` from `list-balances`.
4. IF `withdrawable < extraNeeded`, THEN the change will fail — first add margin
   (`adjust-margin --direction add`) or reduce size with a reduce-only order.

Notes:

- Raising leverage needs no extra margin, but `targetLeverage` MUST be ≤ the asset's
  `maxLeverage` (from `list-assets`).
- `adjust-margin` applies to ISOLATED positions only; `--side` MUST match the open position.
- `adjust-margin --direction` defaults to `add`; `--amount` is a USDC delta in decimal units.
- `set-leverage --margin-mode` defaults to `cross`.

## Examples

### Update leverage without placing an order

```bash
tribes-cli hyperliquid set-leverage \
  --from 0x1111111111111111111111111111111111111111 \
  --coin BTC \
  --leverage 5 \
  --margin-mode isolated \
  --wallet-id <evmWalletId>
```

### Add isolated margin to an open long

```bash
tribes-cli hyperliquid adjust-margin \
  --from 0x1111111111111111111111111111111111111111 \
  --coin BTC \
  --side long \
  --amount 3 \
  --direction add \
  --wallet-id <evmWalletId>
```

### Remove excess isolated margin from the same position

```bash
tribes-cli hyperliquid adjust-margin \
  --from 0x1111111111111111111111111111111111111111 \
  --coin BTC \
  --side long \
  --amount 1 \
  --direction remove \
  --wallet-id <evmWalletId>
```
