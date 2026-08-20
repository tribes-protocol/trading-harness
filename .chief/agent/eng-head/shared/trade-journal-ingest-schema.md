# Trade Journal — Ingest Schema (format-first)

Deliverable by Owen (eng-planner) per Ada (msg-4ff2c5d9) — format-first so Selene/Eli can
batch backfill reports immediately while the site build is in flight. Version 1.0 · 2026-08-20.

## 1. SQLite columns (the trade row)

`trades` table — one row per trade (per position/leg; a rung-ladder is one row with the blended
entry, per-Chief spec fields):

| column            | type              | notes                                        |
| ----------------- | ----------------- | -------------------------------------------- |
| `id`              | TEXT (uuid v4)    | unique; also the detail-view key             |
| `timestamp`       | INTEGER (epoch s) | decision/placement time UTC                  |
| `ticker`          | TEXT              | XRP / ETH / NVDA / BTC / SILVER / ...        |
| `dex`             | TEXT              | '' = main, else e.g. 'xyz'                   |
| `side`            | TEXT              | 'long' / 'short'                             |
| `entryPrice`      | REAL              | blended entry price                        |
| `sizeBase`        | REAL              | base units (e.g. 169 XRP)                    |
| `notionalUsd`     | REAL              | sizeBase × entryPrice                        |
| `marginUsd`       | REAL              | posted margin                               |
| `leverage`        | INTEGER           | leverage multiplier                          |
| `stopPx`          | REAL              | SL trigger                                  |
| `targetPx`        | REAL              | primary target (TP)                         |
| `riskUsd`         | REAL              | dollar risk to stop                          |
| `riskPctAccount`  | REAL              | riskUsd / accountValue at decision, %        |
| `rr`              | REAL              | reward:risk ratio                              |
| `status`          | TEXT              | open | filled | closed | stopped | tp_hit      |
| `realizedPnlUsd`  | REAL              | 0 if open; net if closed                     |
| `report`          | TEXT (JSON blob)  | the decision report (schema below)            |

## 2. Decision-report JSON (the `report` column value)

Names exactly per Selene's field set. Markdown (multi-line glyph) allowed inside `thesis`,
`bullCase`, `bearCase`, `sources`; scalars are numbers.

```json
{
  "thesis": "markdown string",
  "bullCase": "markdown string (optional)",
  "bearCase": "markdown string (optional)",
  "riskParams": { "stopPx": 1.18, "targetPx": 1.32, "marginUsd": 14.5 },
  "riskUsd": 3.9, "riskPctAccount": 0.5,
  "rr": 2.1,
  "accountSnapshot": { "equityUsd": 780, "withdrawableUsd": 594, "date": "2026-08-20T15:00:00Z" },
  "equityCurve": [ { "t": "2026-08-20T12:00:00Z", "equityUsd": 810 }, ... ],
  "sources": [ { "reason": "VWAP pullback 2-4% off high", "url": "..." , "ts": "..."}, ... ],
  "bias": "long",
  "statusAtDecision": "open"
}
```

Rules:
- `equityCurve` is a sparse time series the desk samples at decision time; optional, array.
- `thesis` + `sources[].reason` are markdown; `sources[].url` optional but cited when known.
- Do NOT store linked-images; text + cited URL only.
- Numbers are JSON numbers (no strings); prices in USD/base-unit as floating.

## 3. Batch import — drop path + endpoint

- DROP: `/root/workspace/evidence/trade-reports/` — one JSON file per trade, named
  `<ticker>-<ts>_<id>.json`, conforming to the schema canvas above (report object may also carry
  the trade-row fields at top level for a one-file import).
- IMPORT: `tribes-cli journaling import` (or `bun scripts/TradeJournalImport.ts`) scans the
  drop dir, upserts each file into SQLite, id-keyed. Idempotent — re-running never duplicates.

## 3. Sample conforming report — XRP long (open)

file `evidence/trade-reports/XRP-20260820_9001.json`:

```json
{
  "id": "xrp-long-0089001",
  "timestamp": 1787230800000,
  "ticker": "XRP", "dex": "", "side": "long",
  "entryPrice": 1.2561, "size": 169, "notionalUsd": 212.78, "marginUsd": 10.64, "leverage": 20,
  "stopPx": 1.1802, "targetPx": 1.3200, "rr": 2.1,
  "status": "open", "realizedPnlUsd": 0,
  "report": {
    "thesis": "Pullback-to-VWAP reclaim on heavy volume in a bull tape; expand of regulated-crypto nominee catalysts. Entry at the reclaim hold, stop below the dip low.",
    "bias": "Bull", "confidenceAtDecision": 0.64,
    "riskUsd": 15.9, "riskPctAccount": 2.0, "rr": 2.1,
    "accountSnapshot": { "equityUsd": 780.0, "withdrawableUsd": 594.19, "date": "2026-08-20T12:00:00Z" },
    "equityCurve": [ { "date": "2026-08-20T11:30:00Z", "equityUsd": 805 } , { "date": "2026-08-20T12:00:00Z", "equityUsd": 780.5 } ],
    "sources": [ { "reason": "XRP reclaim volume on the 1m; volume ratio 2.1× vs 20-SMA", "url": "https://tribes.xyz/perps/XRP", "ts": "2026-08-20T11:55:00Z" }, { "reason": "Macro oil spike (Iran bid) lifts energy tape; XRP correlated risk-on", "ts": "2026-08-20T12:02:00Z" } ]
  }
}
```

## 4. Route

This is the CONTRACT for Selene's desk (research) to produce decision reports and for Desi's
(execution) to attach fill data. The schema lives in the shared dir; Engineering will publish
the importing CLI + the fill-attachment interface in the main build. Milestone M5 ingests via a
drop-path change and the `journaling import` command which already conforms (idempotent).