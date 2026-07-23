# Project 27 PR #80 — billed-topology remediation plan

## Objective and exact authority

Reconstruct the required Lucy analyst cutover from
`tribes-protocol/trading-harness#80` on current trading-harness main without rewriting or
force-pushing the old PR branch. Remove the retired forced-MITM/zero-rated assumption, preserve
placeholder-only credentials and all required native analyst behavior, and make the external
delivery safe for terminal PR #2575.

- Exact execution base: `f75060e5d74f290cc84607d27c2e6a06e74f8d37`.
- Isolated branch: `fix/p27-pr80-billed-topology-v1`.
- Isolated worktree:
  `/root/Developer/worktrees/trading-harness-p27-pr80-remediation-v1`.
- Old PR #80 head: `66b4c5d289f70bd343356c05987498147af1df42`.
- Old head merge-base: `af5298ea8129235be653bc53fd24e335ea13e55c`.
- Old head relation to current main: 37 commits ahead, two commits behind, 93 changed paths;
  GitHub currently reports `MERGEABLE/CLEAN`.
- Project 27 item: `PVTI_lADOBZZXps4Bdfe2zgz5hec`, initially **In review**.
- Current terminal release dependency: issue #2613 on exact terminal release
  `19af762fba3409172c6a655fd1788a743131e126`.

This plan-only commit must be pushed and read back with one changed path before board ownership or
product mutation. After that checkpoint, claim the Project card with a delimiter-bounded owner
block, assign `hishboy`, move **In review** to **In progress**, and read back body, assignee, and
status before merging any source.

## Current #2067 contract

The current contract is not the one written in the old PR plan:

1. Transparent MITM and explicit HTTP-proxy egress are both tollbooth-billed. Neither is
   zero-rated.
2. The sandbox receives only a catalog placeholder under the exact provider environment variable.
   The egress boundary swaps the real operator credential at the provider hop. The harness must
   never mint, store, log, or expose a live provider key.
3. Provider requests must stay on the cataloged provider origin and normal network path. Harness
   code must not install its own billing bypass, direct-real-key fallback, global proxy override,
   or second pricing table.
4. Missing placeholders fail the affected command group closed. Keyless public hosts remain
   keyless; they are not evidence that keyed provider traffic is unbilled.
5. The terminal repository owns boot-env projection, delivery, iron-proxy injection, metering,
   wallet settlement, and deployment evidence. This repository owns only the native commands,
   provider request shape, redaction, routing, and tests.

## PR #74 exclusion

Draft trading-harness PR #74 is not a prerequisite and no commit or path is inherited from it.
It is a one-commit, 445-path competing rewrite at
`fcccc4af15332a9b891f88b250bc494618d51ef0`, based on
`2625f8584f4099e66ade0224609c5c5849b2e8d9`, with no checks and a dirty merge state. It shares
42 paths with PR #80: 16 deleted analyst-runner blobs are identical, 26 overlap divergently, and
403 PR #74 paths are unique. That proves only a superseded subset, not whole-PR equivalence.

- Frozen exclusion:
  https://github.com/tribes-protocol/trading-harness/pull/74#issuecomment-5064058218
- PR #80 cross-link:
  https://github.com/tribes-protocol/trading-harness/pull/80#issuecomment-5064059437

Do not add PR #74 to Project 27, merge it, cherry-pick it, or use it as source authority.

## Exact 93-path classification

Disposition tags:

- `DOC-CURRENT` — required operator/skill behavior; preserve while removing stale topology claims.
- `PLAN-CURRENT` — required design evidence; reconcile to current billed topology.
- `PLAN-REWRITE` — required historical plan whose forced-MITM/zero-rated section must be replaced.
- `CUTOVER-DELETE` — required removal of the legacy `/agent/lucy/*` analyst facade.
- `CUTOVER-ADD` — required native command surface.
- `EGRESS-BOUND` — required keyed-provider consumer; audit exact env name, origin, request
  placement, redaction, and missing-key failure against #2067.
