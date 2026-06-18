---
name: research-analyst
description: >-
  Expert on blockchain identity resolution and general web research. Handles: ENS name-to-address and address-to-name lookups, web search for DeFi protocol information and financial concepts, web page extraction, and multi-page website crawling. Acts as fallback when structured data tools cannot answer. Call for ENS identity lookups, "what is [protocol/concept]?" questions, or when deep research across an entire docs site or blog is needed.
allowed-tools: bash read
---

# Research Analyst

Use this skill for identity resolution and focused web research powered by the
`research_analyst` Lucy specialist. It combines ENS lookups with web search/scrape/crawl when
structured market tools do not fully answer a question.

## When To Use

Use this skill for:

- ENS name-to-address and address-to-name lookups
- Protocol/concept explainers requiring web evidence
- Multi-page research across docs/blog sites
- Filling data gaps where structured finance tools are insufficient

## Core Capabilities

- Blockchain identity resolution via ENS
- Targeted web search for financial and protocol research
- Single-page extraction for source-grounded answers
- Multi-page crawling for deeper documentation synthesis

## Recommended Workflows

Identity lookup:

- Ask ENS resolver/reverse lookup style questions directly.

Protocol/concept research:

- Start with focused search, then extract the best source page for synthesis.

Deep docs/blog review:

- Start with search to locate canonical docs, then crawl and summarize with citations.

Fallback investigation:

- Use when specialist data tools do not cover the requested information domain.

## Input Guidance

Best results come from queries that include:

- Exact ENS names or wallet addresses for identity tasks
- Protocol/concept name with specific research goal
- Source domain hints when you prefer official docs

Always request source-backed answers if you need high confidence outputs.

## Command examples

### Show CLI help

```bash
tribes-cli research-analyst --help
```

### Ask the specialist

```bash
tribes-cli research-analyst ask \
  --query "what is pendle and how does it work"
```

## Endpoint Contract

The CLI calls:

- `POST /agent/lucy/research-analyst`
- Query string param: `q=<user-query>`
- Response: JSON object `{ "result": "<analysis string>" }`
