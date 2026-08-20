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