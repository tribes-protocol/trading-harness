import { describe, expect, it } from 'vitest';
import {
  annotateRouting,
  annotateStaleness,
  detectDisagreement,
  flagDisagreement,
} from '../../src/services/quality.js';
import type { Sourced } from '../../src/schemas/common.js';

function sourced(overrides: Partial<Sourced> = {}): Sourced & { asOf?: string } {
  return {
    schemaVersion: '1.0.0',
    source: {
      provider: 'test',
      endpoint: '/x',
      requestedAt: '2026-07-17T00:00:00.000Z',
      receivedAt: '2026-07-17T00:00:01.000Z',
      cacheHit: false,
      freshness: 'eod',
    },
    additionalSources: [],
    quality: [],
    lineage: [],
    ...overrides,
  };
}

describe('annotateRouting', () => {
  it('is a no-op for primary-served results', () => {
    const value = sourced();
    const out = annotateRouting({ value, providerUsed: 'test', fallbackUsed: false, failures: [] });
    expect(out.quality).toEqual([]);
    expect(out.lineage).toEqual([]);
  });

  it('stamps fallback_source and lineage on fallback', () => {
    const out = annotateRouting({
      value: sourced(),
      providerUsed: 'secondary',
      fallbackUsed: true,
      failures: [{ provider: 'primary', error: 'down' }],
    });
    expect(out.quality).toContain('fallback_source');
    expect(out.lineage.at(-1)?.step).toBe('fallback-routing');
  });
});

describe('annotateStaleness', () => {
  it('flags data older than the threshold', () => {
    const old = { ...sourced(), asOf: '2020-01-01T00:00:00.000Z' };
    expect(annotateStaleness(old, 60_000).quality).toContain('stale');
  });

  it('leaves fresh data unflagged', () => {
    const fresh = { ...sourced(), asOf: new Date().toISOString() };
    expect(annotateStaleness(fresh, 60_000).quality).not.toContain('stale');
  });
});

describe('detectDisagreement', () => {
  it('returns undefined within tolerance', () => {
    expect(
      detectDisagreement('p', [
        { provider: 'a', value: 100 },
        { provider: 'b', value: 100.5 },
      ]),
    ).toBeUndefined();
  });

  it('detects spread beyond tolerance and flags payloads', () => {
    const d = detectDisagreement('p', [
      { provider: 'a', value: 100 },
      { provider: 'b', value: 105 },
    ]);
    expect(d).toBeDefined();
    expect(d!.relativeSpread).toBeGreaterThan(0.01);
    const flagged = flagDisagreement(sourced(), d!);
    expect(flagged.quality).toContain('provider_disagreement');
    expect(flagged.lineage.at(-1)?.step).toBe('cross-check');
  });

  it('handles single-view input', () => {
    expect(detectDisagreement('p', [{ provider: 'a', value: 1 }])).toBeUndefined();
  });

  it('rejects a non-finite or negative tolerance instead of inverting the guard', () => {
    const views = [
      { provider: 'a', value: 100 },
      { provider: 'b', value: 100 },
    ];
    expect(() => detectDisagreement('p', views, Number.NaN)).toThrow();
    expect(() => detectDisagreement('p', views, -0.5)).toThrow();
  });
});
