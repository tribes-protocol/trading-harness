---
name: token-analyst
description: >-
  Deep-dives into ONE identified token using real-time on-chain data. Handles: live and
  historical on-chain prices, security and rug-risk audits, on-chain trades and volume,
  smart-money flow direction, holder concentration, wallet-level transfer forensics, tokenomics
  red flags (mint/freeze authority, taxes, exit liquidity), and name-to-address resolution.
  Call for any question about a specific token's price, safety, trades, or holders. NOT for:
  coin profiles, historical coin charts, or supply data (use fundamentals-analyst); trending or
  new-token discovery (use alpha-scout); market-wide rankings or multi-coin prices (use
  market-strategist); pool or DEX analysis (use research-analyst).
allowed-tools: bash read
---

# Token Analyst

A playbook over structured commands: Pi runs the commands and does the synthesis itself — no
specialist agent sits behind this skill anymore. It OWNS the `tribes-cli token` group (Birdeye
primary with Moralis/CoinGecko-onchain fallbacks; the `source` field names the provider that
answered) and composes it with smart-money flows, wallet forensics, indicators, and headlines
into one token deep-dive. Follows the market-data reliability invariants in AGENTS.md
(sources + timestamps, facts vs interpretation, partial results). Research-only: this skill
never places orders. Requires an auth token (run `tribes-cli login` once on auth failures).

## When to use

- Current price, liquidity, and volume snapshot for one identified token.
- Security and rug-risk audit (honeypot flags, ownership, mint/freeze authority, taxes) before
  touching a token.
- On-chain flow direction (smart money net buying or selling), holder concentration, and
  transfer forensics on specific wallets around one token.
- The chart read on a token's own on-chain candles as one leg of a deep-dive.
- NOT for coin profiles, historical coin charts, or supply data — use `fundamentals-analyst`.
- NOT for trending tokens, new listings, or smart-money discovery — use `alpha-scout`.
- NOT for market-wide rankings, top movers, or multi-coin price tables — use `market-strategist`.
- NOT for pool, pair, or DEX questions — no structured source; use `research-analyst`.

## Command reference

Primary surface — `tribes-cli token` (structured JSON, seconds; all accept `--out <file>`;
chain ids: `1` Ethereum, `8453` Base, `56` BNB, `42161` Arbitrum, `10` Optimism, `137` Polygon,
`solana`):

| Subcommand | Purpose                                                                                | Required flags         |
| ---------- | -------------------------------------------------------------------------------------- | ---------------------- |
| `search`   | Resolve a name/symbol to chain + address                                               | `--query`              |
| `price`    | Live price + liquidity                                                                 | `--address`, `--chain` |
| `overview` | Mcap, FDV, liquidity, volume, 24h change, holder count                                 | `--address`, `--chain` |
| `ohlcv`    | Candles (`--interval 1m…1M`, `--limit ≤1000`, `--time-from`/`--time-to` epoch seconds) | `--address`, `--chain` |
| `security` | Rug-risk payload: mint/freeze authority, ownership, taxes, honeypot flags              | `--address`, `--chain` |
| `holders`  | Top holders (`--limit ≤100`)                                                           | `--address`, `--chain` |
| `trending` | Trending tokens on one chain (`--limit ≤50`, default solana)                           | none                   |

`trending` lives in this group, but discovery questions route to `alpha-scout`.

Composed commands from other groups (fast, structured; full docs in the owning skills):

| Command                                                                            | Purpose in the deep-dive                                                         | Owning skill        |
| ---------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | ------------------- |
| `smart-money token-flows --address <a> --chain <c> [--days 1-365]`                 | Net smart-money flow direction; check `granularity` (hourly ≤7 days, else daily) | `alpha-scout`       |
| `onchain transfers --address <a> --chain <c> [--limit 1-100]`                      | Direction-labeled transfer history of one WALLET (deployer, top holder)          | `wallet-analyst`    |
| `technicals indicators --address <a> --chain <c> [--interval 1D] [--limit 30-500]` | SMA/EMA/RSI/MACD/Bollinger/ATR/ROC + factual trend read on the token's candles   | `technical-analyst` |
| `news headlines --coin <symbol> [--size 1-50]`                                     | Fast catalyst leads; provider sentiment is `positive\|negative\|neutral` or null | `news`              |

Hard rules:

1. Resolve first: any ambiguous name or symbol goes through `tribes-cli token search` before
   anything else, and every later command uses the resolved chain + address. If search returns
   multiple plausible matches, present the candidates instead of guessing.
2. Render token addresses as tribes.xyz Markdown links, never bare addresses (AGENTS.md).
3. Taxes in the `security` payload are FRACTIONS of 1 (`0.05` = 5%), not percentages.
4. Verify Hyperliquid tradability before presenting a trade idea as actionable (AGENTS.md
   guardrail).
