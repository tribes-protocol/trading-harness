---
name: provider-dd
description: Data Platform workflow — documentation-first due diligence for adding or re-verifying a data provider, updating the research record and capability registry. Use when integrating a new provider, when an integration fails unexpectedly, or when capabilities/licensing may have changed.
---

# Provider Due Diligence (Documentation-First)

Mandate: `data-platform` (vendor-management sub-function) in
`docs/OPERATING_MODEL.md`. The registry (`src/registry/providers.json`) is
the source of truth for what a provider verifiably offers — nothing enters
it from memory.

## Steps

1. **Locate current official docs** (WebSearch/WebFetch or `pi search`).
   Vendor docs, API reference, pricing/plan pages, terms. Third-party
   tutorials and blog posts are NOT acceptable sources.
2. **Verify systematically:** auth mechanism, API version + deprecation
   policy, base URLs, the endpoints that matter, request params, response
   schemas, supported assets/markets/chains, pagination, rate limits per
   plan, quotas, error behavior, freshness, historical depth, SDKs,
   entitlements per tier, storage/caching restrictions, attribution rules.
   Anything unconfirmable is recorded as "unknown" — never guessed.
3. **Write/update the research record**
   `docs/research/providers/<id>.json` with `reviewDate`, findings, and
   `sourcesConsulted[]` (URL + what it verified). Every factual claim must
   trace to a consulted URL.
4. **Update the registry entry** in `src/registry/providers.json`:
   capabilities with freshness/priority/notes, rate limits, licensing,
   limitations, preferred uses. Verification status rules:
   - `docs-reviewed`: what you just did.
   - `live-tested`: ONLY after an actual successful call (`pi doctor
     --live` or adapter tests against the live API) — record the date.
   - Never upgrade status without the corresponding act.
5. **Update the human doc** `docs/providers/<id>.md` and `docs/COVERAGE.md`
   if coverage shifted.
6. **Validate:** `npx tsx src/cli/index.ts registry <id>` must render, and
   the test suite must stay green (`npx vitest run`).
7. **Advise consumers.** If licensing/limits changed in a way that affects
   desks (e.g. new storage restriction), hand off an advisory to affected
   departments.

## Rules

- Failing integration? Re-read the docs BEFORE patching code — APIs change.
- Rate limits in the registry are the documented ones; adapters throttle
  below them.
- Licensing constraints become code-level guards where possible (e.g. FRED:
  no disk cache) and registry notes always.
