---
name: alpha-scout
description: >-
  Discovers opportunities BEFORE a specific token is chosen. Handles: trending tokens, new token
  listings, and smart-money flows and accumulation. Call to find what is hot or where smart money
  is rotating. NOT for: one identified token's price, safety, or trades (use token-analyst);
  market-wide rankings or top movers (use market-strategist); trending pools (use defi-analyst).
allowed-tools: bash read
---

# Alpha Scout

Backing command group: `tribes-cli alpha-scout` — one natural-language query in, one free-text
analysis string out. Requires: an auth token (run `tribes-cli login` once on auth failures).

## When to use

- "What's trending?" / "What's hot right now?" — trending-token discovery.
- "What are whales / smart money buying?" — smart-money accumulation and flows.
- "Any new tokens worth watching?" — new listings plus a validation pass.
- NOT for one identified token's price, security, or trades — use `token-analyst`.
- NOT for market-wide rankings, global caps, or top gainers/losers — use `market-strategist`.
- NOT for trending or new pools and DEX pairs — use `defi-analyst`.

## Hard rules

1. The ONLY flag is `--query` — no `--out`, no filter flags; encode every filter (time window,
   chain, signal type, exclusions) inside the query text.
2. Output is one free-text analysis string on stdout, not JSON; use shell redirection for a file.
3. MUST set a bash timeout of at least 120 seconds for this command — specialist calls are slow.
4. The CLI calls the API itself — NEVER call the endpoint or curl directly.
5. Specialist follow-up suggestions are YOUR TODOs, not a user menu — at most 2 refinement passes.

## Command reference

| Subcommand | Purpose                                | Required flags | Read-only or signed |
| ---------- | -------------------------------------- | -------------- | ------------------- |
| `ask`      | Query the alpha-scout specialist agent | `--query`      | read-only           |

Query quality decides answer quality. Wrong: `--query "whales?"`. Right:
`--query "tokens with largest net smart-money inflow last 48h on Base, exclude stablecoins"`.

## Examples

### What's hot right now (trending × smart-money intersect)

1. Run the trending query, then the smart-money query:

```bash
timeout 300 tribes-cli alpha-scout ask \
  --query "top 10 trending tokens in the last 24 hours across all chains"
timeout 300 tribes-cli alpha-scout ask \
  --query "which tokens are smart-money wallets net accumulating over the last 24 hours"
```

2. Intersect the lists; report tokens in BOTH first as strongest candidates, the rest secondary.

### Smart-money accumulation

```bash
timeout 300 tribes-cli alpha-scout ask \
  --query "tokens with the largest net smart-money inflows over the past 7 days on Solana, exclude stablecoins and wrapped assets"
```

### New listings (then validate with one trending or smart-money overlap pass)

```bash
timeout 300 tribes-cli alpha-scout ask \
  --query "notable new token listings from the last 72 hours with early volume or smart-money interest"
```

## Post-discovery checklist

1. Verify Hyperliquid tradability before presenting ideas as executable (AGENTS.md guardrail).
2. IF the request was unscoped, THEN add securities (`stock-analyst`) and commodities
   (`commodity-analyst`) passes; see AGENTS.md.
3. Hand off a chosen token: on-chain deep-dive → `token-analyst`; profile → `fundamentals-analyst`.

## Error recovery

| Symptom                                  | Action                                                                                       |
| ---------------------------------------- | -------------------------------------------------------------------------------------------- |
| Auth error (unauthorized, expired token) | Run `tribes-cli login`, retry the original command once, then stop and report.               |
| Empty or vague specialist answer         | Rephrase the query once with a tighter window/chain/signal; if still vague, stop and report. |
| Any other API failure                    | Retry the same command once; if it fails again, stop and report the error.                   |

## Related skills

- `token-analyst` — deep-dive on one identified token (price, security, trades, holders).
- `fundamentals-analyst` — research profile of one listed coin.
- `hyperliquid` — tradability verification and execution for discovered ideas.
