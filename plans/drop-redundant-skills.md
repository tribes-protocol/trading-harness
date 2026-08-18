# Drop redundant local skills in favor of the zipbox catalog — plan

Authored 2026-08-18 by the planning subagent. All file:line references are against
`trading-org` @ `eb15c8a`. Implementer: verify your base is at-or-after that commit.

Product-owner request: "Is the trading-harness providing any browser or websearch or redundant
skills? Make sure to remove that in favor of all of our `zipbox-*` skills."

## Verdicts (capability comparison, not name matching)

| Skill          | Verdict    | Basis                                                                                                                                                                                                                                                                                                                                                                                                           |
| -------------- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `browser`      | **REMOVE** | Both wrap the same `@playwright/cli` with the same `pwcli` env wrapper, headless-only rules, session model, and safety rules. `zipbox-browser` is a superset: adds `generate-locator`, network mocking (`route`/`unroute`/`network-state-set`), and modal-state error guidance the local copy lacks. No auth in either. Local copy's only extras are finance routing clauses (moved into AGENTS.md, see below). |
| `web-search`   | **REMOVE** | Same backend: `tribes-cli web-search` POSTs to `/agent/web/search` + `/agent/web/extract` (`src/helpers/WebSearch.ts:10-11`); `zipbox-websearch` curls the identical endpoints. Same output, same limits. The `tribes-cli web-search` command group **stays** — only the skill doc goes. Caveat flagged below.                                                                                                  |
| `notify`       | **REMOVE** | `zipbox-notify` (upstream) explicitly routes trading-harness boxes to the native CLI: "If you are on a trading-harness / ATA box, `tribes-cli notify \"<message>\"` is that harness's own CLI — use it and stop." The CLI (`src/cli/Notify.ts`, `NotifyService`, `Osc`/`Tty` utils), the `session_shutdown` auto-hook, and AGENTS.md's "## Notifying the user" section all **stay**. Only the skill doc goes.   |
| `news`         | **KEEP**   | Asset-scoped market news with sentiment via `tribes-cli news`. No zipbox equivalent exists.                                                                                                                                                                                                                                                                                                                     |
| `tribes-login` | **KEEP**   | Trading-specific guided auth. No zipbox equivalent.                                                                                                                                                                                                                                                                                                                                                             |

