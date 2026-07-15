---
name: macros
description: >-
  Numeric macro market snapshot. Handles: DXY broad dollar index, US 2y/10y Treasury yields and
  the 2s10s curve, VIX, Fed funds rate, CPI level and YoY inflation, unemployment, gold, and
  Brent oil. Call for any question needing current macro NUMBERS — interest rates, inflation
  print, dollar strength, oil price — or as the numeric half of macro state for strategize (pair
  with news for narrative). NOT for: macro narrative, headlines, or why markets moved (use news);
  individual stock quotes (use stock-analyst); crypto market caps, dominance, or breadth (use
  market-strategist); event odds like rate-cut probabilities (use prediction).
allowed-tools: bash read
---

# Macros

Fetch numeric macro indicators **directly** from **FRED** (St. Louis Fed), reading the key from
`.env`. Series map below; full auth details live in `docs/inlined-provider-apis.md`.

> The former `tribes-cli macros market` backend proxy is **deprecated** — the backend is being
> retired. Pull the series from FRED yourself and assemble the snapshot.

## When to use

- Need current macro numbers (10y yield, VIX level, DXY, CPI, Fed funds, unemployment, gold,
  Brent) before forming or defending a trade thesis.
- The `strategize` skill needs the numeric half of macro state — pair with `news` for narrative.
- NOT for why markets moved, headlines, or macro sentiment — use `news`.
- NOT for individual stock quotes or stock movers — use `stock-analyst`.
- NOT for crypto market cap, dominance, or rankings — use `market-strategist`.
- NOT for market-implied odds of macro events (rate cuts, elections) — use `prediction`.

## Data source

These keys come from the environment — the same names the `src/common/Env.ts` constants
read (`process.env.*`), loaded from `.env`. Reference them directly by name in the calls below. In a bare shell, load them once with
`set -a; . ./.env; set +a`.

FRED — `https://api.stlouisfed.org`. Endpoint:
`GET /fred/series/observations?series_id=<ID>&api_key=$FRED_API_KEY&file_type=json&sort_order=desc&limit=<n>`
with header `User-Agent: tribes-terminal-api/1.0`. A value of `.` means "no observation" — skip
it.

## Series to fetch

| FRED series id     | Output slot          | Unit / meaning                              | limit |
| ------------------ | -------------------- | ------------------------------------------- | ----- |
| `DTWEXBGS`         | `dxy`                | broad dollar index level                    | 4     |
| `DGS10`            | `yields.us10y`       | percent                                     | 4     |
| `DGS2`             | `yields.us2y`        | percent                                     | 4     |
| `T10Y2Y`           | `yields.curve_2s10s` | percentage points; negative = inverted      | 4     |
| `VIXCLS`           | `vix`                | index level                                 | 4     |
| `DFF`              | `fed_funds`          | percent                                     | 4     |
| `CPIAUCSL`         | `cpi`                | index level; `yoy_pct` from ~13 months back | 14    |
| `UNRATE`           | `unemployment`       | percent                                     | 4     |
| `GOLDAMGBD228NLBM` | `gold`               | USD per troy ounce (optional series)        | 4     |
| `DCOILBRENTEU`     | `brent`              | USD per barrel                              | 4     |

`change_pct` (dxy, vix, gold, brent) = percent change vs. the previous observation.
`curve_2s10s` falls back to `us10y - us2y` if `T10Y2Y` is missing. `cpi.yoy_pct` compares the
latest CPI to the observation ~12 months earlier (hence `limit=14`).

## Rules

1. Reference each key from the environment (`.env`, exposed as the `src/common/Env.ts` constants) — e.g. `$BIRDEYE_API_KEY`. Never hardcode a key.
2. Fetch only the series the question needs — do not always pull all ten.
3. Each series is independent: a failed one does not block the others. Report which series failed
   and answer with the available fields.
4. Send the `User-Agent` header — FRED rejects some requests without it.

## Examples

### One series (10-year Treasury yield, latest point)

```bash
curl -s "https://api.stlouisfed.org/fred/series/observations?series_id=DGS10&api_key=$FRED_API_KEY&file_type=json&sort_order=desc&limit=4" \
  -H 'User-Agent: tribes-terminal-api/1.0' | jq '.observations[0]'
```

### Full snapshot (loop the series map)

```bash
for s in DTWEXBGS DGS10 DGS2 T10Y2Y VIXCLS DFF UNRATE GOLDAMGBD228NLBM DCOILBRENTEU; do
  v=$(curl -s "https://api.stlouisfed.org/fred/series/observations?series_id=$s&api_key=$FRED_API_KEY&file_type=json&sort_order=desc&limit=1" \
    -H 'User-Agent: tribes-terminal-api/1.0' | jq -r '.observations[0] | "\(.date) \(.value)"')
  echo "$s $v"
done
```

## Error recovery

| Symptom                                   | Action                                                                        |
| ----------------------------------------- | ----------------------------------------------------------------------------- |
| 400 / "Bad Request. api_key"              | The `FRED_API_KEY` in `.env` is missing/invalid — check it, then retry once.  |
| 429 / 5xx (rate limit or outage)          | Wait briefly, retry once; if it still fails, stop and report plainly.         |
| A needed series returns only `.` values   | Report that series as unavailable and answer with the fields you have.        |

## Related skills

- `news` — macro narrative, headlines, and sentiment (the other half of macro context).
- `strategize` — consumes this snapshot plus `news` output when forming trade theses.
- `prediction` — market-implied probabilities of macro events (rate cuts, elections).
- `market-strategist` — crypto market-wide aggregates (caps, dominance, rankings).
- `commodity-analyst` — turns gold, Brent, dollar, rates, and inflation context into a commodity thesis.
