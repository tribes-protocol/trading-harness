# Lucy sunset — two-PR migration plan (from-scratch build)

Authored 2026-07-22 from a 29-agent audit of the terminal repo's legacy Lucy codepath
(`packages/core/src/lucy`, 313 files) and this harness at `main`. Branch:
`leo/lucy-migration-pr1`. Everything here is built fresh off `main` — no prior
integration branches are referenced or reused.

## The one fact that shapes everything

The harness's analyst surface is a **facade over Lucy today**: every entry in
`src/common/Analysts.ts` POSTs to `/agent/lucy/<slug>` on api.tribes.xyz, served by
apps/api `FinancialAgentService`, which imports 10 specialist agent classes from
`@tribes-terminal/core/lucy`. Deleting Lucy without a native cutover hard-breaks the
live harness skills. PR 1 therefore builds direct provider services in this repo and
cuts each analyst skill over; PR 2 deletes Lucy in the terminal repo.

## Cutover doctrine

Per analyst: a domain-named service (own fetch, zod-parsed, compact snake_case JSON), a
CLI command group, a SKILL.md rewrite that makes the pi agent the analyst (it composes
structured data commands and interprets them itself — the free-text `ask` LLM loop is
removed, not reimplemented), removal of the `ANALYSTS` registry entry + standalone
runner, and tests. `MarketService` / `tribes-cli market` (this branch) is the template.

## PR 1 — analyst cutovers (this repo), in order

| Analyst              | Providers to build                                                                                                                          | Status              |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- |
| market-strategist    | CoinGecko Pro (global, defi, history, top, movers, categories, new, price, search, trending)                                                | DONE on this branch |
| fundamentals-analyst | CoinGecko Pro coin deep-dive (history, ohlc, supply, tickers, contract data, exchange rates)                                                | DONE                |
| defi-analyst         | CoinGecko onchain/GeckoTerminal (pools, trades, pool OHLCV, trending/top/new pools, dex lists)                                              | DONE                |
| token-analyst        | BirdEye (price/overview/holders/trades, Solana) + Nansen (flows, PnL) + token security                                                      | DONE                |
| alpha-scout          | Nansen smart-money (netflow, holdings, DEX/perp trades, DCAs) + BirdEye trending/new listings                                               | DONE                |
| wallet-analyst       | Nansen wallet (balances, labels, counterparties, transfers) + BirdEye Solana PnL                                                            | DONE                |
| exchange-analyst     | CoinGecko exchanges/derivatives/treasury + Nansen perp screener + Hyperliquid order book                                                    | DONE                |
| stock-analyst        | Marketstack (candles/details/search) + NBBO/movers/status/news via apps/api `/stocks/*` (decision below)                                    | DONE                |
| research-analyst     | web search/extract via apps/api `/agent/web` (Tavily must stay proxied — see MITM) + ENS (Alchemy RPC + subgraph) + depth-crawl replacement | DONE                |
| technical-analyst    | net-new: indicator/backtest compute over unified OHLCV (BirdEye/Marketstack/Hyperliquid)                                                    | DONE                |

Finale: delete `src/common/Analysts.ts`, `src/helpers/AnalystCli.ts`, `src/helpers/Analyst.ts`,
and `src/types/Analyst.ts` once the last proxy entry is gone.

## Key contract (per provider)

Env-var names MUST match the control plane's egress billing entries
(`terminal/apps/api/src/utils/EgressBilling.ts`): `COIN_GECKO_PRO_API_KEY`,
`BIRDEYE_API_KEY`, `NANSEN_API_KEY`, `MARKETSTACK_API_KEY`, `FRED_API_KEY`,
`NEWSDATAIO_API_KEY`. Inside a sandbox the boot env carries catalog placeholders under
these names and the egress proxy swaps real keys at the TLS hop — the box never holds a
live credential. Empty key = the command group reports itself unavailable.

## PR 1b — terminal-repo extractions (must land before PR 2)

- **News pipeline**: `NewsAgent.invoke()` is the live producer for NewsDO (web news
  feed) — extract orchestration + News/Tavily helpers out of `lucy/` into apps/api.
- **Asset-context resolution**: `AssetContextService` is value-imported by apps/api
  (predictions relevance, news, token chat) and the backend AssetResolution queue job —
  extract with its transitive helpers.
- **LLM client + logger**: re-home `createAi` and the lucy logger wiring (apps/api,
  apps/backend, apps/telegram) to core/server.
- **Boot env**: terminal issue #2613 reconstructs the security work from PR #2586, including the
  exact catalog-placeholder projection into `SandboxBootEnv`. The harness never receives a live
  provider key. Historical PR #2573 is evidence for that accepted behavior, not a branch or merge
  dependency.
- zipbox TEST-SUITE.md items for the changed in-guest surface.

## PR 2 — Lucy deletion (terminal repo), blocked on PR 1 merge + fleet rebake/drain + PR 1b deploy

- Delete `packages/core/src/lucy`, the `/agent/lucy/*` + `/message/*` routes,
  FinancialAgentService/Controller, Messages DO, token chat, user memory/reflections
  (incl. user-DO memory handlers, `TelegramMigrationService.migrateMemory`, UI orphans),
  Slack feature-request notify, stock-fundamentals + equity-options tools (accepted
  loss), PredictionAgent (harness calls Polymarket direct; web PredictionService
  survives), the three LucyRuntime.ts files, the `./lucy` package export.
- apps/telegram dies with the sunset (strip turbo filters + scripts). **Keep
  `LUCY_BOT_TOKEN` in apps/api** — NotificationService + Telegram web-login HMAC use it.
- Keep `MassiveStocksHelper` while apps/api `/stocks/*` serves the stock-analyst slice.
- eslinter surgery: delete the two lucy-specific rules, strip lucy from four shared-rule
  regexes; the `lucy/` eslint plugin NAMESPACE prefix is unrelated — keep it.
- Tests: delete the lucy suite except `Prediction.test.ts` and `XStocks.test.ts`, which
  test surviving non-lucy code and relocate.
- Web chat surface is already dark (`LUCY_AGENT_ENABLED=false`) — delete with the rest.

## Egress / metering posture

1. Transparent MITM and explicit HTTP-proxy egress both enter the same tollbooth billing path.
   Neither transport is zero-rated.
2. A sandbox receives only the catalog placeholder under the exact provider environment variable.
   The egress boundary swaps the operator credential at the provider hop; this harness must never
   mint, store, log, or expose a live provider key.
3. Keyed requests stay on their cataloged provider origin and normal network path. Harness code
   must not install a billing bypass, direct-real-key fallback, global proxy override, or second
   pricing table.
4. A missing placeholder fails the affected command group closed. Keyless public hosts remain
   keyless; their traffic is not evidence that keyed provider traffic is unbilled.
5. The terminal repository owns placeholder projection and delivery, iron-proxy injection,
   metering, wallet settlement, and deployment evidence. This repository owns the native
   commands, provider request shape, redaction, routing, and tests.

Tavily remains deliberately outside the catalog because its credential is body-carried. Research
web search stays behind the JWT-authenticated apps/api `/agent/web` proxy; never inject a live
Tavily key into a VM. Massive is also not cataloged: stock NBBO/movers/status/news stay behind the
existing non-Lucy apps/api `/stocks/*` endpoints rather than adding a direct in-VM provider path.

## Open decisions (defaults chosen, flag to change)

- `ask` removed per cutover doctrine — one-shot free-text analysts become multi-step
  data composition by the agent.
- Telegram conversational bot retires in PR 2 (bot account + token live on for
  login/notifications).
- Equity options + SEC fundamentals: dropped with no harness successor.
