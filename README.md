# Pi Research Platform

Institutional multi-asset investment-research platform, built **pi-first**
for the [pi coding agent](https://pi.dev): a strictly-typed TypeScript
application layer (provider adapters, versioned schemas, capability
registry, routed services, CLI) plus harness-native department skills and
personas modeling a multi-strategy fund's operating structure. Claude Code
is supported as a secondary harness.

## Quick start (pi)

```bash
npm install
cp .env.example .env        # add provider API keys (all optional)
pi                          # in this directory; trust the project when asked
```

Inside pi: skills are `/skill:<name>` (e.g. `/skill:market-brief`,
`/skill:risk-review`, `/skill:crypto-research`), department personas are
`/<name>` (e.g. `/risk-officer`, `/macro-analyst`). All data flows through
the platform CLI:

```bash
npx tsx src/cli/index.ts registry        # provider capability registry
npx tsx src/cli/index.ts doctor          # config check (--live: 1 minimal call/provider)
npx tsx src/cli/index.ts quote AAPL --json
npx tsx src/cli/index.ts series CPIAUCSL --from 2020-01-01
npx tsx src/cli/index.ts token price --chain ethereum --address 0x...
npx tsx src/cli/index.ts token ohlcv --id bitcoin --interval 1d --limit 90
npx tsx src/cli/index.ts news --query "central bank"
npx tsx src/cli/index.ts search "tokenized treasuries adoption"
npx tsx src/cli/index.ts validate handoff artifacts/handoffs/<file>.json
npm test && npm run typecheck
```

## What's here

| Layer | Where | Notes |
|---|---|---|
| Core machinery | `src/core/` | HTTP (timeouts/retries/backoff/Retry-After), per-provider rate limiting, TTL caches, pagination caps, structured redacting logger, env-only credentials |
| Schemas | `src/schemas/` | zod, versioned; every dataset carries source, freshness, quality flags, lineage; epistemic labels on findings |
| Provider adapters | `src/providers/<id>/` | 10 providers, each built documentation-first from `docs/research/providers/<id>.json`, with doc-derived fixtures + mocked tests |
| Capability registry | `src/registry/providers.json` | machine-readable verified capabilities, freshness, priorities, rate limits, licensing; verification status `unverified → docs-reviewed → live-tested` |
| Routed services | `src/services/` | primary/fallback routing with recorded fallback usage, cross-provider disagreement surfacing (preserved, never averaged) |
| CLI | `src/cli/` | `pi` — human-readable + `--json`; logs on stderr |
| Departments | `src/departments/`, `docs/OPERATING_MODEL.md` | 17 modeled departments across three lines of defense; typed handoff artifacts with preserved dissent |
| Skills (canonical) | `.pi/skills/` | 18 department workflows (macro/equity/crypto/FI/commodities research, market-structure, quant-signal, model-validation, risk-review, portfolio-review, ic-memo, compliance-check, news-triage, ops-treasury, performance-report, market-brief, provider-dd, handoff) |
| Personas (canonical) | `.pi/prompts/` | 16 department personas with embedded discipline rules; `.claude/agents/` is generated from these via `npm run sync:agents` |
| Claude-only workflows | `.claude/workflows/` | `morning-brief`, `ic-review`, `token-dd` multi-agent orchestrations (Claude Code's Workflow engine) |
| Research records | `docs/research/` | provider docs reviews (with sources consulted) + operating-model research |

## Design commitments

1. **Documentation-first** — every provider capability claim traces to an
   official-docs review with URLs and review date. Failing integrations
   trigger doc re-reads, not blind patches.
2. **Verification honesty** — nothing is marked `live-tested` without an
   actual successful call. With no API keys present, adapters ship
   `docs-reviewed` with mocked tests, and `pi doctor --live` upgrades
   status only when it truly runs.
3. **Data honesty** — EOD/delayed/cached/estimated data is flagged and
   described as such, everywhere, always. Provider disagreements are
   surfaced with both values. Missing coverage (options chains, futures
   curves, bond-level FI) fails loudly — see `docs/COVERAGE.md`.
4. **Secrets** — env vars only, registered with a redactor that scrubs
   logs, errors, and outputs; `.env` is gitignored.
5. **Auditability** — research notes, handoffs, IC memos are schema-valid
   JSON artifacts with evidence types, confidence, limitations, and
   verbatim dissents.

## Harness compatibility (pi-first)

The TypeScript platform (services, CLI, tests) is harness-agnostic — any
agent that can run shell commands drives it via `npx tsx src/cli/index.ts`.
The agent-facing assets are canonical in `.pi/` with Claude Code support
derived from them:

| Asset | pi (pi.dev) — primary | Claude Code — derived |
|---|---|---|
| Project context | `AGENTS.md` (pi-native) | `CLAUDE.md` symlink → `AGENTS.md` |
| Skills (18) | `.pi/skills/` canonical (Agent Skills standard; `/skill:<name>`) | `.claude/skills` symlink → `.pi/skills` (`.agents/skills` likewise, for newer pi builds and other harnesses) |
| Department personas (16) | `.pi/prompts/` canonical (`/<name>`; frontmatter carries `description` + `claudeTools`) | `.claude/agents/` **generated** by `npm run sync:agents` — edit the `.pi/prompts` source, never the output |
| Multi-agent workflows (3) | not available — pi has no orchestration; use the single-agent skill equivalents: `market-brief` ≈ morning-brief, `ic-memo` ≈ ic-review, `crypto-research` ≈ token-dd | `.claude/workflows/` (Workflow engine), an optional extra |

Note: the pi coding agent's binary is `pi`. This package deliberately
declares **no** `bin` entry — always invoke the platform CLI as
`npx tsx src/cli/index.ts` to avoid shadowing the harness binary.

## Documentation

- `docs/ARCHITECTURE.md` — layers and design rules
- `docs/DATA_STANDARDS.md` — provenance, quality flags, identifier discipline
- `docs/OPERATING_MODEL.md` — departments, governance forums, handoffs
- `docs/COVERAGE.md` — honest asset-class coverage map
- `docs/providers/<id>.md` — per-provider verified capability docs
