---
name: org-compliance
description: >-
  Second-line compliance review for the trading organization: restricted-list screening,
  data-licensing hygiene, single-source claim quarantine, and a state-machine bypass audit —
  producing a pass | pass-with-conditions | blocked view that the first line may dispute but
  never edit. Handles: reviewing a strategy's evidence set before promotion when it leans on
  single-source social or internal-only provider data, screening instructions against the
  restricted list, periodic control reviews of the artifact store, and publication hygiene.
  Call it from the promotion path, the review workflows, or a periodic control pass. NOT for:
  investment views or trade quality (use research-evaluate); live execution safety (use
  exec-validate-instruction); portfolio limits (use portfolio-triggers); provider capability
  checks (use eng-provider-dd).
allowed-tools: bash read
---

# Org Compliance

## Identity

- Stable id: `org-compliance` — owner: Compliance Officer (second line, reports to the Head of
  Desk; organizationally outside every producing department).

## Purpose

Test the PROCESS, not the trade: does the artifact under review comply with the restricted
list, the data-licensing rules, the evidence-sourcing rules, and the state machine itself?
Compliance produces no investment views and never edits first-line artifacts; its findings are
recorded beside them, and disagreement from the first line is recorded as dissent — never
resolved by softening the finding.

## Inputs

Required: the artifact under review (strategy, instruction, observation set, or "periodic" for
a control pass) and the review trigger (promotion-gate, publication, periodic, escalation).
Optional: prior compliance findings for the same lineage.

## Outputs

A compliance view appended as a sidecar `<id>.compliance.json` (`org-protocol` ack shape plus
`verdict: pass | pass-with-conditions | blocked`, `findings[]` each citing the specific rule,
`conditions[]` testable ex post). `blocked` halts the promotion or publication it gates. A
periodic pass writes a work-order-style report under `.tribes/org/workorders/`.

## Integration

- Restricted list: `.tribes/org/config/restricted-list.json` (`{"assets": [], "reasons": {}}`;
  create the structure if absent — an unmaintained list is itself a finding, not a crash).
- Evidence audit: read the artifact's `sources[]`, `checks[]`, `payload`, `dissents[]` per the
  `org-protocol` envelope; read cited snapshots under `.tribes/org/snapshots/`.
- Bypass audit: `tribes-cli hyperliquid list-fills --address <addr>` and `list-open-orders
--all-dexes` diffed against `.tribes/org/orders/` and `instructions/`.
- Config audit: `.tribes/org/config/thresholds.json` change records.

## Preconditions

- Read access to `.tribes/org/`; the wallet address from `tribes-cli wallet list` for bypass
  audits. No signing capability is needed — this skill runs no mutating command, ever.

## Procedure

1. Scope: name the artifact, its state, and the trigger. Promotion-gate reviews are mandatory
   when the evidence set includes single-source social claims (zipbox-x) or internal-only
   provider data used as decisive evidence.
2. Restricted list: screen every instrument the artifact touches. A match → `blocked` until
   the human clears it via the Head of Desk.
3. Source audit: every material claim carries provider, command, and timestamps; single-source
   social "scoops" must show corroboration per the intel-news-triage independence rule or be
   quarantined (finding + condition, or blocked if decisive). Fabrication marks (checks
   without sources, sources without snapshots) are findings.
4. Licensing hygiene: provider data (Nansen, Birdeye, CoinGecko, X) is for internal decision
   use and user reporting only — flag any artifact staged for external republication of raw
   provider payloads; X data is metered and read-only by contract.
5. Bypass audit (periodic and on escalation): venue fills or resting orders with no matching
   instruction/order artifact; threshold loosenings without a recorded human confirmation;
   terminal states stamped by a role other than their charter owner. Each is a finding routed
   to the Head of Desk.
6. Issue the view: verdict + findings, each traceable to a rule in this skill, the charter, or
   `org-protocol`. Conditions must be verifiable later; vague conditions are not conditions.

## Validation

- Every finding cites its rule; every condition is testable ex post; the verdict follows the
  findings (any unresolved blocked-class finding → `blocked`).

## Risk & safety

- Second-line independence: NEVER edit a first-line artifact; NEVER produce or endorse an
  investment view; NEVER run a mutating or fund-moving command.
- When in doubt on a source's propriety, the answer is stop-and-escalate, not "probably fine".
- NEVER read `.tribes/privy-wallets.json`.

## Failure & retry

- Read commands: retry once, then record the audit gap as a finding (an unauditable control is
  a failed control, not a pass).
- An unreadable restricted list or config log → `pass-with-conditions` at best, with the
  repair as the condition.

## Timeouts & rate limits

- Read-only venue pulls: 60 s bash timeout; reuse the pass's shared snapshots per
  `org-protocol` budgets.

## Observability

- Views live as sidecars beside the artifacts they judge; periodic reports under
  `workorders/`. Nothing is deleted; superseded views stay in place.

## Escalation

- `blocked` → the gated promotion/publication halts; producer department lead + Head of Desk
  notified. Restricted-list and bypass findings → Head of Desk → the human (`notify`).
- First-line disagreement → recorded verbatim in the artifact's `dissents[]`; the finding
  stands until the Head of Desk or the human overrules it in writing.

## Example

```bash
cat .tribes/org/config/restricted-list.json
cat .tribes/org/strategies/20260730T110500Z-eth-funding-carry.json
tribes-cli hyperliquid list-fills --address 0xWALLET --out .tribes/org/snapshots/20260730T113000Z-fills.json
```

Success: `20260730T110500Z-eth-funding-carry.compliance.json` — verdict pass-with-conditions;
finding: one decisive X claim lacks second-source corroboration (intel-news-triage rule);
condition: corroborate or drop the claim before the instruction is minted.

## Acceptance

- [ ] Verdict issued with rule-cited findings and testable conditions.
- [ ] No first-line artifact edited; view delivered as a sidecar.
- [ ] Restricted list screened; bypass audit run when triggered.
- [ ] Blocked verdicts actually halted the gated action.

## Related skills

- `org-protocol` — envelope, sidecars, dissent rules this skill relies on.
- `research-evaluate` — the promotion gate that consumes the compliance view.
- `intel-news-triage` — the independence rule the source audit enforces.
- `intel-social-sentiment` — the metered X reads whose claims get audited.
- `eng-provider-dd` — licensing facts per provider.
- `notify` — human alerts on blocked and bypass findings.
