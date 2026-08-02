---
name: intel-smart-money
description: >-
  Market Intelligence discovery chain for on-chain smart-money behavior: what labeled smart
  wallets are buying and selling, who exactly moved, and whether those wallets deserve the
  weight — netflows and holdings first, then per-token buyer/seller attribution, then wallet
  verification through labels, PnL, and related-wallet expansion. Handles: accumulation vs
  distribution reads, smart-money rotation, wallet-cluster verification, and Hyperliquid perp
  positioning of top addresses — all written as observation artifacts. Call it during a
  Discovery pass or when a candidate needs an on-chain flow read. NOT for: one token's safety or
  holder table (use token-analyst); trending-token discovery (use alpha-scout); third-party
  wallet questions in user conversations (use wallet-analyst); promoting observations to signals
  (use validate-signal-score).
allowed-tools: bash read
---

# Intel: Smart Money

## Identity

- Stable id: `intel-smart-money` — owner: Market Intelligence. Invoked by: On-chain
  Intelligence.

## Purpose

Produce evidence-grade observations about smart-money behavior by chaining three questions:
WHAT is being accumulated or distributed (flows), WHO did it (attribution), and IS the who
credible (verification). A flow number without attribution and wallet verification is a weak
observation and is labeled as such. This skill observes; it never scores signals, never ranks
opportunities, never trades.

## Inputs

Required: the pass context (cycle id, scope — full sweep or one asset). Optional: a target
token address + chain from another observation; a wallet address to verify; the timeframe
(provider windows are fixed trailing-30d for most Nansen lenses — note it, don't fight it).

## Outputs

Observation artifacts (`.tribes/org/observations/`, per `org-protocol` envelope): facts =
flows/holdings/trades with provider timestamps; hypothesis = the labeled accumulation/
distribution/rotation read; every artifact records provider + command + `retrieved_at`, and the
known lens limits (trailing-30d windows, first page only, max 100 rows).

## Integration

- Flows: `tribes-cli smart-money netflow --limit 20`, `holdings`, `flow-intelligence --token
--chain --timeframe` (cohort netflows, 5m–7d timeframes), `flows` (daily series, ≤30d),
  `historical-holdings`.
- Attribution: `who-bought-sold --token --chain`, `dex-trades` (NOTE: `--token` filters BUYS
  only — sells need `who-bought-sold`), `pnl-leaderboard --token`, `dcas` (Solana).
- Perp positioning: `smart-money perp-trades`, `perp-leaderboard --token <SYMBOL>`,
  `address-leaderboard`.
- Verification: `tribes-cli wallet-data labels --wallet`, `pnl --wallet`, `related --wallet`,
  `counterparties`, `transactions`; Solana depth: `net-worth`, `balance-change`.
- All Nansen-backed; `wallet-data net-worth*`/`balance-change`/`transfer-total` are
  BirdEye-backed and Solana-only. Use `--out` for large outputs.

## Preconditions

- Auth token present (`tribes-cli login` once if commands 401).
- Chain scope decided: `--chain all` works for netflow/holdings/dex-trades but is REJECTED by
  token-list, screener, and historical-holdings — pick a concrete chain for those.
- For a token-scoped run: the exact token address and chain resolved first (via `token search`
  or the observation that triggered this run).

## Procedure

1. Sweep (or scope): `netflow --limit 20` for the accumulation/distribution board; `holdings`
   for stock-vs-flow context. Snapshot both with `--out` under `.tribes/org/snapshots/`.
2. For each token of interest: `flow-intelligence` (cohort split), `who-bought-sold` (top
   buyers AND sellers), `flows` for the daily shape.
3. Attribute: take the top 3–5 buyer/seller addresses → `wallet-data labels`, `pnl`, and
   `related` per address. A "smart" flow driven by one unlabeled wallet is a weak observation.
4. Perp check when the asset trades on Hyperliquid: `perp-leaderboard --token <SYMBOL>` and
   `perp-trades` for positioning skew of proven addresses.
5. Write one observation per finding with the accumulation | distribution | mixed | unclear
   read as hypothesis, the wallet evidence table in `payload`, and lens limits stated.

## Validation

- Every flow claim carries its window and units; buys-only lenses are never presented as net.
- Attribution exists for any strong read; otherwise the hypothesis is capped at `unclear`.
- Entity names from `entity-search` are names only (no addresses) — never claim an
  entity-to-wallet mapping the provider did not give.

## Risk & safety

- Read-only observation; no trading, no signal promotion, no wallet interactions.
- Smart-money labels are provider-defined (fixed cohort) — say so when weight rests on them.
- NEVER read `.tribes/privy-wallets.json`; the org's own wallets are out of scope here.

## Failure & retry

- Non-auth failure: retry the command once, then record the gap in the observation and move on.
- Auth failure: `tribes-cli login`, retry once, else stop and report.
- An empty lens (no smart-money activity) is a finding — record "no activity in window", not a
  failure.

## Timeouts & rate limits

- Standard reads: 60 s bash timeout. Per-pass budget per `org-protocol`: one sweep pair
  (netflow + holdings) reused across the pass; per-token chains only for shortlisted assets
  (≤5 per pass) — every lens is a billed Nansen call.

## Observability

- Observations under `observations/`, raw pulls under `snapshots/`, both carrying the cycle id;
  wallet-verification tables embedded in the artifact `payload`.

## Escalation

- Findings → Data Validation (`validate-signal-score` owns promotion).
- Provider failures after retry → Engineering work order (`eng-triage`).
- A flow contradicting a live thesis position → flag to the Intelligence Lead for expedited
  validation.

## Example

```bash
tribes-cli smart-money netflow --limit 20 --out .tribes/org/snapshots/20260101T120000Z-sm-netflow.json
tribes-cli smart-money who-bought-sold --token 0xTOKEN --chain base
tribes-cli wallet-data labels --wallet 0xTOPBUYER --chain base
```

Success: an observation `20260101T121500Z-token-sm-accumulation.json` — fact: +$2.1M net
smart-money inflow (24h window); attribution: 3 labeled funds among top buyers, verified
positive 30d PnL; hypothesis: accumulating; limits: trailing-30d, page 1.

## Acceptance

- [ ] Flow, attribution, and verification steps all ran (or the gap is stated).
- [ ] Every artifact records provider, command, window, and retrieval time.
- [ ] Buys-only lens never presented as net flow; entity names never mapped to addresses.
- [ ] Budget respected: one sweep per pass, ≤5 per-token chains.

## Related skills

- `alpha-scout` — interactive smart-money questions outside the org.
- `token-analyst` — the token's own safety/holder deep-dive.
- `wallet-analyst` — third-party wallet questions in user conversations.
- `validate-signal-score` — the only path from these observations to signals.
- `intel-derivatives-posture` — perp positioning proxies built on the same leaderboards.
- `org-protocol` — envelope, snapshots, budgets.
