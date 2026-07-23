# Project 27 PR 86 staging billed-egress proof

## Authority and immutable inputs

- Board: tribes-protocol Project 27 (158 total items after this card was added).
- Execution card: `tribes-protocol/trading-harness#87`.
- Project item: `PVTI_lADOBZZXps4Bdfe2zgz51z4`.
- Branch: `ops/p27-ata-staging-v1`.
- Worktree: `/root/Developer/worktrees/trading-harness-p27-ata-staging-v1`.
- Base and required staging source: trading-harness `main` at
  `7a48145b61736a2e212af526ef782f080f834f97`.
- Superseding implementation: PR 86, candidate
  `aa7abadede6d0b6aa728bd10f5fe34fe9fdc1966`, merged as the required base above.
- Protected candidate CI:
  `https://github.com/tribes-protocol/trading-harness/actions/runs/30050904059/job/89352548808`
  (successful).

This is a staging-only operational proof. It authorizes no production change, fleet deployment,
QA certification, or release certification.

## Success criteria

A run is `CONFIRMED` only when all of the following are true:

1. The post-merge `main` CI run for the required source is successful before the sandbox is
   exercised.
2. An operator-designated staging account and authenticated session create or claim one owned ATA
   sandbox. Every destructive action is guarded by an exact sandbox ID/name binding read from the
   control-plane response.
3. Host-side `sandboxd exec` reads `/opt/tribes/harness.stamp` and proves
   `HARNESS_REPO=trading-harness`, `HARNESS_TYPE=ata`, and
   `HARNESS_SHA=7a48145b61736a2e212af526ef782f080f834f97`. Agent narration is not source
   evidence.
4. One native command per keyed provider succeeds through the normal in-guest path:

   - CoinGecko: `tribes-cli market global --out <nonsecret-temp-path>`
   - BirdEye:
     `tribes-cli token-data price --addresses So11111111111111111111111111111111111111112 --chain solana --out <nonsecret-temp-path>`
   - Nansen: `tribes-cli smart-money netflow --chain all --limit 1 --out <nonsecret-temp-path>`
   - Marketstack: `tribes-cli stocks candles --symbol AAPL --limit 1 --out <nonsecret-temp-path>`

5. For each provider, operator-side timestamps and sandbox ID correlate the request with both an
   iron-proxy observation and a `sandbox_billing_txns` record whose model is
   `egress:<provider>`. Wallet reserve and settlement evidence proves exact-once charging.
6. A fresh supported configuration with one catalog placeholder omitted makes only that provider
   fail closed. No real provider key enters the sandbox and no other provider is disabled.
7. The steady-state request path contains no `/agent/lucy/*` request.
8. The exact owned sandbox is removed after evidence capture and any pool/drain setting changed for
   the run is restored.

A functional assertion that disagrees with expected behavior is `FAIL`. Missing authority,
ambiguous sandbox identity, stale source, unavailable safe omission mechanism, inaccessible
operator evidence, or an unsafe cleanup condition is `ARM VOID`; it must not be presented as a
product failure or a passing proof.

## Execution plan

1. **Preflight and ownership**

   - Push this plan-only commit and read it back from origin.
   - Bind the card to the branch, worktree, base SHA, assignee, and current heartbeat.
   - Move the card from Ready to In progress and read the state back before any staging mutation.
   - Verify the protected post-merge `main` CI run is successful.

2. **Resolve staging target**

   - Resolve the operator-designated staging control-plane URL, authenticated account/session, and
     sandbox host from authoritative configuration or operator records.
   - Resolve the current host slug and IPv6 address from the fleet source of truth. Use `ssh -6`
     and verify remote hostname plus IPv6 before reading host-side evidence.
   - Do not reuse a tester's sandbox or infer target identity from a friendly name.

3. **Create an isolated ATA arm**

   - Create through the authenticated API/admin path `POST /sandbox` with `harness=ata`.
   - Record only nonsecret sandbox identifiers and timestamps.
   - If creation returns `created:false`, stop with `ARM VOID`; do not destroy a preexisting
     sandbox.
   - An explicit sandbox name may still warm-adopt. Source-stamp equality, not the requested name,
     determines whether the arm is valid.
   - ATA workspace creation clones the default trading-harness `main`; `HOST_HARNESS_REF` is not a
     source selector. If the stamp is stale, remove only the owned test sandbox, safely
     recreate/drain under operator authority, and retry from a fresh arm.

4. **Prove source and native routing**

   - Read `/opt/tribes/harness.stamp` using host-side `sandboxd exec`.
   - Run the four exact native commands once each. Retain exit status, response schema/source, and
     timestamps only; do not retain result values unless necessary to prove schema.
   - Correlate proxy, billing transaction, reserve, settlement, and wallet delta records by
     provider, sandbox ID, and time window.
   - Query only the minimum nonsecret columns. Never print or store environment values, secret
     columns, authorization headers, full request URLs, request bodies, or provider response
     bodies.

5. **Prove fail-closed isolation**

   - Use only a supported fresh boot/configuration path to omit one catalog placeholder.
   - Do not modify production configuration, expose an operator credential, or inject a real key.
   - Confirm the omitted provider reports unavailable before network/billing activity while an
     untouched keyed sibling still succeeds and bills normally.
   - If staging cannot safely create this condition, report `ARM VOID` with the missing operator
     capability; do not improvise an in-guest bypass.

6. **Cleanup and receipts**
   - Re-read the exact sandbox ID/name binding, delete only the owned test sandbox, poll to its
     terminal state, and restore any temporary operator setting.
   - Add a sanitized evidence matrix to issue 87: source stamp; per-provider native command,
     iron-proxy, billing model, reserve/settlement, and wallet result; isolation result; no-Lucy
     result; cleanup receipt.
   - Record any unresolved serious item in the release `QUESTIONS` document. Do not silently defer
     it.
   - Move issue 87 to In QA only after the complete receipt is present. The release may be handed
     to QA/certification only after this gate and the release integration/docs gates are complete.

## Evidence hygiene

Use placeholders such as `<staging-url>`, `<sandbox-id>`, and `<timestamp>` in durable comments.
Do not paste credentials, tokens, cookies, secret names paired with values, raw provider payloads,
or full billable URLs. Every reported conclusion must distinguish `CONFIRMED`, `FAIL`, and
`ARM VOID`.

## Attempt receipt — 2026-07-23

Outcome: **`ARM VOID`**. Exact-main CI
[30052308071](https://github.com/tribes-protocol/trading-harness/actions/runs/30052308071)
passed for `7a48145b61736a2e212af526ef782f080f834f97`, but no valid non-production
subject was available.

The repository-designated development API and both documented staging UI tunnel names returned
HTTP 404 with ngrok `ERR_NGROK_3200`. The authenticated read-only host-list request reached the same
tunnel-level response before returning any host inventory. The executor was a production-connected
guest and was rejected; it also had no KVM, local Postgres, ngrok, Wrangler, or authenticated
intercom client from which to construct the required isolated fleet.

No sandbox, provider, database, fleet, production, or QA mutation occurred. All provider-routing,
billing, wallet, missing-placeholder, and no-Lucy assertions are `NOT RUN`; no staging resource
exists to clean up. The durable evidence and exact unblock condition are recorded on
[issue 87](https://github.com/tribes-protocol/trading-harness/issues/87#issuecomment-5064495008).
