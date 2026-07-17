# Moralis

- **Official docs:** https://docs.moralis.com — reviewed **2026-07-17**
- **API version:** EVM Web3 Data API v2.2 (`https://deep-index.moralis.io/api/v2.2`); Solana Data API unversioned (`https://solana-gateway.moralis.io`)
- **Auth:** API key in the `X-API-Key` header on every request. Env var: `MORALIS_API_KEY`
- **Research record:** [`docs/research/providers/moralis.json`](../research/providers/moralis.json)

## Verified capabilities (this adapter)

| Capability | Endpoint | Chains | Freshness | Notes |
| --- | --- | --- | --- | --- |
| `onchain.wallet_balances` | `GET /wallets/{address}/tokens` | ethereum, polygon, bsc, arbitrum, base, optimism, avalanche | realtime (near real-time, blocks p50 < 4s) | Cursor pages drained (bounded at 10); payload flagged `incomplete` if truncated. Spam filtering not applied (per-item `possible_spam` available upstream). 100 CU/request. |
| `onchain.wallet_balances` (Solana) | `GET /account/mainnet/{address}/portfolio` | solana | realtime | Native SOL (lamports) + SPL balances; no USD values on this endpoint. 10 CU. |
| `onchain.transfers` | `GET /wallets/{address}/history` | ethereum, polygon, bsc, arbitrum, base, optimism, avalanche | realtime | Decoded full wallet history, flattened to one Transfer per erc20/native sub-transfer; cursor pagination passed through (`nextCursor`). 150 CU/request. Solana: **not supported** (no documented endpoint). |
| `onchain.token_price` | `GET /erc20/{address}/price` | EVM chains above | realtime (DEX-derived) | 50 CU. `unverified` quality flag added when contract unverified or flagged possible spam. |
| `onchain.token_price` (Solana) | `GET /token/mainnet/{address}/price` | solana | realtime (DEX-derived) | 10 CU. |
| `onchain.dex_pairs` | `GET /erc20/{token_address}/pairs` | EVM chains above | realtime | 50 CU. Pairs without 24h volume are marked inactive by Moralis — mapped to a `stale` quality flag. Solana: **not supported** (no documented endpoint). |
| live probe | `GET /web3-api-version` | — | — | Used by `pi doctor --live`; minimal-quota documented request. |

Chain parameters are sent as documented hex chain ids (`0x1`, `0x89`, `0x38`, `0xa4b1`, `0x2105`, `0xa`, `0xa86a`). `bitcoin` and `other` are rejected with `NotSupportedError`.

## Freshness & history

- Official claims: blocks/transactions/transfers indexed near real time — freshness p50 < 4s, p90 < 8s; API latency p50 < 50ms. Derived metrics (holders, analytics, PnL) "may lag slightly during periods of high activity".
- Wallet history is marketed as the full decoded history of a wallet; per-chain genesis depth is not documented.
- Historical prices/balances available via `to_block`; maximum historical depth for OHLCV/other datasets is **not documented**.
- Most data endpoints are **mainnet-only**; chain support varies by feature.

## Rate limits & billing (per plan, docs 2026-07-17)

Billing is in Compute Units (CU) per request (e.g. token price 50 CU, wallet history 150 CU, DeFi positions 5,000 CU). Limits are evaluated over a **rolling 4-second window**; breaches return HTTP 429.

| Plan | Throughput | Quota |
| --- | --- | --- |
| Free | 40 rps | 40,000 CU/day |
| Starter ($49/mo) | 40 rps | 2M CU/month (+$11.25/M overage) |
| Pro ($199/mo) | 80 rps | 100M CU/month (+$5/M overage) |
| Business ($490/mo) | 200 rps | 500M CU/month (+$4/M overage) |
| Enterprise | custom | custom |

The adapter throttles itself to a conservative 10 rps (burst 10), shared across both Moralis hosts.

## Entitlements

- Free tier: core Data API only; DeFi API and premium endpoints excluded.
- DeFi API (positions/summary): Starter+ per pricing/premium-endpoints pages, though the endpoint page says Pro+ — **documented inconsistency, resolve before contracting**.
- Premium endpoints (token search, trending, analytics, insights, score): Pro+.
- None of the endpoints this adapter uses are plan-gated beyond the CU budget.

## Licensing / attribution / storage

- Terms: https://moralis.com/terms/ — no sublicensing or provisioning of the Services to third parties (s.1.1); treat data redistribution/resale as restricted pending vendor clarification. Internal research use is the safe envelope.
- **Attribution required on Free/Starter/Pro tiers** (not on Business/Enterprise); exact format not documented.
- Storage/caching of API responses is not explicitly addressed in the Terms.
- Best-efforts availability only below Enterprise; no outage compensation.

## Known limitations

- Crypto/onchain only — no equities, FI, FX, commodities, funds, or macro.
- **Prices and pairs are DEX-derived onchain data, never consolidated exchange tape. Thin-liquidity pairs can produce unrepresentative prices** — check `liquidityUsd`, and note the adapter surfaces `unverified` (unverified/possible-spam contracts) and `stale` (inactive pairs) quality flags. Upstream mitigations (`min_pair_side_liquidity_usd`, `max_token_inactivity`) exist for stricter workflows.
- Spam token contamination is a first-class problem; spam filters are opt-in flags, not defaults.
- No documented error response body schema and no retry/backoff guidance; the platform HTTP client's bounded exponential backoff applies.
- Active endpoint churn with short notice (e.g. Solana holders/discovery endpoints sunset 2026-07-31) — monitor https://docs.moralis.com/changelog.md.
- Undocumented: maximum OHLCV lookback, cursor expiry, default/max page sizes per endpoint.

## Institutional use

- **PRIMARY:** EVM wallet intelligence (decoded history, balances, net worth), token due diligence, DEX market microstructure.
- **FALLBACK:** EVM/Solana token pricing for display/valuation — for benchmark or consolidated pricing prefer a market-data aggregator as primary and use Moralis as an onchain cross-check.
- Never label Moralis data as exchange real-time consolidated tape; classify as near real-time onchain.
