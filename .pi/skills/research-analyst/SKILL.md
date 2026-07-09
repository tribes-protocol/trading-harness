---
name: research-analyst
description: >-
  Finance research specialist driven by one natural-language query. Handles: ENS name/address
  resolution (forward and reverse) and cited multi-source web research on protocols, companies,
  filings, and concepts across crypto and stocks. Call when structured analyst skills and news
  cannot fully answer and the question needs source-backed evidence or ENS identity. NOT for:
  headlines, catalysts, or sentiment (use news); non-finance topics, one quick search, or reading
  one known URL (use web-search); price, chart, or market data (route to the matching analyst skill).
allowed-tools: bash read
---

# Research Analyst

Backing command group: `tribes-cli research-analyst`. One natural-language query drives a remote
specialist that resolves ENS identities and performs cited multi-source finance web research.
The CLI calls the specialist API itself — NEVER call the endpoint directly.
Requires: an auth token (run `tribes-cli login` once if commands fail with auth errors).

## When to use

- ENS identity questions — resolve a name to an address or an address to a name.
- Protocol, company, or concept explainers that need source-backed web evidence.
- Deep research across official docs, filings, investor pages, or blogs.
- NOT for headlines, catalysts, or sentiment — use `news` first.
- NOT for non-finance topics, one quick search, or reading one known URL — use `web-search`.
- NOT for prices, charts, or market data — use the matching analyst skill (AGENTS.md routing map).

## Hard rules

1. The ENTIRE surface is `tribes-cli research-analyst ask --query "<text>"`. Internal specialist
   tools (ENS resolvers, web search/scrape/crawl) are NOT subcommands — steer them via wording.
2. The ONLY flag is `--query`; there is no `--out` and no filter flags — encode addresses,
   preferred source domains, time windows, and depth inside the query text.
3. MUST set a bash timeout of at least 120 seconds for this command — it can run for minutes.
4. MAX 2 `ask` calls per user question: one well-specified query, one reworded retry, then stop.
5. Keep returned source URLs in your final answer; say plainly when reliable info is unavailable.

## Command reference

| Subcommand | Purpose                                           | Required flags | Read-only or signed |
| ---------- | ------------------------------------------------- | -------------- | ------------------- |
| `ask`      | Send one natural-language query to the specialist | `--query`      | read-only           |

Output is one free-text analysis string on stdout, not JSON — relay the prose, no fields to parse.

## Examples

### Resolve an ENS name to an address

```bash
tribes-cli research-analyst ask \
  --query "Resolve vitalik.eth to its Ethereum address"
```

### Reverse-resolve an address to an ENS name

```bash
tribes-cli research-analyst ask \
  --query "What ENS name reverse-resolves to 0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045?"
```

### Protocol explainer with cited sources

```bash
tribes-cli research-analyst ask \
  --query "How does Pendle's vePENDLE model work? Use the official Pendle docs and cite URLs"
```

### Deep multi-source company dive

```bash
tribes-cli research-analyst ask \
  --query "Summarize Coinbase's latest quarterly results and 2026 outlook using investor.coinbase.com and SEC filings; cite each source URL"
```

## Error recovery

| Symptom                                  | Action                                                                            |
| ---------------------------------------- | --------------------------------------------------------------------------------- |
| Auth error (unauthorized, expired token) | Run `tribes-cli login`, retry the original command once, then stop and report.    |
| Empty or off-target answer               | Reword `--query` once with more specific names, addresses, or domains; then stop. |
| Timeout, 5xx, or rate limit              | Retry the same command once; if it fails again, stop and report — NEVER loop.     |

## Related skills

- `news` — first stop for market/asset news, catalysts, and sentiment.
- `web-search` — one quick search, reading one known URL, or non-finance topics.
- `browser` — JS-gated or fetch-blocked pages (401/403/challenge).
- `fundamentals-analyst` — structured research profile of one listed coin.