**Redundancy sweep of the other 63 local skills: none found.** All 68 descriptions were read
against the 12-skill zipbox catalog. `wallet-analyst` (third-party wallets, Nansen) is
complementary to `zipbox-wallet` (this sandbox's own Privy wallet) — both already coexist in the
routing map. `intel-social-sentiment` already consumes `zipbox-x` rather than duplicating it. No
local skill touches caddy, dns, email, api-keys, desktop, geo, or image.

**Flagged capability caveat (web-search).** `zipbox-websearch`'s transport is
`tribes-agent-token`, a helper baked into zipbox sandboxes only. Outside a sandbox (Claude
Code/Cursor/local shell, which AGENTS.md's Installation section explicitly supports),
that wrapper fails and reports "credential unavailable", while `tribes-cli web-search` keeps
working everywhere after `tribes-cli login`. The CLI stays and remains the documented backing of
`research-analyst`, `news`, `commodity-analyst`, and the desk prompts, so no flow loses its
tool; only the generic "search the web" _skill routing_ changes. Mitigation included in the edit
map: the AGENTS.md precedence bullet notes the CLI as the non-sandbox path.

## Scope decision: the sync channel must be repointed in this change

The vendored catalog pins `696490a` from `tribes-protocol/ai-harness-setup` — **archived**, 7
skills, stale content (its `zipbox-email` wrongly denies HTML/attachment support). Canonical home
is now `tribes-protocol/terminal` at `harnesses/setup/skills/`, which holds **12** skills
(measured on `origin/main`, 2026-08-18): the 7 plus `zipbox-api-keys`, `zipbox-desktop`,
`zipbox-geo`, `zipbox-image`, `zipbox-notify`.

Repointing is **not** optional scope-widening; it is a hard dependency of the notify removal:

1. Every org escalation path must route somewhere. The replacement, `zipbox-notify`, does not
   exist in this repo until it is vendored, and `tests/skills/SkillsContract.test.ts` fails on
   any reference to a skill that is not on disk.
2. `scripts/install-shared-skills.sh` derives the sandbox's runtime `/root/skills` catalog from
   `skills/.synced.json` — the staleness is live in production trading sandboxes today (7 stale
   skills, 5 missing), including the false `zipbox-email` claims.
3. The owner asked for "all of our zipbox-\* skills"; the archived pin can never deliver more
   than 7.
4. The current channel is dead anyway — any future `skills:upgrade` needs this fix.

Vendor-compatibility was measured against `tribes-protocol/terminal` `origin/main`: all 12
SKILL.md files are ≤300 lines (max 299, `zipbox-image`), all carry `allowed-tools: bash read`,
each skill directory contains only `SKILL.md`, and every `## Related skills` bullet references
only other zipbox-\* skills — so the full set passes `SkillsContract` after a sync. Sync from
terminal's `main` **tip at implementation time** and record the sha the script resolves; a
`zipbox-email` content fix is in flight on terminal and rides along if merged, which is fine.

`tribes-protocol/terminal` is **private**, so the anonymous-codeload fetch in
`scripts/skills-upgrade.mjs` cannot survive the repoint (see step 1).

## Implementation steps (ordered; verify after each)

### 0. Baseline

`bun install --frozen-lockfile`, then `bun run format:check` and
`bunx vitest run tests/skills/` on the clean branch. Both must be green before any edit — if
`format:check` is already red, stop and report rather than absorbing unrelated reformats into
the skills:upgrade run (it executes `bun run format` repo-wide).

### 1. Repoint `scripts/skills-upgrade.mjs`

- `UPSTREAM_REPO` → `tribes-protocol/terminal`.
- Skills live at `harnesses/setup/skills/` in that tree, not `skills/`: parameterize the path
  `fetchUpstreamSkills` resolves after extraction (`skills-upgrade.mjs:322` area,
  `join(extracted, 'skills')`).
- The repo is private: replace the anonymous
  `curl https://codeload.github.com/...` fetch with an authenticated
  `gh api repos/tribes-protocol/terminal/tarball/<sha>` download (write the response to the
  tarball path; `gh` already authenticates `resolveSha`). Update the "Public repo" comment —
  it is now false.
- `H1_MARKER` text and the header comments name `tribes-protocol/ai-harness-setup`; rename to
  the terminal repo. Also update the prefix-filter comment at `skills-upgrade.mjs:90` whose
  example list names `browser` and `web-search` as protected trading skills (they are being
  removed; `news` remains a correct example).
- Same rename sweep in prose: AGENTS.md "### Updating the shared skills" (line 260 area) and
  the docblock of `tests/skills/SyncedSkills.test.ts` (comments only; no assertions change —
  the test deliberately pins shape, not the sha or file list).

### 2. Run the sync

`bun run skills:upgrade`. Expected result: 12 vendored skills, refreshed content for the 7,
`skills/.synced.json` rewritten with the terminal sha, the AGENTS.md marker-fenced routing
bullets (lines 197–207) regenerated to 12 entries. Nothing outside `skills/zipbox-*`,
`skills/.synced.json`, and the fenced block should change. `bunx vitest run tests/skills/`
must be green at this point (the new bullets keep every skill referenced in the routing
section).

Do not hand-edit anything under `skills/zipbox-*` — `SyncedSkills.test.ts` recomputes sha256
per vendored file and fails on any hand-edit.

### 3. Delete the three skills — and watch the contract test go red

`git rm -r skills/browser skills/web-search skills/notify`.

`bunx vitest run tests/skills/SkillsContract.test.ts` must now FAIL, specifically on:

- routing map unknown tokens: `web-search` (AGENTS.md:144, 172), `browser` (145, 173),
  `notify` (174);
- description `(use …)` refs: `research-analyst` (web-search + browser), `news`, `prediction`,
  `intel-social-sentiment` (web-search);
- `## Related skills` bullets naming the removed slugs (files below).

If it does not fail here, the instrument is broken — stop and investigate before proceeding.

### 4. Rewrite every reference

Guiding rule: **does the text name the skill (a routing pointer) or the CLI command (a
capability)?** Skill pointers move to the zipbox slug. CLI mentions
(`tribes-cli web-search …`, `tribes-cli notify …`) stay verbatim — both command groups remain
in the product (`src/cli/WebSearch.ts`, `src/cli/Notify.ts`, composed in `src/cli/Tribes.ts`).

AGENTS.md:

- 144–145 External-info precedence: `web-search` → `zipbox-websearch`, `browser` →
  `zipbox-browser`; append the caveat "(outside a sandbox, `tribes-cli web-search` is the same
  backend)".
- Routing table rows: 172 → `zipbox-websearch`; 173 → `zipbox-browser`; 174 → `zipbox-notify`.
- "## Notifying the user" (≈375) stays as-is — it documents the CLI, which survives.

Skills — `## Related skills` bullets (contract-enforced) plus body prose:

- `skills/eng-provider-dd/SKILL.md`: 46, 102, 142 (→ `zipbox-websearch`), 143 (→ `zipbox-browser`).
- `skills/commodity-analyst/SKILL.md`: 32, 88, 141, 149 (→ `zipbox-websearch`), 150 (→
  `zipbox-browser`); lines 69/71/83 are `tribes-cli` commands — keep.
- `skills/research-analyst/SKILL.md`: 10 (description, both), 34, 36, 49, 107, 113, 114;
  lines 17/22/42/59/60/81–94 are CLI mentions — keep.
- `skills/news/SKILL.md`: 9 (description), 25, 98, 101, 117, 118.
- `skills/prediction/SKILL.md`: description `(use web-search)` (folded across lines 9–10), 26, 120.
- `skills/intel-social-sentiment/SKILL.md`: 5 + 12 (description), 80, 127, 183; 64/134 are CLI — keep.
- `notify` → `zipbox-notify` in: `org-protocol` 166/238, `exec-onchain-swap` 150/191,
  `eng-verify-change` 139, `portfolio-reconcile` 144/180, `eng-repair-integration` 104/152/189,
  `exec-order-lifecycle` 149/185, `eng-triage` 83/125/157, `portfolio-triggers` 171/204,
  `exec-place-order` 131, `org-compliance` 113/143, `eng-diagnose` 136/170.

`.agents/` role docs (not contract-enforced, but they route the org):

- `desk-news.md:19` → `zipbox-websearch` / `zipbox-browser`.
- `eng-integration.md:55`, `pm-triggers.md:61`, `eng-lead.md:62`, `pm-position-monitor.md:50`:
  `(\`notify\`)`→`(\`zipbox-notify\`)`.
- `desk-stock-research.md:21-22`, `desk-commodity-research.md:19-20`, `intel-news.md:35/45`:
  CLI command usage — keep.

`docs/org/ORGANIZATION.md`:

- 171 (skill catalog list) → `zipbox-websearch`; 279, 348, 378 `(\`notify\` skill)`→`zipbox-notify`. Lines 451/478/525 name CLI invocations — keep.

`docs/qa/p25-shared-skills-inheritance.md`: 32 and 36 say "not the trading-only
`web-search`/`browser` skill" — drop the clauses; the comparison target no longer exists.

After the sweep, a repo-wide search for `` `web-search` ``, `` `browser` ``, and `` `notify` ``
must hit only CLI-command contexts, `src/`, `tests/`, historical `plans/`, and the Pi
extension's unrelated `ctx.ui.notify`. Historical plan files under `plans/` are records — do
not edit them.

### 5. Verify

- `bunx vitest run tests/skills/` green.
- Full gate: `bun run format:check`, `bun run lint`, `bun run build`, `bunx vitest run` —
  judge each by exit status, not output text.
- `test/shared-skills-install.test.sh` runs in CI as root; it derives its expectations from
  `.synced.json`, so the 12-skill manifest passes without edits. Do not run it locally as root
  on a machine that has `/root/skills`.

## Test plan (what fails, and when)

| Test                                                    | Today (`eb15c8a`) | After step 3 (deletion, no rewrites)                                                               | Done state |
| ------------------------------------------------------- | ----------------- | -------------------------------------------------------------------------------------------------- | ---------- |
| `tests/skills/SkillsContract.test.ts` routing-map check | pass              | **FAIL**: unknown tokens `web-search`/`browser`/`notify` at AGENTS.md 144/145/172/173/174          | pass       |
| `SkillsContract` description cross-ref check            | pass              | **FAIL** in `research-analyst`, `news`, `prediction`, `intel-social-sentiment`                     | pass       |
| `SkillsContract` Related-skills check                   | pass              | **FAIL** in the 14 skills listed in step 4                                                         | pass       |
| `tests/skills/SyncedSkills.test.ts`                     | pass (7 skills)   | pass — and **FAIL** if any vendored file is hand-edited or the manifest doesn't exactly cover disk | pass (12)  |
| `test/shared-skills-install.test.sh` (CI)               | pass              | pass (manifest-derived)                                                                            | pass       |
| `format:check` / `lint` / `build`                       | pass              | pass                                                                                               | pass       |

No test should be weakened, and none needs to be: the contract tests already encode exactly the
consistency this change must preserve.

## Blast radius

- **No code path invokes any of the three skills by name.** Measured: greps over
  `.pi/settings.json`, `bootstrap.sh`, `package.json`, `knip.jsonc`, `src/`, `tests/` find the
  names only in docs/skills and in unrelated identifiers (`ctx.ui.notify`, `NotifyService`).
  Skills here are doc-only by design (AGENTS.md: "no executable code under `skills/`").
- **Running sessions cannot lose a skill mid-flight.** The repo is cloned at provision;
  nothing live-updates `skills/` inside an existing sandbox. The new tree arrives with the next
  provision/pull, with routing rewritten in the same commit — no window where a referenced
  skill is missing.
- **Notifications keep working everywhere.** The `session_shutdown` auto-notify is a Pi
  extension writing the OSC escape directly (`.pi/extensions/tribes/index.ts:111` explains it
  cannot even reach the CLI); `tribes-cli notify` remains compiled and documented in AGENTS.md.
- **The org's escalation chains** (18 references across skills, `.agents/`, ORGANIZATION.md)
  are all repointed in the same commit to `zipbox-notify`, which itself instructs trading boxes
  to use `tribes-cli notify` — one extra doc hop, same behavior.
- `knip` is unaffected: deletions are markdown; both CLI groups stay composed in
  `src/cli/Tribes.ts`.

## Out of scope

- Removing the `web-search` or `notify` CLI command groups (they are the product's capability
  layer and the zipbox docs defer to them).
- Editing any vendored `zipbox-*` file (machine-written; fix upstream in
  `tribes-protocol/terminal` `harnesses/setup/skills/`).
- Historical records under `plans/` and any behavior of `scripts/install-shared-skills.sh`
  (already manifest-derived; needs no change).