- `ROUTER-BOUND` — required provider-neutral routing/fallback; preserve without adding a network
  or billing bypass.
- `PRESERVE` — required supporting behavior with no billing semantic expansion.
- `TEST-BOUND` — required focused coverage; preserve and extend where a billed-topology mutation
  is otherwise unguarded.

```text
DOC-CURRENT	.agents/desk-commodity-research.md
DOC-CURRENT	.agents/desk-crypto-research.md
DOC-CURRENT	.agents/desk-stock-research.md
DOC-CURRENT	.agents/desk-technicals.md
DOC-CURRENT	AGENTS.md
PLAN-CURRENT	plans/generic-capability-router.md
PLAN-REWRITE	plans/lucy-sunset-two-pr-migration.md
DOC-CURRENT	skills/alpha-scout/SKILL.md
DOC-CURRENT	skills/asset-data/SKILL.md
DOC-CURRENT	skills/commodity-analyst/SKILL.md
DOC-CURRENT	skills/defi-analyst/SKILL.md
DOC-CURRENT	skills/exchange-analyst/SKILL.md
DOC-CURRENT	skills/fundamentals-analyst/SKILL.md
PRESERVE	skills/macros/SKILL.md
DOC-CURRENT	skills/market-strategist/SKILL.md
PRESERVE	skills/position-management/SKILL.md
DOC-CURRENT	skills/research-analyst/SKILL.md
DOC-CURRENT	skills/stock-analyst/SKILL.md
DOC-CURRENT	skills/strategize/SKILL.md
DOC-CURRENT	skills/technical-analyst/SKILL.md
DOC-CURRENT	skills/token-analyst/SKILL.md
DOC-CURRENT	skills/wallet-analyst/SKILL.md
CUTOVER-DELETE	src/cli/AlphaScout.ts
CUTOVER-ADD	src/cli/Asset.ts
EGRESS-BOUND	src/cli/BirdeyeData.ts
EGRESS-BOUND	src/cli/Coin.ts
CUTOVER-DELETE	src/cli/DefiAnalyst.ts
PRESERVE	src/cli/Ens.ts
CUTOVER-DELETE	src/cli/ExchangeAnalyst.ts
EGRESS-BOUND	src/cli/Exchanges.ts
CUTOVER-DELETE	src/cli/FundamentalsAnalyst.ts
PRESERVE	src/cli/Hyperliquid.ts
EGRESS-BOUND	src/cli/Market.ts
CUTOVER-DELETE	src/cli/MarketStrategist.ts
EGRESS-BOUND	src/cli/Onchain.ts
CUTOVER-DELETE	src/cli/ResearchAnalyst.ts
EGRESS-BOUND	src/cli/SmartMoney.ts
CUTOVER-DELETE	src/cli/StockAnalyst.ts
EGRESS-BOUND	src/cli/Stocks.ts
PRESERVE	src/cli/Ta.ts
CUTOVER-DELETE	src/cli/TechnicalAnalyst.ts
CUTOVER-DELETE	src/cli/TokenAnalyst.ts
CUTOVER-ADD	src/cli/Tribes.ts
CUTOVER-DELETE	src/cli/WalletAnalyst.ts
EGRESS-BOUND	src/cli/WalletData.ts
CUTOVER-DELETE	src/common/Analysts.ts
EGRESS-BOUND	src/common/Env.ts
CUTOVER-DELETE	src/helpers/Analyst.ts
CUTOVER-DELETE	src/helpers/AnalystCli.ts
ROUTER-BOUND	src/routing/Adapters.ts
ROUTER-BOUND	src/routing/Capabilities.ts
ROUTER-BOUND	src/routing/Chains.ts
ROUTER-BOUND	src/routing/Router.ts
CUTOVER-DELETE	src/services/AnalystService.ts
EGRESS-BOUND	src/services/BirdeyeService.ts
EGRESS-BOUND	src/services/CoinService.ts
PRESERVE	src/services/EnsService.ts
EGRESS-BOUND	src/services/ExchangesService.ts
PRESERVE	src/services/HyperliquidService.ts
EGRESS-BOUND	src/services/MarketService.ts
EGRESS-BOUND	src/services/NansenService.ts
EGRESS-BOUND	src/services/OnchainService.ts
EGRESS-BOUND	src/services/StocksService.ts
PRESERVE	src/services/TaService.ts
CUTOVER-DELETE	src/types/Analyst.ts
ROUTER-BOUND	src/types/AssetIdentity.ts
EGRESS-BOUND	src/types/Birdeye.ts
ROUTER-BOUND	src/types/Capability.ts
EGRESS-BOUND	src/types/Coin.ts
PRESERVE	src/types/Ens.ts
EGRESS-BOUND	src/types/Exchanges.ts
EGRESS-BOUND	src/types/Market.ts
CUTOVER-DELETE	src/types/MassiveStocks.ts
EGRESS-BOUND	src/types/Nansen.ts
EGRESS-BOUND	src/types/Onchain.ts
PRESERVE	src/types/StockTicker.ts
EGRESS-BOUND	src/types/Stocks.ts
PRESERVE	src/types/Ta.ts
PRESERVE	src/utils/News.ts
PRESERVE	src/utils/Ta.ts
TEST-BOUND	tests/routing/Adapters.test.ts
TEST-BOUND	tests/routing/Router.test.ts
TEST-BOUND	tests/services/BirdeyeService.test.ts
TEST-BOUND	tests/services/CoinService.test.ts
TEST-BOUND	tests/services/EnsService.test.ts
TEST-BOUND	tests/services/ExchangesService.test.ts
TEST-BOUND	tests/services/HyperliquidService.test.ts
TEST-BOUND	tests/services/MarketService.test.ts
TEST-BOUND	tests/services/NansenService.test.ts
TEST-BOUND	tests/services/OnchainService.test.ts
TEST-BOUND	tests/services/StocksService.test.ts
TEST-BOUND	tests/services/TaService.test.ts
TEST-BOUND	tests/utils/Ta.test.ts
```

