import { describe, expect, it } from 'vitest';
import { collect, paginateCursor, paginateOffset } from '../../src/core/pagination.js';

describe('paginateOffset', () => {
  it('walks pages until a short page', async () => {
    const pages = [[1, 2, 3], [4, 5, 6], [7]];
    let call = 0;
    const items = await collect(
      paginateOffset(async () => ({ items: pages[call++] ?? [] }), 3),
    );
    expect(items).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(call).toBe(3);
  });

  it('respects maxItems cap', async () => {
    const items = await collect(
      paginateOffset(async (offset) => ({ items: [offset, offset + 1, offset + 2] }), 3, {
        maxItems: 5,
      }),
    );
    expect(items).toHaveLength(5);
  });

  it('stops at reported total', async () => {
    const calls: number[] = [];
    const items = await collect(
      paginateOffset(
        async (offset) => {
          calls.push(offset);
          return { items: [offset, offset + 1, offset + 2], total: 6 };
        },
        3,
      ),
    );
    expect(items).toHaveLength(6);
    expect(calls).toEqual([0, 3]);
  });
});

describe('paginateCursor', () => {
  it('follows cursors until exhausted', async () => {
    const pages: Record<string, { items: number[]; nextCursor?: string }> = {
      start: { items: [1, 2], nextCursor: 'b' },
      b: { items: [3], nextCursor: undefined },
    };
    const items = await collect(
      paginateCursor(async (cursor?: string) => pages[cursor ?? 'start']!),
    );
    expect(items).toEqual([1, 2, 3]);
  });

  it('continues through empty pages when a cursor is still present', async () => {
    const pages: Record<string, { items: number[]; nextCursor?: string }> = {
      start: { items: [1, 2], nextCursor: 'p2' },
      p2: { items: [], nextCursor: 'p3' },
      p3: { items: [3, 4], nextCursor: undefined },
    };
    const items = await collect(
      paginateCursor(async (cursor?: string) => pages[cursor ?? 'start']!),
    );
    expect(items).toEqual([1, 2, 3, 4]);
  });

  it('enforces maxPages against cursor loops', async () => {
    const items = await collect(
      paginateCursor(async () => ({ items: [1], nextCursor: 'again' }), { maxPages: 4 }),
    );
    expect(items).toEqual([1, 1, 1, 1]);
  });
});
