# Trading Journal — Taperoom Inc.

Durable record of every decision. One entry per decision, dated heading, newest at top.
Maintained by Mona (pm-position-monitor) for Portfolio Mgmt. Every number sourced with file
path + UTC timestamp; missing facts are marked MISSING, never invented.

---

## 2026-08-20 — ETH TP win (booked) — recoup nearly cleared (≈ $4.81 remaining)

ETH long 1.25 @ 2295.6 (main) took profit at TP 2320. Trig-verified (Portia msg-09f08404c4b54e0313e860b4);
confirmed on venue 15:33:16Z.

### Facts (sourced)

- **Exit:** Close Long ETH 2320.4 × 1.25 — oid 520987243453 (TP), closedPnl **+$31.00**,
  ts 1787239941564 = 15:32:21Z. All ETH orders cleared (clean flat, orders 0).
- **Round-trip:** entry 2295.6 × 1.25 (oid 520986678605) → TP 2320.4 → realized +$31.00.
- **Book state:** FLAT (0/2 slots); BTC band-limit 71,900–72,050 armed.
- **Recoup milestone:** $35.81 − $31.00 = **≈ $4.81 remaining** (deficit nearly cleared!); day
  realized ≈ +$47.4 net. Persisted in monitoring-baseline.md.

---

## 2026-08-20 — NVDA SL exit (booked) — slot freed for BTC band-limit

NVDA long 5.0 @ 217.78 (xyz) stopped out on SL 216.8. Fill Trig-verified (Portia
msg-4a25e9dedfde63b42c06f98a); confirmed on venue 15:26:58Z.

### Facts (sourced)

- **Exit:** Close Long NVDA 216.77 × 5.0 — oid 520960194162 (SL), closedPnl **−$5.05**,
  ts 1787239532152 = 15:25:32Z. All NVDA orders removed (clean flat).
- **Round-trip:** entry 217.78 × 5.0 (oids 520960002187) → SL 216.77 → realized −$5.05.
- **Book state:** ETH-only (slot 1/2); BTC band-limit (71,900–72,050) armed for the freed slot.
- **Recoup:** $30.76 + $5.05 = **$35.81** (deficit widens); day realized ≈ +$16.03 net
  (BTC/XRP −22.97 + SILVER +44.05 − NVDA −5.05). Persisted in monitoring-baseline.md.

---

## 2026-08-20 — SILVER scale-out (TP1 + TP2 filled, position closed) — booked to recoup

SILVER long 34.06 @ 67.2257 (xyz, authorized add; operator-directed per Chief msg-2d0bb22a). Full
scale-out completed; fills confirmed (Portia msg-f29326522d1207b00ed62b64, Desi confirmed).

### Facts (sourced)

- **Entry:** 34.06 @ 67.2257 (oid 520906529839 2.06@67.223 + oid 520908743785 30.51@67.226 +
  1.49@67.225), fees 0.206072.
- **TP1 fill:** oid 520909390998 @ 68.103/68.105 × 10 → closedPnl 7.483369+1.292571 =
  **+8.77594**, fees 0.061292 (ts 1787237603140).
- **TP2 fill:** oid 520909421393 @ 68.712/68.713 × 24 → closedPnl 11.563414+24.124006 =
  **+35.68742**, fees 0.148419 (ts 1787238155126).
- **Round-trip net: +$44.0476** (+44.46336 closedPnl − 0.206072 open fees − 0.209711 close fees).
- **Recoup impact:** remaining $74.81 − $44.05 = **$30.76**; persisted in monitoring-baseline.md.
- Stale SL 66.65 × 24.06 (oid 520962705872) cancel pending Runa (Desi dispatched); NVDA remains
  the tracked position (5.0 @ 217.78, full ladder).

---

## 2026-08-20 — BTC + XRP SL exits (book flat) — booked to recoup

Both positions closed on SL triggers 13:37Z; book flat. Fills Trig-verified (Portia
msg-2047d9acc73c10448541eccf).

### Facts (sourced)

- **BTC:** stop-market oid 520809051184 filled 0.0299 @ 71,190 at **13:37:08Z** → realized
  **−$20.66** (designed worst-case −$20 under the operator's daily-cap override; no stand-down on
  fill per ruling). Entry blended 71,881.1.
