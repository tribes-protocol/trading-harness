import { requireApiKey, type ProviderId } from '../../core/config.js';
import { DataQualityError } from '../../core/errors.js';
import { HttpClient, type QueryValue } from '../../core/http.js';
import { nowIso, toUtcIso, type Frequency } from '../../core/time.js';
import type { LineageStep } from '../../schemas/common.js';
import {
  MacroSeriesInfoSchema,
  MacroSeriesSchema,
  type MacroSeries,
  type MacroSeriesInfo,
} from '../../schemas/macro.js';
import { BaseAdapter } from '../base.js';
import type { MacroSeriesSource, ProviderMeta } from '../types.js';
import type {
  FredObservation,
  FredObservationsResponse,
  FredSeriesMeta,
  FredSeriesResponse,
  FredSeriesSearchResponse,
} from './types.js';

/**
 * FRED (Federal Reserve Bank of St. Louis) adapter — macro time series.
 *
 * Source of truth: docs/research/providers/fred.json (official docs
 * https://fred.stlouisfed.org/docs/api/fred/).
 *
 * LICENSING (CRITICAL):
 *  - FRED terms prohibit storing/caching/archiving FRED content and
 *    incorporating it into any database. This adapter therefore performs
 *    NO persistent caching of any kind (no DiskCache); every call goes to
 *    the API and `cacheHit` is always false.
 *  - Applications must display FRED_ATTRIBUTION verbatim, and displayed
 *    data must cite the original source via FRED (e.g. "Source: BLS via
 *    FRED").
 */

/** Required verbatim by the FRED API Terms of Use on any application. */
export const FRED_ATTRIBUTION =
  'This product uses the FRED API but is not endorsed or certified by the Federal Reserve Bank of St. Louis.';

const BASE_URL = 'https://api.stlouisfed.org/fred';

/** Documented real-time sentinels (earliest / latest). */
const REALTIME_EARLIEST = '1776-07-04';
const REALTIME_LATEST = '9999-12-31';

/** Documented representation of a missing observation. */
const MISSING_VALUE = '.';

/** Documented example series (Real GNP, annual) — minimal-quota probe target. */
const PROBE_SERIES_ID = 'GNPCA';

/** fred/series/search caps limit at 1000 (docs: 1-1000, default 1000). */
const SEARCH_LIMIT_CAP = 1000;

/**
 * frequency_short → canonical platform frequency. FRED also publishes
 * bi-weekly (BW) and semiannual (SA) series which have no canonical
 * equivalent; those keep only frequencyRaw.
 */
const FREQUENCY_BY_SHORT: Record<string, Frequency> = {
  D: '1d',
  W: '1w',
  M: '1mo',
  Q: '1q',
  A: '1y',
};

/**
 * FRED `last_updated` looks like "2013-08-14 08:31:05-05": space-separated
 * with an hour-only UTC offset. Normalize to ISO-8601 before converting.
 */
function fredTimestampToIso(raw: string): string {
  let normalized = raw.trim().replace(' ', 'T');
  if (/[+-]\d{2}$/.test(normalized)) normalized = `${normalized}:00`;
  return toUtcIso(normalized);
}

/** Map a raw `seriess[]` entry to the platform MacroSeriesInfo shape. */
function mapSeriesInfo(meta: FredSeriesMeta): MacroSeriesInfo {
  const frequency = FREQUENCY_BY_SHORT[meta.frequency_short.toUpperCase()];
  return MacroSeriesInfoSchema.parse({
    // Preserve the provider-native series id verbatim (e.g. "CPIAUCSL").
    id: meta.id,
    title: meta.title,
    units: meta.units,
    ...(frequency !== undefined ? { frequency } : {}),
    frequencyRaw: meta.frequency,
    seasonalAdjustment: meta.seasonal_adjustment,
    lastUpdated: fredTimestampToIso(meta.last_updated),
    ...(meta.notes !== undefined ? { notes: meta.notes } : {}),
  });
}

/** Parse a documented numeric-string value; "." (missing) becomes null. */
function parseObservationValue(seriesId: string, date: string, raw: string): number | null {
  if (raw === MISSING_VALUE) return null;
  const value = Number(raw);
  if (raw.trim() === '' || !Number.isFinite(value)) {
    throw new DataQualityError(
      `fred: observation for series "${seriesId}" on ${date} has non-numeric value "${raw}"`,
      { details: { seriesId, date, raw } },
    );
  }
  return value;
}

