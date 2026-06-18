---
name: macros
description: >-
  Fetch structured macro indicators (DXY, US Treasury yields, VIX, Fed funds,
  CPI, unemployment, gold, oil) via Terminal API. Pairs with macros news
  context so strategize has narrative + numeric market state each cycle.
allowed-tools: bash read
---

# Macros (numeric structured snapshot)

Companion to `.pi/skills/news` for macro signals. News gives narrative; this
skill provides the numeric snapshot used by strategize.

## When this runs

The strategize flow runs this on each data-collector cycle and reads the CLI's
stdout JSON.

## Requirements

- `API_BASE_URL` must point to the Terminal API worker.

## Indicators

Series fetched (FRED ID -> output key):

| FRED ID          | Output key                                      |
| ---------------- | ----------------------------------------------- |
| DTWEXBGS         | dxy.value (broad dollar)                        |
| DGS10            | yields.us10y                                    |
| DGS2             | yields.us2y                                     |
| T10Y2Y           | yields.curve_2s10s                              |
| VIXCLS           | vix                                             |
| DFF              | fed_funds                                       |
| CPIAUCSL         | cpi (value + yoy_pct derived from latest 2 obs) |
| UNRATE           | unemployment                                    |
| GOLDAMGBD228NLBM | gold                                            |
| DCOILBRENTEU     | brent                                           |

Values are null-safe, so partial outages do not fail the entire payload.

## CLI

```bash
tribes-cli macros market
```

Output schema:

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
