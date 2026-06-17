---
name: token-analyst
description: >-
  Deep-dives into individual tokens using real-time on-chain data. Handles: current and historical prices, token security and risk audits, on-chain trade activity and volume analysis, token transfers, tokenomics (creation info, mint/burn, exit liquidity), and token search/discovery by name or keyword. Call for any question about a specific token's price, chart, safety, trades, or identity.
allowed-tools: bash read
---

# Token Analyst

Use this skill for deep token analysis powered by the `token_analyst` Lucy specialist.
It is designed for token-specific research and should be preferred over generic market tools
when the user asks about a single token.

## When To Use

Use this skill for:

- Current token price and market snapshot
- Historical price and time-window analysis
- Security and risk checks (honeypot/ownership flags)
- Tokenomics and lifecycle analysis (creation, mint/burn, exit liquidity)
- On-chain trade and transfer behavior
- Holder concentration and whale activity
- Token discovery by name/symbol when the contract is unknown

## Core Capabilities

- Price and charts: spot + historical context
- Security and risk: contract-level risk checks
- Trading flow: recent trades, volume, buyer/seller behavior
- Holder analysis: top holders and distribution
- Discovery: resolve ambiguous token names to concrete addresses

## Recommended Workflows

Quick price check:

- Ask for current price context and include liquidity/volume framing.

Token due diligence:

- Ask for metadata, security posture, market data, and token creation context.

Trade analysis:

- Ask for recent activity first, then zoom into large trades/whale behavior.

Holder analysis:

- Ask for top holders and concentration/distribution trends.

Token lookup/disambiguation:

- If symbol/name is ambiguous, explicitly include chain or contract address.

## Input Guidance

Best results come from queries that include:

- Chain and token address (preferred), or
- Symbol/name plus chain/exchange context if known

If you do not provide a chain/address, the specialist may choose the dominant listing by
market footprint and proceed with that token.

## Command examples

### Show CLI help

```bash
bun src/cli/TokenAnalyst.ts --help
```

### Ask the specialist

```bash
API_BEARER_TOKEN="$(bun src/cli/llm-token.ts)" \
bun src/cli/TokenAnalyst.ts ask \
  --query "risk and holder concentration for PEPE on ethereum"
```

## Endpoint Contract

The CLI calls:

- `POST /agent/lucy/token-analyst`
- Query string param: `q=<user-query>`
- Authorization header: `Bearer <API_BEARER_TOKEN>`
- Response: JSON object `{ "result": "<analysis string>" }`