- **XRP:** stop-market oid 520861827364 filled 330 @ 1.1932 at **13:37:14Z** → realized **−$2.31**
  (scalp stopped ~6 min after entry 13:33:52 @ 1.2002).
- **TOTAL realized −$22.97.** Both exits reduce-only; never-naked held to the instant of fill —
  the brackets executed exactly as designed.
- **Recoup impact:** remaining $51.84 + $22.97 = **$74.81** (deficit worsens); persisted in
  monitoring-baseline.md; reported to Portia ~13:40Z.

---

## 2026-08-20 — Engineering integration test round-trip (sizing-lock/gate) — netted to recoup

> **Entry timestamp:** 2026-08-20 ~04:55Z (sourced from Ada/eng-head msg-062e4d698efb96322e9e373f;
> recorded ~04:5xZ on this update).

Sourced from **Ada (eng-head)**, msg-062e4d698efb96322e9e373f — Kai's actual fills from the
sizing-lock/gate (one-flag-exemption) integration test. This realized REAL PnL and must be
netted into the recoup baseline.

### Facts (sourced)

- **Entry:** oid 520493777380 (leg 520493777000001), buy 0.046 BTC in two legs @ 69,504.0,
  fees 0.588942 + 0.84979 = **1.438732**. ~04:55Z.
- **Close:** oid 520493891654, sell 0.046 @ 69,495.0, closedPnl **−0.414**, fee **1.438546**.
- **Net realized: −$3.2913** (price delta −$0.414 + total fees 0.588942+0.84979+1.438546 =
  $2.877278).
- **Recoup impact:** daily realized +$3.5741 (BTC close) − $3.2913 (test) = **+$0.2828 net**;
  remaining to recoup −$48.55 → **−$51.84** (deficit worsens).
- **Persisted:** monitoring-baseline.md updated ~04:5xZ (recoup figure + daily realized note);
  this entry added to trading-journal.md.
- Close timestamp not separately stated in the sourcing message — recorded entry ts ~04:55Z only
  (MISSING rather than invented).

---

## 2026-08-20 — BTC long 0.02166 @ 69,178.0 (no-trigger deployment; CLOSED +$3.5741, booked)

### 1. THESIS — why the long was taken

**The entry was a NO-TRIGGER deployment — a process breach. It fired despite an explicit
stand-by gate, not because a trigger fired.** Journal is for learning, not flattery, so this is
stated plainly:

- Package A-212 (`/root/workspace/.chief/agent/research-promoter/shared/scalping-package-A-212.md`,
  status "ARMING, AWAITING TRIGGER", 03:45Z) locked the desk to **STAND-BY until the entry
  trigger stack fires** (VWAP revisit, RSI extreme <30/>70, or Bollinger squeeze breakout) —
  "no entries until the trigger stack fires (see ENTRY GATE §G)".
- Beck's backtest (`/root/workspace/.chief/agent/research-generator/shared/scalping_backtest_sizing_report.md`,
  03:48Z) showed **0% hit rate** (BTC 0/6, ETH 0/6, SOL 0 signals) in a momentum window and
  recommended "**do not deploy passively; wait for RSI extreme + VWAP revisit or Bollinger
  squeeze.**"
- The entry at ~03:55Z was made by Runa (exec-runner) **before any trigger fired** — the
  pre-override flag raised by Portia (pm-lead). This was the no-trigger breach that later drew
  Chief's close ruling.

### 2. DATA POINTS — every number that informed the decision

