import type { ProviderId } from '../core/config.js';
import { NotSupportedError } from '../core/errors.js';
import { isNewsSource, isWebSearchSource } from '../providers/types.js';
import { executeWithFallback } from '../registry/routing.js';
import type { NewsBatch, SearchBatch } from '../schemas/news.js';
import { getAdapter } from './adapter-registry.js';
import { annotateRouting } from './quality.js';

/** News and web-research services. */

export async function getNews(params: {
  query?: string;
  from?: string;
  to?: string;
  language?: string;
  category?: string;
  max?: number;
}): Promise<NewsBatch> {
  // Archive when a date window is given; search when a query is given
  // (this is what makes registry-declared search fallbacks reachable);
  // otherwise the latest-headlines operation.
  const operation =
    params.from !== undefined || params.to !== undefined
      ? ('news.archive' as const)
      : params.query !== undefined
        ? ('news.search' as const)
        : ('news.latest' as const);
  const route = await executeWithFallback(operation, {}, async (match) => {
    const adapter = getAdapter(match.provider.id as ProviderId);
    if (!isNewsSource(adapter)) {
      throw new NotSupportedError(
        `Adapter "${match.provider.id}" does not implement news — registry/adapter mismatch`,
      );
    }
    return adapter.getNews(params);
  });
  return annotateRouting(route);
}

export async function webSearch(params: {
  query: string;
  maxResults?: number;
  depth?: 'basic' | 'advanced';
  includeAnswer?: boolean;
}): Promise<SearchBatch> {
  const route = await executeWithFallback('search.web', {}, async (match) => {
    const adapter = getAdapter(match.provider.id as ProviderId);
    if (!isWebSearchSource(adapter)) {
      throw new NotSupportedError(
        `Adapter "${match.provider.id}" does not implement web search — registry/adapter mismatch`,
      );
    }
    return adapter.webSearch(params);
  });
  return annotateRouting(route);
}
