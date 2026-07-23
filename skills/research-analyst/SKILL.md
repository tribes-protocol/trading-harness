---
name: research-analyst
description: >-
  Finance research specialist. Handles: ENS identity (forward name-to-address and reverse
  address-to-name resolution on Ethereum mainnet, with avatar and social records) and cited
  multi-source web research on protocols, companies, filings, and supply/demand concepts across
  crypto, securities, and commodities. Call when structured analyst skills and news cannot fully
  answer and the question needs source-backed evidence or ENS identity. NOT for: headlines,
  catalysts, or sentiment (use news); non-finance topics, one quick search, or reading one known
  URL (use web-search); deep multi-page reading, crawling, or JS-gated pages (use browser);
  price, chart, or market data (route to the matching analyst skill).
allowed-tools: bash read
---

# Research Analyst

Backing command groups: `tribes-cli web-search` (ranked search + single-page text extraction via
the Tavily proxy) and `tribes-cli ens` (ENS forward and reverse resolution on Ethereum mainnet).
YOU are the analyst: compose searches and extracts, read the sources, and write the cited
synthesis yourself. There is no backend specialist behind this skill and no `ask` subcommand —
each command returns in seconds.
`web-search` requires an auth token (run `tribes-cli login` once if it fails with auth errors);
`ens` reads mainnet directly.

## When to use

- ENS identity questions — resolve a name to an address (`ens resolve`) or an address to its
  primary name and owned domains (`ens reverse`).
- Protocol, company, or concept explainers that need source-backed web evidence — compose
  `web-search search` + `web-search extract` and synthesize with citations.
- Research across official docs, filings, investor pages, or blogs — same composition, scoped
  to primary sources.
- NOT for headlines, catalysts, or sentiment — use `news` first.
- NOT for non-finance topics, one quick search, or reading one known URL — use `web-search`.
- NOT for deep multi-page reading or crawling of one site, or JS-gated/blocked pages — use
  `browser`.
- NOT for prices, charts, or market data — use the matching analyst skill (AGENTS.md routing map).

## Hard rules

1. Every subcommand prints structured JSON on stdout — parse it, never screen-scrape prose.
   The `ens` subcommands also accept `--out <file>`; the `web-search` subcommands have NO
   `--out` flag (stdout only).
2. Research flow is: `search` → pick the 1–5 most primary or most recent URLs → `extract` each →
   synthesize. Never rest a load-bearing claim on a search snippet alone — extract the page.
3. Cite the source URL for every claim in your final answer; say plainly when reliable
   information is unavailable.
4. NEVER use `extract` to bypass paywalls, CAPTCHAs, or access controls. A blocked, empty, or
   JS-rendered page routes to the `browser` skill — do not re-run `extract` on it.
5. If a command reports the provider key is not set, the capability is unavailable on this box —
   report that plainly instead of retrying or working around it.

## Command reference

All read-only.

| Command              | Purpose                                                | Required flags | Useful flags   |
| -------------------- | ------------------------------------------------------ | -------------- | -------------- |
| `web-search search`  | Ranked web results (title, url, snippet)               | `--query`      |                |
| `web-search extract` | Readable text content of one page URL                  | `--url`        |                |
| `ens resolve`        | ENS name → address, avatar, url/twitter/github records | `--name`       | `--out <file>` |
| `ens reverse`        | Address → primary ENS name and owned domains           | `--address`    | `--out <file>` |

## Examples

### Resolve an ENS name to an address

```bash
tribes-cli ens resolve --name vitalik.eth
```

### Reverse-resolve an address to an ENS name

```bash
tribes-cli ens reverse --address 0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045
```

### Protocol explainer with cited sources

```bash
tribes-cli web-search search --query "Pendle vePENDLE model official docs"
tribes-cli web-search extract --url "https://docs.pendle.finance/ProtocolMechanics/Mechanisms/vePENDLE"
```

Extract the official docs page(s) from the results, then explain the mechanism yourself, citing
each URL used.

### Multi-source company dive

```bash
tribes-cli web-search search --query "Coinbase latest quarterly results shareholder letter site:investor.coinbase.com"
tribes-cli web-search search --query "Coinbase 10-Q 2026 outlook SEC filing"
tribes-cli web-search extract --url "{SHAREHOLDER_LETTER_URL}"
tribes-cli web-search extract --url "{FILING_OR_COVERAGE_URL}"
```

Run one search per angle, extract the strongest 2–3 primary sources, and synthesize the results
and outlook with a citation per claim.

## Error recovery

| Symptom                                             | Action                                                                            |
| --------------------------------------------------- | --------------------------------------------------------------------------------- |
| Key-not-set error                                   | Provider unconfigured on this box — report it; do not retry or work around.       |
| Auth error (unauthorized, expired token)            | Run `tribes-cli login`, retry the original command once, then stop and report.    |
| Off-target search results                           | Reword `--query` once with more specific names, addresses, or domains; then stop. |
| `extract` returns empty, blocked, or challenge text | Switch to the `browser` skill for that URL — NEVER re-run `extract` on it.        |
| Any other API failure                               | Retry the same command once; if it fails again, stop and report the error.        |

## Related skills

- `news` — first stop for market/asset news, catalysts, and sentiment.
- `web-search` — one quick search, reading one known URL, or non-finance topics.
- `browser` — deep multi-page reading/crawling and JS-gated or fetch-blocked pages.
- `fundamentals-analyst` — structured research profile of one listed coin.
- `wallet-analyst` — on-chain activity of an address after ENS resolution.
