# Hyperliquid Perps Scalping Playbook — $50/Day Regime

**Version:** 1.0  
**Target:** ~$50 net daily profit  
**Primary timeframes:** 1m (trigger), 5m (context / veto)  
**Default margin per trade:** $500  
**Leverage:** up to 20× (see §5 for per-market rules)  
**Risk policy:** 2:1 minimum R:R, hard SL/TP on every position, $50 daily loss cap

---

## 1. Entry Trigger Stack

### 1.1 Indicator Configuration

Run two candle pulls before every session:

```bash
# 1m candles — primary trigger feed (real BTC perp)
tribes-cli hyperliquid candles --coin BTC --interval 1m --out /tmp/btc-1m.json

# 5m candles — context / volatility filter (real BTC perp)
tribes-cli hyperliquid candles --coin BTC --interval 5m --out /tmp/btc-5m.json
```

Then compute:

```bash
tribes-cli ta indicators --candles-file /tmp/<coin>-1m.json --set rsi,bb,atr,vwap
tribes-cli ta indicators --candles-file /tmp/<coin>-5m.json --set ema,atr
```

**Indicator params:**
- **RSI(14)** — 1m candles
- **Bollinger Bands(20,2)** — 1m candles  
- **VWAP** — 1m candles  
- **ATR(14)** — 5m candles (volatility filter + stop sizing)
- **EMA stack** — 5m candles (9, 21, 50). Note: `ta indicators` surfaces EMA20/50 natively; treat EMA9 as the short-term trend proxy by eyeballing the 1m EMA alignment or computing locally if needed.

**Volume spike threshold:** trigger-candle volume on 1m ≥ **150%** of the 20-period 1m volume SMA. Compute locally from the candles file.

### 1.2 Exact Long-Entry Formula

A long fires when **ALL** of the following are true simultaneously:

1. **VWAP deviation:** 1m price trades **≥0.4% below** 1m VWAP, then the next 1m candle **closes back above** VWAP.
2. **RSI extreme:** 1m RSI(14) **< 35**.
3. **Bollinger touch:** the candle that dipped below VWAP also touched or pierced the **lower Bollinger Band(20,2)**.
4. **Volume spike:** the reclaim candle shows volume ≥ **150%** of the 20-period 1m volume SMA.
5. **5m EMA context:** the 5m EMA stack is either **bullish** (EMA9 > EMA21 > EMA50) OR **flat-bullish** (all three within 0.3% of each other). Dead-cross (9 < 21 < 50) = veto.
6. **ATR volatility gate:** 5m ATR(14) expressed as % of price is **between 0.10% and 0.50%**. Below 0.10% = dead market; above 0.50% = too choppy.

> **Plain-English trigger:** *"Price tags lower Bollinger + RSI < 35 while trading below VWAP, then reclaims VWAP on a volume spike, with the 5m EMA stack flat or up."*

### 1.3 Exact Short-Entry Formula

A short fires when **ALL** of the following are true simultaneously:

1. **VWAP deviation:** 1m price trades **≥0.4% above** 1m VWAP, then the next 1m candle **closes back below** VWAP.
2. **RSI extreme:** 1m RSI(14) **> 65**.
3. **Bollinger touch:** the candle that popped above VWAP also touched or pierced the **upper Bollinger Band(20,2)**.
4. **Volume spike:** the breakdown candle shows volume ≥ **150%** of the 20-period 1m volume SMA.
5. **5m EMA context:** the 5m EMA stack is either **bearish** (EMA9 < EMA21 < EMA50) OR **flat-bearish** (all three within 0.3% of each other). Golden-cross (9 > 21 > 50) = veto.
6. **ATR volatility gate:** same as long: 5m ATR(14) % of price must be **0.10%–0.50%**.

> **Plain-English trigger:** *"Price tags upper Bollinger + RSI > 65 while trading above VWAP, then breaks back below VWAP on a volume spike, with the 5m EMA stack flat or down."*

### 1.4 ATR-Based Stop Sizing

- Compute **5m ATR(14)** as a % of current price.
- Initial SL distance = **0.5 × ATR(14)**.
- Enforce bounds:
  - **Minimum:** 0.20% of price (prevents noise-stop on very low ATR).
  - **Maximum:** 0.30% of price (prevents over-wide stops that blow the daily cap).
