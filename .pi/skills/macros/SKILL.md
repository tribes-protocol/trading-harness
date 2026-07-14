---
name: macros
description: >-
  Numeric macro market snapshot as one JSON payload. Handles: DXY broad dollar index, US 2y/10y
  Treasury yields and the 2s10s curve, VIX, Fed funds rate, CPI level and YoY inflation,
  unemployment, gold, and Brent oil. Call for any question needing current macro NUMBERS —
  interest rates, inflation print, dollar strength, oil price — or as the numeric half of macro
  state for strategize (pair with news for narrative). NOT for: macro narrative, headlines, or
  why markets moved (use news); individual stock quotes (use stock-analyst); crypto market caps,
  dominance, or breadth (use market-strategist); event odds like rate-cut probabilities (use
  prediction).
allowed-tools: bash read
---

# Macros

Backing command group: `tribes-cli macros`. Fetches one structured JSON snapshot of numeric
macro indicators (FRED-sourced). The CLI calls the API itself — NEVER call the endpoint or curl
directly.
Requires: an auth token (run `tribes-cli login` once if commands fail with auth errors).

## When to use

- Need current macro numbers (10y yield, VIX level, DXY, CPI, Fed funds, unemployment, gold,
  Brent) before forming or defending a trade thesis.
- The `strategize` skill needs the numeric half of macro state — pair with `news` for the
  narrative half.
- NOT for why markets moved, headlines, or macro sentiment — use `news`.
- NOT for individual stock quotes or snapshots — use `stock-analyst`.
- NOT for crypto market cap, dominance, or rankings — use `market-strategist`.
- NOT for market-implied odds of macro events (rate cuts, elections) — use `prediction`.

## Hard rules

1. `market` is the ONLY subcommand in this group and it takes NO flags. NEVER invent variants.
   Wrong: `tribes-cli macros yields`, `tribes-cli macros market --series DGS10`.
   Right: `tribes-cli macros market`.
2. There is NO `--out` flag here (unlike most tribes-cli commands) — JSON goes to stdout only.
   Wrong: `tribes-cli macros market --out snap.json` (unknown option).
   Right: `tribes-cli macros market > snap.json`.
3. If the actual stdout keys differ from the schema below, trust the actual stdout.

## Command reference

| Subcommand | Purpose                     | Required flags | Read-only or signed |
| ---------- | --------------------------- | -------------- | ------------------- |
| `market`   | Fetch macro market snapshot | none           | read-only           |

## Indicators

Series fetched (FRED ID → output key, with units):

| FRED ID          | Output key           | Unit / meaning                             |
| ---------------- | -------------------- | ------------------------------------------ |
| DTWEXBGS         | `dxy.value`          | broad dollar index level                   |
| DGS10            | `yields.us10y`       | percent                                    |
| DGS2             | `yields.us2y`        | percent                                    |
| T10Y2Y           | `yields.curve_2s10s` | percentage points; negative = inverted     |
| VIXCLS           | `vix.value`          | index level                                |
| DFF              | `fed_funds.value`    | percent                                    |
| CPIAUCSL         | `cpi.value`          | index level; `cpi.yoy_pct` = YoY inflation |
| UNRATE           | `unemployment.value` | percent                                    |
| GOLDAMGBD228NLBM | `gold.value`         | USD per troy ounce                         |
| DCOILBRENTEU     | `brent.value`        | USD per barrel                             |

`change_pct` fields (dxy, vix, gold, brent) are the percent change since the previous
observation (day over day). All values are nullable — partial outages do not fail the payload.

## Examples

### Fetch the full macro snapshot

```bash
tribes-cli macros market
```

Output schema (keys the operator parses):

```json
{
  "generated_at": "2026-05-14T15:00:00Z",
  "source": "fred",
  "dxy": { "value": 105.2, "change_pct": 0.4, "as_of": "2026-05-14" },
  "yields": { "us10y": 4.21, "us2y": 4.88, "curve_2s10s": -0.67, "as_of": "2026-05-14" },
  "vix": { "value": 18.9, "change_pct": -2.1, "as_of": "2026-05-14" },
  "fed_funds": { "value": 5.33, "as_of": "2026-05-14" },
  "cpi": { "value": 315.2, "yoy_pct": 3.2, "as_of": "2026-04-01" },
  "unemployment": { "value": 4.0, "as_of": "2026-04-01" },
  "gold": { "value": 2330.1, "change_pct": 0.8, "as_of": "2026-05-14" },
  "brent": { "value": 82.4, "change_pct": -0.5, "as_of": "2026-05-14" },
  "errors": [{ "series": "DGS10", "error": "..." }]
}
```

### Extract only the fields you need

```bash
tribes-cli macros market | jq '{vix: .vix.value, us10y: .yields.us10y, curve: .yields.curve_2s10s}'
```

## Error recovery

| Symptom                                     | Action                                                                                                     |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Auth error (unauthorized, expired token)    | Run `tribes-cli login`, retry the original command once, then stop and report.                             |
| `errors` array non-empty / needed key null  | Report which series failed and answer with the available fields — do NOT retry the whole payload.          |
| `error: unknown option`                     | You passed a flag; `market` takes none. Rerun bare and redirect stdout if you need a file (`> snap.json`). |
| Any other API failure (whole command fails) | Retry the same command once; if it fails again, stop and report the error.                                 |

## Related skills

- `news` — macro narrative, headlines, and sentiment (the other half of macro context).
- `strategize` — consumes this snapshot plus `news` output when forming trade theses.
- `prediction` — market-implied probabilities of macro events (rate cuts, elections).
- `market-strategist` — crypto market-wide aggregates (caps, dominance, rankings).
- `commodity-analyst` — turns gold, Brent, dollar, rates, and inflation context into a commodity thesis.
