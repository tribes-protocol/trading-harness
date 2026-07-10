# trading-harness QA Test Suite

The canonical catalog of QA flows that must pass before **every** release of the Pi trading harness. This file is the regression contract: if an item here is green on release N and red on release N+1, that is a regression and a release blocker.

Each suite exercises one transaction path end-to-end through `tribes-cli` — **generate** the unsigned payload, then **send** it — because the two halves fail independently and a passing generate tells you nothing about the signer.

**Rules of engagement**

- **Suites run inside a Phase 0 sandbox.** Phase 0 boots a trading-agent sandbox that is already authenticated. Neither suite has a login step, and neither should ever run `tribes-cli login` — if a suite item fails on missing auth, Phase 0 is what regressed.
- **Mainnet only.** There is no testnet path in this harness. Every send item broadcasts a real transaction from the live agent wallet onto Base or Solana mainnet. Do not run send items casually.
- **Zero value, sponsored gas.** Every item transfers `0` to the wallet's own address, and gas is sponsored by the harness (`skills/transaction/SKILL.md`), so the signer never needs a native balance. A send item that fails on "insufficient funds" is a red — it means gas sponsorship broke, not that you need to top up.
- **Self-transfer.** `to` and `from` are both the agent's own address, so a successful item moves no value and needs no cleanup. Never point these at a third-party address to "make it more realistic".
- **Wallet ids come from `tribes-cli wallet list`.** Never read `.tribes/privy-wallets.json` directly, and never hardcode a wallet id or address into a runbook — the snapshot is per-environment.
- **One tester at a time per wallet.** Both suites send from the same wallet. Two concurrent testers race the EVM nonce and will produce spurious reds.
- **Failures** are reported by item id (e.g. "S2-3 red: signature failed bs58 length check").
- **Item ids are stable.** Never renumber. A retired check is marked `RETIRED (date — reason)` in place; new checks append at the end of their suite.

**Ground truth.** The command surface lives in `src/cli/Wallet.ts` and `src/cli/Transaction.ts`; the payload and result types in `src/types/Solana.ts`, `src/types/Lang.ts`, and `src/types/Transaction.ts`. Re-read them before each pass — the code wins on conflict with anything below.

**Two properties of the CLI that trip up every new tester**

1. **All output is JSON, so bare strings arrive quoted.** Every command writes `JSON.stringify(result, null, 2)` (`ensureJsonTreeString`, `src/utils/Lang.ts`). A command whose result is a plain string — a tx hash, a Solana signature, a base64 payload — prints it **wrapped in double quotes**. Piping that stdout straight into the next command's flag, or regex-matching it as `^0x…`, fails on the quote characters. Strip them (`jq -r .`) before reuse.
2. **`So11111111111111111111111111111111111111111` is a native-SOL sentinel, not the wrapped-SOL mint.** It ends in `…111`, one character short of the canonical wrapped-SOL mint `…112`. `src/types/Solana.ts` defines it as `NATIVE_MINT`, and `WalletService.buildSolTransfer` switches on it to emit a bare `SystemProgram.transfer`. Passing the real wrapped-SOL mint instead silently routes you down the SPL-token branch and builds a completely different transaction.

---

## Phase 0 — QA self-provisions a logged-in agent (P0-x)

Setup, not a regression contract. Phase 0 produces the thing Suites 1–2 assume: a running trading-agent sandbox that is **already authenticated**, with no human in the loop. Its items are ordered and each gates the next — a red here means the pass never starts, not that the harness regressed.

The harness has two credential paths, and this phase covers only the second:

- **`app: 'external'`** — `tribes-cli login` prints a browser-approval URL and polls for ~3 minutes. This is what Claude Code and a local shell use. **Out of scope here.**
- **`app: 'web'`** — a sandbox booted from the terminal web app comes up pre-authenticated. As the harness README puts it: "Auth is already wired at provisioning — there is no manual login step." That is the path below.

Two separate credentials land in a web-booted box, and P0-5 checks both:

