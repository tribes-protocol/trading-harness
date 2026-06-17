---
name: wallet-analyst
description: >-
  Expert on wallet and portfolio analysis. Handles: token balances across all chains, portfolio net worth and trends over time, realized and unrealized PnL (overall and per-token), transfer tracking, transaction history, and balance changes. Call when the user asks about their wallet, holdings, portfolio performance, or transaction activity.
allowed-tools: bash read
---

# Wallet Analyst

Use this skill for wallet and portfolio analysis powered by the `wallet_analyst` Lucy specialist.
It focuses on balances, net worth, PnL, transfer activity, and transaction-level wallet behavior.

## When To Use

Use this skill for:

- Current wallet holdings and token balances across chains
- Portfolio net worth snapshots and trend analysis over time
- Realized and unrealized PnL breakdowns, including token-level performance
- Transfer activity and wallet transaction history
- Net worth change attribution and wallet behavior diagnostics

## Core Capabilities

- Cross-chain wallet balance analysis with token and USD context
- Net worth analytics: current value, composition, and historical trend
- Performance analytics: realized vs unrealized PnL and per-token outcomes
- Activity intelligence: transfers, transaction timelines, and balance shifts

## Recommended Workflows

Portfolio overview ("What is in my wallet?"):

- Ask for wallet assets and net worth first, then drill into breakdown details.

Performance review ("How is my wallet doing?"):

- Ask for overall PnL, then per-token PnL, and finally net worth chart trend.

Activity and flows:

- Ask for recent transfers first, then transfer totals and full transaction history.

Net worth change investigation:

- Ask for the net worth trend, then balance changes and PnL context for explanation.

## Input Guidance

Best results come from queries that include:

- Wallet address (if not using default context wallet)
- Explicit timeframe (for example 24h / 7d / 30d)
- Desired focus: balances, net worth, PnL, or transfer activity

If your query is broad, start with a portfolio snapshot and then ask follow-up questions.

## Code

```bash
bun run build --filter=@tribes-terminal/skill-wallet-analyst
```

## Command examples

### Show CLI help

```bash
bun .pi/skills/wallet-analyst/src/cli/WalletAnalyst.ts --help
```

### Ask the specialist

```bash
API_BEARER_TOKEN="$(bun src/cli/llm-token.ts)" \
bun .pi/skills/wallet-analyst/src/cli/WalletAnalyst.ts ask \
  --query "portfolio PnL and net worth trend over the last 30d"
```

## Endpoint Contract

The CLI calls:

- `POST /agent/lucy/wallet-analyst`
- Query string param: `q=<user-query>`
- Authorization header: `Bearer <API_BEARER_TOKEN>`
- Response: JSON object `{ "result": "<analysis string>" }`
