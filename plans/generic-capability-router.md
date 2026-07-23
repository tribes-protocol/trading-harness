# Generic capability commands — provider routing plan

**Status: PLAN ONLY — no code until approved.**
Authored 2026-07-23 from three exhaustive docs sweeps: BirdEye (91 reference pages),
CoinGecko Pro incl. onchain/GeckoTerminal (87 endpoints from the OpenAPI spec + every
reference page), Marketstack v2 (full endpoint list). Massive is excluded everywhere —
no subscription (operator decision); its removal already landed on the base branch.

## Goal

Capability-first commands with a primary provider and automatic fallback, returning **one
payload shape per capability regardless of which provider answered**. Example targets from
the operator: token price (BirdEye `/defi/price` ↔ CoinGecko `/simple/token_price`) and
OHLCV (BirdEye `/defi/v3/ohlcv` ↔ CoinGecko onchain token/pool OHLCV).

## The one structural insight

Routing is not per-capability — it is per **capability × identifier-kind (× chain)**.
"Price" means four different things: a chain+contract address (BirdEye-native), a CoinGecko
coin id (CoinGecko-only), a stock ticker (Marketstack-only), or an HL perp symbol
(venue-native). The router keys on that pair, which is also what makes a single output
schema per capability possible.

## Provider constraints that shape routing

| Provider      | Key in egress catalog (in-VM injectable) | Tier gates to respect                                                                                                                                                                                                       | Chain scope                                                          |
| ------------- | ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| BirdEye       | ✅                                       | Standard/Starter/Premium/Business gates per endpoint; two used endpoints are Business/Premium-documented                                                                                                                    | Multi-chain; much of the wallet/holder/transfer suite is Solana-only |
| CoinGecko Pro | ✅                                       | Analyst+ gates (movers, new coins, mcap chart, megafilter, onchain categories, token-OHLCV, top-holders); `circulating_supply_chart` is **Enterprise-only** (already-shipped `coin supply` may be dead on our key — verify) | Coin-id universe global; onchain per-network                         |
| Marketstack   | ✅                                       | `/v2/stockprice` is rate-limited to 1 call/min; intraday sub-quote fields need an IEX agreement                                                                                                                             | Stocks only, EOD-centric                                             |
| Nansen        | ✅                                       | —                                                                                                                                                                                                                           | Multi-chain, no `all` on some endpoints                              |
| Hyperliquid   | keyless                                  | —                                                                                                                                                                                                                           | Venue-native perps                                                   |

Routing consequences: (a) fallback must trigger on **401/403 (plan gate)**, not just
key-unset; (b) chain determines primary in places (e.g. wallet analytics: Solana → BirdEye,
EVM → Nansen — exactly how `wallet-data` already splits).

## Architecture

### 1. Capability adapters (thin, no service rewrites)

Each existing service gains nothing; a new `src/routing/` layer defines per-capability
interfaces and wraps existing service methods as adapters:

```
src/routing/Capabilities.ts   // interfaces: PriceSource, CandleSource, ProfileSource, …
src/routing/Adapters.ts       // birdeyePriceSource(service), coingeckoPriceSource(service), …
src/routing/Router.ts         // resolve(capability, identifier) → ordered chain → first success
src/types/Capability.ts       // the unified payload schemas (below)
```

A few adapters need **new service methods** for currently-unwired endpoints (marked NEW in
the matrix): CoinGecko `/simple/token_price/{platform}`, onchain `simple/token_price`,
onchain token OHLCV, onchain token snapshot/info; BirdEye `/defi/price` single;
Marketstack `/v2/stockprice`. All follow the existing service idiom.

### 2. Fallback semantics (the contract)

- Try providers in chain order; move to the next on: key unset, 401/403 (tier gate), 408 or
  network timeout, 429, any 5xx, schema-parse failure, or **empty payload** where data was
  expected.
- **Asset-not-found is FINAL, not a fallback trigger**, when the provider is authoritative
  for the identifier space (CoinGecko for coin ids, Marketstack for tickers). For
  contract-address lookups it IS a fallback trigger (indexing coverage differs per provider).
- One provider per response — never merged data.
- Unified envelope on every generic command:
  ```json
  { "source": "birdeye", "attempted": [{ "provider": "birdeye", "outcome": "ok" }], ...capability payload }
  ```
  On full failure: the attempted list with per-provider reasons, so the agent can report
  precisely ("BirdEye key unset, CoinGecko 429").

### 3. Unified payload schemas (one per capability)

`src/types/Capability.ts`, snake_case, `.nullish()` like everything else. The normalization
work is small because every existing service already emits trimmed shapes:

- `PriceQuote` — { symbol?, price_usd, market_cap_usd?, volume_24h_usd?, change_24h_pct?, liquidity_usd?, updated_at? }
- `CandleSeries` — **the existing candle contract, unchanged**: { candles: [{t,o,h,l,c,v}] } (v nullish; CoinGecko coin-OHLC has no volume)
- `TokenProfile` — identity + market block (price/mcap/fdv/liquidity/volume/holders?) + links?
- `TrendingList`, `NewListings`, `SearchResults`, `PoolSnapshot`, `HoldersList` — same trimming style

### 4. CLI surface

One new group: **`tribes-cli asset`** — asset-class-agnostic via identifier flags:

| Subcommand       | Identifier flags (exactly one form)                   | Chain flag    |
| ---------------- | ----------------------------------------------------- | ------------- |
| `asset price`    | `--address --chain` \| `--id` \| `--ticker`           | for contracts |
| `asset candles`  | same + `--timeframe/--days` per identifier space      |               |
| `asset profile`  | `--address --chain` \| `--id` \| `--ticker`           |               |
| `asset trending` | `--space onchain\|coins` (default onchain) `--chain?` |               |
| `asset new`      | `--space onchain\|coins`                              |               |
| `asset search`   | `--query` `--chain?` (chain given → onchain-first)    |               |
| `asset holders`  | `--address --chain`                                   |               |