/** Guard the documented observations[] payload; anything else is a data-quality failure. */
function requireObservations(seriesId: string, data: FredObservationsResponse): FredObservation[] {
  if (!Array.isArray(data.observations)) {
    throw new DataQualityError(
      `fred: /fred/series/observations returned no observations[] array for series "${seriesId}"`,
      { details: { seriesId } },
    );
  }
  return data.observations;
}

export class FredAdapter extends BaseAdapter implements MacroSeriesSource {
  readonly id: ProviderId = 'fred';

  readonly meta: ProviderMeta = {
    id: 'fred',
    name: 'FRED (Federal Reserve Bank of St. Louis)',
    docsUrl: 'https://fred.stlouisfed.org/docs/api/fred/',
    docsReviewDate: '2026-07-17',
    apiVersion: 'v1 (fred/*); v2 exists only for bulk release observations (not used here)',
    envVar: 'FRED_API_KEY',
  };

  private http: HttpClient | undefined;

  constructor(private readonly opts: { fetchImpl?: typeof fetch } = {}) {
    super();
  }

  /**
   * Build the HttpClient lazily so importing/constructing the adapter never
   * reads credentials. Auth is the documented `api_key` query parameter,
   * plus `file_type=json` on every request. FRED publishes no numeric rate
   * limit (only "429 on breach"), so we self-throttle conservatively at
   * 2 requests/second.
   */
  private client(): HttpClient {
    if (this.http === undefined) {
      this.http = new HttpClient({
        provider: 'fred',
        baseUrl: BASE_URL,
        defaultQuery: { api_key: requireApiKey('fred'), file_type: 'json' },
        rateLimit: { capacity: 2, refillPerSecond: 2 },
        ...(this.opts.fetchImpl !== undefined ? { fetchImpl: this.opts.fetchImpl } : {}),
      });
    }
    return this.http;
  }

  /** Exactly one minimal-quota documented request (metadata for one series). */
  protected async liveProbe(): Promise<void> {
    await this.client().getJson<FredSeriesResponse>('/series', { series_id: PROBE_SERIES_ID });
  }

