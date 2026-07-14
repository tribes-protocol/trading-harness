---
name: alpha-scout
description: >-
  Discovers opportunities BEFORE a specific token is chosen. Handles: trending tokens, new token
  listings, and smart-money flows and accumulation. Call to find what is hot or where smart money
  is rotating. NOT for: one identified token's price, safety, or trades (use token-analyst);
  market-wide rankings or top movers (use market-strategist); trending pools (use defi-analyst).
allowed-tools: bash read
---

# Alpha Scout

Backing command group: `tribes-cli alpha-scout`. Queries BirdEye for trending, new listings, and
search; Nansen for smart-money flows; CoinGecko for freshly updated token metadata. Returns JSON.
Requires `BIRDEYE_API_KEY`, `NANSEN_API_KEY`, and `COIN_GECKO_PRO_API_KEY` (already set in `.env`).

## When to use

- What is trending or newly listed on a chain, before any token is chosen.
- Where smart money is flowing: net flow, holdings, DEX trades, perp trades, DCA positions.
- Resolving a name/symbol/address to a token on a specific chain.
- NOT for one identified token's price, safety, holders, or trades — use `token-analyst`.
- NOT for market-wide caps, rankings, or top movers — use `market-strategist`.
- NOT for liquidity pools or pair-level discovery — use `defi-analyst`.

## Hard rules

1. Output is JSON on stdout. Every subcommand also accepts `--out <file>`.
2. These commands answer in seconds; a default bash timeout is enough.
3. **Chain is not optional in practice.** BirdEye commands are chain-scoped and default to
   `solana`; pass `--chain` explicitly for anything else. `search` returns an EMPTY result set
   for a chain it was not given — an empty list means "not on that chain", never "does not exist".
4. `trending` is ranked, rank 1 = most trending. The default `--sort-type asc` returns the top;
   `desc` returns the bottom of the list.
5. Nansen `--chains` takes exact provider names (`ethereum`, not `eth`), comma-separated.
6. Discovery output is a candidate list, not a recommendation. Verify Hyperliquid tradability
   before presenting anything as executable (AGENTS.md guardrail).
7. Relay exact figures. A `null` field means the provider had no value — say so, never guess.

## Command reference

| Subcommand               | Purpose                                           | Required flags    | Read-only or signed |
| ------------------------ | ------------------------------------------------- | ----------------- | ------------------- |
| `trending`               | Trending tokens on one chain                      | —                 | read-only           |
| `new-listings`           | Newly listed tokens on one chain                  | —                 | read-only           |
| `smart-money-tokens`     | Tokens ranked by smart-trader count or net flow   | —                 | read-only           |
| `search`                 | Find tokens/markets by name, symbol, or address   | `--query`         | read-only           |
| `recently-updated`       | Tokens whose on-chain metadata was just refreshed | —                 | read-only           |
| `sm-netflow`             | Smart-money net flow per token                    | `--chains`        | read-only           |
| `sm-holdings`            | What smart money currently holds                  | `--chains`        | read-only           |
| `sm-historical-holdings` | Smart-money holdings over a date range            | `--chains --from` | read-only           |
| `sm-dex-trades`          | Recent smart-money DEX trades                     | `--chains`        | read-only           |
| `sm-perp-trades`         | Recent smart-money perp trades (venue-wide)       | —                 | read-only           |
| `sm-dcas`                | Smart-money DCA positions (venue-wide)            | —                 | read-only           |

BirdEye chains: `solana`, `ethereum`, `base`, `bsc`, `arbitrum`, `optimism`, `polygon`,
`avalanche`, `sui`, `zksync`. Nansen chains: `ethereum`, `solana`, `base`, `bnb`, `arbitrum`,
`optimism`, `polygon`, `avalanche`, `hyperevm`, `linea`, `mantle`, `monad`, `all`.
`sm-historical-holdings` covers only `base`, `bnb`, `ethereum`, `monad`, `solana`.

Common options: `--limit`, `--page` (Nansen), `--out <file>`.

## Examples

### What is hot right now

```bash
tribes-cli alpha-scout trending --chain solana --limit 10
tribes-cli alpha-scout new-listings --chain base --limit 10
```

### Where smart money is rotating

```bash
tribes-cli alpha-scout sm-netflow --chains ethereum,base --limit 15
tribes-cli alpha-scout smart-money-tokens --interval 7d --sort-by net_flow --limit 10
```

### Smart-money activity, trade by trade

```bash
tribes-cli alpha-scout sm-dex-trades --chains ethereum --limit 20
tribes-cli alpha-scout sm-perp-trades --limit 20
```

### Resolve a token on a chain

```bash
tribes-cli alpha-scout search --query pepe --chain ethereum --limit 5
```

## Post-discovery checklist

1. Verify Hyperliquid tradability before presenting ideas as executable (AGENTS.md guardrail).
2. IF the request was unscoped, THEN add securities (`stock-analyst`) and commodities
   (`commodity-analyst`) passes; see AGENTS.md.
3. Hand off a chosen token: on-chain deep-dive → `token-analyst`; profile → `fundamentals-analyst`.

## Error recovery

| Symptom                                            | Action                                                                               |
| -------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `BIRDEYE_API_KEY is not set` (or Nansen/CoinGecko) | The key is missing from the environment. Stop and report.                            |
| Empty `search` result                              | Wrong chain, not a "not found". Retry once on the chain the token actually lives on. |
| Empty `sm-dcas` / `sm-perp-trades`                 | No smart-money rows right now. Report the gap; do not retry in a loop.               |
| Any other API failure                              | Retry the same command once; if it fails again, stop and report the error.           |

## Related skills

- `token-analyst` — deep-dive on one identified token (price, security, trades, holders).
- `fundamentals-analyst` — research profile of one listed coin.
- `hyperliquid` — tradability verification and execution for discovered ideas.