1. `TRIBES_API_KEY` — an opaque per-sandbox proxy key the control plane generates and injects into the boot env at create (and again on a warm-pool claim). Only its keccak256 hash is persisted. `src/common/Env.ts` reads it **ahead of** `API_BEARER_TOKEN`.
2. A **P-256 agent authorization key**, minted _inside_ the VM by `tribes-agent-key <sandboxId> <userId>` and written to `/var/lib/tribes/agent-authorization-key.json`. The `tribes` extension's `AuthBootstrap.installAgentKey()` copies it into `.tribes/agent-authorization-key.json`, and `hasAgentKey()` then reports logged-in.

A **key quorum** binds that in-VM public key as an authorized signer on the user's Privy-custodied wallets. That is how the sandbox signs trades for a wallet whose private key never touches the box.

### Environment

Phase 0 targets a **local web/api stack plus a remote Linux KVM host**. Read this section before touching anything — two of these bite hard.

- **Mac:** `bun dev` in the terminal monorepo (turbo: `web`, `api`, `backend`, …) plus Postgres from `dockers/docker-compose.dev.yml`. `apps/api` is a Cloudflare Worker under `wrangler dev` on `127.0.0.1:8787`; `apps/web` serves `:3000` and defaults to that endpoint.
- **A remote Linux box with `/dev/kvm`.** Sandboxes are Firecracker microVMs. There is **no non-KVM fallback, no mock backend, and no darwin path** — `bun dev` never starts `sandboxd`, so a Mac alone cannot boot an agent. Provision the box once:

  ```
  bun run sandboxd:provision --target-host <ip> --api <control-plane-url> \
    --capacity 30 --domain <wildcard-domain>
  ```

  (needs `ADMIN_ACCESS_KEY` to mint the provision token, or pass `--token`).

- **Reachability — the step that bites.** `wrangler dev --ip 127.0.0.1` binds loopback only, but the host registers **outbound** to the control plane. So `--api` must be a URL the remote box can actually reach: tunnel `:8787` (cloudflared/ngrok) or rebind wrangler. Get this wrong and there is no error — the box just sits in `provisioning` forever (see P0-4).
- **Bring your own Privy app.** No dev or staging Privy app id is committed anywhere (`apps/web/.env.example` ships `NEXT_PUBLIC_PRIVY_APP_ID=` empty, and both apps hard-fail at boot without it). Stand up your own Privy app with **email login enabled**, then set `NEXT_PUBLIC_PRIVY_APP_ID`, `PRIVY_APP_ID`, `PRIVY_APP_SECRET`, `PRIVY_VERIFICATION_KEY` — plus `PRIVY_APP_ID` and `NODE_ENV=development` for the harness itself.
- **The beta gate fires locally too — the QA account must be whitelisted.** `requireModOrWhitelistedInProduction` is `if (!getIsProduction(env)) return null`, which reads like a dev no-op. It is not, because `apps/api/wrangler.jsonc` sets `"NODE_ENV": "production"` in its one and only `vars` block, with no dev override — so `wrangler dev` on `:8787` **is production** to `getIsProduction()`. The gate guards `POST /sandbox`, not just `/agents/login`, and an unwhitelisted account gets "The sandbox is currently limited to beta users."

  Phase 0 is therefore **not** self-service out of the box. Before the first pass, whitelist `tribes-leo+ata-qa@agentmail.to` once — mint and redeem an access code (`POST /mod/whitelist/codes` then `POST /whitelist/redeem`; `access_codes` is empty on a fresh DB), or add its Privy smart-wallet address to `MODS`. This is a one-time setup cost for the standing account; it is precisely why the alias is fixed rather than random.

### Before every pass: re-bake, or you are testing stale code

A booted sandbox runs the **baked** `ata` harness, not your working tree. The rootfs bake fingerprints its inputs — including the baked monorepo payload (foundation, skills, **the ata harness**, lockfile) — and re-bakes only when they change. To QA a harness change:

```
bun run sandboxd:upgrade --target-host <ip>          # re-bakes when inputs changed
bun run sandboxd:upgrade --target-host <ip> --force-bake   # override the stamp
```

Skip this and Phase 0 will happily boot the previous release. Running microVMs are never touched by an upgrade, so test only boxes created **after** the re-bake.

