import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { FredService } from '@/services/FredService'

const API_KEY = 'test-fred-key'

function observationsBody(rows: [string, string][]): string {
  const observations = rows.map(([date, value]) => ({
    realtime_start: date,
    realtime_end: date,
    date,
    value
  }))
  /* eslint-disable lucy/no-json-stringify */
  return JSON.stringify({ observations })
  /* eslint-enable lucy/no-json-stringify */
}

describe('FredService', () => {
  beforeEach(async () => {
    process.env.TRIBES_PROVIDER_CACHE_BASE = await mkdtemp(join(tmpdir(), 'fred-test-'))
  })

  afterEach(() => {
    delete process.env.TRIBES_PROVIDER_CACHE_BASE
    vi.restoreAllMocks()
  })

  it('fetches, uppercases the series id, and drops missing observations', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        observationsBody([
          ['2026-07-14', '.'],
          ['2026-07-13', '4.62'],
          ['2026-07-10', '4.56']
        ]),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    )

    const service = new FredService({ apiKey: API_KEY })
    const series = await service.getSeries({ seriesId: 'dgs10', limit: 3 })

    expect(series).toEqual({
      source: 'fred-direct',
      series_id: 'DGS10',
      points: [
        { date: '2026-07-13', value: 4.62 },
        { date: '2026-07-10', value: 4.56 }
      ]
    })

    const requestUrl = new URL(String(fetchSpy.mock.calls[0]?.[0]), 'https://unused.test')
    expect(requestUrl.pathname).toBe('/fred/series/observations')
    expect(requestUrl.searchParams.get('series_id')).toBe('DGS10')
    expect(requestUrl.searchParams.get('api_key')).toBe(API_KEY)
    expect(requestUrl.searchParams.get('file_type')).toBe('json')
    expect(requestUrl.searchParams.get('sort_order')).toBe('desc')
  })

  it('throws without calling fetch when unconfigured', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    const service = new FredService({ apiKey: '' })

    await expect(service.getSeries({ seriesId: 'DGS10', limit: 1 })).rejects.toThrow(
      'FRED_API_KEY is not set'
    )
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('redacts the api key from error messages', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(`bad key ${API_KEY}`, { status: 400, statusText: 'Bad Request' })
    )

    const service = new FredService({ apiKey: API_KEY })
    let message = ''
    try {
      await service.getSeries({ seriesId: 'DGS10', limit: 1 })
    } catch (error: unknown) {
      message = error instanceof Error ? error.message : ''
    }
    expect(message).not.toContain(API_KEY)
    expect(message).toContain('***')
  })

  it('builds the macro snapshot with change_pct and per-series errors', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation((input): Promise<Response> => {
      const url = new URL(String(input), 'https://unused.test')
      const seriesId = url.searchParams.get('series_id') ?? ''
      if (seriesId === 'VIXCLS') {
        return Promise.resolve(new Response('sad', { status: 400, statusText: 'Bad Request' }))
      }
      if (seriesId === 'CPIAUCSL') {
        // Sparse monthly series: one month missing mid-window (like the
        // never-published Oct 2025 print) — YoY must match by date, not index.
        const rows: [string, string][] = [
          ['2026-06-01', '310'],
          ['2026-05-01', '309'],
          ['2026-04-01', '308'],
          ['2026-03-01', '307'],
          ['2026-02-01', '306'],
          ['2026-01-01', '305'],
          ['2025-12-01', '304'],
          ['2025-11-01', '303'],
          ['2025-09-01', '302'],
          ['2025-08-01', '301.5'],
          ['2025-07-01', '301'],
          ['2025-06-01', '300'],
          ['2025-05-01', '299']
        ]
        return Promise.resolve(
          new Response(observationsBody(rows), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
          })
        )
      }
      return Promise.resolve(
        new Response(
          observationsBody([
            ['2026-07-14', '100'],
            ['2026-07-13', '80']
          ]),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      )
    })

    const service = new FredService({ apiKey: API_KEY })
    const snapshot = await service.getMacrosSnapshotDirect()

    expect(snapshot.source).toBe('fred')
    expect(snapshot.dxy).toEqual({ value: 100, change_pct: 25, as_of: '2026-07-14' })
    expect(snapshot.yields.us10y).toBe(100)
    expect(snapshot.vix).toEqual({ value: null, change_pct: null, as_of: null })
    expect(snapshot.cpi.value).toBe(310)
    expect(snapshot.cpi.as_of).toBe('2026-06-01')
    expect(snapshot.cpi.yoy_pct).toBeCloseTo(((310 - 300) / 300) * 100, 2)
    expect(snapshot.errors.some((entry) => entry.series === 'VIXCLS')).toBe(true)
    // FRED discontinued its gold series: never fetched, always null + error.
    expect(snapshot.gold).toEqual({ value: null, change_pct: null, as_of: null })
    expect(
      snapshot.errors.some(
        (entry) => entry.series === 'GOLDAMGBD228NLBM' && entry.error.includes('discontinued')
      )
    ).toBe(true)
  })
})
