# trading-harness

Autonomous Hyperliquid trading harness for the [Pi coding agent](https://github.com/earendil-works/pi-coding-agent). Pi runs the wallet CLI, the Hyperliquid skill, and the hourly trading loop. You talk to Pi.

`AGENTS.md` is the operating constitution.

## How it runs

This repo **is** the agent's workspace. In a Tribes sandbox the control plane clones it into `/workspace`, runs `bootstrap.sh` once to install deps and build everything, injects the agent's authorization key + RPC/provider env, and launches `pi`. Auth is already wired at provisioning — **there is no manual login step**.

To run it locally instead:

```bash
bun run bootstrap.sh   # install deps + build the world (ata CLIs, extensions, all skills)
pi                      # start the harness
```

Pi reads `.pi/settings.json` and `AGENTS.md`, then starts the trading harness. Everything below is a prompt to Pi.

## Environment

Set these in the sandbox/runtime env (never commit secrets):

| Variable          | Purpose                                      |
| ----------------- | -------------------------------------------- |
| `API_BASE_URL`    | Tribes API base (LLM proxy + wallet backend) |
| `PRIVY_APP_ID`    | Privy app for the agent wallet               |
| `ALCHEMY_API_KEY` | EVM RPC (Base/Eth/BSC/Arb/Optimism/Polygon)  |
| `HELIUS_API_KEY`  | Solana RPC                                   |

Direct wallet CLI usage from the workspace root, injecting a bearer token:

```bash
API_BEARER_TOKEN="$(bun src/cli/llm-token.ts)" \
  bun .pi/skills/wallet/src/cli/Wallet.ts list
```

## Trading

Deposit into Hyperliquid (bridge minimum is 5 USDC):

```bash
bun .pi/skills/hyperliquid/src/cli/Hyperliquid.ts deposit --amount 25 --from <0x-privy-wallet>
```

Withdraw USDC:

```bash
bun .pi/skills/hyperliquid/src/cli/Hyperliquid.ts withdraw --amount 2 --from <0x-privy-wallet> --destination <0x-evm-address>
```

Transfer USDC between spot and perp wallets:

```bash
bun .pi/skills/hyperliquid/src/cli/Hyperliquid.ts transfer-usd-class --amount 2 --from <0x-privy-wallet> --direction spot-to-perp
```

Place a perp order:

```bash
bun .pi/skills/hyperliquid/src/cli/Hyperliquid.ts trade-perp --from <0x-privy-wallet> --coin BTC --side long --type market --amount 0.001
```

Place a spot order:

```bash
bun .pi/skills/hyperliquid/src/cli/Hyperliquid.ts trade-spot --from <0x-privy-wallet> --pair HYPE/USDC --side buy --type market --amount 10
```

## Layout

```text
AGENTS.md                  # Operating constitution
bootstrap.sh               # First-boot: install deps + build the world
src/                       # ata code (@/*) + shared foundation utilities (@foundation/*)
  cli/                     # agent-key, llm-token, token CLIs
  common/ helpers/ services/ types/ utils/
.pi/
  settings.json            # Pi provider/model config
  extensions/tribes.ts     # the one extension: provider + welcome + wallet warm-up
  skills/                  # real skill dirs (hyperliquid, wallet, transaction, analysts, …)
tests/                     # Unit tests
```

## Security

- Never paste secrets into Pi prompts, summaries, or commits.
- Wallet private keys live in Privy; RPC/API keys come from the environment.
- `.env*` and `.pi/*.json` wallet/key snapshots are gitignored.

## References

- Privy Agent Wallet CLI: <https://docs.privy.io/recipes/agent-integrations/agent-cli>
- Hyperliquid API: <https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api>
