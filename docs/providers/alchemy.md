# Alchemy

- **Official docs:** https://www.alchemy.com/docs (reviewed **2026-07-17**)
- **API version:** per-product path versioning — node/Enhanced APIs `v2`, NFT `v3`, Data/Portfolio `v1`, Prices `v1`. No global version or formal deprecation policy.
- **Auth:** env var `ALCHEMY_API_KEY`. The key is embedded in the **URL path** for node/Data APIs (`{network}.g.alchemy.com/v2/{key}`, `api.g.alchemy.com/data/v1/{key}/...`); the Prices API uses `Authorization: Bearer {key}`. The key is registered as a redaction secret at config load, and the adapter additionally rewrites error `endpoint` fields to key-free logical names.
- **Research record:** `docs/research/providers/alchemy.json`

## Verified capabilities

| Operation | Adapter method | Endpoint | Freshness | Quality flags |
|---|---|---|---|---|
| onchain.transfers | `getTransfers` | `alchemy_getAssetTransfers` (JSON-RPC POST, v2) | `delayed` (indexed pipeline; lag not quantified) | `delayed` |
| onchain.wallet_balances | `getWalletBalances` | `POST data/v1/{key}/assets/tokens/by-address` | `realtime` (current balances) | `estimated` when USD values derive from embedded prices; `incomplete` on per-token errors or truncated pages |
| onchain.token_price | `getTokenPrice` | `GET prices/v1/tokens/by-symbol` / `POST prices/v1/tokens/by-address` (Bearer) | `unknown` (refresh cadence undocumented) | `unverified` always; `lastUpdatedAt` propagated to `asOf` |

Live probe (`pi doctor --live`): a single `eth_blockNumber` call on `eth-mainnet` (10 CU, cheapest documented method).

## Chain → network mapping (documented networks only)

| Chain | JSON-RPC subdomain | Data/Portfolio API identifier |
|---|---|---|
| ethereum | `eth-mainnet` | `eth-mainnet` |
| polygon | `polygon-mainnet` | `matic-mainnet` |
| arbitrum | `arb-mainnet` | `arb-mainnet` |
| optimism | `opt-mainnet` | `opt-mainnet` |
| base | `base-mainnet` | `base-mainnet` |
| solana | — (not used by this adapter) | `solana-mainnet` (balances; prices-by-address unverified) |

All other chains raise `NotSupportedError`. Verify the official feature-support-by-chain matrix before adding a chain.

The Prices API by-address endpoint reuses the same network identifiers (the endpoint reference says networks "should match network enums"; only `eth-mainnet` is explicitly shown in its example) — identifiers other than `eth-mainnet` are **unverified** for the Prices API specifically.

## Freshness & history

- **Transfers:** indexed historical data by block range; `toBlock: indexed` implies indexing lag vs chain head (not quantified). `pageKey` cursors expire after **10 minutes** — the adapter never caches them, and callers must resume promptly or restart. The adapter's compound cursor scans the outgoing (`fromAddress`) leg, then the incoming (`toAddress`) leg (Alchemy accepts one direction per call). Categories requested: `external`, `erc20` (`internal` is limited to Ethereum/Polygon and excludes zero-value transfers, delegatecalls, miner rewards).
- **Balances:** current on-chain state; embedded `tokenPrices` freshness is undocumented.
- **Prices:** update frequency and maximum lookback are **not documented**. By-symbol is a volume-weighted composite across 10+ CEXes / 100+ DEXes (~1,000+ tokens); by-address is DEX-only (~10K+ tokens). Never present as exchange-grade real-time; inspect `asOf` (from `lastUpdatedAt`). Response shapes differ: by-symbol items carry `symbol`, by-address items carry `network` + `address` (no `symbol` — per the by-address endpoint reference); the adapter tolerates either and omits `token.symbol` when the provider does not return one. Currency casing varies across official examples (`usd` vs `USD`); matched case-insensitively, uppercased on output.

## Rate limits & entitlements

| Plan | Limits |
|---|---|
| Free | 30M CU/month, 500 CUPS (account-level); Prices API 300 req/hour; 5 apps / 5 webhooks |
| PAYG | $0.45/M CU (to 300M, then $0.40/M), 10,000 CUPS; Prices API 10K req/hour; Debug/Trace APIs, Gas Manager |
| Enterprise | Custom CU/CUPS/SLAs; Prices API without separate hourly cap |

- Throughput is **account-level** — a runaway job throttles every Alchemy consumer. The adapter self-throttles to ~4 req/s (≈300 CUPS at the heaviest documented 75 CU call), well under the Free-tier 500 CUPS. The Prices API 300 req/hour Free-tier cap is **not** separately enforced client-side — budget accordingly.
- On 429 the shared HTTP client honors `Retry-After` with jittered backoff, per Alchemy's documented guidance.
- HTTP 200 can still carry a JSON-RPC error object; the adapter detects this and raises `ProviderError`.

## Licensing / attribution / storage

- ToS v2.0 (2025-06-27): use limited to **internal business purposes**; no frame/mirror/sell/resell/rent/lease. Redistribution of Alchemy-served data to external clients requires enterprise terms.
- No attribution requirement documented; proprietary notices must not be removed.
- No explicit caching prohibition found, but long-term storage/re-serving of Alchemy-derived datasets needs legal review against the internal-use and no-resale clauses.

## Known limitations

- Crypto/on-chain only — no traditional asset classes.
- Prices API cadence/lookback undocumented → permanently `freshness: unknown`, `quality: [unverified]` here; use a dedicated market-data vendor as primary for pricing.
- Symbol price lookups carry symbol-collision risk; prefer chain+address (the adapter prefers it automatically when both are provided).
- The Beta `transactions/history/by-address` endpoint is "scheduled for removal" and is deliberately **not** used.
- Transfer category support and Data API availability vary per chain.
- Request payloads capped at 2.6 MB (HTTP 413).

## Institutional use

- **Primary:** historical transfer/flow reconstruction on documented EVM chains; EVM node RPC infrastructure.
- **Fallback:** multi-chain wallet balances (behind Helius for Solana, Moralis for EVM wallet intelligence); token prices (behind CoinGecko/Birdeye).
- **Not suitable:** regulated benchmark pricing, exchange-attributed tick data, external redistribution under the standard license.