- If raw 0.5× ATR falls outside 0.20%–0.30%, clamp to the bound and log the raw ATR for review.
- At 20× leverage, this maps to **4%–6% of posted margin**, centering on the ~5% target.

### 1.5 Veto Conditions (Skip Regardless of Stack)

- Spread > 0.10% at trigger time.
- Position would breach the $50 daily loss path (see §4).
- A second position is already open (see §5).
- Hyperliquid `isDelisted` = true or `onlyIsolated` with no isolated margin budget left.

---

## 2. Candidate Filter

Before any trigger, scan the Hyperliquid perp with `list-assets --all-dexes` and verify:

| Filter | Threshold | Why |
|--------|-----------|-----|
| `dayNtlVlm` | ≥ **$5,000,000** | Enough two-sided flow to fill tight stops |
| `openInterest` | ≥ **$1,000,000** | Confirms active positioning |
| `impactPxs` spread | < **0.15%** for intended size | Slippage on entry/exit must not eat edge |
| `referencePx` vs `oraclePx` vs `midPx` | All within **0.10%** | Rejects stale or manipulated prints |
| `isDelisted` | `false` | Non-negotiable |
| `maxLeverage` offered | ≥ **10×** | Scalping regime needs magnification |

**Actionable preference:** candidates with `dayNtlVlm` > $20M and impact spread < 0.08% rank above everything else. If no candidate clears the table, do not trade — flat is a position.

---

## 3. TP/SL Ladder — Exact Math ($500 Margin @ 20×)

### 3.1 Notional & Target

| Variable | Value |
|----------|-------|
| Posted margin | $500 |
| Leverage | 20× |
| Notional size | **$10,000** |
| Gross daily target | **+$50** (+10% of margin) |
| Hard stop-loss | **−$25** (−5% of margin) |
| R:R ratio | **2:1** |

### 3.2 Price-Distance Math at 20×

A 0.25% price move on $10,000 notional = $25 P&L = 5% of margin.  
A 0.50% price move = $50 P&L = 10% of margin.

Therefore:
- **SL distance:** **−0.25%** from entry (hard; may be adjusted by ATR within 0.20%–0.30% bounds).
- **TP distances:** ladder below sums to **+0.50%** equivalent on the blended position.

### 3.3 Three-Rung Scaled TP

| Rung | % of Position Closed | Price % from Entry | P&L on That Slice | % of Margin Captured |
|------|----------------------|--------------------|-------------------|----------------------|
| **TP1** | 50% | **+0.30%** | $5,000 × 0.003 = **$15** | **3.0%** |
| **TP2** | 30% | **+0.50%** | $3,000 × 0.005 = **$15** | **3.0%** |
| **TP3** | 20% | **+1.00%** | $2,000 × 0.010 = **$20** | **4.0%** |
| **Total** | **100%** | — | **$50** | **10.0%** |

### 3.4 SL Management

1. **Initial SL:** placed at **−0.25%** from entry (or ATR-clamped distance per §1.4).
2. **After TP1 fills:** cancel the original SL and place a new SL at the **entry price** (breakeven). The remaining 50% of the position is now risk-free.
3. **After TP2 fills:** SL stays at breakeven on the final 20%.
4. **Hard rule:** SL is never moved to a worse price. It only ever tightens to breakeven; it never get wider.

### 3.5 Hyperliquid Bracket Construction

```bash
# 1) Entry with hard stop
tribes-cli trade-perp --coin <COIN> --side buy --sz <sz> --sl-px <entry*(0.9975)>

# 2) After fill, place reduce-only limits at TP1, TP2, TP3
tribes-cli trade-perp --coin <COIN> --side sell --sz <sz*0.50> --reduce-only --limit-px <entry*1.003>
tribes-cli trade-perp --coin <COIN> --side sell --sz <sz*0.30> --reduce-only --limit-px <entry*1.005>
tribes-cli trade-perp --coin <COIN> --side sell --sz <sz*0.20> --reduce-only --limit-px <entry*1.010>

# 3) When TP1 fills, move SL to breakeven (cancel old SL, place new stop at entry px)
```

> **Important:** Hyperliquid’s atomic bracket supports one TP + one SL. Multi-rung ladders must be managed as post-fill reduce-only orders per the sequence above.

