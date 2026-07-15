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

Answer by calling **CoinGecko Pro** directly, reading the key from `.env`. Endpoints below; full
catalog and auth details live in `docs/inlined-provider-apis.md`.

> The former `tribes-cli exchange-analyst ask` backend proxy is **deprecated** — the backend is
> being retired. Run the pulls yourself.

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

## Data source

These keys come from the environment — the same names the `src/common/Env.ts` constants
read (`process.env.*`), loaded from `.env`. Reference them directly by name in the calls below. In a bare shell, load them once with
`set -a; . ./.env; set +a`.

CoinGecko Pro — `https://pro-api.coingecko.com`, header `x-cg-pro-api-key`.

Paths under `/api/v3`:

- Exchanges: `/exchanges`, `/exchanges/list`, `/exchanges/{id}`, `/exchanges/{id}/tickers`,
  `/exchanges/{id}/volume_chart[/range]`.
- Derivatives: `/derivatives`, `/derivatives/exchanges[/list]`, `/derivatives/exchanges/{id}`.
- Public treasuries: `/entities/list`, `/public_treasury/{entity}`,
  `/public_treasury/{entity}/{coin}/holding_chart`, `/{entity}/public_treasury/{coin}`,
  `/public_treasury/{entity}/transaction_history`.

## Rules

1. Reference each key from the environment (`.env`, exposed as the `src/common/Env.ts` constants) — e.g. `$BIRDEYE_API_KEY`. Never hardcode a key.
2. Encode venue, scope (spot exchange, derivatives, treasury), ordering, and time window in the
   request query params.
3. At most 2 passes per question: one broad pull, then one narrowed follow-up. Then report.
4. Findings here are research only — verify Hyperliquid tradability via the `hyperliquid` skill
   before presenting any asset as an actionable trade idea (AGENTS.md).
5. Perp/derivatives venue depth ON Hyperliquid still routes to the `hyperliquid` skill.

## Examples

### Rank centralized exchanges

```bash
curl -s 'https://pro-api.coingecko.com/api/v3/exchanges?per_page=10&page=1' \
  -H "x-cg-pro-api-key: $COIN_GECKO_PRO_API_KEY" -H 'accept: application/json'
```

### Derivatives exchanges by open interest

```bash
curl -s 'https://pro-api.coingecko.com/api/v3/derivatives/exchanges?order=open_interest_btc_desc&per_page=20' \
  -H "x-cg-pro-api-key: $COIN_GECKO_PRO_API_KEY" -H 'accept: application/json'
```

### Public treasury holdings for a coin

```bash
curl -s 'https://pro-api.coingecko.com/api/v3/companies/public_treasury/bitcoin' \
  -H "x-cg-pro-api-key: $COIN_GECKO_PRO_API_KEY" -H 'accept: application/json'
```

## Error recovery

| Symptom                                   | Action                                                                    |
| ----------------------------------------- | ------------------------------------------------------------------------- |
| 401 / 403                                 | The `COIN_GECKO_PRO_API_KEY` in `.env` is missing/invalid — check, retry. |
| 429 / 5xx (rate limit or outage)          | Wait briefly, retry once; if it still fails, stop and report plainly.     |
| Empty / off-topic result                  | Tighten the query (venue, ordering, coin) and retry once.                 |

## Related skills

- `fundamentals-analyst` — which exchanges list a specific coin (coin is the subject).
- `hyperliquid` — tradable Hyperliquid markets, your own positions, orders, and balances.
- `defi-analyst` — DEX pools, pairs, TVL, and on-chain liquidity.
- `market-strategist` — market-wide caps, dominance, rankings, and movers.