| Data point | Value | Source (path) | Time (UTC) |
|---|---|---|---|
| Entry price | 69,178.0 (avg fill, market) | `/root/workspace/.chief/agent/exec-runner/shared/entry-journal.md`; fills tradeId 719279020753893; my `list-positions` verification | entry ~03:55:24Z; verified 03:58Z, 04:05Z |
| Entry oid | 520461506403 | entry-journal.md; fills orderId 520461506403 | 03:55Z |
| Size / notional | 0.02166 BTC ≈ $1,498.7 | entry-journal.md; `list-positions` | 03:55Z / 03:58Z |
| Leverage / margin mode | 15x cross (max 40x) | package A-212 §2; `list-positions` leverage 15, cross | 03:45Z / 03:58Z |
| Posted margin | $99.88 (marginUsed 99.908916 live) | entry-journal.md; `list-positions` | 03:55Z / 03:58Z |
| Book / account value | $212.18 → $211.29 at entry | `/root/workspace/hyperliquid-account-state.json` (03:42Z); entry-journal.md | 03:42Z / 03:55Z |
| **Size deviation — CONFIRMED-SEQUENCING DEVIATION** | Executed ≈ half the corrected v3 1-up size: 0.02166 BTC / $1,498.7 notional / $99.88 margin (15x cross) vs v3-locked ~0.0460 BTC / $3,182.70 / $212.18. **Root cause: the pre-correction sizing package (~$100/pos) was in force at order time; v3 corrected sizing superseded only AFTER the fill** — same sequencing/timing-fault class as the no-trigger breach. NOT operator error, NOT data/tool fault. Executed numbers REAL, match fills/positions; deviation is the sizing-package TIMING, not the fill | package A-212 §2 vs entry-journal.md; fills oid 520461506403; list-positions; Chief's finding via Desi (exec-lead), delivered by Portia msg-33eb89d41d4732c7b3de4e49 | 03:45Z vs 03:55:24Z; confirmed ~04:2xZ |
| 5m RSI(14) | 48 / 51 / 46 per last watch | Portia briefing msg-c051a0a71bc5189f1dbe1afc; independently recomputed 48.5 → 46.8 on `/tmp/btc-5m-fresh.json` (827 candles, last close 69,161.29) | ~03:5xZ / recompute 04:06Z |
| VWAP distance at entry | Price ~**+3.35%** above anchored VWAP (66,917.23 whole-window VWAP; last close +3.35%); 1m VWAP 66,894.52 vs last close 69,117.20 (+3.3%) at 03:43Z. VWAP-revisit trigger (needs pullback to 0.4–1.2% band) did NOT fire | `/root/workspace/.chief/agent/research-generator/shared/scalping_backtest_sizing_report.md` §3.4; `/tmp/btc-ta.json` (03:43Z); recompute 04:06Z | 03:48Z / 03:43Z |
| Bollinger state | Bandwidth(20,2) ≈ 1.12–1.54% (last 6×5m candles), approaching but not sustained <1.5% squeeze; **no breakout** | recompute on `/tmp/btc-5m-fresh.json` | 04:06Z |
| Volume | Last 5m candle 0.50 vs 20-SMA 6.54 → **ratio 0.08 — no spike** (trigger needs ≥150%) | recompute on `/tmp/btc-5m-fresh.json` | 04:06Z |
| Market regime | Momentum rally: BTC +7.8%, ETH +17.3%, SOL +13% over 72h window; prices ended 3–10% above anchored VWAP, neutral RSI — mean-reversion scalps run over | backtest_sizing_report.md §3.4 / §6; package A-212 §G | 03:48Z |
| Entry fill fee | 0.674277 USDC | fills tradeId 719279020753893 | 03:55:24Z |
| SL / TPs | SL trigger 68,896.39 (Stop Market, reduce-only 0.02166); TP1 69,401.00 (0.01083); TP2 69,587.63 (0.00650); TP3 70,043.86 (0.00433) | package A-212 §2; **verified live** `list-open-orders` 03:58Z: oids 520461506404 / 520461699638 / 520461725832 / 520461751709, all reduce-only | 03:45Z / 03:58Z |
| Liquidation px | 60,165.20 — far below SL (SL ≈ 8,731 pts above liq; liq safety ~9.7× per Beck §5) | `list-positions` liquidationPx 60165.2005096018; backtest_sizing_report.md §5 | 03:58Z |
| Macro snapshot | DXY 118.90 (−0.24%), US10y 4.71%, VIX 15.84 (+4.3%), fed funds 3.63%, CPI YoY 3.30%, Brent 95.29 | `/root/workspace/macros-snapshot.json` | 03:42:43Z |
| News (BTC) | Bullish cluster: "Bitcoin nears $70K … broad rebound"; "Trump open to expanding US Bitcoin reserve"; "Trump hosts top crypto CEOs … US weighs Bitcoin buy" | `/root/workspace/news-BTC.json` (timestamps 1787196325 / 1787194958 / 1787194800) | 03:43Z |
| Trigger stack at entry | **NONE fired** (no RSI<30, no VWAP revisit, no squeeze breakout, no volume spike) | synthesis of rows above | 03:55Z |