---

## 4. Daily Loss-Cap — $50 Enforcement

### 4.1 The Numbers

| Item | Value |
|------|-------|
| Margin per trade | $500 |
| SL per full stop | −$25 (5% of margin) |
| Max full stops allowed | **2** |
| Max entries allowed | **4** (hard ceiling, regardless of outcome) |
| Fee budget | ~$10/day (2 round-trips × ~$3.50 + overhead) |
| Net daily target after fees | **~$40** |

### 4.2 Accounting Rules

- **Realized P&L** + fees for the UTC calendar day (00:00–23:59) drives the cap.
- **Unrealized buffer:** if an open position is −$20 unrealized and you have zero realized losses so far, count it as a 0.8-stop drawdown. Do not open a second position until unrealized improves or the trade closes.
- **Breakeven exits** (SL moved to entry after TP1, then stopped out) count as **0.5 stops** toward the cap for planning purposes. They do not hit the $50 realized limit, but they consume mental/execution bandwidth.

### 4.3 Stand-Down Triggers

1. **Hard stand-down:** cumulative realized loss reaches **−$50** → no new entries until next UTC day. Existing runners may be held to their TPs or manually closed at discretion.
2. **Soft stand-down:** **2 consecutive full SL hits** → mandatory **2-hour cooldown** even if realized loss is <$50.
3. **Win-lock:** after 2 fully successful trades (all 3 TPs hit, +$50 each = +$100 realized), you may continue trading up to the 4-entry daily ceiling, but must reduce position size to **$250 margin** per trade to prevent giving back the day in one stop.

### 4.4 Session Log (Required)

Before every entry, journal: coin, entry px, SL px, TP ladder pxs, which criteria fired, 5m ATR%, posted margin, running daily P&L. After exit, log realized P&L and update the running total. No log = no trade.

---

## 5. Leverage Guidance — Cross vs. Isolated

### 5.1 Per-Market Max Leverage

| Hyperliquid `maxLeverage` | Playbook Leverage | Rationale |
|---------------------------|-------------------|-----------|
| ≥ 25× | **20×** (hard cap) | Maximum magnification within regime |
| 15× – 24× | **15×** | Room below max for buffer |
| 10× – 14× | **10×** | Default floor; still viable |
| 5× – 9× | **Skip** | Insufficient for $50/day target on $500 margin |

**Global ceiling:** never exceed **20×**, even if the venue offers 50×.

### 5.2 Margin Mode Rules

- **Default:** **cross margin**. The shared pool is acceptable because stops are tight and ATR-gated; liquidation is improbable before the hard stop fills.
- **Isolated override:** use **isolated margin** when:
  - The coin has `requiresIsolatedMargin` or `onlyIsolated` set by the venue.
  - You are trading at **>15× leverage** — isolate the position so a blowout caps at the posted $500, not the entire cross pool.
  - You are holding **2 concurrent positions** — isolate each at its exact leverage to prevent one position’s volatility from dragging the shared margin of the other.

### 5.3 Position Sizing with Concurrency

| Concurrent Positions | Margin per Position | Notional per Position (20×) |
|----------------------|---------------------|------------------------------|
| 1 | $500 | $10,000 |
| 2 | $250 each | $5,000 each |

When splitting, recalculate the TP/SL price levels for the smaller notional. The R:R stays 2:1; the absolute dollar target per trade drops proportionally. The daily loss cap remains $50 across both positions combined.

### 5.4 Sequence Rules

- **After a win:** second position allowed immediately if uncorrelated (see §5.5).
- **After a loss:** mandatory **30-minute cooldown** before next entry. Only 1 position may be open during cooldown.
- **Never add to a loser.** No averaging down, no martingale scale-in.

### 5.5 Correlation Limits

- **Max 1 position** per group:
  - Crypto majors: BTC, ETH
  - Alts L1: SOL, AVAX, SUI, NEAR, etc.
  - Meme / high-beta: DOGE, PEPE, SHIB (only if `dayNtlVlm` > $10M)
  - Stock indices: SPY, QQQ, DIA (perps)
  - Commodities: XAU, XAG, OIL (perps)
- **Proxy rule:** if 1h rolling correlation of returns is estimated > 0.85, treat assets as the same group and do not double up.
