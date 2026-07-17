# Helius (Solana)

- **Official docs**: https://www.helius.dev/docs
- **Docs review date**: 2026-07-17
- **API version**: JSON-RPC 2.0 (Solana RPC / DAS / Helius RPC extensions); REST v0 (Enhanced Transactions, Webhooks — not used); REST v1 (Wallet API — Beta, not used)
- **Base URL (adapter)**: `https://mainnet.helius-rpc.com`
- **Auth**: env var `HELIUS_API_KEY` (sent as the documented `api-key` query parameter; the platform redaction layer strips it from logs/errors)
- **Research record**: [`docs/research/providers/helius.json`](../research/providers/helius.json)

## Verified capabilities (implemented in `src/providers/helius/adapter.ts`)

| Platform operation | Helius endpoint | Freshness | Quality flags | Notes |
| --- | --- | --- | --- | --- |
| `onchain.wallet_balances` (`getWalletBalances`) | DAS `getAssetsByOwner` (JSON-RPC POST, 10 credits/page) | realtime (indexed; `last_indexed_slot` semantics) | `estimated` whenever embedded USD values are present; `incomplete` if >10,000 assets truncated | Fungible tokens (`token_info.balance`) + native SOL (`nativeBalance`); NFTs excluded from token balances. `rawAmount` = raw base-unit integer string; `amount` = decimals-adjusted. |
| `onchain.transfers` (`getTransfers`) | `getTransfersByAddress` (Helius-exclusive JSON-RPC extension, 10 credits/request) | realtime (finalized commitment) | none | Reconciled token + native-SOL transfer objects. `solMode: "merged"` (WSOL merged into native SOL mint `So111...111`). Cursor via opaque `paginationToken`. **Requires Developer plan or higher.** |
| `healthCheck --live` | `getHealth` (standard RPC, 1 credit) | realtime | n/a | Cheapest documented probe; exactly one request. |

Solana-only: every method throws `NotSupportedError` for `chain !== "solana"`.

### Endpoint-selection note

The research record's `getTransactionsForAddress` returns *signatures* or *raw
transactions* (no parsed from/to/amount fields), so the platform `Transfer`
shape is served by its documented sibling `getTransfersByAddress`, which
returns parsed transfer objects with raw base-unit `amount` (string),
`decimals`, and `uiAmount`. `getTransactionsForAddress` (unlimited mainnet
history) remains the right tool for raw full-history transaction backfill and
can be added as a separate capability later. Enhanced Transactions (`/v0/...`)
is flagged legacy in the official Getting Data guide and is not used.

## Freshness & history

- **RPC / transfers**: real-time at `confirmed`/`finalized` commitment (`processed` unsupported on parsed/extension endpoints). Adapter pins `finalized`.
- **DAS balances**: near-real-time indexed; responses carry `last_indexed_slot`.
- **Embedded USD prices** (DAS `price_info`, `nativeBalance` price fields): update **hourly**, cover only the **top 10,000 tokens by market cap**, and are documented by Helius as *estimates, not real-time market rates* (DAS asset price data has a ~600 s cache). The adapter stamps `valueUsd` but flags the batch `estimated`. Never present these as market data — route pricing through a market-data provider.
- **History**: `getTransactionsForAddress` mainnet retention is documented as *Unlimited* (devnet 2 weeks; testnet unsupported). Token-account-level history before slot 111,491,819 has documented gaps/workarounds.

## Rate limits & credits (per plan)

| Plan | Credits | RPC | DAS / Enhanced | Notes |
| --- | --- | --- | --- | --- |
| Free ($0/mo) | 1M/mo | 10 rps | 2 rps | Wallet API 2 rps |
| Developer ($49/mo) | 10M/mo | 50 rps | 10 rps | unlocks `getTransfersByAddress` / `getTransactionsForAddress` |
| Business ($499/mo) | 100M/mo | 200 rps | 50 rps | LaserStream gRPC mainnet |
| Professional ($999/mo) | 200M/mo | 500 rps | 100 rps | +100 RPS purchasable |

Credit costs: standard RPC 1 (incl. `getHealth`); DAS 10; `getTransfersByAddress` 10; Enhanced Transactions 100; Wallet API 100. Credits do **not** roll over; exhaustion without autoscaling returns `429 max usage reached`. On 429 the docs prescribe exponential backoff (1 s doubling to 30 s, ±25% jitter, ≤5 attempts) — handled by the shared `HttpClient`. The adapter throttles client-side at a conservative 2 req/s (Free-plan DAS floor).

## Entitlements

- All plans (incl. Free): Solana RPC (mainnet+devnet), DAS, Enhanced Transactions, Priority Fee API, Webhooks, Wallet API, ZK Compression.
- Developer+: `getTransfersByAddress` (used by this adapter's `getTransfers`), `getTransactionsForAddress`, LaserStream WSS extensions.
- Business+: LaserStream gRPC mainnet, `sendBundle`. Professional: Pre-Confirmations, data add-ons. Enterprise: custom limits, SLA.

## Licensing / attribution / storage

- **Storage/caching**: not addressed in published terms — treat as *not documented*; clarify under an Enterprise agreement before persisting derived datasets externally.
- **Attribution**: not required.
- **Redistribution**: ToS §7(v) prohibits sublicensing/reselling/distributing Helius products — internal research use only.
- **Accuracy**: ToS §12 disclaims data accuracy; services are "as is". No SLA on self-serve plans; termination-at-will clause. OFAC-sanctioned use prohibited.

## Known limitations

- Solana mainnet/devnet only; no other chains or asset classes.
- Not a market-data provider: embedded prices are hourly top-10k estimates (see above).
- `getTransfersByAddress` needs Developer plan+; Free keys will fail `getTransfers`.
- Token-account history before slot 111,491,819 has documented completeness gaps — disclose in completeness-sensitive research.
- Raw DAS balances arrive as JSON numbers; balances above 2^53 base units lose precision upstream (recorded in lineage).
- No formal versioning/deprecation policy; no canonical JSON-RPC error schema (adapter maps errors defensively).
- Wallet API is Beta (not used by this adapter for that reason).

## Institutional use

- **PRIMARY**: Solana holdings/portfolio composition (this adapter's `getWalletBalances`), Solana transfer/transaction history and reconciliation (`getTransfers`), real-time Solana event monitoring (webhooks/LaserStream — not yet wrapped), entity tagging (Wallet API identity — not yet wrapped).
- **FALLBACK**: indicative USD valuations of Solana tokens (hourly estimates only, behind a dedicated market-data provider such as Birdeye/CoinGecko).
- **NOT SUITABLE**: real-time or historical market pricing for any asset class; any non-Solana data; redistribution of Helius outputs.
- Institutional deployment: Business/Professional minimum for throughput; Enterprise for SLA.
