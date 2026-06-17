---
name: alpha-scout
description: >-
  Discovers emerging opportunities and tracks smart money. Handles: trending tokens, new token listings, smart money flows and signals, and recently updated token info. Call when the user wants to discover what's hot or find smart money signals. For holder/trader deep-dives, use token_analyst instead.
allowed-tools: bash read
---

# Alpha Scout

Use this skill for early-signal discovery powered by the `alpha_scout` Lucy specialist.
It focuses on trend discovery and smart-money behavior, then combines those signals to
surface stronger momentum candidates.

## When To Use

Use this skill for:

- Discovering trending tokens and new listings
- Finding where sophisticated traders are rotating
- Identifying overlap between trend and smart-money inflow signals
- Exploring “what is hot right now” with data-backed context

## Core Capabilities

- Trend discovery: currently trending tokens and newly listed tokens
- Smart-money tracking: accumulation, flows, and active positioning
- Signal synthesis: cross-checking multiple momentum signals before acting

## Recommended Workflows

"What's trending?" / "What's hot?":

- Ask for trending tokens first, then cross-reference with smart-money token signals.
- Prioritize tokens that appear in both sets.

"What are whales buying?":

- Ask for smart-money token list and flow context over a clear interval.

New token discovery:

- Ask for recent listings and then validate with smart-money or trend overlap.

Token resolution:

- If token names are ambiguous, include chain/address context in your query.
- For holder/trader deep-dives, switch to `token-analyst`.

## Input Guidance

Best results come from queries that include:

- Time window (for example 24h / 7d)
- Chain and token identifiers where possible
- Desired signal type (trending, new listings, smart money, or combined)

## Code

```bash
bun run build
```

## Command examples

### Show CLI help

```bash
bun .pi/skills/alpha-scout/src/cli/AlphaScout.ts --help
```

### Ask the specialist

```bash
API_BEARER_TOKEN="$(bun src/cli/llm-token.ts)" \
bun .pi/skills/alpha-scout/src/cli/AlphaScout.ts ask \
  --query "top 10 trending tokens in the last 24 hours"
```

## Endpoint Contract

The CLI calls:

- `POST /agent/lucy/alpha-scout`
- Query string param: `q=<user-query>`
- Authorization header: `Bearer <API_BEARER_TOKEN>`
- Response: JSON object `{ "result": "<analysis string>" }`
