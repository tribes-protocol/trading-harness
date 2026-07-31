---
name: research-backtest-spec
description: >-
  Strategy Research skill that compiles one strategy-proposal into an executable specification
  for the local backtest engine — the ma-cross or rsi-revert mapping with parameters, the candle
  source, timeframe, and window, the sample-size plan, and the cost assumptions to apply
  analytically afterward. Handles: engine mapping, data-source selection (hyperliquid candles
  for venue-native series including HIP-3 perps; asset candles or coin ohlc otherwise),
  provider-limit budgeting (GeckoTerminal 200-candle cap, CoinGecko days enums), and the
  robustness matrix declaration. Call it on an acked strategy-proposal before any engine run.
  NOT for: inventing the strategy (use research-hypothesis); executing the run (use
  research-backtest-run); computing metrics (use research-metrics); the promote decision (use
  research-evaluate).
allowed-tools: bash read
---

# Research: Backtest Spec

## Identity

- Stable id: `research-backtest-spec` — owner: Strategy Research. Invoked by: Backtesting Agent.

## Purpose

Turn a proposal's rules into a specification the engine can execute mechanically and
reproducibly: which of the two strategies, which parameters, which candle source and window
within real provider limits, and which cost assumptions get applied analytically afterward
(the engine models none). This skill plans; it never fetches the run data, never runs the
engine, never judges results, and never rewrites the proposal's rules to fit the engine.

## Inputs

Required: an acked, unexpired `strategy-proposal` (`.tribes/org/proposals/<id>.json`) with
`rules` and `engine_representable`. Optional: the account's real fee tier via
`tribes-cli hyperliquid user-fees --address <addr>` (the primary cost source; the venue's
public taker rate labeled `assumption` only on failure); prior snapshots reusable
within their freshness window.

## Outputs

`payload.backtest_spec` embedded in the proposal (atomic rewrite of the Strategy
Research-owned file; the embed recorded in `checks[]` per the charter's self-contained state-4
audit trail):

- `strategy`: `{name: "ma-cross", fast, slow}` or `{name: "rsi-revert", rsi_low, rsi_high}` —
  or `not-representable` plus the named alternative-evidence path.
- `data`: the exact fetch command verbatim (copy-paste runnable), timeframe, window, expected
  minimum candle count, and the provider limit that constrains it.
- `costs`: per-side taker fee pct + slippage bps, with source (`user-fees` | `assumption`);
  `research-metrics` subtracts `2 x (fee + slippage)` per round trip analytically.
- `robustness_matrix`: alternative windows, timeframes, comparable assets, and ±20% parameter
  perturbations for `research-robustness` — declared BEFORE any run (data-snooping control).

Facts vs assumptions are labeled: provider limits are facts; cost figures are assumptions
until `user-fees` supplies the real tier. If `user-fees` is read, its output is stamped with
provider, command, source timestamp, and retrieval timestamp per `org-protocol`. Explicit
failure states: `not-representable` (a valid outcome, not an error), `window-unachievable`.

## Integration

Data-source selection, venue-native first for anything that trades on Hyperliquid:

- Venue-native perp series, any dex, including HIP-3 stock/commodity perps:
  `tribes-cli asset candles --perp <COIN|dex:COIN> --timeframe <1m|5m|15m|1h|4h|1d|1w> --out
<file>` — emits the shared candle contract directly (venue window ~200 candles) and is the
  spec's default for perps. The raw `tribes-cli hyperliquid candles` command reaches longer
  windows via `--start-time`, but its rows are NOT the ta contract — a spec choosing it must
  declare a transform step before `ta backtest` can consume the file.
- CoinGecko coin: `tribes-cli asset candles --id <id> --days <1|7|14|30|90|180|365|max> --out
<file>` (or `tribes-cli coin ohlc`). Days enum only, granularity auto — candle count is NOT
  the day count (`--days 365` often returns ~90 candles); `v` is null, so no VWAP.
- Contract token: `tribes-cli asset candles --address <a> --chain <c> --timeframe
<1m|5m|15m|1h|4h|1d|1w> --out <file>`. BirdEye → GeckoTerminal fallback; GeckoTerminal is
  capped at 200 candles with no pagination and has no 1w aggregate.
- Stock proxy (EOD daily only): `tribes-cli stocks candles --symbol <s> --from <YYYY-MM-DD>
--to <YYYY-MM-DD> --limit <1-1000> --out <file>`. True historical windows via `--from/--to`;
  proxy prices can diverge from HIP-3 dex marks — venue-native preferred when it exists.
- Engine bounds this spec must respect: `tribes-cli ta backtest` accepts `--fast`/`--slow`
  (2-500, fast < slow) and `--rsi-low`/`--rsi-high` (1-99, low < high); RSI length is
  hardcoded to 14 for backtests.

## Preconditions