### Items

- [ ] **P0-1 — The stack is up and a host is registered**

  - Do: start `bun dev` + Postgres on the Mac; confirm the tunnel resolves; on the KVM box run `sandboxd health`.
  - Expect: `sandboxd health` reports registration, capacity, and uptime. The api sees the host online. A host that is not registered means every later boot hangs — fix it here, not at P0-4.

- [ ] **P0-2 — An AgentMail inbox exists for this pass**

  - Do: reuse the standing inbox `tribes-leo@agentmail.to` (create it via the AgentMail API — `https://api.agentmail.to/v0/`, API-key auth — passing a stable `client_id` so re-running returns the existing inbox instead of minting a duplicate). The API key is **not** stored in either repo: supply `AGENTMAIL_API_KEY` from your password manager at run time, and never write it to a file under version control.
  - Expect: `GET /v0/inboxes` lists the inbox. `+` aliasing is confirmed working (kobe, 2026-07-03), so the fixed aliases below all land in this one inbox while Privy treats each as a **distinct account**. If Privy ever collapses them, fall back to separate inboxes (`…-ata-qa@`, `…-ata-fresh@`).

  **Use these exact addresses every pass — never a random or timestamped alias.** A stable address means the same Privy account, the same wallets, and the same agent across runs, so a red is a real regression rather than a brand-new account behaving differently.

  | Alias                               | Role                                                                          |
  | ----------------------------------- | ----------------------------------------------------------------------------- |
  | `tribes-leo+ata-qa@agentmail.to`    | The standing QA account. Boots the agent; Suites 1–2 run against its wallets. |
  | `tribes-leo+ata-fresh@agentmail.to` | A never-booted account, reserved for the P0-6 logged-out negative check.      |

  Reusing `+ata-qa` also means its wallets accumulate a transaction history across passes — that is intended, and it is what makes the wallet auditable on a block explorer.

- [ ] **P0-3 — Log into the web app with a Privy email OTP**

  - Do: drive `http://localhost:3000/sandbox?start=1` with the `browser` skill (Playwright; the CLI is not preinstalled, and a global `npm install -g` needs root — run it through `npx -y @playwright/cli@latest` instead, and pass `PLAYWRIGHT_MCP_USER_AGENT`). The Privy modal is **already open** on load — do not click "Sign in to boot trading agent" first; that button sits _behind_ the modal and the click will be intercepted. Fill `input[type=email]:visible` with `tribes-leo+ata-qa@agentmail.to` and click the modal's `Submit`. Snapshot the inbox first (`messages.list()`) so you can tell the OTP apart from prior mail, then poll — **AgentMail has no wait-for-message primitive**, so poll it yourself: every 2s, up to 60s. Read the message with `messages.get()` and extract the code from `extracted_text` with an explicit regex (`/\b(\d{6})\b/`). Six blank text inputs appear for the code; the search box is also `input[type=text]`, so target the **trailing six**.
  - Expect: the mail arrives from `no-reply@mail.privy.io` (subject `Your login code for …`), typically in under 2s. After entry the modal closes, a `privy-token` cookie (~400 chars) is set, and `LOGOUT` is visible. Red: no message after 60s ⇒ email login is not enabled on your Privy app.

- [ ] **P0-4 — Boot the trading agent**

  - Do: on `http://localhost:3000/sandbox?start=1`, accept the TOS gate. **`ACCEPT` starts `disabled`** — tick the consent checkbox (`input[type=checkbox]`) first, then click it. (`?start=1` is the documented boot trigger; in production the same funnel target is `https://tribes.xyz/sandbox?start=1`.)
  - Expect: a sandbox is created on the **`ata`** harness — that is the trading agent, and it is the default (`DEFAULT_SANDBOX_HARNESS === 'ata'`). Do not confuse it with `pi` (the underlying coding agent) or `tribes` (the extension). The box transitions `provisioning → running`.
  - Red — **"Not available. The sandbox is currently limited to beta users."** The account is not whitelisted. This fires on a _local_ stack too: `apps/api/wrangler.jsonc` has a single top-level `vars` block with `"NODE_ENV": "production"` and no dev override, so `wrangler dev` is production as far as `getIsProduction()` is concerned, and `requireModOrWhitelistedInProduction` enforces. See the Environment section — the account must be whitelisted before this item can pass.
  - Red — stuck in `provisioning` indefinitely with **no** error message. Different failure: no host picked up the start command (the reachability mistake). Distinguish the two by the copy on screen. Check `sandboxd health` on the box, not the browser.