The manifest must equal the exact sorted 93-path PR #80 diff with no omission, duplicate, or extra
before implementation starts.

## Additive-import receipt and bounded scope amendment

The old head was imported as merge
`d2493fdd56be0c5186c3ddf28e01d94d3bfce56c`, with exact parents
`17a587202c1c7efbfccaac2b8a339f9276a15c7d` and
`66b4c5d289f70bd343356c05987498147af1df42`.

| Import disposition        | Exact result                                                                      |
| ------------------------- | --------------------------------------------------------------------------------- |
| Imported paths            | 93 / 93 manifest paths                                                            |
| Sorted-path SHA-256       | `5d9cb29f2c77e43fb4f409ca3a9bf0afca7bc3dd498a11579d4aa0165ecd0ccf`                |
| Textual conflicts         | 0                                                                                 |
| Current-main preservation | The exact current-main plan checkpoint remains first parent                       |
| PR #74 ancestry           | Excluded; neither PR #74 commit is a merge parent                                 |
| Stale doctrine            | Imported only as historical source; not accepted until the remediation gates pass |

One new regression path is now authorized:
`tests/services/EgressBillingContract.test.ts` (`TEST-BOUND`). It binds the four exact provider
environment names, catalog origins and credential placements, fail-closed empty-placeholder
behavior, error redaction, and the billed explicit-proxy/transparent-MITM doctrine. Product
remediation otherwise stays inside the original 93-path manifest. The terminal release
changelog, permanent suite, release delta, QA plan, certification plan, and #2067 decision record
remain the authoritative release accounting and are updated only after the external merge receipt
exists.

## Implementation sequence

