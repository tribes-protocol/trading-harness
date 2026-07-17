# Architecture

Institutional multi-asset research platform for the Pi harness. TypeScript,
Node ≥ 22, strict typing throughout. Everything an agent, skill, CLI, or
report consumes flows through one application layer.

```
                  .pi/skills · .pi/prompts (canonical) · .claude/* (derived)
                                 │  (department workflows)
                                 ▼
                     ┌──────────────────────────┐
   pi CLI ─────────► │      services layer      │ ◄──── reports / notebooks
                     │ market-data macro news   │
                     │ onchain search quality   │
                     └──────┬─────────┬─────────┘
                            │         │
                  ┌─────────▼───┐ ┌───▼───────────┐
                  │  registry   │ │   adapters    │  one per provider,
                  │ providers.  │ │ (frozen       │  behind typed
                  │ json+routing│ │  interfaces)  │  capability interfaces
                  └─────────────┘ └───┬───────────┘
                                      │
                  ┌───────────────────▼──────────────────┐
                  │                core                  │
                  │ config·redact·errors·logger·http     │
                  │ ratelimit·cache·pagination·time      │
                  └──────────────────────────────────────┘
```

## Layers

- **core** (`src/core`) — cross-cutting machinery. `HttpClient` centralizes
  timeouts, bounded retries with exponential backoff + jitter, Retry-After
  handling, per-provider token-bucket rate limiting, error mapping into a
  structured taxonomy, and secret-redacted structured logging. `config`
  loads credentials from env/.env only and registers every key with the
  redactor; nothing above this layer touches `process.env` for secrets.
- **schemas** (`src/schemas`) — zod schemas, versioned via `SCHEMA_VERSION`.
  Every dataset carries `source` (provider, endpoint, timestamps, cacheHit,
  freshness), `quality` flags, and `lineage` (explicit transform steps).
  Epistemic labels (`observed | calculated | model_estimate | hypothesis |
  assumption | analyst_judgment`) are mandatory on findings and signals.
- **providers** (`src/providers`) — one adapter per provider implementing
  only the capability interfaces its official docs verify
  (`QuoteSource`, `MacroSeriesSource`, `WalletBalancesSource`, …). Adapters
  normalize into schema shapes, stamp freshness truthfully (Marketstack EOD
  data is flagged `eod`, never presented as real-time), and expose one
  minimal-quota `liveProbe()` for `pi doctor --live`.
- **registry** (`src/registry`) — machine-readable capability registry
  (`providers.json`, validated by `ProviderRegistryFileSchema`). Each
  capability records freshness, historical depth, priority, and a
  verification status: `unverified → docs-reviewed → live-tested`.
  `routing.ts` selects primary/fallback providers per operation and
  records every fallback (payloads get a `fallback_source` flag).
- **services** (`src/services`) — the layer everything else calls. Adds
  routing, disagreement detection (never averaging — both views are
  preserved and flagged `provider_disagreement`), staleness annotation.
- **cli** (`src/cli`) — `pi` command: `registry`, `doctor [--live]`,
  `quote [--cross-check]`, `bars`, `series`, `series-search`, `news`,
  `search`, `token price`, `wallet`, `validate handoff|note|ic-memo`.
  Human-readable by default, `--json` for machine output; logs on stderr.
- **departments** (`src/departments`, `.pi/`, `.claude/`) — department
  definitions, handoff records (`HandoffSchema`), and the operating model
  of `docs/OPERATING_MODEL.md` encoded pi-first: canonical skills in
  `.pi/skills/`, canonical personas in `.pi/prompts/`; Claude Code assets
  are symlinked/generated from them (see AGENTS.md, "Harness layout").

## Design rules

1. **Documentation-first**: no adapter code without a docs research record
   in `docs/research/providers/` and a registry entry naming the docs URL
   and review date. Registry entries are the source of truth for what a
   provider verifiably offers.
2. **Verification honesty**: `live-tested` requires an actual successful
   call (recorded with timestamp). Absent keys ⇒ capabilities stay at
   `docs-reviewed`. Tests use mocked fixtures and never claim live status.
3. **No silent merging**: identifiers, currencies, frequencies, timezones,
   adjustment methods, and data vintages are explicit schema fields;
   transformations append lineage steps.
4. **Secrets**: env-only, registered with the redactor at load, masked in
   logs/errors/output by exact-value and pattern matching. `.env` is
   gitignored; `.env.example` documents variable names only.
5. **Failure containment**: retries are bounded, pagination is capped,
   rate-limit hits penalize the local bucket, and fallback usage is
   surfaced — degraded data is always labeled, never silent.