- [ ] **P0-5 — The sandbox came up already authenticated**

  - Do: in the booted sandbox, inspect the environment and the `.tribes/` directory, then run `tribes-cli wallet list`.
  - Expect, all three:
    - `TRIBES_API_KEY` is present in the sandbox env.
    - `.tribes/agent-authorization-key.json` exists, with `app: "web"` and a non-null `userId` and `sandboxId`.
    - `tribes-cli wallet list` returns a wallet array — **with `tribes-cli login` never having been run**. This is the whole point of the phase.
  - Red: a prompt to log in, or a missing authorization key. Either means credential injection regressed — that is a release blocker, and it is the one thing in Phase 0 that is a genuine regression signal rather than a setup mistake.

- [ ] **P0-6 — A logged-out sandbox fails loudly (negative check)**
  - Do: on a box where Phase 0 has **not** run, run `tribes-cli wallet list`.
  - Expect: it fails with a missing-auth error. It must **not** silently serve a stale `.tribes/privy-wallets.json` from a previous account — `WalletService.listWallets` treats that file as a read-through cache. `LoginService.finalizeLogin` calls `clearWalletSnapshot` for exactly this reason, and commit `a3d6568` ("clear the cached wallet snapshot on a fresh login") fixed a bug where it did not.

### Then run the suites

Suites 1 and 2 run **inside** the P0-4 sandbox, unchanged. They have no login step.

Two caveats specific to this environment, both of which change what a red means:

- The suites broadcast **real Base and Solana mainnet transactions**, but against a local api those calls are proxied with **your dev Privy app's** credentials. The wallets are that app's wallets, not the production agent wallets. Do not expect production balances or history.
- Gas sponsorship (`sponsor: true`) must be configured on your dev Privy app. Until it is, the Rules-of-engagement claim that "an insufficient-funds error is a red" does **not** hold locally — an unsponsored dev app fails that way by construction, and that is a setup gap, not a regression.

---

## Suite 1 — EVM zero-value self-transfer (S1-x)

Runs against Base (`chainId` 8453). Generate with `wallet ethTransfer`, broadcast with `transaction sendEthTransaction`.

- [ ] **S1-1 — Wallet discovery returns a usable EVM wallet**

  - Do: `tribes-cli wallet list`
  - Expect: a JSON **array** (not an object) of wallet snapshots, each carrying non-empty `evmWalletId`, `evmWalletAddress`, `solWalletId`, `solWalletAddress`. `evmWalletAddress` is a `0x`-prefixed 40-hex-character address. An empty array is a red — `listWallets` is specified to throw `No agent wallet found` rather than return one.

- [ ] **S1-2 — Generate a zero-value native self-transfer**

  - Do: with `$EVM` set to `evmWalletAddress` from S1-1:
    ```
    tribes-cli wallet ethTransfer --chain-id 8453 --token-id network --amount 0 --to-address "$EVM"
    ```
  - Expect: an object with exactly `{ "chainId": 8453, "to": "<$EVM>", "data": "0x", "value": "0" }`. `chainId` is a **number**, `value` is a **string** (`BigintSchema` serializes through `toJsonTree` as a decimal string), and `data` is the empty-calldata sentinel `0x` — not `""` and not omitted. `--token-id network` is what selects the native asset; a contract address here builds an ERC-20 transfer instead.
  - Note: this item is read-only — it builds an unsigned payload and broadcasts nothing. Safe to run on any branch, any time.

