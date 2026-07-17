---
name: news-triage
description: News & Event Analysis workflow — monitor, assess materiality and source credibility, and route events to the right departments with handoffs. Use for breaking-news assessment, event monitoring, or building a news digest.
---

# News & Event Triage

Mandate: `news-events` in `docs/OPERATING_MODEL.md` — a central monitoring
utility whose product is *routing*: the right desk hears the right thing
with an honest credibility label.

## Steps

1. **Gather.** `pi news --query <topic> --json` (NewsData primary).
   For breaking/uncovered topics, fall back to `pi search "<topic>"
   --depth advanced` (Tavily) — web-derived results carry lower default
   credibility.
2. **De-duplicate and timestamp.** Cluster same-story items; record
   `publishedAt` vs retrieval gap. Free-tier news can be 12h delayed —
   the digest must say what window it actually covers.
3. **Assess each material item:**
   - *Materiality*: which instrument/desk does it move, and through what
     mechanism? If you can't state the mechanism, it's color, not signal.
   - *Credibility*: primary source (regulator filing, official release) >
     reputable outlet > aggregator > social. Provider ticker tags are
     unverified — confirm the entity mapping yourself.
   - *Confirmation*: single-source extraordinary claims stay `hypothesis`
     until corroborated; say what confirmation would look like.
4. **Route.** For each material event, create a handoff (`handoff` skill)
   to the owning department: desk for fundamentals, `independent-risk` for
   exposure-threatening events, `compliance` for MNPI-adjacent or
   restricted-name items (surveillance sits inside compliance).
5. **Digest artifact.** A `ResearchNote` (department `news-events`) listing
   items with credibility labels, what was routed where, and what was
   deliberately ignored (with reason).

## Rules

- Vendor sentiment scores are `model_estimate` — usable for triage
  ordering, never as a finding by themselves.
- Never let recency substitute for reliability; label both explicitly.
- MNPI discipline: if an item plausibly contains material non-public
  information, stop analysis and route to `compliance` first.
