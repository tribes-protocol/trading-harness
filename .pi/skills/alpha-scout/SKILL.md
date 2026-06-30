---
name: alpha-scout
description: >-
  Discovers emerging opportunities across crypto and stocks. Handles crypto trend and smart-money discovery, stock movers and shorting-pressure discovery, institutional/insider flow proxies, and market news synthesis across both asset classes. Use when the user asks what is hot, where money is rotating, or what catalysts matter right now.
allowed-tools: bash read
---

# Alpha Scout

Use this skill for early-signal discovery powered by the `alpha_scout` Lucy specialist.
It covers both crypto and stocks, then combines independent signals to separate noise
from momentum.

## When To Use

Use this skill for:

- Unscoped "what's happening" and headline/catalyst requests
- Discovering what is trending or newly launched in crypto
- Finding where smart money is rotating in crypto
- Stock momentum discovery (movers, shorting pressure, headlines)
- Institutional/insider flow proxy checks on stocks
- Cross-signal synthesis before action

## Core Capabilities

- Market news across both crypto and stocks
- Crypto trend discovery (trending tokens, new listings, recently updated tokens)
- Crypto smart-money discovery (token lists, netflow, holdings/trading behavior)
- Stock signal discovery (top movers, short interest/short volume, news catalysts)
- Stock smart-money proxies (13-F holdings and insider Form 4 activity)
- Signal synthesis across independent indicators

## Asset-Class Coverage (Critical)

You cover both crypto and stocks. Tool count may be crypto-heavy, but that must never bias
the output.

If the user does not explicitly scope asset class, treat the request as cross-asset and
cover both sides before answering.

For unscoped news/headline requests, present one combined briefing with these sections:

- `## Crypto`
- `## Stocks`

If one side is unavailable or empty, still include that section and state the gap.

Only return one side when the user explicitly scopes to one side.

## Workflow Patterns

News / headlines ("any news?", "what's the latest news", "market headlines"):

- Treat as asset-class-agnostic unless user scoped it.
- Fetch both sides: crypto headlines and stock headlines.
- Return one combined briefing with `## Crypto` and `## Stocks`.

"What's trending?" / "What's hot?":

- Run trending tokens first, then smart-money token signals.
- Cross-reference overlap; tokens in both sets are stronger.

"What are whales buying?":

- Use smart-money token list with interval/trader-style context.
- Add netflow/holdings context when needed.

New token discovery:

- Use recent listings first, then validate with smart-money/trend overlap.
- Flag age/risk because very new launches are higher risk.

Token resolution:

- Resolve symbol/name ambiguity with token search before deeper calls.
- Ask for missing chain/address when required.
- For holder/trader distribution deep-dives, switch to `token-analyst`.

Stock momentum discovery ("What's hot in stocks today?"):

- Use top movers (gainers/losers), then short-interest/short-volume signals.
- Add stock-news catalysts before concluding.

Institutional and insider activity:

- Use institutional holdings (13-F) and insider transactions together.
- Ask for the 10-digit filer CIK when institutional-holdings requests lack it.

## Error Handling and Retries

When a tool returns an error response:

1. Diagnose whether input is fixable (for example wrong chain, bad address format, invalid
   parameter, missing required field).
2. If fixable, adjust inputs and retry the same tool. Attempt at least two retries with
   modified parameters before giving up.
3. If still failing, or not parameter-fixable (provider outage, rate limit, server error),
   report the error with the tool name, message, and user-intent summary.

## Rules

- For unscoped news/headline requests, always cover crypto and stocks in separate sections.
- For unscoped opportunity/discovery/entry-timing intent, always run both crypto and stock paths
  before answering.
- Do not let the first pass lock scope. If you started crypto-only, run a stock counterpart pass
  before finalizing (and vice versa).
- For mixed or unscoped responses, always return two sections: `## Crypto` and `## Stocks`.
- Before presenting trade candidates, verify each one is listed on Hyperliquid (perp or spot).
- Prioritize and rank `tradable now` ideas first.
- If an idea is not listed, label it `Not currently tradable on Hyperliquid` and keep it in a
  watchlist-only subsection.
- Prefer recency: alpha comes from being early.
- Include timeframe and signal strength when presenting trends.
- Flag listing age and elevated risk for new launches.
- Prefer multi-signal confirmation over single-signal conclusions.
- Ask for exact missing inputs (chain/address/CIK) when required.
- Every claim must be traceable to tool output.
- Do not make buy/sell recommendations; present evidence so the user decides.

## Input Guidance

Best results come from queries that include:

- Time window (for example 24h / 7d)
- Asset class scope when intentional (`crypto only`, `stocks only`, or both)
- For crypto: chain and token identifiers where possible
- For stocks: ticker, and filer CIK when requesting institutional holdings
- Desired signal type (trending, listings, smart money, movers, catalysts, or combined)

## Command examples

### Show CLI help

```bash
tribes-cli alpha-scout --help
```

### Ask the specialist

```bash
tribes-cli alpha-scout ask \
  --query "what's hot across crypto and stocks in the last 24 hours"
```

## Endpoint Contract

The CLI calls:

- `POST /agent/lucy/alpha-scout`
- Query string param: `q=<user-query>`
- Response: JSON object `{ "result": "<analysis string>" }`