### 3. DECISION LOG — sequence

1. **Entry** — ~03:55:24Z: Runa placed market long 0.02166 BTC @ 69,178.0 (oid 520461506403),
   atomic SL 68,896 attached, 3-rung reduce-only TP ladder placed post-fill. **No trigger had
   fired** (stand-by flag active) → **process breach**.
2. **No-trigger flag** — Runa pre-override flagged by Portia (pm-lead) as the no-trigger
   deployment; entry flagged before a close ruling existed (per Portia briefing msg-c051a0a71bc5189f1dbe1afc).
3. **Desi's report** — Desi (exec-lead) reported/verified the live package; my independent
   verification at 03:58Z matched: long 0.02166 @ 69,178.0, all 4 protections resting reduce-only.
4. **Close ruling** — issued by **CHIEF**: the no-trigger BTC position was ruled **CLOSED**,
   **UNCONDITIONAL** — it does not wait on Rae's gate ruling (the position was already ruled to
   close as a no-trigger/process-breach position). Rae (exec-risk)'s gate ruling returned the
   **same breach verdict** afterwards — the close decision was made first and independently.
   Chief also granted a **one-time retry waiver** for the close; the retry failed and the close
   is back in the Engineering fix path. Source: Desi (exec-lead), msg-1dd13161af9a3c8ddacfbc46,
   ~04:10Z (corroborates Runa entry-journal.md "after Chief's no-trigger close ruling").
   **Gate-compliance ruling (Rae, exec-risk): PROCESS BREACH** — BTC long oid 520461506403
   (fill 03:55:24Z) printed with no satisfied entry trigger, against the armed v3 stand-by gate.
   Delivered 2026-08-20 ~04:03Z (msg-663a35827a5b814110d1b331). Source: Rae/exec-risk, ruling
   PROCESS BREACH, ts 2026-08-20T04:03:45Z.
5. **Close execution** — attempted by Runa; **FAILED** with tool error `Failed to sign typed data
   with viem wallet` (exit 1). Per Chief standing rule: stopped, no retry, escalated to Ada
   (eng-head) with error + exact command; Desi kept in loop. The signing tool failure has **NOT
   yet been release-resolved** by Engineering (Ada — Owen → engineer → Wren → Cam). A re-attempt
   of the reduce-only close IS queued with Runa (exec-runner) for the moment Ada's fix lands;
   she holds until then. Position state ~04:05Z: still open, only the entry fill landed
   (closedPnl 0.0), all 4 protections resting reduce-only — no naked. Source: Desi (exec-lead),
   msg-1dd13161af9a3c8ddacfbc46.
6. **PnL booked to recoup baseline** — **DONE ~04:19Z**: close landed ~04:18:38Z (orderId
   520474353285, ts 1787199518696). Realized **+$3.5741** (closedPnl 3.54915 + 0.0249). Netted
   against −$52.12 baseline → **remaining to recoup −$48.55**. Persisted in
   `/root/workspace/.chief/agent/pm-position-monitor/shared/monitoring-baseline.md`; reported to
   Portia. (Source: list-fills at ~04:19Z.)

### CONFIRMED-SEQUENCING DEVIATION — BTC long entry oid 520461506403 (sizing)

> **Entry update timestamp:** 2026-08-20T04:31:33Z (top-up per Portia msg-d064089f717a3223fac0ac70;
> original entry ~03:55:24Z).

**Status: CONFIRMED-SEQUENCING DEVIATION — confirmed-by-CHIEF** (not suspected, not tool-fed —
real, accepted as REAL by Chief, verified against fills + list-positions). Per Chief's finding
from Desi (exec-lead), verified vs fills + list-positions:

- **Executed:** ~03:55:24Z — ~$99.88 margin / $1,498.7 notional / 0.02166 BTC @ 69,178.0
  (15x cross) — roughly **HALF** the corrected v3 1-up size (~$212.18 margin / $3,182.70
  notional / ~0.0460 BTC).
