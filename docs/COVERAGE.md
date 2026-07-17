# Asset-Class Coverage (honest map)

What the current provider set can and cannot support, per the documentation
research (`docs/research/providers/`). "Primary/Fallback" refers to registry
routing priorities in `src/registry/providers.json`.

| Asset class | Coverage | Primary | Fallback | Constraints (recorded, not hidden) |
|---|---|---|---|---|
| Global equities / ETFs / indices | EOD good; intraday weak | Marketstack | — | EOD only for non-US; intraday is US/IEX (not consolidated tape), bid/ask NULL without IEX entitlement; history plan-gated |
| Macro (US + intl) | Strong | FRED | — | Daily at best; revisions handled via ALFRED vintages; storage/caching prohibited by terms |
| Rates & credit | Reference-series level | FRED | — | Treasury curves, ICE BofA OAS etc. as series; no bond-level or dealer data |
| FX | Reference-rate level | FRED | — | Daily reference rates only; no tradable/intraday FX feed |
| Commodities | Spot/index series | FRED | Marketstack (plan-gated /commodities, 1 rpm) | No futures curves, no term structure |
| Futures / options / volatility surfaces | **Not covered** | — | — | No provider in the current set offers chains/curves/surfaces — flagged as a platform gap |
| Fixed income (instrument-level) | **Not covered** | — | — | No terms & conditions, pricing, or new-issue data |
| Crypto reference market data | Strong | CoinGecko Pro | Birdeye, Moralis | Cached aggregates (20-30s+); plan-gated history; never tick-real-time |
| Crypto DEX microstructure | Strong | Birdeye | Moralis, CoinGecko onchain | Vendor "real-time" without SLA; short retention on fine granularities |
| On-chain EVM (balances/transfers/RPC) | Strong | Alchemy / Moralis | — | CU-metered; indexing lag unquantified (Alchemy transfers) |
| On-chain Solana | Strong | Helius | Birdeye, Moralis | Helius embedded prices are hourly estimates (top-10k tokens) |
| Labeled flow intelligence | Unique | Nansen | — | Proprietary model estimates; strict redistribution limits; 4y rolling history |
| News | Good | NewsData.io | Tavily (topic=news) | Real-time not guaranteed; free tier delayed 12h; archive plan-gated |
| Web research / extraction | Good | Tavily | — | Web-derived: source vetting required; `answer` is LLM output |

## Rules derived from this map

1. Equity intraday output always carries `delayed` quality and the IEX-only
   caveat; EOD carries `eod`. No exceptions.
2. Anything priced off DEX data notes thin-liquidity risk for long-tail
   tokens.
3. Nansen-derived findings are `model_estimate` and internal-use-only.
4. FRED-based reports must include the FRED attribution string; FRED data
   is never disk-cached.
5. Requests for uncovered asset classes (options chains, futures curves,
   bond-level FI) must fail with `NotSupportedError` naming the gap rather
   than silently substituting a proxy.
