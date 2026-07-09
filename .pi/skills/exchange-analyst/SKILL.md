---
name: exchange-analyst
description: >-
  Expert on centralized exchanges, derivatives markets, and institutional crypto holdings.
  Handles: exchange rankings and volume trends, individual exchange profiles and tickers,
  derivatives/futures tickers and open interest, derivatives exchange rankings, and public
  treasury data (which companies hold crypto and their transactions). Call when the EXCHANGE or
  derivatives market is the subject. NOT for: which exchanges list a specific coin (use
  fundamentals-analyst); what is tradable on Hyperliquid or your own positions/orders (use
  hyperliquid); DEX pools and pairs (use defi-analyst).
allowed-tools: bash read
---

# Exchange Analyst

Backing command group: `tribes-cli exchange-analyst`. Sends one natural-language question to the
exchange/derivatives specialist and prints one free-text analysis string to stdout.
Requires: an auth token (run `tribes-cli login` once if commands fail with auth errors).

## When to use

- Rank or compare centralized exchanges by volume, trust, or market coverage.
- Profile one exchange: its tickers, volume trend, listed markets.
- Derivatives market context: futures/perp tickers, open interest, funding across venues.
- Rank derivatives exchanges by open interest or volume.
- Track public treasuries: which companies hold crypto, holdings size, transaction history.
- NOT for which exchanges list a specific coin (coin is the subject) — use `fundamentals-analyst`.
- NOT for tradable Hyperliquid markets or your own positions/orders/balances — use `hyperliquid`.
- NOT for DEX pools, pairs, or on-chain liquidity — use `defi-analyst`.
- NOT for placing or canceling orders — use `hyperliquid` or `trade-execution`.

## Hard rules

1. MUST set a bash timeout of at least 120 seconds for this command — it polls a backend agent
   and can run for minutes (see AGENTS.md).
2. The ONLY flag is `--query`; there is no `--out` and no filter flags — encode venue, scope
   (spot exchange, derivatives, treasury), and time window inside the natural-language query
   text. Output is one free-text analysis string on stdout, not JSON.
3. The CLI calls the API itself — NEVER call the endpoint or curl directly.
4. MAX 2 passes per question: one broad ask, then at most one narrowed follow-up ask. Then
   report what you have.
5. Findings here are research only — verify Hyperliquid tradability via the `hyperliquid` skill
   before presenting any asset as an actionable trade idea (see AGENTS.md).

## Command reference

| Subcommand | Purpose                                              | Required flags | Read-only or signed |
| ---------- | ---------------------------------------------------- | -------------- | ------------------- |
| `ask`      | Ask the exchange/derivatives specialist one question | `--query`      | read-only           |

## Examples

### Rank centralized exchanges

```bash
tribes-cli exchange-analyst ask \
  --query "rank the top 10 spot exchanges by 24h volume and trust score"
```

### Compare derivatives open interest and funding

```bash
tribes-cli exchange-analyst ask \
  --query "open interest and funding rates for BTC futures across Binance, Bybit, and OKX"
```

### Track public treasury holdings

```bash
tribes-cli exchange-analyst ask \
  --query "which public companies hold the most BTC, and their latest treasury transactions"
```

## Error recovery

| Symptom                                  | Action                                                                         |
| ---------------------------------------- | ------------------------------------------------------------------------------ |
| Auth error (unauthorized, expired token) | Run `tribes-cli login`, retry the original command once, then stop and report. |
| Any other API failure                    | Retry the same command once; if it fails again, stop and report the error.     |
| Command exceeds your bash timeout        | Re-run once with a 300-second timeout; if it times out again, stop and report. |

## Related skills

- `fundamentals-analyst` — which exchanges list a specific coin (coin is the subject).
- `hyperliquid` — tradable Hyperliquid markets, your own positions, orders, and balances.
- `defi-analyst` — DEX pools, pairs, TVL, and on-chain liquidity.
- `market-strategist` — market-wide caps, dominance, rankings, and movers.
