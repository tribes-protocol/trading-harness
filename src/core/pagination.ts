/**
 * Pagination helpers with hard safety caps so a provider bug (or a
 * misunderstood pagination contract) can never produce an unbounded crawl.
 */

export interface PageLimits {
  /** Stop after this many items (default 10,000). */
  maxItems?: number;
  /** Stop after this many pages (default 100). */
  maxPages?: number;
}

export interface OffsetPage<T> {
  items: T[];
  /** Total available items if the provider reports it. */
  total?: number;
}

export async function* paginateOffset<T>(
  fetchPage: (offset: number, limit: number) => Promise<OffsetPage<T>>,
  pageSize: number,
  limits: PageLimits = {},
): AsyncGenerator<T, void, undefined> {
  const maxItems = limits.maxItems ?? 10_000;
  const maxPages = limits.maxPages ?? 100;
  let offset = 0;
  let yielded = 0;
  for (let page = 0; page < maxPages; page += 1) {
    const { items, total } = await fetchPage(offset, pageSize);
    for (const item of items) {
      if (yielded >= maxItems) return;
      yield item;
      yielded += 1;
    }
    if (yielded >= maxItems) return;
    offset += items.length;
    if (items.length < pageSize) return;
    if (total !== undefined && offset >= total) return;
  }
}

export interface CursorPage<T, C> {
  items: T[];
  nextCursor?: C | undefined;
}

export async function* paginateCursor<T, C>(
  fetchPage: (cursor: C | undefined) => Promise<CursorPage<T, C>>,
  limits: PageLimits = {},
): AsyncGenerator<T, void, undefined> {
  const maxItems = limits.maxItems ?? 10_000;
  const maxPages = limits.maxPages ?? 100;
  let cursor: C | undefined;
  let yielded = 0;
  for (let page = 0; page < maxPages; page += 1) {
    const { items, nextCursor } = await fetchPage(cursor);
    for (const item of items) {
      if (yielded >= maxItems) return;
      yield item;
      yielded += 1;
    }
    if (yielded >= maxItems) return;
    // An empty page with a live cursor is legitimate (server-side
    // filtering); only a missing cursor ends the stream. maxPages bounds
    // pathological empty-page loops.
    if (nextCursor === undefined) return;
    cursor = nextCursor;
  }
}

/** Drain an async generator into an array (bounded by the generator's caps). */
export async function collect<T>(gen: AsyncGenerator<T, void, undefined>): Promise<T[]> {
  const out: T[] = [];
  for await (const item of gen) out.push(item);
  return out;
}
