# Nansen

On-chain smart-money analytics and wallet/entity intelligence. Crypto-only.

- **Official docs:** https://docs.nansen.ai/ (reviewed **2026-07-17**)
- **API version:** v1 (path prefix `/api/v1/`); `/api/v1beta1/` backtesting family is beta and subject to breaking changes (not used by this adapter)
- **Base URL:** `https://api.nansen.ai`
- **Auth:** API key in the lowercase `apikey` request header. Env var: `NANSEN_API_KEY` (never logged; registered with the redactor)
- **Research record:** [`docs/research/providers/nansen.json`](../research/providers/nansen.json)

## Verified capabilities (implemented by `NansenAdapter`)

| Platform operation | Nansen endpoint | Method | Credits | Freshness | Notes |
| --- | --- | --- | --- | --- | --- |
| `onchain.labeled_flows` (`getLabeledFlows`) | `/api/v1/smart-money/netflow` | POST | 5 | realtime (rolling 1h/24h/7d/30d aggregates) | Smart-money cohort is proprietary model output → `evidenceType: model_estimate`, `labelSource: nansen`, quality `estimated`. Windows: `1h`, `24h` (`1d`), `7d` (`1w`), `30d` (`1mo`). Requires chain + token address — never bare symbols. |
| `onchain.wallet_balances` (`getWalletBalances`) | `/api/v1/profiler/address/current-balance` | POST | 1 | realtime | `hide_spam_token` pinned to `true`. Nansen returns decimal-adjusted `token_amount` only (no raw base units, no token decimals); `rawAmount` is a lossless digit-string encoding declared in lineage, quality `converted`. |
| health probe (`pi doctor --live`) | `/api/v1/search/general` | POST | 0 (per MCP tool table; REST-side cost absent from the API overview credit table — cheapest documented probe either way) | n/a | Single minimal-quota request; response body not consumed as data (search prices may be delayed per docs). |

Chain mapping: platform `bsc` ↔ Nansen `bnb`; `bitcoin` is Profiler-only (no Smart Money);
platform `other` is unsupported. Raw Nansen identity (`chain:token_address`) is preserved in
`token.providerIds.nansen`.

## Freshness and history

- Smart Money netflow: rolling 1h/24h/7d/30d windows over DEX trades + CEX transfers; latency not quantified by docs.
- Profiler balances: documented as "real-time token balance information".
- Historical smart-money holdings (not implemented): daily EOD UTC snapshots, 4-year rolling window, beta.
- Token screener retention (not implemented): ~130 min (minute) / ~50 h (hourly) / ~50 d (daily).

## Rate limits and credits

| Plan | Rate limit | Credits |
| --- | --- | --- |
| Free | 15 req/s, 300 req/min | 100 one-time trial credits + 10/day refill |
| Pro (all paid) | 75 req/s, 1,500 req/min | 2,000 starter credits (docs) — marketing page says 1,000; confirm at purchase |

- Per-endpoint overrides exist (e.g. `profiler/perp-trades` 5 req/min) — none apply to the endpoints used here.
- Credit metering on top of rate limits; monitor `X-Nansen-Credits-Remaining`, honor `Retry-After` on 429 (the shared HttpClient does).
- The adapter self-throttles conservatively at burst 5 / sustained 4 req/s (≤ 240 req/min), inside Free-plan limits.

## Entitlements

- Free keys can access all Pro endpoints but get **403** when `premium_labels: true` is sent.
- `premium_labels` default flipped from `true` to `false` on **2026-04-01** (per API changelog). It applies to `tgm/holders`, `tgm/pnl-leaderboard`, `tgm/perp-pnl-leaderboard`, `perp-leaderboard` — **none of the endpoints this adapter calls**, so the adapter does not send it. Any future use of those endpoints MUST pin `premium_labels` explicitly (5 vs 150 credit cost difference).
- No documented enterprise tier, SLA, or formal deprecation window.

## Licensing / redistribution — INTERNAL-USE-ONLY BY DEFAULT

Governed by Nansen's Data Redistribution Guidelines (updated 2025-11-18) + ToS. **Default
posture for this platform: treat all Nansen-sourced data as internal-use-only.** Per-endpoint:

- `smart-money/netflow` (used here): **Restricted** — external redistribution requires prior written approval, "significant modification", and attribution; anything resembling raw smart-money redistribution needs a ≥7-day delay. Internal research use is allowed.
- `profiler/address/current-balance` (used here): redistribution **allowed, no attribution required** — but the platform default remains internal-only.
- **Prohibited** (never expose externally, not consumed by this adapter): smart-money holdings, smart-money DEX trades/DCAs/perp-trades, address labels, PnL/perp leaderboards.
- Attribution, when redistributing attribution-tier data: "Powered by Nansen API" or a link to nansen.ai near the display.
- Storage/caching limits are not addressed in the guidelines; the ToS must be reviewed before any long-term persistence beyond internal research caches.

## Known limitations

- Crypto-only; no traditional asset classes.
- Chain support varies per endpoint (Smart Money ≈19-chain enum, Bitcoin Profiler-only, Solana lacks transaction lookup, TON lacks PnL).
- Smart-money labels are re-derived over time (30D/90D/180D windows) — live endpoints reflect *current* labels; only v1beta1 backtesting endpoints are temporally correct.
- Two documented error-body shapes (`{detail: ...}` FastAPI-style and `{error: {code, message}}`) — both map through the shared HTTP error taxonomy.
- Pagination exposes `is_last_page` only (no total count); the adapter requests up to 1,000 rows and truthfully flags `incomplete` when more pages exist.
- No official SDKs; REST only.

## Institutional use

- **PRIMARY:** smart-money flow intelligence (labeled netflows), wallet/entity due diligence and forensics, token holder-base analytics.
- **FALLBACK:** wallet balances (behind Helius for Solana and Moralis/Alchemy for EVM; registry priority 50), token OHLCV, DeFi portfolio positions.
- **NOT SUITABLE:** any customer-facing redistribution of smart-money data without legal approval; sub-minute exchange-grade market data; non-crypto assets.
