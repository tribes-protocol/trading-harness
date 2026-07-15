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

Answer by calling on-chain data providers **directly** (BirdEye, Nansen, Moralis, and Alchemy/
Helius RPC), reading keys from `.env`. Endpoints below; full catalog and auth details live in
`docs/inlined-provider-apis.md`.

## When to use

- Current price, liquidity, and volume snapshot for one identified token.
- Security and rug-risk audit (honeypot, ownership, mint authority) before touching a token.
- On-chain trade flow, whale buys/sells, transfers, holder concentration, and tokenomics.
- NOT for coin profiles, supply trends, or exchange listings — use `fundamentals-analyst`.
- NOT for trending tokens, new listings, or smart-money discovery — use `alpha-scout`.
- NOT for market-wide rankings, top movers, or multi-coin price tables — use `market-strategist`.
- NOT for pool, pair, or DEX questions — use `defi-analyst`.

## Data sources

These keys come from the environment — the same names the `src/common/Env.ts` constants
read (`process.env.*`), loaded from `.env`. Reference them directly by name in the calls below. In a bare shell, load them once with
`set -a; . ./.env; set +a`.

- **BirdEye** — `https://public-api.birdeye.so`, header `X-API-KEY` + `x-chain`. Primary source
  for price, security, trades, holders, creation, OHLCV.
- **Nansen** — `https://api.nansen.ai`, header `apiKey`, POST JSON. TokenGodMode flows, holders,
  indicators, who-bought-sold, pnl leaderboard.
- **Moralis** — `https://deep-index.moralis.io`, header `X-API-Key`. ERC-20 metadata/price.
- **Alchemy / Helius** RPC — raw native/SPL balance and contract reads.

`x-chain` values: `1 ethereum`, `10 optimism`, `56 bsc`, `137 polygon`, `8453 base`,
`42161 arbitrum`, `solana`.

## Endpoints (BirdEye unless noted)

| Need                     | Endpoint                                            |
| ------------------------ | --------------------------------------------------- |
| Name/symbol → address    | `GET /defi/v3/search?chain=<net>&keyword=&target=token` (chain is a QUERY param here, not the x-chain header; skip `search_mode=exact` — it over-filters) |
| Price (batch)            | `GET /defi/multi_price?list_address=`               |
| Overview (vol/liq)       | `GET /defi/token_overview?address=`                 |
| Security / rug flags     | `GET /defi/token_security?address=`                 |
| Creation info            | `GET /defi/token_creation_info?address=`            |
| Recent trades            | `GET /defi/v3/token/txs?address=`                   |
| Whale trades (by volume) | `GET /defi/v3/token/txs-by-volume?token_address=`   |
| Mint/burn                | `GET /defi/v3/token/mint-burn-txs?address=`         |
| Holder distribution      | `GET /holder/v1/distribution?token_address=&top_n=` |
| Historical price         | `GET /defi/history_price?address=&type=&time_from=&time_to=` |
| OHLCV                    | `GET /defi/ohlcv?address=&type=&time_from=&time_to=`|
| Deep flows / TGM (Nansen)| `POST /api/v1/tgm/{flows,holders,who-bought-sold,indicators,token-information}` |

## Workflow patterns

- **Quick price:** `/defi/multi_price` for spot; add `/defi/token_overview` for liquidity/volume.
- **Due diligence ("is X safe?"):** `/defi/v3/token/meta-data/multiple` → `/defi/token_security`
  (rug flags) → `/defi/v3/token/market-data/multiple` (mcap/liq/vol) → `/defi/token_creation_info`
  if the launch looks suspicious.
- **Charts/history:** `/defi/token_overview` for current context → `/defi/history_price`
  (`type` + `time_from`/`time_to`) for ranged history.
- **Trade/whale analysis:** `/defi/v3/token/txs` (recent) → `/defi/v3/token/txs-by-volume` (whales)
  → `/defi/txs/token/seek_by_time` (time-windowed) → `/defi/v3/all-time/trades/single` (lifetime),
  or Nansen `tgm/who-bought-sold` for buyer/seller breakdown.
- **Holders:** `/holder/v1/distribution` for concentration; Nansen `tgm/holders` for labeled holders.
- **Resolve a symbol first** with `/defi/v3/search?chain=<net>&keyword=`.