5. Every command here is fast — no `timeout` needed. The only slow path near this skill is
   `tribes-cli news fetch` (analyzed sentiment, needs `timeout 300`; owned by `news`).

## Examples

### Snapshot: resolve, then price + liquidity

```bash
tribes-cli token search --query "WIF"
tribes-cli token price --address EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm --chain solana
```

### Security / rug-risk audit (contract address known)

```bash
tribes-cli token security --address 0x6982508145454ce325ddbe47a25d4ec3d2311933 --chain 1
tribes-cli token holders --address 0x6982508145454ce325ddbe47a25d4ec3d2311933 --chain 1 --limit 20
```

Report mint/freeze authority, ownership, taxes (fractions of 1), and honeypot flags as facts
with source + as-of time; compute top-10 holder concentration yourself and label it a
calculation.

### Full deep-dive (one parallel batch after resolution)

Legs are independent — run them as ONE parallel batch (`--out` files with backgrounded
commands, or subagents). A leg that fails after one retry becomes a named gap, not a stop.

```bash
tribes-cli token overview --address EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm --chain solana --out /tmp/ta-overview.json
tribes-cli token security --address EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm --chain solana --out /tmp/ta-security.json
tribes-cli token holders --address EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm --chain solana --limit 20 --out /tmp/ta-holders.json
tribes-cli token ohlcv --address EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm --chain solana --interval 4H --limit 180 --out /tmp/ta-ohlcv.json
tribes-cli smart-money token-flows --address EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm --chain solana --days 7 --out /tmp/ta-flows.json
tribes-cli technicals indicators --address EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm --chain solana --interval 1D --limit 90 --out /tmp/ta-tech.json
tribes-cli news headlines --coin wif --size 10 --out /tmp/ta-news.json
```

Synthesize the deep-dive yourself, keeping the three layers visibly distinct:

- Facts: price, liquidity, mcap/FDV, holder count, security flags, flow totals, indicator
  values — every figure cited with its `source` field and an as-of timestamp.
- Calculations: top-N holder concentration, liquidity-to-mcap ratio, net flow direction over
  the window, indicator confluence — shown as your math on the cited facts.
- Interpretation: the whale-flow narrative and any verdict — labeled as a read with confidence
  and missing data named; never presented as guaranteed.

### Wallet-level forensics (a top holder or the deployer)

```bash
tribes-cli onchain transfers --address 0x28C6c06298d514Db089934071355E5743bf21d60 --chain 1 --limit 50
```

Use on wallet addresses surfaced by `holders` or `token-flows`: is the wallet accumulating,
distributing, or just moving funds between its own addresses?

## Error recovery

| Symptom                                                    | Action                                                                                                    |
| ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Auth error (unauthorized, expired token)                   | Run `tribes-cli login`, retry the original command once, then stop and report.                            |
| Result looks like the wrong token                          | Re-run `tribes-cli token search`, confirm chain + address, and re-run the command with the resolved pair. |
| `source` shows `moralis` or `coingecko-onchain`            | Not an error — Birdeye fell back; cite the provider that actually answered.                               |
| A `smart-money`/`onchain`/`news` leg reports a missing key | Continue with the remaining legs; name the gap in the report.                                             |
| Any other API failure                                      | Retry the same command once; if it fails again, stop and report the error.                                |

## Limitations

- No LP-lock detail and no mint/burn event history beyond what the `security` payload reports —
  the retired analyst agent used to fetch these; when they are material, state them as
  unverified rather than inferring them.
- The deep-dive narrative (whale intent, tokenomics quality) is Pi's own synthesis of the legs
  above — interpretation, never a guarantee.
- Coverage is the harness chains only (`1 8453 56 42161 10 137 solana`); tokens elsewhere have
  no structured source here.
- `holders` caps at 100 rows, so concentration math beyond the top 100 is not possible;
  `token-flows` rows are hourly only for windows ≤7 days, else daily.
- Pool- and pair-level analysis (LP composition, pool OHLCV) is out of scope — use
  `research-analyst`.

## Related skills

- `token-diligence` — PASS/CAUTION/FAIL pre-trade gate composed from these commands.
- `fundamentals-analyst` — CoinGecko profile and historical charts for one listed coin.
- `alpha-scout` — discovery before a specific token is chosen; owns the `smart-money` docs.
- `technical-analyst` — the indicator engine when the chart itself is the question.
- `wallet-analyst` — full portfolio analytics when a wallet, not a token, is the subject.
- `news` — analyzed per-token sentiment via the slow `news fetch` path.
