---
name: wallet-analyst
description: >-
  Portfolio analytics for any wallet address. Handles: net worth and its trend over time,
  realized and unrealized PnL (overall and per-token), balance changes, transfer tracking, and
  transaction history. Call when the question is how a wallet performed or what happened in it —
  the agent's own or any third-party address. NOT for: wallet addresses/IDs or raw pre-trade
  balances (use wallet); live Hyperliquid positions, orders, or perp/spot balances (use
  hyperliquid).
allowed-tools: bash read
---

# Wallet Analyst

Answer by calling portfolio providers **directly** — BirdEye for wallet net worth/PnL/history,
Nansen profiler for address analytics, Alchemy/Helius RPC for raw balances — reading keys from
`.env`. Endpoints below; full catalog and auth details live in `docs/inlined-provider-apis.md`.

> The former `tribes-cli wallet-analyst ask` backend proxy is **deprecated** — the backend is
> being retired. Run the pulls yourself.

## When to use

- Net worth now or its trend over time (24h/7d/30d).
- Realized and unrealized PnL, overall or per-token.
- Transfer activity, transaction history, balance changes.
- Attribution: why a wallet's value changed over a period.
- NOT for the agent's addresses, wallet IDs, or a raw balance snapshot before a trade — use
  `wallet`.
- NOT for Hyperliquid positions, open orders, or perp/spot balances — use `hyperliquid`.

## Data sources

These keys come from the environment — the same names the `src/common/Env.ts` constants
read (`process.env.*`), loaded from `.env`. Reference them directly by name in the calls below. In a bare shell, load them once with
`set -a; . ./.env; set +a`.

- **BirdEye** — `https://public-api.birdeye.so`, header `X-API-KEY` + `x-chain`:
  net worth `/wallet/v2/current-net-worth` & `/wallet/v2/net-worth`, details
  `/wallet/v2/net-worth-details`, PnL `/wallet/v2/pnl` & `/wallet/v2/pnl/summary`, balance change
  `/wallet/v2/balance-change`, holdings `/v1/wallet/token_list`, tx history `/v1/wallet/tx_list`.
- **Nansen profiler** — `https://api.nansen.ai`, header `apiKey`, POST:
  `POST /api/v1/profiler/address/{current-balance,historical-balances,transactions,counterparties,related-wallets,pnl,pnl-summary,labels}`.
- **Alchemy / Helius** RPC (`ALCHEMY_API_KEY` / `HELIUS_API_KEY`) for raw native/SPL balance reads.

`x-chain` values: `1 ethereum`, `10 optimism`, `56 bsc`, `137 polygon`, `8453 base`,
`42161 arbitrum`, `solana`.

## Rules

1. Reference each key from the environment (`.env`, exposed as the `src/common/Env.ts` constants) — e.g. `$BIRDEYE_API_KEY`. Never hardcode a key.
2. Always analyze a specific address. For "my" wallet, get the address from `tribes-cli wallet
   list` first, then query that exact address — NEVER assume a default.
3. Pick the right chain (`x-chain`) for the wallet; run per-chain if the wallet spans chains.
4. Run the follow-on pulls yourself (net worth → PnL → balance-change attribution); at most 1–2
   refinement passes, then present the sharpened answer (AGENTS.md).
5. Render token/wallet addresses shown to the user as tribes.xyz Markdown links (AGENTS.md).

## Examples

### Portfolio snapshot (holdings + net worth)

```bash
curl -s 'https://public-api.birdeye.so/wallet/v2/current-net-worth?wallet=<ADDRESS>&sort_by=value_usd&sort_type=desc&limit=100&offset=0' \
  -H "X-API-KEY: $BIRDEYE_API_KEY" -H 'x-chain: solana' -H 'accept: application/json'
```

### Performance review (PnL summary)

```bash
curl -s 'https://public-api.birdeye.so/wallet/v2/pnl/summary?wallet=<ADDRESS>&duration=30d' \
  -H "X-API-KEY: $BIRDEYE_API_KEY" -H 'x-chain: solana' -H 'accept: application/json'
```

### Address activity (Nansen profiler transactions)

```bash
curl -s -X POST 'https://api.nansen.ai/api/v1/profiler/address/transactions' \
  -H "apiKey: $NANSEN_API_KEY" -H 'content-type: application/json' -H 'accept: application/json' \
  -d '{"parameters":{"address":"<ADDRESS>","chain":"ethereum","timeframe":"7d"}}'
```

## Error recovery

| Symptom                                   | Action                                                                          |
| ----------------------------------------- | ------------------------------------------------------------------------------- |
| 401 / 403 from a provider                 | The key in `.env` is missing/invalid — check it, then retry once.               |
| 429 / 5xx (rate limit or outage)          | Wait briefly, retry once; if it still fails, stop and report plainly.           |
| Result covers the wrong / empty wallet    | You used the wrong address or chain — rerun with the address from `wallet list`.|
| Nansen body shape rejected (400)          | Adjust the `parameters` body; fall back to the BirdEye wallet endpoints.        |

## Related skills

- `wallet` — addresses, wallet IDs, and raw balance JSON needed before execution.
- `hyperliquid` — live Hyperliquid balances, positions, and open orders.
- `transaction` — broadcast prepared transactions and check a transaction's status.
