# Account data, order status, and history reads

Read-only subcommands (no `--from`/`--wallet-id`; all accept `--out <file>`). Times are epoch
milliseconds.

| Subcommand           | Purpose                                                             | Flags                                                                                                                                          |
| -------------------- | ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `order-status`       | One order's status (open/filled/canceled/rejected/unknownOid) by id | `--address` (req), exactly one of `--oid <n>` \| `--cloid <0x+32hex>`                                                                          |
| `funding-history`    | Per-coin funding-rate history                                       | `--coin` (req), `--start-time <ms>` (req), `--end-time <ms>`, `--dex`                                                                          |
| `predicted-fundings` | Predicted funding across venues, per coin                           | none                                                                                                                                           |
| `candles`            | Venue-native OHLCV snapshot (any dex, incl. HIP-3 perps)            | `--coin` (req), `--interval 1m\|3m\|5m\|15m\|30m\|1h\|2h\|4h\|8h\|12h\|1d\|3d\|1w\|1M` (req), `--start-time <ms>` (req), `--end-time`, `--dex` |
| `portfolio`          | Account-value + PnL history buckets (day/week/month/allTime + perp) | `--address` (req)                                                                                                                              |
| `ledger`             | Non-funding ledger: deposits, withdrawals, transfers                | `--address` (req), `--start-time`, `--end-time`                                                                                                |
| `user-fees`          | The account's real fee rates + 14-day volume                        | `--address` (req)                                                                                                                              |
| `rate-limit`         | API budget: cumulative volume, requests used, cap                   | `--address` (req)                                                                                                                              |

Notes:

- `order-status` with an unknown id returns `status: "unknownOid"` — an explicit answer, not an
  error. It is the only safe confirmation surface for a timed-out order command; never resubmit
  an order to "check" it.
- `candles` output rows are `{open_time, close_time, open, high, low, close, volume,
num_trades}` — NOT the `ta` candle-file contract; transform before feeding `ta backtest`, or
  use `tribes-cli asset candles --perp <COIN|dex:COIN>` which emits the contract directly
  (venue window ~200 candles).
- `funding-history` and `candles` apply the same `dex:coin` prefixing as `order-book` on
  builder dexes — pass `--dex` and the bare coin.

## Client order ids (cloid)

- `trade-perp` and `trade-spot` accept optional `--cloid <0x + 32 hex chars>`, attached to the
  entry order (bracket exit legs carry none). The cloid is echoed in the command output and in
  `list-open-orders`/`list-fills`, and is queryable via `order-status --cloid`.
- `cancel-order` and `cancel-order-spot` accept exactly one of `--order-id` or `--cloid` —
  cancel by cloid when the oid is unknown (e.g. a timed-out submission).
- `scale-*` and `twap-*` accept no cloid: identify ladder legs by their venue oids
  (`list-open-orders`) and TWAPs by the returned `twapId` (`list-positions`).
