---
name: web-search
description: >-
  General web search and single-page text extraction via the Tavily proxy. Handles: ranked web
  search results (title, url, snippet) and the full readable text of one known URL. Call it for
  non-finance lookups, docs, and regulatory background, or as the LAST resort for finance — news
  first for market/asset news, research-analyst for source-backed finance research. NOT for:
  market or asset news and sentiment (use news); cited finance research or ENS (use
  research-analyst); JS-gated or fetch-blocked pages (use browser).
allowed-tools: bash read
---

# Web Search

Backing command group: `tribes-cli web-search`. Searches the open web and extracts the readable
text of a specific page.
Requires: an auth token (run `tribes-cli login` once if commands fail with auth errors).

## When to use

- Non-finance lookups, project documentation, regulatory texts, or background context — run
  `search`.
- Reading the full content of one specific, already-known URL — run `extract`.
- Finance questions ONLY as the last resort: `news` first, then `research-analyst`, then this
  skill (see the routing map in AGENTS.md).
- NOT for market or asset news, catalysts, or sentiment — use `news`.
- NOT for cited multi-source finance research or ENS resolution — use `research-analyst`.
- NOT for pages that need JavaScript or block programmatic fetch — use `browser`.
- NOT for prices, charts, indicators, wallets, or pools — use the matching analyst skill.

## Hard rules

1. NEVER use `extract` to bypass paywalls, CAPTCHAs, or access controls.
2. Extract at most 3 URLs per question — pick the most recent or most primary sources.
3. These commands have NO `--out` flag — output is JSON on stdout only.
4. Field names in the output JSON are not guaranteed — read the raw JSON instead of parsing
   hardcoded keys with jq.
5. Cite the source URL for every claim you carry into analysis.

## Command reference

| Subcommand | Purpose                                          | Required flags | Read-only or signed |
| ---------- | ------------------------------------------------ | -------------- | ------------------- |
| `search`   | Search the web, return ranked title/url/snippet  | `--query`      | read-only           |
| `extract`  | Extract the readable text of a specific page URL | `--url`        | read-only           |

## Examples

### Find current pages on a topic

```bash
tribes-cli web-search search \
  --query "EU MiCA stablecoin reserve requirements 2026"
```

Output is JSON with ranked results (title, url, snippet). Read the snippets, then `extract` only
the 1–3 URLs worth reading in full. If the results are off-topic, re-run `search` once with a
narrower query instead of extracting weak matches.

### Read the full text of one page

```bash
tribes-cli web-search extract \
  --url "https://example.com/regulation/mica-stablecoin-rules"
```

Output is JSON containing the page's readable text content.

## Error recovery

| Symptom                                             | Action                                                                         |
| --------------------------------------------------- | ------------------------------------------------------------------------------ |
| Auth error (unauthorized, expired token)            | Run `tribes-cli login`, retry the original command once, then stop and report. |
| Any other API failure                               | Retry the same command once; if it fails again, stop and report the error.     |
| `extract` returns empty, blocked, or challenge text | Switch to the `browser` skill for that URL — NEVER re-run `extract` on it.     |
| Two searches return nothing useful                  | Stop and report the gap — do not keep rephrasing the same query.               |

## Related skills

- `news` — market/asset news, catalysts, and sentiment (first choice for finance news).
- `research-analyst` — source-backed finance research and ENS resolution.
- `browser` — JS-gated or fetch-blocked pages (401/403, bot challenges, empty HTML).
- `strategize` — market briefings that consume background context found here.
