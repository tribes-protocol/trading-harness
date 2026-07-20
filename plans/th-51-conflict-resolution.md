# PR #51 (`leo/notify-cli`) — conflict resolution plan

Base: `main` @ `2afddca9c387` (advanced 2026-07-20T03:32:25Z by PR #76's squash merge)
PR head: `bf68774d9e28` · merge-base: `56bd096331bc`
Authored 2026-07-20 by the planning subagent; executed on branch `merge/pr51-notify-onto-main`.

## Verdict

**The PR is NOT redundant, and the conflict is NOT trivial.**

`git merge-tree --write-tree --name-only origin/main pr51` reports exactly TWO conflicts.
`AGENTS.md` and `src/cli/Tribes.ts` auto-merge cleanly — no work needed there beyond verification.

> NOTE: GitHub's `+914 / -0` diff stat is computed against the PR's STALE base and describes a
> tree that no longer exists. It is not evidence that this PR is a pure addition. Same defect as
> the green `verify` check on `bf68774d9e28`, which also predates the base move.

### Conflict 1 — `.pi/skills` (file/directory): a LAYOUT INVERSION, and it is trivial

|                      | `.pi/skills`                        | `skills/`              |
| -------------------- | ----------------------------------- | ---------------------- |
| merge-base `56bd096` | real directory                      | symlink → `.pi/skills` |
| `origin/main`        | symlink → `../skills` (mode 120000) | real directory         |
| `pr51`               | real directory (mode 040000)        | —                      |

`git diff --name-status 56bd096 pr51 -- .pi/skills` returns exactly **one line**:
`A .pi/skills/notify/SKILL.md`. Everything else under pr51's `.pi/skills/` is the stale
pre-inversion snapshot already present under `skills/` on main.

**Resolution:** keep main's symlink verbatim; land the one new file at `skills/notify/SKILL.md`.
Confirmed by `test/shared-skills-install.test.sh`, which builds the production contract
explicitly (`ln -s ../skills "$WORKSPACE/.pi/skills"`).

⚠️ The hazard was real even though the fix is one line: taking pr51's side naively would replace
the shared-skills symlink with a literal directory and silently revert the `/opt/harnesses/skills`
read-only-drive delivery path (#1914, `install-skills.sh`) — while the diff stat still read
"pure addition".

### Conflict 2 — `src/cli/Notify.ts` (add/add): main's 55 lines are NOT a subset of pr51's 191

|                         | `origin/main` (from #76) | `pr51`                                                                                                         |
| ----------------------- | ------------------------ | -------------------------------------------------------------------------------------------------------------- |
| Terminator              | **BEL** `\x07`           | **ST** `\x1b\\` (`src/utils/Osc.ts`)                                                                           |
| OSC 9 bare-message form | **emitted**              | **never emitted**                                                                                              |
| Write target            | `process.stdout`         | `/dev/tty` → `TRIBES_TTY` → ancestor-pty walk → stdout last                                                    |
| CLI flags               | `--title`, `--body`      | `-t/--title`, `-s/--subtitle`, `--sound`, `--sound-name`, `-b/--backend`, `--doctor`, `--list-backends`, stdin |
| Sanitisation            | clamp 200 only           | strips control/ESC/BEL, `;`→`,`, title 64 / body 200                                                           |
| Backends                | OSC only                 | terminal-notifier, osascript, notify-send, bell, osc                                                           |

pr51 is a capability superset **except** for three regressions: BEL→ST, OSC 9 dropped,
`--body` removed. `--body` is a documented breaking change (`AGENTS.md:333`).

A second in-repo emitter stays on main untouched: `.pi/extensions/tribes/index.ts:121` writes
`'\x1b]9;Trading agent session ended\x07'` — **BEL-terminated OSC 9**. Shipping pr51 as-is
would leave two emitters on different wire formats in one repo.

## Ruling (team-lead, 2026-07-20)

**Take pr51's architecture. Keep main's contract verbatim.** A PR that adds desktop
notifications does not get to change a wire format as a side effect.

Record in the PR body, in these words:

> **ST may or may not be supported; this PR deliberately does not find out.**

Do NOT write "we chose BEL because it's safer" — that implies weighing something nobody could
measure. The authoritative parser could not be located: `TerminalNotification.ts` in the
sandboxing repo is Zod schemas only — no regex, no terminator handling, no OSC parsing. The
question stays exactly as open as it was before this PR.

## Parallelisation

**Inherently sequential** — one branch, one conflict resolution, one verification run. Do not
fan out. Sole exception: step 3 (parser lookup) may run concurrently with step 2 (`bun install`),
since step 3 touches no files in the clone and step 2 touches only `node_modules/`. Everything
from step 4 onward is strictly ordered.

## Constraints (non-negotiable)

> **NEVER run `git stash`** — this repo's `.git` may be shared across worktrees and stash/reflog
> are shared state; commit instead.

- Do **not** merge PR #51. Do **not** push to `main`. Deliverable is a resolved branch, pushed,
  verified green locally. The merge call belongs to team-lead.
- If any step's expected output does not appear, STOP and report rather than working around it.

## Steps

1. **Re-verify starting state.** `git status --porcelain && git rev-parse origin/main pr51 && git merge-base origin/main pr51` → empty porcelain; `2afddca…`, `bf68774…`, `56bd0963…`. Non-empty porcelain → STOP. Do not stash.
2. **Install deps.** `bun install --frozen-lockfile` → exit 0. (CI pins bun 1.3.10.)
3. _(concurrent with 2)_ **Locate the OSC parser.** `find ~/Developer -name 'TerminalNotification.ts' -not -path '*/node_modules/*'`. Already checked: it is Zod schemas only. If no real parser is found, record that and proceed with BEL per the ruling. Do not block.
4. **Baseline the test count on main.** `git checkout -B merge/pr51-notify-onto-main origin/main && bunx vitest run` → expect `Test Files 16 passed (16)`, `Tests 162 passed (162)`, vitest v4.1.3. If different, record ACTUALS and use them — the _rise_ is what matters.
5. **Start the merge.** `git merge --no-commit --no-ff pr51` → non-zero exit; exactly the two conflicts above; `AGENTS.md` and `src/cli/Tribes.ts` auto-merge. Any third conflict → STOP.
6. **Resolve `.pi/skills`.** `git checkout origin/main -- .pi/skills && mkdir -p skills/notify && git show pr51:.pi/skills/notify/SKILL.md > skills/notify/SKILL.md && git rm -r --cached --ignore-unmatch '.pi/skills~origin_main' && rm -rf '.pi/skills~origin_main' && git add .pi/skills skills/notify/SKILL.md`. Verify: `.pi/skills -> ../skills`; `skills/notify/SKILL.md` present; `.pi/skills~origin_main` gone.
7. **Take pr51's `Notify.ts` as the base.** `git checkout pr51 -- src/cli/Notify.ts && git add src/cli/Notify.ts` → `wc -l` = 191. Starting point only; steps 8/10 patch it.
8. **Restore BEL** in `src/utils/Osc.ts`: `buildOscNotification` returns BEL-terminated, not ST. `sanitizeField` already strips all codepoints `< 0x20` (including BEL) from the payload, so BEL termination introduces no injection risk — say that in the comment, replacing the "never mistaken for a bell" rationale. Update `tests/utils/Osc.test.ts` to assert BEL.
9. **Bring in the genuinely-new files** (all absent on main, zero conflict risk): `git checkout pr51 -- src/services/NotifyService.ts src/types/Notify.ts src/utils/Osc.ts src/utils/Tty.ts tests/utils/Osc.test.ts tests/utils/Tty.test.ts && git add -A`. Ordering between 8 and 9 is the only flexible pair — re-apply the step-8 edit if this clobbers it.
10. **Restore `--body` and OSC 9** in `src/cli/Notify.ts`: add `.option('--body <text>', …)` and use it as the message when no positional args are given; add an OSC 9 emitter to `src/utils/Osc.ts` and have `NotifyService.sendOsc` use it for the bare-message case (default title `'Tribes Agent'`, no subtitle). Add a test.
11. **Update `AGENTS.md:333-334`.** The auto-merge only added the routing-map row; the "Notifying the user" section still describes the old two-flag CLI and "writes … to stdout". Rewrite for the backend model, `--doctor` / `--list-backends`, and the controlling-terminal target (stdout as fallback).
12. **Format, lint, typecheck.** `bun run format:check && bun run lint && bun run build` → all exit 0. `bun run build` is `tsc --noEmit -p tsconfig.json`. NOTE: `bun run test` is aliased to typecheck only — it does NOT run vitest.
13. **MANDATORY test-count check.** `bunx vitest run` → expect `Test Files 18 passed (18)` and a tests count **strictly greater** than the step-4 baseline. **If the file count is still 16, or the count did not rise, that is a FINDING, not a pass** — the new tests are not being collected. STOP, report, check `vitest.config.ts` include globs and staging. Do not push.
14. **Shared-skills contract.** `sudo -E sh test/shared-skills-install.test.sh` → exit 0, no `FAIL -` lines. If it refuses because `/root/skills` exists, note as environment-specific and rely on CI. Do not delete `/root/skills`.
15. **Commit.** Message records: the `.pi/skills` layout-inversion resolution, that main's `Notify.ts` was NOT a subset, and the three restored behaviours.
16. **Push and open a PR** from `merge/pr51-notify-onto-main` → `main`, referencing #51, with the caveat sentence verbatim. Leave #51 OPEN; comment on it pointing at the new PR.
17. **Confirm CI green** — `gh pr checks --watch`, including `Shared skills inheritance contract`.

## Critical files

- `src/cli/Notify.ts`
- `src/utils/Osc.ts`
- `src/services/NotifyService.ts`
- `AGENTS.md`
- `test/shared-skills-install.test.sh`
