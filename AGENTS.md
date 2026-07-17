# Pi Research Platform — project instructions

Institutional multi-asset research platform, **pi-first** (pi.dev is the
primary harness; Claude Code is supported). Read `docs/ARCHITECTURE.md`,
`docs/OPERATING_MODEL.md`, `docs/COVERAGE.md` before structural changes.

## Commands

- Typecheck: `npx tsc --noEmit` · Tests: `npx vitest run` (mocked; no network)
- CLI: `npx tsx src/cli/index.ts <cmd> --json` (data → stdout, logs → stderr)
- Health: `npx tsx src/cli/index.ts doctor` (`--live` costs one minimal call per configured provider)
- Regenerate Claude agent definitions after editing personas: `npm run sync:agents`

## Harness layout (pi-first)

- **Canonical**: skills in `.pi/skills/<name>/SKILL.md` (Agent Skills
  standard; invoke as `/skill:<name>` in pi); department personas in
  `.pi/prompts/<name>.md` (invoke as `/<name>` in pi; frontmatter carries
  `description` + `claudeTools`). Context file: this `AGENTS.md`.
- **Derived for Claude Code**: `.claude/skills` and `.agents/skills` are
  symlinks to `.pi/skills`; `.claude/agents/*.md` are GENERATED from
  `.pi/prompts/` by `scripts/sync-claude-agents.ts` — edit the canonical
  prompt, then `npm run sync:agents` (never edit `.claude/agents` by hand);
  `CLAUDE.md` is a symlink to this file. If a harness ever fails to follow
  the skill symlinks, extend the sync script to copy instead.
- **Claude-Code-only extra**: `.claude/workflows/` multi-agent
  orchestrations (pi equivalents are the single-agent skills:
  market-brief, ic-memo, crypto-research).
- Never declare a `bin: {pi}` in package.json — it would shadow the pi
  harness binary. The platform CLI is always `npx tsx src/cli/index.ts`.

## Hard rules

- **Documentation-first**: never add/modify a provider capability without
  updating its research record (`docs/research/providers/<id>.json`) and
  registry entry (`src/registry/providers.json`) from CURRENT official docs
  — use the `provider-dd` skill. Never invent endpoints/params/fields.
- **Verification honesty**: `live-tested` status requires an actual
  successful call (with date). Tests use fixtures derived from documented
  response shapes; never claim live verification from mocked tests.
- **Secrets**: env vars only (see `.env.example`), accessed via
  `src/core/config.ts` (never `process.env` directly for keys). Everything
  logged/thrown passes redaction. Never commit `.env`.
- **Data honesty**: quality flags (`eod`, `delayed`, `estimated`, `cached`,
  `fallback_source`, `provider_disagreement`) must be stamped truthfully
  and survive into any prose/reports. Delayed/EOD is never called
  real-time. Licensing guards: FRED & Birdeye — no disk caching; FRED
  output needs its attribution string; Nansen content is internal-only.
- **Schemas**: all cross-module data validates against `src/schemas/*`
  (zod). Breaking shape changes bump `SCHEMA_VERSION` in
  `src/schemas/common.ts`.
- All provider HTTP goes through `src/core/http.ts` (`HttpClient`) — no raw
  `fetch` in adapters. Adapters construct clients lazily (no key reads at
  import time) and accept `{ fetchImpl }` for tests.

## Layout

`src/core` (http/config/redact/errors/cache/ratelimit/pagination/time) →
`src/schemas` (zod, versioned) → `src/providers/<id>` (adapter, raw types,
fixtures, tests) → `src/registry` (providers.json + routing) →
`src/services` (routed, quality-annotated) → `src/cli`.
Departments: `src/departments`; research artifacts land in `artifacts/`
(they are the audit trail; keep them).

## Style

ESM with `.js` import suffixes, TypeScript strict + noUncheckedIndexedAccess,
no `console.log` (use `src/core/logger.ts`), tests colocated in provider
dirs + `tests/` for core.
