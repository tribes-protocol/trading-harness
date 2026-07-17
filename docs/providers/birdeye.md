# Birdeye (Birdeye Data Services)

- **Official docs:** https://docs.birdeye.so/ (reviewed **2026-07-17**)
- **API version:** mixed per-endpoint families (`/defi/*` legacy, `/defi/v2/*`, `/defi/v3/*`, `/v1/wallet/*`); no formal versioning/deprecation policy — additive changelog only
- **Base URL:** `https://public-api.birdeye.so`
- **Auth:** API key in the `X-API-KEY` request header. Env var: `BIRDEYE_API_KEY`
- **Chain selection:** `x-chain` request header (default `solana`); the adapter maps the platform `Chain` enum to Birdeye chain names (solana, ethereum, polygon, arbitrum, optimism, base, bsc, avalanche); `bitcoin`/`other` are rejected
- **Research record:** `docs/research/providers/birdeye.json`

## Verified capabilities

| Capability | Endpoint | Notes |
|---|---|---|
| `onchain.token_price` (`getTokenPrice`) | `GET /defi/price` | Price by contract/mint address (`include_liquidity=true`); `updateUnixTime` → `asOf`; 3 CU |
| `onchain.token_ohlcv` (`getTokenOhlcv`) | `GET /defi/v3/ohlcv` | Intervals mapped 1m/5m/15m/30m/1h→1H/4h→4H/1d→1D/1w→1W/1mo→1M; max 5,000 candles per request; documented chain subset → adapter allows solana, ethereum, bsc, base only; dynamic CU 60/90/120 |
| `onchain.dex_pairs` (`getDexPairs`) | `GET /defi/v2/markets` | Markets/pools for a token, sorted by liquidity desc; `limit` 1–20 (adapter clamps); nullable per-market `price` |
| `onchain.wallet_balances` (`getWalletBalances`) | `GET /v1/wallet/token_list` | **Solana only** per docs; Beta and marked deprecated upstream (wallet v2 family exists); raw `balance` preserved as `rawAmount` decimal string |
| health probe | `GET /defi/networks` | One minimal utils-tier request used by `pi doctor --live` |

Identifier regime: contract/mint addresses per chain — the adapter refuses bare-symbol lookups and preserves the address in `providerIds.birdeye`.

## Freshness & history

- Vendor claims **real-time** but documents **no latency SLA or uptime guarantee**. `source.freshness` is stamped `realtime` per the registry entry; the registry notes carry the caveat. Never present Birdeye data as exchange-official or SLA-backed.
- Price responses carry `updateUnixTime` (mapped to `asOf`). Markets and wallet responses carry no timestamp — `asOf` is stamped from `receivedAt` (recorded in lineage).
- OHLCV retention documented only for second-level candles (1s: 2 weeks; 15s/30s: 3 months); minute+ lookback is **undocumented** — do not commit to backtesting depth without vendor confirmation.

## Rate limits & entitlements

| Plan | Documented limit |
|---|---|
| Standard (free) | 1 rps, 30k CU/month |
| Lite / Starter | 15 rps |
| Premium | 50 rps / 1,000 rpm (adds WebSockets, per pricing page) |
| Business | 100–150 rps / 1,500 rpm (unlocks batch/multi endpoints) |
| Enterprise | custom |

- Wallet v1 group (`/v1/wallet/*`) has an extra documented cap: 30 rps/150 rpm (the rate-limiting page also cites 30 rpm) — the adapter's client-side bucket is a conservative **1 rps** (free-tier floor); sustained wallet polling must additionally respect the group cap.
- Usage is metered in Compute Units per endpoint; OHLCV v3 CU is dynamic by candle count.
- `/defi/price`, `/defi/v3/ohlcv`, `/defi/v2/markets`, `/defi/networks` are available on all tiers incl. free Standard; `/v1/wallet/token_list` requires Lite+.
- Errors: `{"success": false, "message": "..."}` envelope; no machine-readable codes; no documented `Retry-After` header. The adapter maps 429 → `RateLimitError`, 401/403 → `EntitlementError`, and success:false-on-200 → `ProviderError`.

## Licensing / attribution / storage

- **Storage RESTRICTED:** public ToS clause 10.2.a prohibits copying/scraping/storing/reproducing data as written, with no API carve-out documented — **this adapter performs no disk caching** and platform-side persistence is disabled pending an enterprise agreement.
- **Redistribution prohibited** (ToS 10.2.c, 4.5). Outputs are internal-research-only.
- ToS states data is "not intended for actual trading purposes" — trading-adjacent use requires contractual cover.
- No attribution requirement documented.

## Known limitations

- Crypto/DEX only — no CEX order books, no non-crypto asset classes.
- Per-chain feature asymmetry: OHLCV v3 documents a 10-chain subset (adapter gates to solana/ethereum/bsc/base of the platform enum); wallet token list is Solana-only; Sui lacks several endpoints/fields.
- Registry lists broader chain coverage for OHLCV/wallet than the per-endpoint docs support — the adapter enforces the documented per-endpoint sets.
- Wallet `balance` arrives as a JSON number in the Solana example (digit string in the EVM example); the adapter accepts both and preserves digit strings exactly, but numeric values above 2^53 have already lost precision at the provider's JSON layer.
- Price/OHLCV methodology (pool weighting, outlier/wash-trade handling) is undocumented.

## Institutional use

- **PRIMARY** for multi-chain DEX market data: token prices by contract address, fine-grained OHLCV, pool/pair liquidity, long-tail token screening.
- **FALLBACK** for wallet balances (behind Helius on Solana; Moralis/Alchemy on EVM) and for historical crypto series for majors (lookback undocumented).
- Not suitable for regulated/auditable EOD valuation feeds or anything requiring an SLA.
