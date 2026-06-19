# trading-harness

Autonomous Hyperliquid trading harness for the [Pi coding agent](https://github.com/earendil-works/pi-coding-agent). Pi runs the wallet CLI, the Hyperliquid skill, and the hourly trading loop. You talk to Pi.

`AGENTS.md` is the operating constitution.

## How it runs

This repo **is** the agent's workspace. In a Tribes sandbox the control plane clones it into `/workspace`, runs `bootstrap.sh` once to install deps **and compile the whole project into a single `tribes-cli` binary installed on PATH**, injects the agent's authorization key + RPC/provider env, and launches `pi`. Auth is already wired at provisioning — **there is no manual login step**.

To run it locally instead:

```bash
bun run bootstrap.sh   # install deps + compile the tribes-cli binary, then install it globally
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

On startup the `tribes` extension writes `API_BASE_URL`, `PRIVY_APP_ID`, and a freshly
minted `API_BEARER_TOKEN` into `.env` (refreshed every 24h). The `tribes-cli` binary
auto-loads `.env` from the workspace, so every command reads its config straight from it —
no token prefix on any command.

Direct wallet CLI usage from the workspace root:

```bash
tribes-cli wallet list
```

## Trading

Deposit into Hyperliquid (bridge minimum is 5 USDC):

```bash
tribes-cli hyperliquid deposit --amount 25 --from <0x-privy-wallet>
```

Withdraw USDC:

```bash
tribes-cli hyperliquid withdraw --amount 2 --from <0x-privy-wallet> --destination <0x-evm-address>
```

Transfer USDC between spot and perp wallets:

```bash
tribes-cli hyperliquid transfer-usd-class --amount 2 --from <0x-privy-wallet> --direction spot-to-perp
```

Place a perp order:

```bash
tribes-cli hyperliquid trade-perp --from <0x-privy-wallet> --coin BTC --side long --type market --amount 0.001
```

Place a stop-loss perp order (stop-market or stop-limit):

```bash
tribes-cli hyperliquid trade-perp --from <0x-privy-wallet> --coin BTC --side short --type stop_market --trigger-px 58000 --amount 0.001 --reduce-only
tribes-cli hyperliquid trade-perp --from <0x-privy-wallet> --coin BTC --side short --type stop_limit --trigger-px 58000 --price 57900 --amount 0.001 --reduce-only
```

Place a take-profit perp order (take-market or take-limit):

```bash
tribes-cli hyperliquid trade-perp --from <0x-privy-wallet> --coin BTC --side short --type take_market --trigger-px 72000 --amount 0.001 --reduce-only
tribes-cli hyperliquid trade-perp --from <0x-privy-wallet> --coin BTC --side short --type take_limit --trigger-px 72000 --price 71900 --amount 0.001 --reduce-only
```

Place an atomic bracket (entry + linked take-profit and stop-loss as OCO) by adding `--tp-px`/`--sl-px`:

```bash
tribes-cli hyperliquid trade-perp --from <0x-privy-wallet> --dex xyz --coin MSFT --side long --type market --amount 1.307 --tp-px 405.56 --sl-px 371.13
```

Place a TWAP perp order (slices the order over a duration) and cancel it by id:

```bash
bun src/cli/Hyperliquid.ts twap-perp --from <0x-privy-wallet> --coin BTC --side long --amount 0.5 --duration-minutes 30 --randomize
bun src/cli/Hyperliquid.ts twap-cancel --from <0x-privy-wallet> --coin BTC --twap-id 1234
```

List open perp positions (read-only; `--all-dexes` sweeps main + every perp dex):

```bash
bun src/cli/Hyperliquid.ts list-positions --address <0x-evm-address> --all-dexes
```

Place a spot order:

```bash
tribes-cli hyperliquid trade-spot --from <0x-privy-wallet> --pair HYPE/USDC --side buy --type market --amount 10
```

## Layout

All executable code lives under a single root `src/` (one alias: `@/*` -> `./src/*`). Every
command builder is composed into one entry, `src/cli/Tribes.ts`, which `bootstrap.sh` compiles
into the `tribes-cli` binary. Each skill under `.pi/skills/<slug>/` is **documentation only** —
its `SKILL.md` points the agent at the matching `tribes-cli <group>` command.

```text
AGENTS.md                  # Operating constitution
bootstrap.sh               # First-boot: install deps + compile tribes-cli, install it globally
src/                       # ALL code: command builders + shared foundation (@/*)
  cli/                     # Tribes.ts (the tribes-cli entry) + one builder per group:
                           #   Wallet, Hyperliquid, Transaction, SpotTrading, Token, News,
                           #   Macros, WebSearch, Prediction, 9 analysts
  common/ helpers/ services/ types/ utils/
.pi/
  settings.json            # Pi provider/model config
  extensions/
    tribes/                # LLM provider + proxy bearer token + welcome + wallet warm-up
    hyperliquid/           # live Hyperliquid positions/status widget
  skills/<slug>/SKILL.md   # skill docs only (no code); run via tribes-cli <group>
```

## Security

- Never paste secrets into Pi prompts, summaries, or commits.
- Wallet private keys live in Privy; RPC/API keys come from the environment.
- `.env*` and `.pi/*.json` wallet/key snapshots are gitignored.

## References

- Privy Agent Wallet CLI: <https://docs.privy.io/recipes/agent-integrations/agent-cli>
- Hyperliquid API: <https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api>
