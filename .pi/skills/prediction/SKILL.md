---
name: prediction
description: Polymarket prediction market research for event odds, binary catalysts, macro/regulatory probabilities, and market-implied expectations. Use to search prediction events, list current events or markets, and fetch specific event or market details by id or slug when trading theses need market-implied probabilities.
allowed-tools: bash read write
---

# prediction

Use this skill when a trading decision needs market-implied probabilities from Polymarket: elections, crypto regulation, ETF decisions, macro events, earnings-adjacent catalysts, geopolitical events, sports/entertainment only if it affects a tradable thesis, or any question where prediction odds can validate or challenge a view.

The bundled CLI mirrors the Lucy prediction tool actions (implemented in `src/cli/Prediction.ts` and `src/services/PredictionService.ts`):

- `prediction_search` -> `search`
- `prediction_list_events` -> `list-events`
- `prediction_get_event` -> `get-event`
- `prediction_list_markets` -> `list-markets`
- `prediction_get_market` -> `get-market`

Data source: Polymarket Gamma API at `https://gamma-api.polymarket.com`. No API key is required.

## Core rules

1. Treat Polymarket odds as one research input, not a trade signal by itself.
2. Prefer active, liquid, recent markets. Thin or stale odds are weak evidence.
3. Compare prediction odds against news, official sources, X/social signal, macro data, technicals, funding, liquidity, and position sizing before trading.
4. For multi-market events, inspect `leadingMarket` on each event (and use `get-event` / `get-market` for full sub-market detail) instead of relying only on the top event summary.
5. Persist relevant findings in the journal or the calling workflow artifact. Include event/market id, slug, odds, end date, volume/liquidity, and why it matters to the asset.

## Quick start

```bash
tribes-cli prediction <action> [options]
```

Output is always pretty-printed JSON. Event commands attach a `leadingMarket` field (overview semantics - one best market per event).

```bash
tribes-cli prediction search --query "crypto regulation stablecoin bill" --limit-per-type 10
tribes-cli prediction list-events --active true --closed false --limit 10 --order volume --ascending false
tribes-cli prediction list-markets --closed false --limit 20 --order volume --ascending false
```

## Search prediction events

Use search first for a natural-language thesis or catalyst.

```bash
tribes-cli prediction search --query "Fed rate cut June" --limit-per-type 10
tribes-cli prediction search --query "CLARITY Act crypto" --limit-per-type 10
```

Options:

```text
--query <q>                   Required search query
--limit-per-type <1..25>      Default: API default when omitted
--events-tag <tag>            Optional repeatable event tag filter
```

## List events

List current events with optional filters and pagination:

```bash
tribes-cli prediction list-events \
  --active true \
  --closed false \
  --limit 25 \
  --order volume \
  --ascending false
```

Useful filters:

```text
--id <id>                     Repeatable event id
--slug <slug>                 Event slug
--tag-id <id>                 Tag id
--tag-slug <slug>             Tag slug
--active true|false           Default: true
--archived true|false
--closed true|false
--limit <n>
--offset <n>
--order <field>               Example: volume, liquidity, endDate
--ascending true|false
```

## Get one event

Fetch a specific event after search/listing exposes its id or slug:

```bash
tribes-cli prediction get-event --event-id 12345
tribes-cli prediction get-event --event-slug some-polymarket-event-slug
```

One of `--event-id` or `--event-slug` is required.

## List markets

List individual markets directly:

```bash
tribes-cli prediction list-markets \
  --closed false \
  --limit 20 \
  --order volume \
  --ascending false
```

Useful filters:

```text
--id <id>                     Repeatable market id
--slug <slug>                 Market slug
--tag-id <id>                 Tag id
--closed true|false
--limit <n>
--offset <n>
--order <field>               Example: volume, liquidity, endDate
--ascending true|false
```

## Get one market

Fetch a specific market after search/listing exposes its id or slug:

```bash
tribes-cli prediction get-market --market-id 12345
tribes-cli prediction get-market --market-slug some-polymarket-market-slug
```

One of `--market-id` or `--market-slug` is required.

## Output interpretation

Enriched event output selects one leading market per event using the same behavior as the Lucy tool:

- If the event has one market, show that market.
- If the event has multiple open markets, rank by the first outcome price (`outcomes[0]` / `outcomePrices[0]`), then liquidity, then market id.
- If the event is closed, choose the highest-priced outcome.

This avoids incorrectly selecting `No` on long-shot binary sub-markets as the event favorite.

Each enriched event looks like:

```json
{
  "event": { "...": "..." },
  "leadingMarket": {
    "market": { "...": "..." },
    "leadingOutcome": "Yes",
    "leadingProbability": "0.42"
  }
}
```

Use `get-event` or `get-market` when sub-market detail beyond `leadingMarket` is needed.

## Trading workflow

1. Translate the asset thesis into prediction queries:
   - `xyz:CRCL` / `xyz:COIN`: `stablecoin bill`, `CLARITY Act`, `crypto market structure`, `SEC Coinbase`.
   - BTC/ETH/SOL: `Bitcoin ETF`, `Ethereum ETF`, `Fed rate cut`, `crypto regulation`, `Solana outage`.
   - Macro-sensitive trades: `Fed rate cut`, `CPI`, `recession`, `oil`, `election`.
2. Run `search` for each thesis.
3. For any relevant result, run `get-event` or `get-market` to capture exact odds, liquidity, volume, and dates.
4. Record whether odds confirm, weaken, or contradict the thesis.
5. Do not open or increase a position from prediction odds alone. Require the strategy workflow evidence threshold and gates.

## Implementation

- Command: `tribes-cli prediction` (source: `src/cli/Prediction.ts`)
- Service: `src/services/PredictionService.ts` (inline HTTP)
- Types: `src/types/Prediction.ts` (Zod schemas + option types)
- Enrichment: `src/utils/Prediction.ts` (`leadingMarket` via `selectLeadingMarket`)