1. **Plan and ownership gate**
   - Commit/push/read back this sole plan path from exact base `f75060e5`.
   - Bind the existing Project card and owner block exactly as described above.
   - Verify the worktree is clean and local equals remote.

2. **Additive old-head integration**
   - Merge exact old head `66b4c5d289f70bd343356c05987498147af1df42` into this branch with
     `--no-ff`, preserving current main's two later commits.
   - Do not rebase, rewrite, force-push, or mutate `leo/lucy-migration-pr1`.
   - Reject any changed path outside the exact 93-path manifest until a new pushed plan amendment
     classifies it.

3. **Billed-topology remediation**
   - Replace the forced-MITM/zero-rated section in
     `plans/lucy-sunset-two-pr-migration.md` with the five current #2067 invariants above.
   - Audit all `EGRESS-BOUND` paths against exact provider origins and key placement:
     CoinGecko Pro, BirdEye, Nansen, and Marketstack.
   - Keep only placeholder-shaped env consumption. Preserve fail-closed missing-key behavior and
     ensure request/error/log paths cannot reveal the injected value.
   - Do not add a harness-global proxy dispatcher or direct-real-key fallback. Explicit proxy and
     transparent MITM selection remain terminal-owned transport behavior.
   - Preserve provider-neutral routing, fallback triggers, payload equivalence, native analyst
     deletions, Massive removal, and the existing no-subscription decision.

4. **Focused regression and mutation coverage**
   - Add or extend a repository test that fails if the zero-rated claim returns, if exact env
     names/provider origins drift, if a keyed service bypasses missing-key failure, or if a
     credential value reaches an error string.
   - Preserve the old head's router fallback, payload-equivalence, service request-shape, and
     native command registration tests.
   - Run focused commands with `nice -n 15`; no un-niced build or test command:
     - the billed-topology semantic contract;
     - router/adapter tests;
     - keyed provider service tests;
     - CLI registration and missing-key tests;
     - Prettier check, ESLint, TypeScript, and the repository verify command required by CI.
   - Full protected-PR CI remains mandatory even if focused local gates pass.

5. **Release accounting**
   - Record the exact external merge SHA and CI run.
   - On the terminal release branch, add the PR #80 behavior to the changelog, permanent suite,
     release delta, QA plan, certification plan, and the existing #2067 decision record. Keep live
     QA, deployment, production, and certification **NOT RUN** until observed.
   - Do not bind terminal PR #2575 as safe until external delivery and terminal #2613 both land.

6. **ATA staging and delivery evidence**
   - ATA clones trading-harness `main` at claim and ignores `HOST_HARNESS_REF`; record the exact
     external main SHA before provisioning.
   - Drain/recreate existing staging ATA boxes so no old clone survives. Provision a fresh ATA box
     and verify its source stamp equals the exact merge.
   - Exercise one native command for each keyed provider class and capture provider success,
     iron-proxy observation, and an attributed `egress:<provider>` tollbooth/wallet charge without
     printing any credential.
   - Confirm steady-state commands do not call `/agent/lucy/*`, missing placeholders fail closed,
     and keyless hosts stay keyless.
   - This plan authorizes no production fleet mutation. Staging evidence remains **NOT RUN** until
     the exact merged source and terminal candidate exist.

## Exact non-overlap with terminal #2613

There is zero repository/path overlap: this branch changes only
`tribes-protocol/trading-harness`; #2613 changes only `tribes-protocol/terminal`. The interface is
the exact environment-variable/placeholder contract. #2613 owns
`apps/api/src/utils/SandboxBootEnv.ts`, its test, key projection/delivery, injector security,
billing topology, and terminal release docs. This branch owns native provider consumers and their
tests. Both can implement in parallel, but staging and PR #2575 remain serialized until both exact
merged heads are available.

No new user-authority question is required. Any product choice discovered during implementation
must stop work and be added to the release `QUESTIONS.md`; operational receipts are not choices.
