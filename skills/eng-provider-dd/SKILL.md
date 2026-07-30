---
name: eng-provider-dd
description: >-
  Engineering due diligence on a data provider, documentation-first: verify auth, endpoints,
  rate limits, freshness, historical depth, licensing, and storage/attribution rules from the
  vendor's OFFICIAL docs, record the findings with sources consulted, and track a verification
  status ladder (docs-reviewed vs live-tested) that never upgrades without the corresponding
  act. Handles: vetting a proposed new provider before any adapter work, re-verifying an
  existing provider when an integration fails unexpectedly or terms may have changed, and
  keeping per-provider capability records. Call it before eng-repair-integration builds or
  fixes an adapter, and on unexplained integration failures. NOT for: writing the adapter (use
  eng-repair-integration); classifying a failure (use eng-triage); root-cause debugging (use
  eng-diagnose); compliance verdicts on artifacts (use org-compliance).
allowed-tools: bash read
---

# Eng: Provider Due Diligence

## Identity

- Stable id: `eng-provider-dd` — owner: Engineering. Invoked by: Integration Engineer.

## Purpose

Establish what a provider VERIFIABLY offers before code is written against it — from current
official documentation, never memory or blog posts — and keep that record honest over time
with a status ladder that separates "the docs say" from "we saw it work". A failing
integration re-enters here first: APIs change, and re-reading the docs precedes patching code.

## Inputs

Required: the provider id and the trigger (new-provider vetting, unexplained failure, terms
re-check). Optional: the capability gap or work order that motivated it.

## Outputs

A committed record `docs/org/providers/<id>.md` containing: review date, verified facts (auth
mechanism, base URLs, endpoints that matter, rate limits per plan, freshness, historical
depth, licensing/storage/attribution rules), `sources consulted` (URL + what each verified),
unknowns explicitly marked, and the verification status: `docs-reviewed` or `live-tested`
(with the date and the exact call that proved it). Facts, not recommendations; the go/no-go on
a new billed provider stays with the human.

## Integration

- Docs research: the `web-search` skill (search + one-URL extract); the `browser` skill only
  when vendor docs are JS-gated.
- Live testing: the provider's EXISTING tribes-cli read command where one exists (a real
  successful call is what upgrades status to `live-tested`); for a not-yet-integrated
  provider, live-testing waits for the adapter — status stays `docs-reviewed`.
- Repo constraints: provider key env-var names must match the control plane's egress billing
  entries (AGENTS.md); check `tests/services/EgressBillingContract.test.ts` for the pinned
  set.

## Preconditions

- The provider's official documentation is reachable. Third-party tutorials, SDK READMEs of
  unknown vintage, and model memory are NOT acceptable sources for any recorded fact.

## Procedure

1. Locate current official docs: vendor API reference, pricing/plan pages, terms of service.
   Record each URL alongside what it verified.
2. Verify systematically: auth mechanism; API version + deprecation policy; base URLs; the
   endpoints the org needs; request params and response schemas; supported
   assets/markets/chains; pagination; rate limits and quotas per plan; error behavior;
   freshness and historical depth; entitlements per tier; storage/caching restrictions;
   attribution requirements. Anything unconfirmable is recorded as `unknown` — never guessed.
3. Write or update `docs/org/providers/<id>.md` with the record shape in Outputs. Prior
   records are updated in place with a new review date, not forked.
4. Status ladder: set `docs-reviewed` for this work. Set `live-tested` ONLY after an actual
   successful call through the harness (record the date and command). Never upgrade status
   without the corresponding act; a failed live test downgrades to `docs-reviewed` with the
   failure noted.
5. Advise consumers: if licensing, limits, or coverage changed in a way that affects a
   department (new storage restriction, tightened quota), send the affected lead a work-order
   note; licensing constraints that can be enforced in code become requirements on the next
   `eng-repair-integration` pass.
6. New billed provider verdict: summarize cost, coverage, and the control-plane billing-entry
   requirement into the backlog (`.tribes/org/workorders/backlog.md`) for the human decision —
   this skill never signs anyone up.

## Validation

- Every recorded fact traces to a consulted official URL; unknowns are labeled unknown; the
  status matches the acts actually performed.

## Risk & safety

- No credentials are created, pasted, or recorded; API keys arrive only via control-plane env
  injection. NEVER read `.tribes/privy-wallets.json`.
- No trading authority: this skill reads docs and runs read-only harness commands at most.

## Failure & retry

- Unreachable docs: retry once, then record the gap and stop — a DD with unverified facts is
  not delivered as done.
- A live test that fails is a finding for `eng-triage`, not a reason to loosen the record.

## Timeouts & rate limits

- `web-search` calls: 60 s; JS-gated pages via `browser` per that skill's budget rules. Live
  tests reuse pass snapshots where possible.

## Observability

- The committed `docs/org/providers/<id>.md` record is the audit trail; backlog entries link
  to it; work orders reference the review date they relied on.

## Escalation

- New billed provider or changed terms needing spend/billing decisions → Engineering Lead →
  Head of Desk → the human.
- Discovered licensing violations in current usage → `org-compliance` for a control review.

## Example

```bash
# re-verify a provider after an unexplained 429 pattern
tribes-cli web-search search --query "Nansen API rate limits documentation"
tribes-cli web-search extract --url https://docs.nansen.ai/api/rate-limits
```

Success: `docs/org/providers/nansen.md` updated — review date today, per-plan limits
corrected from the official page (URL recorded), status `live-tested` retained with the prior
successful call noted, and a heads-up work-order note to the Intelligence Lead about the
tightened per-minute quota.

## Acceptance

- [ ] Every fact traces to an official source URL; unknowns marked unknown.
- [ ] Status ladder honest: no upgrade without the act, downgrades recorded.
- [ ] Affected departments advised on material changes; billed decisions escalated.
- [ ] On integration failure, docs were re-read BEFORE any code was patched.

## Related skills

- `eng-repair-integration` — builds the adapter after (and per) this record.
- `eng-triage` — failure classification that may trigger a re-verification.
- `eng-diagnose` — code-level root cause once docs are ruled out.
- `org-compliance` — licensing hygiene on the consuming side.
- `web-search` — official-docs search and extraction.
- `browser` — JS-gated vendor documentation.
