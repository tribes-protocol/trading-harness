import { ValidationError } from '../core/errors.js';
import { ageMs, nowIso } from '../core/time.js';
import type { RouteResult } from '../registry/routing.js';
import type { QualityFlag, Sourced } from '../schemas/common.js';

/**
 * Data-quality annotation. Routing/fallback/staleness facts are stamped
 * onto the payload's quality flags and lineage so consumers can never
 * mistake fallback, stale, or cached data for the primary real-time view.
 */

function addFlag(quality: QualityFlag[], flag: QualityFlag): QualityFlag[] {
  return quality.includes(flag) ? quality : [...quality, flag];
}

/** Fold routing metadata into the sourced payload. */
export function annotateRouting<T extends Sourced>(route: RouteResult<T>): T {
  const value = route.value;
  if (!route.fallbackUsed) return value;
  return {
    ...value,
    quality: addFlag(value.quality, 'fallback_source'),
    lineage: [
      ...value.lineage,
      {
        step: 'fallback-routing',
        description: `Primary provider(s) failed (${route.failures
          .map((f) => f.provider)
          .join(', ')}); served by ${route.providerUsed}`,
        at: nowIso(),
        params: { failures: route.failures },
      },
    ],
  };
}

/** Array variant: stamp routing metadata onto every element. */
export function annotateRoutingEach<T extends Sourced>(route: RouteResult<T[]>): T[] {
  if (!route.fallbackUsed) return route.value;
  return route.value.map((value) =>
    annotateRouting({
      value,
      providerUsed: route.providerUsed,
      fallbackUsed: route.fallbackUsed,
      failures: route.failures,
    }),
  );
}

/** Stamp `stale` when observation age exceeds the given threshold. */
export function annotateStaleness<T extends Sourced & { asOf?: string }>(
  value: T,
  maxAgeMs: number,
): T {
  if (value.asOf === undefined || ageMs(value.asOf) <= maxAgeMs) return value;
  return { ...value, quality: addFlag(value.quality, 'stale') };
}

export interface Disagreement {
  metric: string;
  values: { provider: string; value: number }[];
  relativeSpread: number;
  tolerance: number;
}

/**
 * Compare the same numeric metric across providers. Returns a Disagreement
 * when the relative spread exceeds tolerance — callers surface it and flag
 * affected payloads with `provider_disagreement` rather than averaging.
 */
export function detectDisagreement(
  metric: string,
  values: { provider: string; value: number }[],
  tolerance = 0.01,
): Disagreement | undefined {
  if (!Number.isFinite(tolerance) || tolerance < 0) {
    throw new ValidationError(
      `disagreement tolerance must be a finite non-negative number, got ${tolerance}`,
    );
  }
  if (values.length < 2) return undefined;
  const nums = values.map((v) => v.value);
  const min = Math.min(...nums);
  const max = Math.max(...nums);
  const mid = (min + max) / 2;
  const relativeSpread = mid === 0 ? (max === min ? 0 : Infinity) : (max - min) / Math.abs(mid);
  if (relativeSpread <= tolerance) return undefined;
  return { metric, values, relativeSpread, tolerance };
}

export function flagDisagreement<T extends Sourced>(value: T, disagreement: Disagreement): T {
  return {
    ...value,
    quality: addFlag(value.quality, 'provider_disagreement'),
    lineage: [
      ...value.lineage,
      {
        step: 'cross-check',
        description: `Provider disagreement on ${disagreement.metric}: relative spread ${(disagreement.relativeSpread * 100).toFixed(2)}% exceeds tolerance ${(disagreement.tolerance * 100).toFixed(2)}%`,
        at: nowIso(),
        params: { values: disagreement.values },
      },
    ],
  };
}
