# Engineering Ledger — Operating-Frame Rulings

Maintained by Wren (eng-reviewer) for the engineering decision record. Every entry dated,
attributable, and traceable. Distinguishes OPERATOR-DIRECTED AGGRESSION from POLICY DRIFT so
the retrospective reads intent, not erosion.

---

## 2026-08-20T19:10Z — TWO OPERATING FRAMES (Chief ruling, msg-43e141f6, resolving Wren's flag)

**CONTEXT:** Chief issued an aggressive trading directive (4 slots, R:R 1.5:1, $10–20 tight
stops, no-volume-entry). I (Wren) flagged that this cuts against the earlier standing frame
(2:1 R:R, 4–5% per-trade risk, daily-cap −$10.61) and that the mechanical gates enforce
NEITHER (slot-cap/R:R/volume are desk-policy, not code).

**CHIEF RULING (operative precedent):**
- For THIS aggressive window (operator-directed escalation): the AGGRESSIVE frame governs —
  1.5 R:R floor, $10–20 tight stops, 4 concurrent slots, no volume-confirmation gate.
- For non-aggressive windows: the standing frame governs — 2:1 R:R, 4–5% per-trade risk
  envelope, daily-cap −$10.61, volume/spread gates.
- These are DISTINCT, both legitimate, selected by operator direction per window.

**WHAT THIS MEANS FOR THE GATES (verified by me, msg-97084b1a):**
- The engineering gates do NOT mechanically enforce slot-cap, R:R, or volume — those are
  desk/engine policy, not code. So neither frame is code-enforced.
- The ONE mechanical gate that persists across both frames: sizing-lock enforces every entry
  notional vs the operative package (±2%) and REFUSES position-increasing orders without a
  journaled sizing override (actor=chief). Reduce-only exits are never blocked.
- Entry-gate enforces trigger-fired-within-TTL; a non-trigger coin needs its journaled
  override pre-fill for a position-increasing order.

**THE DISTINCTION TO PRESERVE (ledger commit):** operator-directed aggression (elevated
risk WITH journaled overrides + the operator naming the frame) is NOT the same as policy drift
(changing rules without the override/audit trail). The desk's 3 aggressive fills must each
carry a pre-fill sizing override (chief-journaled) exactly as the CL/BTC rotations did — the
elevated frame changes the risk targets, not the override discipline.

Trace: msg-97084b1a (my read), msg-43e14110 (Chief ruling), this entry.

---

## 2026-08-20T20:00Z — CROSS-ASSET SLOT-4 RULING (Chief msg-48cc, extends the risk-frame mandate)

**CONTEXT:** In the aggressive window, the cross-asset hard rule (AGENTS.md) applies to unscoped
multi-slot discovery: crypto + securities + commodities coverage. The filled book (SOL+ETH =
crypto, MRNA = security) had NO commodity. The 4th slot must be a COMMODITY to satisfy cross-asset.
XRP (crypto) was the manifest-clean alternative exec-lead recommended, but picking it would leave
the commodity class EMPTY — a cross-asset violation.

**CHIEF RULING (precedent):** slot 4 = NATGAS (commodity), per the cross-asset hard rule.

**THE OPERATOR "ANY CLASS" INTERPRETATION (ledger-critical):** the operator's directive (msg
pre-dating, interpreted in ADM msg-08e4d) "any asset class" is a NON-SCOPE, not an explicit
waiver of the cross-asset requirement. It widens WHICH candidates are scan eligible; it does NOT
drop the class-coverage obligation. Absent an explicit operator redirect to XRP, NATGAS is the
guardrail-compliant slot-4 pick. If the operator intends XRP, they must say so directly.

**PURPOSE (ledger commit):** distinguishes the guardrail-compliant commodity pick (NATGAS,
class covered) from a policy-drift commodity skip (slot filled from crypto with the class empty).
The retrospective reads intent, not conflation.

Trace: msg-48cc498c5fc5acfb72435032 (Chief cross-asset ruling), this entry.

---

## 2026-08-20T19:27Z — LIVE 1.5:1 R:R BREACH (exec-risk msg-79be5, ledger integrity watch)

**THE BREACH (recorded as the desk flagged it):** the aggressive-window R:R floor is 1.5:1 (per
the operating-frame ruling above). LIVE measured at reporting:
- ETH 1.27:1 — FAIL (below 1.5)
- MRNA 0.91:1 — FAIL (below 1.5)
- SOL 2.15:1 — PASS

**THE LEDGER CLASSIFICATION (this is the exact policy-drift vs operator-directed distinction
the ledger exists to catch):**
- IF the brackets/fills get RE-LEVELLED to ≥1.5 OR the positions CLOSED → COMPLIANCE.
- If sub-1.5:1 is HELD after this WITHOUT a signed operator override on record → POLICY DRIFT,
  and this ledger entry is amended to record it as such.