On a fixable error (wrong chain/address/param) adjust and retry (up to 2×) before giving up; on
429/5xx/auth, retry once then report plainly. If chain or address is missing, ask for the exact field.

## Rules

1. Resolve chain + token address BEFORE any data call. Given a symbol, resolve it with BirdEye
   `/defi/v3/search` and pick the row with the strongest liquidity/FDV/volume footprint; state
   which chain + asset you chose.
2. Reference each key from the environment (`.env`, exposed as the `src/common/Env.ts` constants) — e.g. `$BIRDEYE_API_KEY`. Never hardcode a key.
3. When presenting security findings, be direct about risks — lead with any red flag.
4. Always include timestamp/timeframe context with price data. Every claim traces to a response.
5. Run the follow-on pulls yourself (e.g. price → overview → security) — don't hand the user a
   menu. At most 1–2 refinement passes, then present the sharpened answer (AGENTS.md).
6. Render token addresses as tribes.xyz Markdown links, never bare addresses (AGENTS.md).
7. Verify Hyperliquid tradability before presenting a trade idea as actionable (AGENTS.md).

## Examples

### Security / rug-risk audit (contract known)

```bash
curl -s 'https://public-api.birdeye.so/defi/token_security?address=0x6982508145454ce325ddbe47a25d4ec3d2311933' \
  -H "X-API-KEY: $BIRDEYE_API_KEY" -H 'x-chain: ethereum' -H 'accept: application/json'
```

### Price + overview snapshot (resolve symbol first)

```bash
# 1) resolve WIF on solana → address (chain= is a query param; sort by liquidity to pick the real one)
curl -s 'https://public-api.birdeye.so/defi/v3/search?chain=solana&keyword=WIF&target=token&sort_by=liquidity&sort_type=desc&limit=5' \
  -H "X-API-KEY: $BIRDEYE_API_KEY" -H 'accept: application/json' \
  | jq -r '[.data.items[].result[]?] | sort_by(-(.liquidity//0)) | .[0] | {symbol,address,liquidity}'
# 2) overview for the resolved address
curl -s 'https://public-api.birdeye.so/defi/token_overview?address=<ADDR>' \
  -H "X-API-KEY: $BIRDEYE_API_KEY" -H 'x-chain: solana' -H 'accept: application/json'
```

### Whale flow (Nansen TokenGodMode)

Nansen bodies are **flat snake_case JSON** — no `parameters` wrapper. TGM endpoints take
`chain` + `token_address`; time-scoped ones (`who-bought-sold`, `flows`, `transfers`) use
`date:{from,to}` (YYYY-MM-DD), while `token-information`/`indicators`/`flow-intelligence` use a
`timeframe` enum (`5m|1h|6h|12h|1d|7d`).

```bash
PEPE=0x6982508145454ce325ddbe47a25d4ec3d2311933
FROM=$(date -u -v-7d +%F 2>/dev/null || date -u -d '7 days ago' +%F); TO=$(date -u +%F)
curl -s -X POST 'https://api.nansen.ai/api/v1/tgm/who-bought-sold' \
  -H "apiKey: $NANSEN_API_KEY" -H 'content-type: application/json' -H 'accept: application/json' \
  -d "{\"chain\":\"ethereum\",\"token_address\":\"$PEPE\",\"date\":{\"from\":\"$FROM\",\"to\":\"$TO\"},\"pagination\":{\"page\":1,\"per_page\":50}}"
```

## Error recovery

| Symptom                                   | Action                                                                          |
| ----------------------------------------- | ------------------------------------------------------------------------------- |
| 401 / 403 from a provider                 | The key in `.env` is missing/invalid — check it, then retry once.               |
| 429 / 5xx (rate limit or provider outage) | Wait briefly and retry once; if it still fails, stop and report plainly.        |
| Answer covers the wrong token             | Re-resolve via `/defi/v3/search` and rerun with the exact chain + address.      |
| Nansen 400/422 (body rejected)            | Body must be flat snake_case (no `parameters` wrapper); add the required `date:{from,to}`. |

## Related skills

- `fundamentals-analyst` — CoinGecko research profile of one listed coin.
- `alpha-scout` — discovery before a specific token is chosen.
- `market-strategist` — market-wide aggregates, rankings, and movers.
- `defi-analyst` — pools, pairs, and DEX activity.
- `technical-analyst` — indicator math and backtests on candles.