  /**
   * Fetch series metadata (GET /fred/series) + observations
   * (GET /fred/series/observations).
   *
   * vintage semantics:
   *  - "latest" (default): FRED default real-time period (= today), i.e.
   *    today's best-known, possibly revised values.
   *  - "point_in_time": ALFRED mode — requests the full documented
   *    real-time range (1776-07-04 .. 9999-12-31) and maps each
   *    observation's realtime_start/realtime_end vintage window onto the
   *    output, so revision history is explicit and look-ahead-safe.
   */
  async getMacroSeries(params: {
    seriesId: string;
    from?: string;
    to?: string;
    vintage?: 'latest' | 'point_in_time';
  }): Promise<MacroSeries> {
    const vintage = params.vintage ?? 'latest';
    const pointInTime = vintage === 'point_in_time';
    const http = this.client();

    const infoRes = await http.getJson<FredSeriesResponse>('/series', {
      series_id: params.seriesId,
    });
    const rawMeta = Array.isArray(infoRes.data.seriess) ? infoRes.data.seriess[0] : undefined;
    if (rawMeta === undefined) {
      throw new DataQualityError(
        `fred: series "${params.seriesId}" returned no metadata from /fred/series`,
        { details: { seriesId: params.seriesId } },
      );
    }

    const obsQuery: Record<string, QueryValue> = {
      series_id: params.seriesId,
      sort_order: 'asc',
      ...(params.from !== undefined ? { observation_start: params.from } : {}),
      ...(params.to !== undefined ? { observation_end: params.to } : {}),
      ...(pointInTime
        ? { realtime_start: REALTIME_EARLIEST, realtime_end: REALTIME_LATEST }
        : {}),
    };
    // Documented pagination: limit (1-100,000, default 100,000) + offset,
    // with the total row count echoed as `count`. Follow offset pages until
    // `count` is reached — otherwise a long series (e.g. a daily series over
    // the full ALFRED realtime range) would be silently truncated at one page.
    const firstPage = await http.getJson<FredObservationsResponse>(
      '/series/observations',
      obsQuery,
    );
    const pages = [firstPage];
    let lastPage = firstPage;
    let fetchedCount = requireObservations(params.seriesId, firstPage.data).length;
    while (fetchedCount < lastPage.data.count) {
      const page = await http.getJson<FredObservationsResponse>('/series/observations', {
        ...obsQuery,
        offset: fetchedCount,
      });
      const pageObservations = requireObservations(params.seriesId, page.data);
      if (pageObservations.length === 0) {
        throw new DataQualityError(
          `fred: observations pagination for series "${params.seriesId}" stalled at offset ` +
            `${fetchedCount} of ${page.data.count}`,
          { details: { seriesId: params.seriesId, offset: fetchedCount, count: page.data.count } },
        );
      }
      pages.push(page);
      lastPage = page;
      fetchedCount += pageObservations.length;
    }

    const info = mapSeriesInfo(rawMeta);

    let missingCount = 0;
    const rawObservations = pages.flatMap((page) => page.data.observations);
    const observations = rawObservations.map((obs) => {
      const value = parseObservationValue(params.seriesId, obs.date, obs.value);
      if (value === null) missingCount += 1;
      return {
        date: obs.date,
        value,
        ...(pointInTime
          ? { realtimeStart: obs.realtime_start, realtimeEnd: obs.realtime_end }
          : {}),
      };
    });

    const lineage: LineageStep[] = [
      {
        step: 'map_series_metadata',
        description:
          'Mapped FRED seriess[0] fields to MacroSeriesInfo; frequency_short mapped to the ' +
          'canonical frequency where one exists, raw frequency preserved in frequencyRaw.',
        at: nowIso(),
        params: {
          frequencyShort: rawMeta.frequency_short,
          mappedFrequency: info.frequency ?? null,
        },
      },
      {
        step: 'convert_last_updated_timestamp',
        description:
          'Converted FRED last_updated ("YYYY-MM-DD HH:mm:ss±hh", hour-only offset) to UTC ISO-8601.',
        at: nowIso(),
        params: { raw: rawMeta.last_updated },
      },
      {
        step: 'parse_observation_values',
        description:
          'Parsed numeric-string observation values to numbers; documented missing marker "." mapped to value: null.',
        at: nowIso(),
        params: { observationCount: observations.length, missingCount },
      },
      ...(pages.length > 1
        ? [
            {
              step: 'paginate_observations',
              description:
                'Followed documented limit+offset pagination on /fred/series/observations until ' +
                'the echoed count was reached (single page would have truncated the series).',
              at: nowIso(),
              params: { pages: pages.length, count: lastPage.data.count },
            },
          ]
        : []),
      ...(pointInTime
        ? [
            {
              step: 'map_realtime_windows',
              description:
                'Requested ALFRED real-time range 1776-07-04..9999-12-31 and mapped each ' +
                'observation realtime_start/realtime_end onto realtimeStart/realtimeEnd vintage windows.',
              at: nowIso(),
              params: {
                realtimeStart: firstPage.data.realtime_start,
                realtimeEnd: firstPage.data.realtime_end,
              },
            },
          ]
        : []),
    ];

    // Registry: macro.series freshness is "eod" — official data on source-agency
    // release schedules; never real-time market data. No caching (cacheHit false
    // always — FRED terms prohibit storing/caching content).
    return MacroSeriesSchema.parse({
      info,
      vintage,
      observations,
      source: {
        provider: this.id,
        endpoint: '/fred/series/observations',
        apiVersion: 'v1',
        requestedAt: firstPage.requestedAt,
        receivedAt: lastPage.receivedAt,
        cacheHit: false,
        freshness: 'eod',
      },
      additionalSources: [
        {
          provider: this.id,
          endpoint: '/fred/series',
          apiVersion: 'v1',
          requestedAt: infoRes.requestedAt,
          receivedAt: infoRes.receivedAt,
          cacheHit: false,
          freshness: 'eod',
        },
      ],
      quality: ['eod'],
      lineage,
    });
  }

  /** Full-text series discovery via GET /fred/series/search. */
  async searchMacroSeries(params: { query: string; limit?: number }): Promise<MacroSeriesInfo[]> {
    const limit =
      params.limit !== undefined && Number.isFinite(params.limit)
        ? Math.max(1, Math.min(Math.trunc(params.limit), SEARCH_LIMIT_CAP))
        : undefined;
    const res = await this.client().getJson<FredSeriesSearchResponse>('/series/search', {
      search_text: params.query,
      ...(limit !== undefined ? { limit } : {}),
    });
    if (!Array.isArray(res.data.seriess)) {
      throw new DataQualityError('fred: /fred/series/search returned no seriess[] array', {
        details: { query: params.query },
      });
    }
    return res.data.seriess.map((meta) => mapSeriesInfo(meta));
  }
}