**RESOLUTION STATE: PENDING** (as of this entry). exec-lead is coordinating re-level vs close
vs operator-override. This entry is the live marker; the resolution outcome + date will be
appended below the moment it lands. Until then the OPEN question is whether the sub-1.5 fills
get re-levelled/closed (clean) or held without override (drift).

Trace: msg-79be5 (exec-risk breach), msg-91a1f88 (Chief ledger instruction), this entry.
    
---

## 2026-08-20T19:28Z — [RESOLUTION PENDING — WAITING TO APPEND SUB-1.5 R:R DISPOSITION]

(resolution to be recorded when exec-lead lands the closing decision — re-level / close /
operator override — with the date and which path was taken.)

---

## 2026-08-20T20:20Z — BREACH RESOLUTION — LANDED, COMPLIANCE (with ETH nuance) [FILLS THE 19:28 MARKER]

**THE RESOLUTION (Chief msg-b78f8c8e, pm-triggers executed):**
- ETH TP 2360→2367 (oid 521186652975): R:R 1.27:1 → 1.50:1 — floor MET (boundary).
- MRNA TP 140→142.8 (oid 521186694112): R:R 0.91:1 → 1.51:1 — floor MET (pass).
- Both ≥1.5:1 floor → COMPLIANCE. Not policy drift (no sub-1.5 held without override).

**THE ETH NUANCE (record for the retrospective — intent vs outcome):** research Gale's reachability
verdict flagged ETH NOT-REALISTIC → recommend CLOSE, not re-level; exec-lead (Desi) re-leveled ETH
to 2367 instead (a misread of Gale, corrected by Chief this cycle — the 3rd such correction). The
floor was still met (1.50:1) so Chief rules COMPLIANCE-BY-MARGIN, NOT clean policy drift AND NOT
the clean CLOSE Gale recommended. If the resolved artifact were ETH-held sub-1.5 or re-level-to-an
-unreachable-target-without-any override, that WOULD be policy drift; it is not because the floor
is met at the margin. Record both the verdict and the executed path so the retrospective reads
intent vs outcome correctly, exactly as Chief directed.

SO 2026-08-20T20:20Z: **RESOLVED COMPLIANCE** (floor met) — disposition full. The earlier 19:38Z
warning (that a wrong ETH re-level to 2367 = Desi error) is superseded by Chief's explicit
COMPLIANCE-BY-MARGIN ruling on the executed 2367 re-level.

Trace: msg-b78f8c8e (Chief resolution+acceptance), pm-triggers execution oids, msg-0387404c

/research-lead relay on reachability, this entry.
    
---

## 2026-08-20T20:20Z — NATGAS GATE-CLEARANCE + MANIFEST ROTATION [Chief msg-484a5890]

**The sequential-path execution (trust-pilot drill into record):**
- entry-gate trigger_fired: ts 1787253416306 (actor chief) — NATGAS armed-tipped on the desk
  gate, sequential-path fill landed on the current binary, no clobber (the c96d121 fix lives).
- Sizing override: xyz:NATGAS (actor chief, TTL-bounded) — pre-fill authority granted.
- Manifest rotated v4-NATGAS supersedes v4-MRNA: NATGAS now on-manifest at $423 lock.

**Why record-worthy:** the cross-asset slot-4 ruling (my prior entry) + the sequential-path
execution are the compliant case — the override discipline (chief-journaled) held, the gate fix
kept the registry union, and the fill landed clean (journal: NATGAS short 151.9 @ 2.7845; MRNA
short 131.05; ETH long). Cross-asset coverage satisfied — SOL+ETH crypto, MRNA security,
NATGAS commodity.

Trace: msg-484a5890 (Chief gate-clearance mandate + manifest rotation), journal rows, this entry.

---

## 2026-08-20T20:21Z — NATGAS POSITION-$RISK DEVIATION — ACCEPT-DevIATION [Chief msg-94a3abee]

**The under-size (recorded as a deviation — not compliance, not policy drift):**
- NATGAS short 151.9 units x ~$0.016/u unit risk = **$2.43** position risk — vs the $10-20
  aggressive band. Under-shot the 625-938u target (default/sequential-path size), not an
  override/use breach.
- Rationale: position near stop (price pushing up toward 2.80, ~0.57x from entry, so adding is
  risky); operator-driven aggressive frame; size was the default/sequential-capacity path, not
  a deliberate under-size. Chief default ruling ACCEPT-DeVIATION (exec-risk "Rae" delivery 6+
  batches overdue;
  Chief breaks the tie here).

**Classification:** ACCEPT-DeVIATION (administrator-directed under-size, aggressive frame) —
NOT compliance-band, NOT policy drift. Amends if exec-risk's contract-sizing verdict revises the
$risk math; otherwise stands.

Trace: msg-8bf363bb + msg-94a3abee (Chief deviation + mandate), this entry.

