---
name: web-search
description: General web search and full-page text extraction (Tavily-backed). Use to find current information, news, docs, or context that the finance-specific skills cannot answer, and to read the full content of a specific page found via search.
allowed-tools: bash read
---

# Web Search

Use this skill to search the open web and to extract the readable text of a specific page.

It is a **general fallback** — for token prices, holders, wallet balances, on-chain
analytics, or market data, use the dedicated skills (hyperliquid, wallet, token-analyst,
defi-analyst, …) first. Reach for web search when you need general news, project
documentation, regulatory updates, or background context those tools don't cover.

## 1. Search

Find ranked results (title, URL, snippet) for a query:

```bash
bun src/cli/WebSearch.ts search --query "ECB rate decision september 2026"
```

Output:

```json
{
  "query": "ECB rate decision september 2026",
  "results": [
    {
      "title": "...",
      "url": "https://...",
      "content": "snippet / summary text",
      "publishedDate": "2026-09-11"
    }
  ]
}
```

Read the snippets to decide which URLs are worth opening.

## 2. Extract

After a search, read the full text of a promising URL:

```bash
bun src/cli/WebSearch.ts extract --url "https://example.com/article"
```

Output:

```json
{
  "url": "https://example.com/article",
  "results": [
    {
      "url": "https://example.com/article",
      "title": "...",
      "rawContent": "full page text content"
    }
  ]
}
```

## Workflow

1. `search` with a focused query to discover candidate URLs.
2. `extract` the most relevant URL(s) to read the full content.
3. Cite the source URL in any analysis you produce.

Do not use extraction to bypass paywalls, CAPTCHAs, or access controls.
