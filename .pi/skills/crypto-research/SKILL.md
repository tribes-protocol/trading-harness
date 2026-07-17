---
name: crypto-research
description: Crypto & On-Chain Research desk workflow — token due diligence, flow analysis, DeFi/venue risk using CoinGecko, Birdeye, on-chain providers, and Nansen labels; produces a validated note with venue recommendations routed to independent risk. Use for any token, protocol, or on-chain question.
---

# Crypto & On-Chain Research Workflow

Mandate: `crypto-onchain` in `docs/OPERATING_MODEL.md`. This desk
RECOMMENDS venues/counterparties; APPROVAL authority sits with
`independent-risk` — route accordingly.

## Steps

1. **Identify the token precisely.** Chain + contract address (or
   CoinGecko coin id). Symbols are never a join key — same symbol, many
   scam contracts. `pi token price --chain <chain> --address <addr> --json`
   or `--id <coingecko-id>`.
2. **Cross-check pricing.** Pull from a second provider (CoinGecko vs
   Birdeye) and compare; a disagreement beyond ~1% on a liquid token is a
   finding, not noise. Note liquidity (`liquidityUsd`) — DEX prices on thin
   pools are unrepresentative by construction.
3. **Market context.** OHLCV history via `pi token ohlcv --id <coingecko-id>`
   (or `--chain/--address`) for drawdown/volatility framing (CoinGecko
   history is plan-gated; Birdeye fine granularity has short retention —
   state the window you actually had).
4. **On-chain evidence.** Wallet/holder work via `pi wallet <chain>
   <address> --json`; transfers for flow reconstruction. Helius embedded
   USD values are hourly estimates — flag them.
5. **Labeled flows (Nansen).** Smart-money netflows are proprietary MODEL
   ESTIMATES: evidence type `model_estimate`, internal-use-only (licensing
   — see `docs/providers/nansen.md`). Never present labels as observed
   identity.
6. **Security screen.** Birdeye documents a token-security capability, but
   the platform has NO normalized token-security operation or CLI command
   today — if you cannot source a security screen from a documented,
   verifiable path, record it as a coverage gap in the note's limitations.
   Never improvise a "passed security check" claim.
7. **Write the note** (`ResearchNote`, department `crypto-onchain`):
   findings with evidence types; explicit sections for liquidity risk,
   venue quality, unlock/supply schedule (if sourced — cite where from),
   and holder concentration *where sourceable* (no normalized holders
   operation exists — absent data is a stated coverage gap, not a guess).
   Limitations: data freshness claims without SLA, DEX-derived pricing,
   label model risk.
8. **Hand off.** Positioning ideas → `portfolio-management`. Venue or
   counterparty recommendations → `independent-risk` (approval is theirs).

## Rules

- "Real-time" is a vendor claim without SLA for DEX providers — write
  "near-real-time (vendor claim)" and include `asOf`.
- Nansen-derived content never leaves internal artifacts.
- A token you couldn't verify on-chain does not get a note that reads as
  if you did.
