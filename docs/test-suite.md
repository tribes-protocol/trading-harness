# trading-harness QA Test Suite

The canonical catalog of QA flows that must pass before **every** release of the Pi trading harness. This file is the regression contract: if an item here is green on release N and red on release N+1, that is a regression and a release blocker.

Each suite exercises one transaction path end-to-end through `tribes-cli` — **generate** the unsigned payload, then **send** it — because the two halves fail independently and a passing generate tells you nothing about the signer.

**Rules of engagement**

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