Every subcommand: structured JSON, `--out`, the unified envelope. The existing
provider-named groups **stay** (they carry the provider-unique depth: BirdEye security/
holder cohorts, Nansen smart money, CoinGecko categories/global/treasury). Overlapping
provider subcommands are kept for compatibility but their skills stop being the default
path.

### 5. Skills

- New `skills/asset-data/SKILL.md`: the generic commands, identifier semantics, the
  envelope, and the fallback story ("source says who answered").
- Edits: token-analyst, market-strategist, fundamentals-analyst, technical-analyst,
  stock-analyst point their price/candle/profile/search flows at `asset …` first;
  provider-specific tables remain for unique depth. technical-analyst's candle recipe gains
  `asset candles … --out` as the one-liner source for every asset class.
- AGENTS.md routing map: one new row; existing rows untouched.

## The routing matrix (primary → fallback, per capability × identifier)

| Capability × identifier | Chain order                                                                                                        | Notes                                                                                                                                              |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| price × contract        | BirdEye `multi_price` → CG onchain `simple/token_price` (NEW) → CG `simple/token_price/{platform}` (NEW)           | The operator's example. BirdEye realtime all-chain; CG onchain realtime on paid; CG platform route needs the platform id (from `market platforms`) |
| price × coin-id         | CG `simple/price` (sole)                                                                                           | Authoritative id space — no fallback                                                                                                               |
| price × ticker          | Marketstack `stockprice` (NEW) → Marketstack latest EOD close (labeled `stale: true`)                              | 1-call/min limit on stockprice; EOD close is the honest fallback                                                                                   |
| price × perp-symbol     | Hyperliquid mark px (existing venue data)                                                                          | Venue-native                                                                                                                                       |
| candles × contract      | BirdEye `v3/ohlcv` → CG onchain token OHLCV (NEW; Analyst+, ≤6-month window/call)                                  | The operator's second example                                                                                                                      |
| candles × coin-id       | CG `coins/{id}/ohlc` (sole; no volume)                                                                             | `v` stays nullish                                                                                                                                  |
| candles × pool          | CG onchain pool OHLCV (existing) → BirdEye `v3/ohlcv/pair` (NEW)                                                   | CG currently primary because already wired + multi-chain                                                                                           |
| candles × ticker        | Marketstack EOD (existing, sole)                                                                                   | Intraday deferred (IEX constraint)                                                                                                                 |
| profile × contract      | BirdEye `token_overview` → CG onchain token snapshot+info (NEW) → CG `coins/{platform}/contract` (existing)        |                                                                                                                                                    |
| profile × coin-id       | CG `coins/{id}` (existing, sole)                                                                                   |                                                                                                                                                    |
| profile × ticker        | Marketstack `tickers/{symbol}` (existing, sole)                                                                    |                                                                                                                                                    |
| trending × onchain      | BirdEye `token_trending` → CG onchain trending_pools (existing)                                                    | Different semantics (tokens vs pools) — normalized to TrendingList rows                                                                            |
| trending × coins        | CG `search/trending` (existing, sole)                                                                              |                                                                                                                                                    |
| new × onchain           | BirdEye `new_listing` → CG onchain new_pools (existing)                                                            |                                                                                                                                                    |
| new × coins             | CG `coins/list/new` (existing, sole; Analyst+)                                                                     |                                                                                                                                                    |
| search                  | query only → CG `search` (existing); with `--chain` → BirdEye `v3/search` (NEW) → CG onchain search (existing)     |                                                                                                                                                    |
| holders × contract      | chain=solana → BirdEye holder (existing) → CG top_holders (Analyst+, beta); other chains → CG top_holders → (none) | The chain-keyed case                                                                                                                               |

Single-source capabilities stay in their provider groups untouched: token security, holder
cohorts, tx-level feeds, Solana wallet analytics (BirdEye); smart money (Nansen); categories,
global stats, exchanges/derivatives/treasury, supply (CoinGecko); stocks beyond the above
(Marketstack); perps venue (Hyperliquid).

## Testing

- Router unit tests: the full trigger matrix (key-unset / 401 / 429 / 5xx / timeout /
  empty / parse-fail / authoritative-not-found-is-final) with stub adapters.
- Payload-equivalence tests per capability: both adapters' outputs parse against the same
  schema for equivalent fixtures — this is the guarantee behind "same payload regardless of
  provider".
- CLI tests: envelope shape, identifier-flag validation (exactly one form).

## Phases (each a reviewable slice)

1. **Router core + `asset price` + `asset candles`** (the operator's two examples) with the
   NEW service methods they need, the skill, tests.
2. `asset profile`, `search`, `trending`, `new`.
3. `asset holders` (chain-keyed), pool candles fallback, stock `price` via stockprice.
4. Skill/doc consolidation: point the analyst skills' overlapping flows at `asset`.

## Out of scope (explicit)

- Massive/anything Massive-backed (no subscription).
- Merging providers within one response; caching; websockets; BirdEye perps API.
- Removing existing provider subcommands (compat kept; revisit after Phase 4).

## Open questions for the operator

1. `coin supply` runs on a CoinGecko **Enterprise-only** endpoint — confirm our key's plan;
   if not Enterprise, the command should be removed or marked degraded (separate from this
   plan, discovered by the sweep).
2. BirdEye `wallet-portfolio` rides a docs-deprecated endpoint; its successor
   (`current-net-worth`) is already wired — fold `wallet-portfolio` into it during Phase 3?
3. Group name `asset` — acceptable, or prefer capability-per-group (`price`, `candles` as
   top-level groups)?
