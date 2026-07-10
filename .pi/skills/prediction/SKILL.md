---
name: prediction
description: >-
  Polymarket prediction market research. Handles: searching active prediction events, listing
  events or markets with filters, and fetching one event or market by id or slug for
  market-implied odds on elections, crypto regulation, ETF decisions, rate cuts, and other
  binary catalysts. Call when a trading thesis needs market-implied probabilities. Read-only
  research — it CANNOT place Polymarket bets or execute anything. NOT for: headlines, catalysts,
  or sentiment (use news); numeric macro indicators (use macros); general web lookups (use
  web-search).
allowed-tools: bash read
---

# Prediction

Backing command group: `tribes-cli prediction`. Fetches Polymarket event odds and market detail
as pretty-printed JSON, no API key needed. The CLI calls the API itself — NEVER curl it directly.

## When to use

- A trade thesis needs market-implied odds: elections, crypto regulation, ETF approvals, Fed
  rate cuts, geopolitical events, or other binary catalysts.
- Stocks traded as Hyperliquid perps (e.g. CRCL, COIN) need regulatory-odds context (SEC, bills).
- NOT for headlines, catalysts, or sentiment narrative — use `news`.
- NOT for numeric macro indicators (CPI, yields, VIX) — use `macros`.
- NOT for general facts or reading a specific URL — use `web-search`.
- NOT for placing bets or trades — nothing in this group executes anything.

## Hard rules

1. `search` returns ACTIVE events only. For closed or resolved markets run
   `list-events --closed true` or `list-markets --closed true`.
2. There is NO `--out` flag in this group — capture stdout instead.
   Wrong: `--out events.json` (unknown option). Right: `> events.json`.
3. Treat odds as one research input, NEVER a trade signal by itself — persistence and evidence
   gates are defined in the `strategize` skill.
4. Prefer active, liquid, recent markets; treat thin or stale odds as weak evidence.
5. Verify odds with `get-market` before citing them in a thesis or report.
6. MUST set a bash timeout of at least 120 seconds for these commands.

## Command reference

| Subcommand     | Purpose                         | Required flags                   | Read-only or signed |
| -------------- | ------------------------------- | -------------------------------- | ------------------- |
| `search`       | Search active prediction events | `--query`                        | read-only           |
| `list-events`  | List prediction events          | none                             | read-only           |
| `get-event`    | Get one event by id or slug     | `--event-id` or `--event-slug`   | read-only           |
| `list-markets` | List prediction markets         | none                             | read-only           |
| `get-market`   | Get one market by id or slug    | `--market-id` or `--market-slug` | read-only           |

Optional flags per subcommand (do not invent others):

- `search`: `--limit-per-type <1..25>` (omit for the server default), `--events-tag <tag>`
  (repeatable).
- `list-events`: `--id` (repeatable), `--slug`, `--tag-id`, `--tag-slug`, `--active`
  (default `true`), `--archived`, `--closed`, `--limit`, `--offset`, `--order` (`volume` or
  `liquidity`), `--ascending`.
- `list-markets`: `--id` (repeatable), `--slug`, `--tag-id`, `--closed`, `--limit`, `--offset`,
  `--order` (`volume` or `liquidity`), `--ascending`.

## Examples

### Search active events for a thesis

```bash
tribes-cli prediction search \
  --query "Fed rate cut" \
  --limit-per-type 10
```

Each returned event carries `leadingMarket` with `leadingOutcome` and `leadingProbability`
(a 0–1 string) — the event favorite.

### List the biggest open events, then page forward

```bash
tribes-cli prediction list-events \
  --active true --closed false \
  --order volume --ascending false \
  --limit 25 --offset 0
```

Next page: rerun the same command with `--offset 25`.

### Get one event's full sub-market detail

```bash
tribes-cli prediction get-event --event-id 903193
```

### Batch-fetch several known markets in one call

```bash
tribes-cli prediction list-markets --id 903193 --id 903194
```

### Get one market's exact odds before citing them

```bash
tribes-cli prediction get-market --market-id 903193
```

Extract these JSON keys: `question`, `outcomes`, `outcomePrices`, `volume`, `liquidity`,
`endDate`, `closed`.

## Error recovery

| Symptom                                   | Action                                                                                                                                                                                          |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Auth error (unauthorized, expired token)  | Run `tribes-cli login`, retry the original command once, then stop and report.                                                                                                                  |
| `search` returns `[]` or nothing relevant | Retry once with fewer, broader keywords (drop dates and adjectives); if still empty, run `list-events --tag-slug <topic>`; if still nothing, report that no market exists — do NOT invent odds. |
| `error: unknown option`                   | You used a flag that does not exist (often `--out`) — recheck the command reference and redirect stdout for files.                                                                              |
| Any other API failure                     | Retry the same command once; if it fails again, stop and report the error.                                                                                                                      |

## Related skills

- `strategize` — persistence and evidence gates; consumes these odds when forming trade theses.
- `news` — headlines, catalysts, and sentiment narrative around the same events.
- `macros` — numeric macro indicators (the actual number vs the market-implied odds).
- `web-search` — general facts prediction markets do not cover.
