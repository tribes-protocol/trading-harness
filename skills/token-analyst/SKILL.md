---
name: token-analyst
description: >-
  Deep-dives into ONE identified token using real-time on-chain data. Handles: live and
  historical on-chain prices, security and rug-risk audits, on-chain trades and volume,
  transfers, holder concentration, tokenomics (mint/burn, exit liquidity), and name-to-address
  resolution. Call for any question about a specific token's price, safety, trades, or holders.
  NOT for: coin profiles, supply trends, or exchange listings (use fundamentals-analyst);
  trending or new-token discovery (use alpha-scout); market-wide rankings or multi-coin prices
  (use market-strategist); pool or DEX analysis (use defi-analyst).
allowed-tools: bash read
---

# Token Analyst

Backing command group: `tribes-cli token-analyst`. Sends one natural-language question to the
token_analyst specialist and prints a plain-text on-chain analysis of one token to stdout.
Requires: an auth token (run `tribes-cli login` once if commands fail with auth errors).

## When to use

- Current price, liquidity, and volume snapshot for one identified token.
- Security and rug-risk audit (honeypot, ownership, mint authority) before touching a token.
- On-chain trade flow, whale buys/sells, transfers, holder concentration, and tokenomics.
- NOT for coin profiles, supply trends, or exchange listings — use `fundamentals-analyst`.
- NOT for trending tokens, new listings, or smart-money discovery — use `alpha-scout`.
- NOT for market-wide rankings, top movers, or multi-coin price tables — use `market-strategist`.
- NOT for pool, pair, or DEX questions — use `defi-analyst`.

## Hard rules

1. The ONLY flag on `ask` is `--query` — no `--out`, no filter flags; encode chain, contract
   address, and time window inside the query text.
2. Output is one free-text analysis string on stdout, not JSON; use shell redirection for a file.
3. MUST set a bash timeout of at least 120 seconds for `ask` — specialist calls are slow.
4. The CLI calls the API itself — NEVER call the endpoint or curl directly.
5. IF the symbol is ambiguous or the chain is unknown, THEN run `tribes-cli token search` first,
   put the resolved chain + address into the `ask` query, and check the answer matches that token.
6. Render token addresses as tribes.xyz Markdown links, never bare addresses (see AGENTS.md).
7. Specialist follow-up suggestions are YOUR TODOs, not a user menu — at most 2 refinement passes.
8. Verify Hyperliquid tradability before presenting a trade idea as actionable (AGENTS.md).

## Command reference

| Subcommand | Purpose                            | Required flags | Read-only or signed |
| ---------- | ---------------------------------- | -------------- | ------------------- |
| `ask`      | Query the token_analyst specialist | `--query`      | read-only           |

Deterministic name→address resolution uses `tribes-cli token search --query "<name or symbol>"`
(JSON output, accepts `--out <file>`; full docs live in the `spot-trading` skill).

## Examples

### Price snapshot and whale flow (chain named, no address needed)

```bash
timeout 300 tribes-cli token-analyst ask \
  --query "current price, liquidity, 24h volume, and net whale buy/sell flow over the last 24 hours for WIF on solana"
```

### Security / rug-risk audit (contract address known)

```bash
timeout 300 tribes-cli token-analyst ask \
  --query "security audit for PEPE 0x6982508145454ce325ddbe47a25d4ec3d2311933 on ethereum: honeypot flags, ownership, mint authority, exit-liquidity risk"
```

### Ambiguous symbol — resolve first, then ask

```bash
tribes-cli token search --query "MOG"
timeout 300 tribes-cli token-analyst ask \
  --query "tokenomics, mint/burn history, and top-holder concentration for MOG <evm-address> on ethereum"
```

## Error recovery

| Symptom                                  | Action                                                                               |
| ---------------------------------------- | ------------------------------------------------------------------------------------ |
| Auth error (unauthorized, expired token) | Run `tribes-cli login`, retry the original command once, then stop and report.       |
| Answer covers the wrong token            | Re-run `ask` with the exact chain + contract address from `tribes-cli token search`. |
| Any other API failure                    | Retry the same command once; if it fails again, stop and report the error.           |

## Related skills

- `fundamentals-analyst` — CoinGecko research profile of one listed coin.
- `alpha-scout` — discovery before a specific token is chosen.
- `market-strategist` — market-wide aggregates, rankings, and movers.
- `defi-analyst` — pools, pairs, and DEX activity.
- `technical-analyst` — indicator math and backtests on candles.
