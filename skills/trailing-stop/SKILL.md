---
name: trailing-stop
description: >-
  Arm, monitor, and exit a trailing stop on an open Hyperliquid perp position. Handles: arming a
  trailing stop on a live position (long: peak − trail; short: trough + trail), the autonomous
  monitor loop (streaming via websocket preferred, 10s poll fallback) that tightens the stop as
  the position moves in favor, and the reduce-only market close on trigger. Call it to protect an
  OPEN position's profit without a manual desk loop. NOT for: placing the entry (use
  trade-execution); hard stop-loss/take-profit brackets or leverage/margin changes (use
  position-management); single Hyperliquid commands or fund moves (use hyperliquid).
allowed-tools: bash read
---

# Trailing Stop

Autonomous profit protection for an open Hyperliquid perp position: `arm` captures the position

- trail config, a detached `monitor` loop follows the price (streaming via the SDK's
  `SubscriptionClient`/`WebSocketTransport`, 10s poll fallback) and tightens the stop as the
  position moves in favor, and on trigger it fires a reduce-only market close at the LIVE position
  size. The trailing stop sits ALONGSIDE the position's hard SL/TP bracket — never a naked
  position, never a flip, never over-close. Requires: auth token (`tribes-cli login` once) and
  `evmWalletId` + EVM address from `zipbox-wallet` — the address is `--from`, the id is
  `--wallet-id`.

## When to use

- You hold an open perp position and want to bank profit as it runs without watching the screen.
- The user asks for a trailing stop / "trail it" / "let it ride with a stop".
- NOT for placing the entry — use `trade-execution`.
- NOT for static stops, leverage, margin, or manual closes — use `position-management`.
- NOT for deciding whether the position should exist — use `thesis`.

## Hard rules

1. Arm ONLY on a LIVE open position — `arm` refuses if there is no open position for that
   coin/side/dex.
2. The trail is `--trail-pct` (decimal percent, e.g. `0.25` = 0.25%, the default form matching
   ATR-bounded stops) or `--trail-px` (absolute price distance). Exactly one is required.
3. No-lose arm guard: the engine REFUSES to arm if the initial stop would immediately cross the
   current mark (arming an already-crossed stop).
4. The stop only TIGHTENS as the position moves in favor; it never widens. The hard SL/TP
   bracket on the position is never modified by the trailing stop.
5. On trigger the exit is a market reduce-only close of the CURRENT live position size — never
   more than the live size, never a flip, same `--from`/`--wallet-id` as the arm. If the
   position is already closed by other policy when the trigger fires, it does NOT exit a second
   time — it records and stops.
6. `cancel` stops the monitor loop WITHOUT exiting — the position stays as it is.

## Commands

```bash
# Arm on a live long (seeds peak from entry/mark; stop = peak × (1 − pct))
tribes-cli trailing-stop arm \
  --coin BTC --dex main \
  --from 0x1111111111111111111111111111111111111111 \
  --side long --trail-pct 0.25 \
  --wallet-id <evmWalletId>

# Arm on a live short with an absolute trail distance
tribes-cli trailing-stop arm \
  --coin ETH --side short --trail-px 12.0 \
  --from 0x1111111111111111111111111111111111111111 \
  --wallet-id <evmWalletId>

# Inspect stops (also reconciles dead monitors via heartbeat)
tribes-cli trailing-stop list

# Cancel the monitor WITHOUT exiting the position
tribes-cli trailing-stop cancel <id>
```

`arm` spawns the detached monitor process itself (redirected stdio to a log under
`.tribes/trailing-stop-<id>.log`); `list`/`cancel` are the supervisor surface. The monitor is
single-flight per stop (it refuses to twin a stop whose heartbeat is fresh) and writes a
heartbeat so a crashed loop is visible in `list` as a stale heartbeat rather than a false exit.

## Monitor path (stream-first, poll fallback)

1. Try the websocket stream (`SubscriptionClient.activeAssetCtx({coin})` → `ctx.markPx/midPx`),
   event-driven, for sub-2s price. If the websocket cannot connect or drops, or the first tick
   does not arrive within the connect timeout, fall back to the 10s poll
   (`metaAndAssetCtxs` on the same coin).
2. Each mark: long → peak = running max (seeded by entry), stop = peak − trail, exit when mark
   ≤ stop. short → trough = running min, stop = trough + trail, exit when mark ≥ stop.
3. On trigger: re-read the live position, market-close every remaining base unit reduce-only,
   verify the position is gone, and log the fill in the stop's state.

## Integration

- Execution Desk: arm on a position you want trailed; the monitor exits autonomously on the
  trigger. The reduce-only close goes through the SAME signing path as every other exit.
- Portfolio: `trailing-stop list` shows status per stop (armed/triggered/exited/cancelled/error),
  the current stop, peak/trough, and the exit fill; a stale heartbeat flags a dead monitor.

## Related skills

- `position-management` — hard SL/TP brackets, leverage, margin, manual closes; the trailing
  stop augments, never replaces, the bracket.
- `hyperliquid` — command syntax, `--from`/`--wallet-id` rule, reduce-only mechanics.
- `trade-execution` — opening the position before you can arm on it.

## Before you finish

- [ ] Armed only on a live open position (arm refused otherwise).
- [ ] Trail is `--trail-pct` (default) or `--trail-px`, exactly one, no-lose guard passed.
- [ ] Confirm `list` shows the stop armed with a fresh heartbeat before walking away.
- [ ] On trigger: `list-positions` shows the position GONE (or correctly reduced) and
      `list-fills` shows the reduce-only fill.