- The proposal is acked, unexpired, and its rules are final — spec-writing never edits rules.
- `engine_representable` is set; if false, this skill still writes the `data` and `costs`
  blocks for the alternative-evidence path (scenario analysis needs candles too).
- `.tribes/org/snapshots/` exists (`mkdir -p`).

## Procedure

1. Map rules → engine: trend-cross entries → `ma-cross` with fast/slow from the proposal's
   lookbacks; oversold mean-revert → `rsi-revert` with the proposal's thresholds. A rule that
   needs a different RSI length, shorts, stops, or event logic is `not-representable` —
   record it; never approximate it silently.
2. Pick the candle source per the table above by asset class; venue-native first.
3. Size the sample: require ≥ `2 x slow + 30` bars for ma-cross (defaults 20/50 → ≥ 130) and
   ≥ 100 bars for rsi-revert. Check the expected count against the constraining limit
   (200-candle GeckoTerminal cap, days-enum granularity, `--limit` 1000 for stocks); when
   short, move to a longer window or higher timeframe and record the compromise.
4. Declare costs: per-side taker fee (real tier via `hyperliquid user-fees` once available,
   else public rate labeled `assumption`) plus a slippage allowance in bps.
5. Declare the robustness matrix: ≥ 2 alternative windows, ≥ 1 alternative timeframe, ≥ 1
   pre-declared comparable asset, ±20% parameter perturbations.
6. Embed `backtest_spec` atomically; add `backtest-spec:written` to `checks[]`; hand to
   `research-backtest-run`.

## Validation

- The fetch command is copy-paste runnable exactly as written, with `--out`.
- Parameters sit inside engine bounds; expected candle count is achievable within the named
  provider limit; the minimum-sample rule is satisfied or the shortfall is recorded.
- Costs carry a source label; the robustness matrix is complete before any run happens.

## Risk & safety

- Never touches live orders or instructions; planning only.
- Never rewrites proposal rules to fit the engine — a bad fit is the finding, not a defect to
  hide. `not-representable` routes to `research-evaluate`'s alternative-evidence clause.
- Never promises data a provider cannot deliver: every window claim cites its limit.

## Failure & retry

- `not-representable`: a valid success outcome; spec still ships `data` + `costs` for the
  alternative path.
- `window-unachievable` (no source meets the minimum sample): degrade timeframe/window with
  the compromise recorded, or fail to the Research Lead — never fabricate history.
- An optional `user-fees` read failing: fall back to the labeled public-rate assumption; no
  retries beyond one.

## Timeouts & rate limits

- Local artifact work; the only optional network read is `user-fees` (fast). Zero candle
  fetches happen here — the run skill fetches, keeping `sources[]` stamps in one place.

## Observability

- The spec lives in the proposal payload; `checks[]` records the embed; the robustness matrix
  is the audit trail of how many variants were planned vs later run.

## Escalation

- Spec → `research-backtest-run` (Backtesting Agent continues).
- `not-representable` → `research-evaluate` alternative-evidence path + Review Board.
- `window-unachievable` → Research Lead; a data gap worth closing (e.g. missing venue candles
  adapter) → Engineering backlog (`.tribes/org/workorders/backlog.md`).

## Example

```json
"backtest_spec": {
  "strategy": { "name": "rsi-revert", "rsi_low": 30, "rsi_high": 70 },
  "data": {
    "fetch": "tribes-cli asset candles --id ethereum --days 180 --out .tribes/org/snapshots/20260730T110000Z-candles-eth.json",
    "min_candles": 100,
    "limit_note": "days enum; candle count != day count — verify true window from t range"
  },
  "costs": { "taker_fee_pct": 0.045, "slippage_bps": 5, "source": "assumption" },
  "robustness_matrix": {
    "windows": ["90", "365"], "timeframes": ["4h via --address route"],
    "assets": ["bitcoin"], "param_perturbation_pct": 20
  }
}
```

Success: the spec embeds atomically, `checks[]` gains `backtest-spec:written`, and
`research-backtest-run` can execute every cell without a single decision left to make.

## Acceptance

- [ ] Strategy mapping honest: engine params in bounds or `not-representable` recorded.
- [ ] Fetch command verbatim-runnable; sample size checked against the named provider limit.
- [ ] Costs declared with source label; robustness matrix declared before any run.
- [ ] Spec embedded atomically with `checks[]` updated; proposal rules untouched.

## Related skills

- `research-hypothesis` — writes the proposal this skill compiles.
- `research-backtest-run` — executes the spec cell by cell.
- `research-metrics` — applies the spec's cost assumptions analytically.
- `research-robustness` — consumes the declared matrix.
- `research-evaluate` — alternative-evidence clause for not-representable strategies.
- `technical-analyst` — the candle-contract two-step recipe and engine background.
- `asset-data` — router semantics behind asset candles.
- `hyperliquid` — venue-native candle flag reference once the adapter lands.
- `org-protocol` — envelope, freshness windows, snapshot reuse.
