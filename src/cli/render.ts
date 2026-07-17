import type { HealthCheckResult } from '../providers/types.js';
import type { Quote, PriceSeries } from '../schemas/market.js';
import type { MacroSeries } from '../schemas/macro.js';
import type { NewsBatch, SearchBatch } from '../schemas/news.js';
import type { TokenPrice } from '../schemas/onchain.js';
import type { ProviderRecord } from '../schemas/registry.js';

/**
 * Human-readable rendering for CLI output (stdout). Quality flags are
 * always displayed — the reader must see delayed/stale/fallback markers.
 */

export function flags(quality: string[]): string {
  return quality.length ? ` [${quality.join(', ')}]` : '';
}

export function renderQuote(q: Quote): string {
  const lines = [
    `${q.instrument.symbol} (${q.instrument.assetClass}) ${q.price} ${q.currency}${flags(q.quality)}`,
    `  as of ${q.asOf} | source: ${q.source.provider} ${q.source.endpoint} | freshness: ${q.source.freshness}${q.source.cacheHit ? ' | cached' : ''}`,
  ];
  if (q.change24hPct !== undefined) lines.push(`  24h change: ${q.change24hPct.toFixed(2)}%`);
  if (q.marketCap !== undefined) lines.push(`  market cap: ${q.marketCap.toLocaleString('en-US')}`);
  return lines.join('\n');
}

export function renderSeries(s: PriceSeries): string {
  const first = s.bars[0];
  const last = s.bars[s.bars.length - 1];
  return [
    `${s.instrument.symbol} ${s.frequency} bars (${s.bars.length}) adj=${s.adjustment}${flags(s.quality)}`,
    `  source: ${s.source.provider} | freshness: ${s.source.freshness} | tz: ${s.timezone}`,
    first && last
      ? `  range: ${first.t} .. ${last.t} | last close: ${last.c}`
      : '  (no bars returned)',
  ].join('\n');
}

export function renderMacro(s: MacroSeries): string {
  const last = s.observations.filter((o) => o.value !== null).at(-1);
  return [
    `${s.info.id} — ${s.info.title}${flags(s.quality)}`,
    `  ${s.observations.length} observations | units: ${s.info.units ?? 'n/a'} | vintage: ${s.vintage}`,
    `  source: ${s.source.provider} | last updated: ${s.info.lastUpdated ?? 'n/a'}`,
    last ? `  latest: ${last.date} = ${last.value}` : '  (no numeric observations)',
  ].join('\n');
}

export function renderNews(batch: NewsBatch): string {
  const header = `${batch.items.length} articles${flags(batch.quality)} (source: ${batch.source.provider})`;
  const rows = batch.items.map(
    (item) =>
      `  - [${item.publishedAt ?? 'undated'}] ${item.title} (${item.sourceName ?? item.sourceDomain ?? 'unknown source'})\n    ${item.url}`,
  );
  return [header, ...rows].join('\n');
}

export function renderSearch(batch: SearchBatch): string {
  const rows = batch.results.map((r) => `  - ${r.title}\n    ${r.url}`);
  const parts = [`${batch.results.length} results for "${batch.query}"${flags(batch.quality)}`];
  if (batch.syntheticAnswer) {
    parts.push(`  synthesized answer (model output, verify before use): ${batch.syntheticAnswer}`);
  }
  return [...parts, ...rows].join('\n');
}

export function renderTokenPrice(p: TokenPrice): string {
  const token = p.token.symbol ?? p.token.address ?? p.token.providerIds['coingecko'] ?? 'token';
  return [
    `${token} (${p.token.chain}) ${p.price} ${p.currency}${flags(p.quality)}`,
    `  as of ${p.asOf} | source: ${p.source.provider} | freshness: ${p.source.freshness}`,
    p.liquidityUsd !== undefined ? `  liquidity: $${p.liquidityUsd.toLocaleString('en-US')}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

export function renderHealth(results: HealthCheckResult[]): string {
  return results
    .map((r) => {
      const status =
        !r.configured
          ? 'NOT CONFIGURED'
          : r.live === null
            ? 'CONFIGURED (not live-tested)'
            : r.live
              ? `LIVE OK (${r.latencyMs}ms)`
              : `LIVE FAILED (${r.latencyMs}ms)`;
      return `  ${r.provider.padEnd(12)} ${status}\n    ${r.message}`;
    })
    .join('\n');
}

export function renderProviderRecord(p: ProviderRecord, verbose = false): string {
  const capabilities = p.capabilities
    .map(
      (c) =>
        `    - ${c.operation} [${c.assetClasses.join(',')}] freshness=${c.freshness} verification=${c.verification}`,
    )
    .join('\n');
  const lines = [
    `${p.id} — ${p.name} (API ${p.apiVersion}, docs reviewed ${p.docsReviewDate}, confidence ${p.reviewConfidence})`,
    `  auth: ${p.authMechanism} via $${p.envVar}`,
    `  docs: ${p.docsUrl}`,
    `  capabilities:\n${capabilities}`,
  ];
  if (verbose) {
    if (p.limitations.length) lines.push(`  limitations:\n${p.limitations.map((l) => `    - ${l}`).join('\n')}`);
    if (p.rateLimits.length) lines.push(`  rate limits:\n${p.rateLimits.map((r) => `    - ${r.plan}: ${r.limit}`).join('\n')}`);
    if (p.licensing.notes || p.licensing.storageRestrictions) {
      lines.push(`  licensing: ${[p.licensing.storageRestrictions, p.licensing.attribution, p.licensing.notes].filter(Boolean).join(' | ')}`);
    }
  }
  return lines.join('\n');
}
