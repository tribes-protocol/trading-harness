---
name: research-analyst
description: >-
  Expert on ENS identity resolution and finance-focused web research across crypto and stocks.
  Handles ENS name/address lookups, targeted web search, page extraction, and multi-page crawl
  synthesis. Use when structured tools cannot fully answer a finance question, or when protocol,
  company, or concept research needs source-backed evidence.
allowed-tools: bash read
---

# Research Analyst

Use this skill for identity resolution and focused finance research powered by the
`research_analyst` Lucy specialist. It combines ENS tools with web search, scrape, and crawl
when structured market tools cannot fully answer the question.

## When To Use

Use this skill for:

- ENS identity lookups (`name -> address` or `address -> name`)
- Protocol/company/concept explainers that need web evidence
- Deep research across docs, filings, blogs, or investor pages
- Filling knowledge gaps where structured finance tools are insufficient

## Core Capabilities

- Identity resolution:
  - `ens_address_resolver` for name -> address
  - `ens_reverse_lookup` for address -> name
- Web research:
  - `web_search` for focused source discovery
  - `web_scrape` for extracting relevant page content
  - `web_crawl` for multi-page docs/filings/blog synthesis
- Gap-filling when structured market tools cannot answer

## Workflow Patterns

ENS identity:

- `ens_address_resolver` for name -> address.
- `ens_reverse_lookup` for address -> name.

Research ("What is [protocol/company]?" / "How does [concept] work?"):

- `web_search` with a focused query.
- `web_scrape` on the most relevant result.
- Synthesize with source attribution.

Deep research ("Explain how [protocol/company] works across docs/filings/blog"):

- `web_search` to find canonical site roots.
- `web_crawl` on docs/blog root URLs with appropriate depth and limit.
- Synthesize across returned pages with source URLs.

## Error Handling and Retries

When a tool returns an error response:

1. Diagnose whether input is parameter-fixable (wrong ENS name, bad URL, or weak query).
2. If fixable, adjust inputs and retry the same tool. Attempt at least two retries with
   modified parameters before giving up.
3. If still failing, or not parameter-fixable (provider outage, rate limit, server error),
   report the error with tool name, message, and user-intent summary.

## Rules

- Try ENS tools first for identity/address questions.
- Use specific search queries, not vague ones.
- Always include source URLs when citing web content.
- Distinguish verified on-chain ENS data from web-sourced information.
- For stock/company research, prioritize primary sources (investor relations, SEC pages,
  earnings releases).
- Stay focused on finance.
- If reliable information is unavailable, say so clearly.

## Input Guidance

Best results come from queries that include:

- Exact ENS names or wallet addresses for identity tasks
- Protocol/company/concept plus a specific research goal
- Preferred source domains when official docs/IR pages are required
- Depth expectations (quick answer vs multi-page deep dive)

## Command examples

### Show CLI help

```bash
tribes-cli research-analyst --help
```

### Ask the specialist

```bash
tribes-cli research-analyst ask \
  --query "how does Pendle work, with sources from official docs"
```

## Endpoint Contract

The CLI calls:

- `POST /agent/lucy/research-analyst`
- Query string param: `q=<user-query>`
- Response: JSON object `{ "result": "<analysis string>" }`