- **ROOT CAUSE:** the **pre-correction sizing package (~$100/pos) was in force at order time**;
  the v3 corrected sizing superseded only **AFTER** the fill. Same sequencing/timing-fault class
  as the no-trigger breach — **NOT operator error, NOT data/tool fault**.
- **Executed numbers are REAL and match fills/positions** (fills oid 520461506403, tradeId
  719279020753893; list-positions); the deviation is the **sizing-package TIMING**, not the fill.
- **Recurrence prevention (paired):** the **sizing-lock guard** is now queued with Engineering
  (Ada, eng-head) as the guard — locks the corrected v3 sizing in force at order time.
- Source: Chief's finding from Desi (exec-lead), delivered via Portia (pm-lead)
  msg-33eb89d41d4732c7b3de4e49; verified against fills + list-positions.

### 4. OUTCOME — CLOSED ~04:18:38Z, realized +$3.5741, booked

- **Close fill:** LANDED — position now FLAT (positions: [] at ~04:19Z). Two reduce-only close
  fills, same orderId 520474353285, ts 1787199518696 (2026-08-20 04:18:38Z):
  - 0.02151 BTC @ 69,343.0 — closedPnl **+3.54915**, fee 0.671205
  - 0.00015 BTC @ 69,344.0 — closedPnl **+0.0249**, fee 0.00468
  (Source: list-fills, tradeIds 214778490573960 / 209247458784024, hash
  0xa0a20fa9108150e7a21b04428e7bbd0202af008eab846fb9446abafbcf852ad2)
- **Realized PnL:** **+$3.5741** gross of the two closedPnl prints (fees: entry 0.674277 +
  close 0.671205 + 0.00468 = $1.3502 total round-trip fees).
- **Remaining to recoup:** **$48.55** — netted +$3.5741 against the −$52.12 baseline; persisted in
  monitoring-baseline.md and reported to Portia (msg to pm-lead ~04:19Z).

### 5. LESSONS

**What went right:**
- Every position ran protected from the first second: hard SL + 3-rung TPs resting reduce-only,
  never naked (package §0 "no naked" honored).
- Liquidation distance was enormous (liq 60,165.20 vs SL 68,896.39 — ~9.7× safety buffer per
  Beck §5); liquidation was never a realistic risk while the SL rested.
- Escalation discipline held exactly: the close tool failure was **not** self-fixed — stopped,
  no retry, escalated to Ada (eng-head) per the standing rule, Desi kept in the loop.

**What went wrong:**
- **No-trigger entry (process breach).** The entry bypassed an explicit stand-by gate that existed
  precisely because the backtest showed 0% hit rate in the momentum regime. This is the single
  largest process failure of the day and it is why the desk drew the close ruling.
- **CONFIRMED-SEQUENCING DEVIATION (sizing):** executed ≈ half the corrected v3 1-up size
  ($99.88 margin / $1,498.7 notional / 0.02166 BTC vs v3 $212.18 / $3,182.70 / ~0.0460 BTC).
  Root cause: the pre-correction sizing package (~$100/pos) was in force at order time; v3
  superseded only after the fill — same sequencing/timing-fault class as the no-trigger breach.
  Not operator error, not data/tool fault (Chief's finding via Desi; verified vs fills +
  list-positions).
- The close path depended on a signing call that failed; a protected position could not be
  converted to cash until Engineering intervened.

**What we change next time:**
- The **gate guard Engineering is building** (per Portia) — entry-stack enforcement so a
  no-trigger entry cannot reach the venue. Until it ships, the desk must treat the stand-by flag
  as a hard lock, not a recommendation.
- **Sizing-lock guard** (queued with Engineering/Ada as the guard) — locks the corrected v3
  sizing in force at order time, so a superseded sizing package cannot execute half-size again.
  The pair of guards (entry-gate + sizing-lock) covers the two confirmed sequencing/timing
  faults.
- Keep a close/exit path that does not depend on the failing signing call (or block new entries
  until the tool is release-resolved).
- Pre-flag any size deviation from the locked package in the entry journal at order time, with
  Desi's sign-off.

---

*Entry maintained by Mona (pm-position-monitor). Sources as cited; all timestamps UTC. Entry
closed +$3.5741 and booked to the recoup baseline; updated 2026-08-20 with the
confirmed-sequencing-deviation record + sizing-lock guard pairing.*