---
name: eng-repair-integration
description: >-
  Engineering skill that fixes or builds one provider adapter slice per the repo's conventions:
  PascalCase service with named-params ctor, zod schemas in src/types, a build…Command() builder
  composed into the CLI entry, tests in tests/services, plus skill doc and routing row for new
  groups. Handles: schema-drift repairs, new adapter slices over existing billed providers, the
  regression-test authorship duty, the money-path needs-human-approval pause, and
  missing-provider escalation to backlog. Call it on a diagnosed work order or approved gap
  spec. NOT for: classifying failures (use eng-triage); read-only root-cause work (use
  eng-diagnose); running the verification gates (use eng-verify-change).
allowed-tools: bash read
---

# Eng: Repair Integration

## Identity

- Stable id: `eng-repair-integration` — owner: Engineering. Invoked by: Integration Engineer
  (provider adapters); the Software Engineer uses the same recipe for general harness fixes.

## Purpose

Fix or build one provider adapter slice — or an equivalent harness change — from a diagnosed
work order to a change set ready for verification, following the repo's own conventions. It
writes code and tests; it never adopts its own money-path work past the human boundary, never
adds a billed provider on its own authority, and has no trading authority: a work order may
never place, modify, or cancel anything on a venue.

## Inputs

Required: a work order with an `eng-diagnose` note (root-cause hypothesis + named seam), or an
approved gap spec (for the charter's closed-gap subcommands). Optional: provider docs, sample
payloads captured with `--out`, prior attempts on the same work order.

## Outputs

- The change set (facts): service + types + CLI builder + tests, plus skill doc and AGENTS.md
  routing row when a new command group lands — every file listed in the work order.
- A regression test for every fixed bug, authored here, proven in `eng-verify-change`.
- The work-order result (what changed, how verified, residual risk) — completed only after
  `eng-verify-change` passes; adoption/rollout notes are recommendations to the Engineering
  Lead, not actions. Captured fixtures record provider + command + source timestamp +
  retrieval timestamp per `org-protocol`.
- Explicit failure states: blocked-needs-provider, fix-does-not-hold, upstream-shape-unstable.

## Integration

The slice recipe (AGENTS.md Architecture; `MarketService` / the `market` group is the
reference slice):

- `src/services/<Provider>Service.ts` — PascalCase filename; named-params ctor (`{ apiKey }`
  for keyed providers); private fetch; zod-parsed, compact snake_case output.
- `src/types/<Concern>.ts` — named zod schemas, then exported inferred types (inline z.infer
  is lint-banned); one concern per file.
- `src/cli/<Group>.ts` — a `build…Command()` builder composed into `src/cli/Tribes.ts`; every
  subcommand emits structured JSON and accepts `--out`; argv validated with a zod schema; no
  business logic in the builder.
- `tests/services/<Provider>Service.test.ts` — vitest with mocked/recorded fetch. Tests are
  neither typechecked nor linted, so they prove nothing unless they RUN.
- New command groups also ship `skills/<slug>/SKILL.md` plus one routing-map row in AGENTS.md,
  outside the synced block.
- Adoption rebuild: `bun run bootstrap.sh` compiles the `tribes-cli` binary (environment is
  baked at compile time).

## Preconditions

- Diagnosis (or approved spec) exists and names the seam; without it, go back to
  `eng-diagnose`.
- Keyed providers: the env-var name must match a control-plane egress billing entry — the
  pinned set today is BIRDEYE_API_KEY, COIN_GECKO_PRO_API_KEY, MARKETSTACK_API_KEY,
  NANSEN_API_KEY (see tests/services/EgressBillingContract.test.ts). A provider with no
  key/billing entry is a human decision: stop and backlog it.
- The working tree is clean enough to isolate this change; never mix unrelated edits into the
  work order's change set.

## Procedure

1. Confirm scope from the diagnosis: one slice, minimal blast radius. Check the money-path
   list FIRST (step 8) — if touched, flag the work order needs-human-approval before writing
   any code.
2. Schema drift: capture a fresh payload with `--out` as the fixture; adjust the schema in
   `src/types` to the observed shape; keep the output compact snake_case; record the capture
   command + timestamp in the work order.
3. Implement per the slice recipe, honoring the lint conventions (hard gates at
   `--max-warnings 0`): PascalCase filenames, no index.ts or barrel files, named schema +
   exported inferred type, the project bigint helper, `ensureJsonTreeString` instead of
   JSON.stringify, never `?:` combined with `| null`, two-argument URL constructor, every
   eslint-disable explained. Prettier: no semicolons, single quotes, no trailing commas,
   width 100.
4. Author tests: a regression test pinning the fixed bug (fails on the old code, passes on the
   new — state which), contract tests for any new subcommand, and the egress billing contract
   extension when a new keyed surface lands.
5. New skill docs must satisfy the skills CI contract (frontmatter keys exactly
   name/description/allowed-tools with `bash read`, H1, whole file <=300 lines, forbidden
   strings absent, all referenced slugs real, routing row present) — SkillsContract.test.ts
   enforces every item.
6. Run a quick targeted check (`bunx vitest run tests/services/<X>.test.ts`) while iterating;
   the full gate belongs to `eng-verify-change`.
7. Hand the change set to `eng-verify-change`; only after it passes, complete the work-order
   result and ack to the Engineering Lead.
8. Money-path boundary: a change touching `src/services/HyperliquidService.ts`,
   `TransactionService.ts`, `WalletService.ts`, or `SwapBridgeService.ts` PAUSES in
   needs-human-approval BEFORE adoption — Head of Desk notifies the human (`notify`), the desk
   keeps running the prior binary, and `bun run bootstrap.sh` is NOT run until explicit
   approval is recorded in the work order.

## Validation

- The change lints, typechecks, and tests green — delegated to `eng-verify-change`; a repair
  without that pass is not returnable.
- The regression test demonstrably pins the bug (its failure on pre-fix code is stated in the
  result).
- Adapter fixtures match a real captured response, with capture provenance recorded.

## Risk & safety

- The money-path approval pause (Procedure 8) is non-negotiable.
- New billed provider, new key, or any control-plane change: human decision via Head of Desk;
  record it in `.tribes/org/workorders/backlog.md`; never hardcode keys, never bypass egress
  billing.
- Never hand-edit machine-synced surfaces: zipbox skill directories and skills/.synced.json
  (SyncedSkills.test.ts fails CI on any drift); honor the MultiAssetPolicy string pins when
  touching the six pinned skill files.
- NEVER commit `.tribes/` state or secrets; `.tribes/privy-wallets.json` is NEVER read or
  referenced by any change.

## Failure & retry

- blocked-needs-provider: key or billing entry missing → backlog + human; the work order
  pauses; no workaround ships.
- fix-does-not-hold: iterate within the same work order (idempotency: one work order, many
  attempts); after two failed verify cycles, return to `eng-diagnose` with the new evidence —
  the hypothesis was likely wrong.
- upstream-shape-unstable (payload differs between captures): record both payloads, widen the
  schema deliberately (optional fields), and name the residual risk in the result.

## Timeouts & rate limits

- Fixture captures against news or analyst surfaces: explicit >=120 s bash timeout (prefer
  300).
- Live provider calls only to capture fixtures — bounded and recorded; tests run against
  mocks, never live providers.

## Observability

- The work order records: seam, files changed, fixture provenance, the money-path flag and its
  resolution, verify handoff, and the final result section. Acks per `org-protocol`.

## Escalation

- needs-human-approval (money path) → Head of Desk → user (`notify`); prior binary keeps
  running until approval.
- New provider or spend → backlog + Head of Desk → human.
- Verified change → Engineering Lead → requesting department with the work-order result; the
  requester re-opens with new evidence if the failure persists.

## Example

```bash
# WO 20260730T1015Z-sol-candles-parse: BirdEye solana OHLCV drift (seam: candle schema)
tribes-cli asset candles --address So11111111111111111111111111111111111111112 \
  --chain solana --timeframe 1h --out /tmp/fixture-sol-1h.json   # fixture capture
# edit the candle schema in src/types; adjust src/services/BirdeyeService.ts mapping if needed;
# add a regression case to tests/services/BirdeyeService.test.ts from the fixture
bunx vitest run tests/services/BirdeyeService.test.ts            # quick iteration check
```

Result: schema updated to the observed payload, regression test pinning the drift, work order
flagged not-money-path, change handed to `eng-verify-change`; result section lists files,
fixture provenance, and residual risk ("schema now tolerates extra fields").

## Acceptance

- [ ] Slice recipe followed: service, types, CLI builder, tests (and skill doc + routing row
      for new groups); conventions clean.
- [ ] Regression test authored and shown to pin the bug.
- [ ] Money-path check ran FIRST; approval pause honored; no unauthorized rebuild.
- [ ] Provider key env names match billing entries; new providers went to backlog, not code.
- [ ] Handed to `eng-verify-change` before the work order was returned.

## Related skills

- `eng-diagnose` — supplies the root-cause note this implements against.
- `eng-verify-change` — the mandatory gate before returning the work order.
- `eng-triage` — classifies new failures discovered mid-repair.
- `asset-data` — the router surface most adapter repairs sit behind.
- `org-protocol` — work-order layout, backlog, acks.
- `notify` — the human-approval and new-provider escalation channel.
