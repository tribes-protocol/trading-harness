import type { ProviderId } from '../core/config.js';
import { NotSupportedError } from '../core/errors.js';
import { isMacroSeriesSource } from '../providers/types.js';
import { executeWithFallback } from '../registry/routing.js';
import type { MacroSeries, MacroSeriesInfo } from '../schemas/macro.js';
import { getAdapter } from './adapter-registry.js';
import { annotateRouting } from './quality.js';

/** Macroeconomic data service (series retrieval + discovery). */

export async function getMacroSeries(params: {
  seriesId: string;
  from?: string;
  to?: string;
  vintage?: 'latest' | 'point_in_time';
}): Promise<MacroSeries> {
  const route = await executeWithFallback('macro.series', {}, async (match) => {
    const adapter = getAdapter(match.provider.id as ProviderId);
    if (!isMacroSeriesSource(adapter)) {
      throw new NotSupportedError(
        `Adapter "${match.provider.id}" does not implement macro series — registry/adapter mismatch`,
      );
    }
    return adapter.getMacroSeries(params);
  });
  return annotateRouting(route);
}

export async function searchMacroSeries(params: {
  query: string;
  limit?: number;
}): Promise<MacroSeriesInfo[]> {
  const route = await executeWithFallback('macro.series_search', {}, async (match) => {
    const adapter = getAdapter(match.provider.id as ProviderId);
    if (!isMacroSeriesSource(adapter)) {
      throw new NotSupportedError(
        `Adapter "${match.provider.id}" does not implement macro search — registry/adapter mismatch`,
      );
    }
    return adapter.searchMacroSeries(params);
  });
  return route.value;
}
