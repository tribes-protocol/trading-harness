import type { JournalReport, JournalTrade } from '@/types/Journal'

import { esc, formatPnlUsd, formatSize, formatWhen, sparklineSvg } from './TradeJournalHtml'

// ---------------------------------------------------------------------------
// Trade-journal feed redesign — detail modal (server-rendered).
//
// The full report is rendered server-side into a hidden modal template on the
// feed page; a small inline script (served with the page) shows/hides it on
// card click, backdrop click, X, and Escape. No client fetch, no bundler, no
// CDN — every byte is escaped server-side, so stored report text can never
// inject. The /api/trades JSON contract is untouched.
// ---------------------------------------------------------------------------

function modalSparkline(report: JournalReport | null | undefined): string {
  const svg = sparklineSvg(report?.equityCurve)
  if (svg === '') return `<span class="no-curve"><span class="dot"></span>no curve</span>`
  return svg
}

/** Server-rendered report body for the modal (the full report, escaped). */
export function renderReportBody(trade: JournalTrade): string {
  const report = trade.report
  const thesis = report?.thesis ?? '—'
  const bull = report?.bullCase ?? null
  const bear = report?.bearCase ?? null
  const rr = report?.rr ?? null
  const conf = report?.confidenceAtDecision
  const risk = report?.riskUsd ?? trade.riskUsd ?? null
  const riskPct = report?.riskPctAccount ?? trade.riskPctAccount ?? null
  const snap = report?.accountSnapshot
  const snapLine = snap
    ? `${esc(snap.date)} — equity $${esc(snap.equityUsd)}` +
      (snap.withdrawableUsd !== null && snap.withdrawableUsd !== undefined
        ? ` · withdraw $${esc(snap.withdrawableUsd)}`
        : '')
    : '—'
  const sources = report?.sources ?? []

  let parts = ''
  parts += `<p class="tm-mono">opened ${esc(formatWhen(trade.timestamp))} · entry ${esc(trade.entryPrice)} · size ${esc(formatSize(trade.sizeBase))} · notional $${esc(trade.notionalUsd)} · lev ${esc(trade.leverage)}</p>`
  if (trade.stopPx !== null && trade.stopPx !== undefined) {
    const target =
      trade.targetPx !== null && trade.targetPx !== undefined ? esc(trade.targetPx) : '—'
    parts += `<p class="tm-mono">stop ${esc(trade.stopPx)} · target ${target}</p>`
  }
  parts += `<h3>Thesis</h3><p>${esc(thesis)}</p>`
  if (bull !== null) parts += `<h3>Bull case</h3><p>${esc(bull)}</p>`
  if (bear !== null) parts += `<h3>Bear case</h3><p>${esc(bear)}</p>`
  const riskBits: string[] = []
  if (rr !== null && rr !== undefined) riskBits.push(`R:R ${esc(rr)}`)
  if (conf !== null && conf !== undefined) riskBits.push(`confidence ${esc(conf)}`)
  if (risk !== null && risk !== undefined) riskBits.push(`risk $${esc(risk)}`)
  if (riskPct !== null && riskPct !== undefined) riskBits.push(`risk ${esc(riskPct)}% of account`)
  if (riskBits.length > 0) parts += `<h3>Risk</h3><p class="tm-mono">${riskBits.join(' · ')}</p>`
  parts += `<h3>Account snapshot</h3><p>${snapLine}</p>`
  parts += `<h3>Equity curve</h3><div class="tm-spark">${modalSparkline(report)}</div>`
  if (sources.length > 0) {
    parts += `<h3>Sources</h3><ul class="tm-sources">`
    for (const s of sources) {
      const link =
        s.url !== null && s.url !== undefined
          ? ` — <a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">source</a>`
          : ''
      parts += `<li>${esc(s.reason)}${link}</li>`
    }
    parts += `</ul>`
  }
  return parts
}

/** Full modal HTML for one trade, keyed by data-trade-id on the overlay. */
export function tradeModalHtml(trade: JournalTrade): string {
  const pnl = trade.realizedPnlUsd ?? 0
  return (
    `<div class="tj-overlay" data-trade-id="${esc(trade.id)}" hidden role="dialog" ` +
    `aria-modal="true" aria-label="${esc(trade.ticker)} trade report">` +
    `<div class="tj-modal">` +
    `<button type="button" class="tj-modal-close" aria-label="Close report">&times;</button>` +
    `<h2>${esc(trade.ticker)} · ${esc(trade.side)}</h2>` +
    `<div class="tm-sub">${esc(trade.status)} · PnL <strong>${esc(formatPnlUsd(pnl))}</strong></div>` +
    `<div class="tm-body">${renderReportBody(trade)}</div>` +
    `</div></div>`
  )
}

// Inline client script — served with the page, no external dependency. Toggles
// the matching overlay on card click; closes on X, backdrop click, and Escape.
export const FEED_CLIENT_SCRIPT = `
(function () {
  var overlay = null;
  function esc(s) { return String(s); }
  function close() {
    if (overlay) { overlay.setAttribute('hidden', ''); overlay.removeAttribute('data-open'); overlay = null; }
    document.removeEventListener('keydown', onKey);
  }
  function onKey(e) { if (e.key === 'Escape') close(); }
  function open(id) {
    close();
    var el = document.querySelector('.tj-overlay[data-trade-id="' + esc(id) + '"]');
    if (!el) return;
    overlay = el;
    el.removeAttribute('hidden');
    el.setAttribute('data-open', 'true');
    document.addEventListener('keydown', onKey);
  }
  document.addEventListener('click', function (e) {
    var t = e.target;
    if (t && t.closest && t.closest('.tj-modal-close')) { close(); return; }
    if (t && t.classList && t.classList.contains('tj-overlay') && !e.target.closest('.tj-modal')) { close(); return; }
    var card = t && t.closest ? t.closest('.trade-card') : null;
    if (card) open(card.getAttribute('data-id'));
    if (card) return;
  });
  document.addEventListener('keydown', function (e) {
    if ((e.key === 'Enter' || e.key === ' ') && e.target && e.target.closest && e.target.closest('.trade-card')) {
      e.preventDefault();
      open(e.target.closest('.trade-card').getAttribute('data-id'));
    }
  });
})();
`
