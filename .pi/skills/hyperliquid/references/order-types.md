# Order types and option flags

Read this before placing limit, stop, take-profit, or bracket orders, or when you need the
optional flag list for any order command. Sizing and price conversion rules live in SKILL.md
("Sizing"); order-batching rules live in SKILL.md ("Order batching").

## Order type matrix (`trade-perp`; `trade-spot` supports `market` and `limit` only)

| `--type`           | `--price` | `--trigger-px` | Behavior once submitted                                |
| ------------------ | --------- | -------------- | ------------------------------------------------------ |
| `market` (default) | omit      | omit           | Aggressive IOC-style fill around the reference price   |
| `limit`            | required  | omit           | Rests at `--price` until filled (per `--tif`)          |
| `stop_market`      | omit      | required       | Market order once the trigger is crossed (stop-loss)   |
| `stop_limit`       | required  | required       | Limit order at `--price` once the trigger is crossed   |
| `take_market`      | omit      | required       | Market order once the trigger is crossed (take-profit) |
| `take_limit`       | required  | required       | Limit order at `--price` once the trigger is crossed   |

- `stop_*` triggers as stop-loss, `take_*` as take-profit; pair either with `--reduce-only` for a
  protective exit on an existing position.
- To close a long you place the exit with `--side short` (and vice versa) plus `--reduce-only`.
- Defaults across order commands: `--type market`, `--tif Gtc`, `--margin-mode cross`,
  `--dex main`.

## Examples

### Limit entry

```bash
tribes-cli hyperliquid trade-perp \
  --from 0x1111111111111111111111111111111111111111 \
  --coin BTC \
  --side long \
  --type limit \
  --price 95000 \
  --amount 0.001 \
  --wallet-id <evmWalletId>
```

### Protective stop-market on an existing long

```bash
tribes-cli hyperliquid trade-perp \
  --from 0x1111111111111111111111111111111111111111 \
  --coin BTC \
  --side short \
  --type stop_market \
  --trigger-px 58000 \
  --amount 0.001 \
  --reduce-only \
  --wallet-id <evmWalletId>
```

### Stop-limit (trigger at 58000, rest a limit at 57900)

```bash
tribes-cli hyperliquid trade-perp \
  --from 0x1111111111111111111111111111111111111111 \
  --coin BTC \
  --side short \
  --type stop_limit \
  --trigger-px 58000 \
  --price 57900 \
  --amount 0.001 \
  --reduce-only \
  --wallet-id <evmWalletId>
```

### Take-profit on an existing long (take_market; use take_limit + --price to rest a limit)

```bash
tribes-cli hyperliquid trade-perp \
  --from 0x1111111111111111111111111111111111111111 \
  --coin BTC \
  --side short \
  --type take_market \
  --trigger-px 72000 \
  --amount 0.001 \
  --reduce-only \
  --wallet-id <evmWalletId>
```

For multiple take-profit levels on one position, use one `scale-perp --reduce-only` ladder
instead of many separate trigger orders.

## Bracket mode (`trade-perp --tp-px` / `--sl-px`)

- Either or both of `--tp-px` / `--sl-px` turns on the bracket: the entry and its exits submit
  atomically in one `order` action with `grouping: normalTpsl`.
- The TP/SL legs are reduce-only OCO exits sized to the entry — one fills, the other cancels; no
  unprotected window, no dangling order.
- Bracket mode requires `--type market` or `limit` and is incompatible with `--reduce-only`.
- Exits default to market; add `--tp-limit-px` / `--sl-limit-px` to rest that leg as a limit
  instead (each requires its matching `--tp-px` / `--sl-px`).
- SKILL.md ("Enter a perp with a bracket") has the copy-paste example.

## Full option flags per command

All signed order commands also take `--from`, `--wallet-id`, and `--out <file>` (see SKILL.md).

- `trade-perp`: `--coin`, `--amount`, `--side long|short`,
  `--type market|limit|stop_market|stop_limit|take_market|take_limit`, `--price`,
  `--trigger-px`, `--tp-px`, `--sl-px`, `--tp-limit-px`, `--sl-limit-px`, `--tif Gtc|Ioc|Alo`,
  `--reduce-only`, `--margin-mode cross|isolated`, `--leverage <int>` (sets leverage before the
  order), `--dex <name>`.
- `trade-spot`: `--pair` (for example `HYPE/USDC`), `--amount`, `--side buy|sell`,
  `--type market|limit`, `--price` (required for `limit`), `--tif Gtc|Ioc|Alo`.
- `twap-perp`: `--coin`, `--amount` (total, base units), `--side long|short`,
  `--duration-minutes <5-1440>`, `--randomize` (jitter sub-order timing), `--reduce-only`,
  `--margin-mode`, `--leverage`, `--dex`. Returns a `twapId`.
- `twap-spot`: `--pair`, `--amount`, `--side buy|sell`, `--duration-minutes <5-1440>`,
  `--randomize`. Returns a `twapId`.
- `scale-perp`: `--coin`, `--amount` (total, split across legs), `--side long|short`,
  `--start-px` / `--end-px` (range endpoints, must differ), `--orders <2-50>`,
  `--size-skew <ratio>` (last-leg size / first-leg size, default `1` = uniform), `--tif`,
  `--reduce-only`, `--margin-mode`, `--leverage`, `--dex`. All legs submit atomically.
- `scale-spot`: `--pair`, `--amount`, `--side buy|sell`, `--start-px` / `--end-px`,
  `--orders <2-50>`, `--size-skew`, `--tif`.
- `cancel-order`: `--coin`, `--order-id` (from `list-open-orders`), `--dex <name>`.
- `cancel-order-spot`: `--pair`, `--order-id` (from `list-open-orders`).
- `twap-cancel`: `--coin`, `--twap-id` (from placement response or `list-positions`),
  `--dex <name>`.
- `twap-cancel-spot`: `--pair`, `--twap-id`.

Minimums (checked by the CLI before signing): every TWAP sub-order and every scale leg must be
≥ $10 notional.