- [ ] **S1-3 — Broadcast the generated transfer**

  - Do: feed the S1-2 payload straight through, unmodified:
    ```
    tribes-cli transaction sendEthTransaction \
      --chain-id 8453 --to "$EVM" --value 0 --data 0x --wallet-id "$EVM_WALLET_ID"
    ```
  - Expect: stdout is a quoted transaction hash — `"0x…"` — whose **unquoted** value matches `^0x[a-fA-F0-9]{64}$` (`HexString`, `src/types/Lang.ts`). Reject the quotes before asserting; a regex anchored at `^0x` against raw stdout matches the `"` and fails. Any non-JSON stdout, or a hash of the wrong length, is a red.
  - Red: an "insufficient funds for gas" error. Gas is sponsored; this means sponsorship regressed.

- [ ] **S1-4 — The broadcast transaction confirms on-chain**
  - Do: with `$HASH` set to the **unquoted** hash from S1-3:
    ```
    tribes-cli transaction getTransactionStatus --chain-id 8453 --hash "$HASH" --check-safe-confirmations
    ```
  - Expect: the status resolves for the hash rather than erroring on an unknown transaction. A hash that S1-3 returned but that no RPC has ever seen is the classic silent failure — the signer acked a transaction it never actually broadcast — and is a release blocker even though S1-3 was green.

## Suite 2 — Solana zero-value self-transfer (S2-x)

Generate with `wallet solTransfer`, broadcast with `transaction sendSolTransaction`. Unlike the EVM path, the generated payload is a **fully serialized transaction** with a `recentBlockhash` already baked in.

- [ ] **S2-1 — Wallet discovery returns a usable Solana wallet**

  - Do: `tribes-cli wallet list`
  - Expect: as S1-1, and `solWalletAddress` base58-decodes to a 32-byte public key.

- [ ] **S2-2 — Generate a zero-value native self-transfer**

  - Do: with `$SOL` set to `solWalletAddress`:
    ```
    tribes-cli wallet solTransfer --chain-id solana \
      --token-id So11111111111111111111111111111111111111111 \
      --amount 0 --from-address "$SOL" --to-address "$SOL"
    ```
  - Expect: a **quoted** base64 string of a serialized `Transaction` (fee payer = `$SOL`, one `SystemProgram.transfer` of 0 lamports). The unquoted payload round-trips exactly: `base64_decode` then `base64_encode` returns the identical string. Do **not** assert this by checking that decoding "doesn't throw" — base64 decoders silently drop invalid characters rather than failing, so that check passes for literally any input, including the quotes.
  - Note: `--from-address` is required here (it is the fee payer) and has no EVM counterpart. Read-only — broadcasts nothing.

- [ ] **S2-3 — Broadcast the generated transfer**

  - Do: **promptly after S2-2** — with `$PAYLOAD` set to the unquoted base64:
    ```
    tribes-cli transaction sendSolTransaction --transaction "$PAYLOAD" --wallet-id "$SOL_WALLET_ID"
    ```
  - Expect: stdout is a quoted signature whose unquoted value base58-decodes to **exactly 64 bytes** (`isValidSolanaTxSignature`, `src/utils/Solana.ts`) — in practice 87–88 characters. Assert the decoded length, not the character count; a base58 string of the right length can still decode short.
  - Red: `blockhash not found` / `block height exceeded`. The blockhash is stamped at generate time and expires after ~150 slots (roughly 60–90 seconds). A payload generated at the top of a QA pass and sent minutes later will fail here — that is a **stale fixture, not a regression**. Regenerate via S2-2 and resend before filing anything.

- [ ] **S2-4 — The broadcast transaction confirms on-chain**
  - Do: with `$SIG` set to the unquoted signature from S2-3:
    ```
    tribes-cli transaction getTransactionStatus --chain-id solana --hash "$SIG" --check-safe-confirmations
    ```
  - Expect: the status resolves for the signature. Note the chain id is the literal string `solana`, not a number. As in S1-4, a signature the RPC has never seen is a release blocker.

---

## Per-release delta

Append per-release checks here as `D<n>` items, following the zipbox convention: each carries a `Do:` / `Expect:` pair and a `Graduates to:` line naming the suite it folds into once the release closes.

_(No open delta items.)_
