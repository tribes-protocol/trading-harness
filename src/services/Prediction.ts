import {
  type PolymarketEvent,
  PolymarketEventSchema,
  type PolymarketListEventsQuery,
  type PolymarketListMarketsQuery,
  type PolymarketMarket,
  PolymarketMarketSchema,
  type PolymarketSearchQuery,
  PolymarketSearchResponseSchema
} from '@/types/Polymarket'
import { isNullish } from '@/utils/lang'

type QueryParam = boolean | number | number[] | string | string[] | null | undefined

const POLYMARKET_GAMMA_BASE_URL = 'https://gamma-api.polymarket.com/'
const POLYMARKET_USER_AGENT = 'skill-prediction-cli/1.0'

export class PredictionService {
  async search(params: PolymarketSearchQuery): Promise<PolymarketEvent[]> {
    const url = new URL('public-search', POLYMARKET_GAMMA_BASE_URL)
    this.setQueryParams(url, {
      q: params.q,
      limit_per_type: params.limitPerType,
      events_tag: params.eventsTag,
      events_status: 'active',
      keep_closed_markets: 0,
      cache: false
    })
    const raw = await this.fetch(url)
    const parsed = PolymarketSearchResponseSchema.parse(raw)
    return parsed.events ?? []
  }

  async listEvents(params: PolymarketListEventsQuery): Promise<PolymarketEvent[]> {
    const url = new URL('events', POLYMARKET_GAMMA_BASE_URL)
    this.setQueryParams(url, {
      id: params.id,
      tag_id: params.tagId,
      slug: params.slug,
      tag_slug: params.tagSlug,
      active: params.active,
      archived: params.archived,
      closed: params.closed,
      limit: params.limit,
      offset: params.offset,
      order: params.order,
      ascending: params.ascending
    })
    const raw = await this.fetch(url)
    return PolymarketEventSchema.array().parse(raw)
  }

  async getEventById(eventId: string): Promise<PolymarketEvent> {
    const url = new URL(`events/${encodeURIComponent(eventId)}`, POLYMARKET_GAMMA_BASE_URL)
    const raw = await this.fetch(url)
    return PolymarketEventSchema.parse(raw)
  }

  async getEventBySlug(eventSlug: string): Promise<PolymarketEvent> {
    const url = new URL(`events/slug/${encodeURIComponent(eventSlug)}`, POLYMARKET_GAMMA_BASE_URL)
    const raw = await this.fetch(url)
    return PolymarketEventSchema.parse(raw)
  }

  async listMarkets(params: PolymarketListMarketsQuery): Promise<PolymarketMarket[]> {
    const url = new URL('markets', POLYMARKET_GAMMA_BASE_URL)
    this.setQueryParams(url, {
      id: params.id,
      slug: params.slug,
      tag_id: params.tagId,
      closed: params.closed,
      limit: params.limit,
      offset: params.offset,
      order: params.order,
      ascending: params.ascending
    })
    const raw = await this.fetch(url)
    return PolymarketMarketSchema.array().parse(raw)
  }

  async getMarketById(marketId: string): Promise<PolymarketMarket> {
    const url = new URL(`markets/${encodeURIComponent(marketId)}`, POLYMARKET_GAMMA_BASE_URL)
    const raw = await this.fetch(url)
    return PolymarketMarketSchema.parse(raw)
  }

  async getMarketBySlug(marketSlug: string): Promise<PolymarketMarket> {
    const url = new URL(`markets/slug/${encodeURIComponent(marketSlug)}`, POLYMARKET_GAMMA_BASE_URL)
    const raw = await this.fetch(url)
    return PolymarketMarketSchema.parse(raw)
  }

  private setQueryParams(url: URL, params: Record<string, QueryParam>): void {
    for (const [key, value] of Object.entries(params)) {
      if (isNullish(value)) {
        continue
      }

      if (Array.isArray(value)) {
        url.searchParams.delete(key)
        for (const element of value) {
          if (!isNullish(element)) {
            url.searchParams.append(key, String(element))
          }
        }
      } else {
        url.searchParams.set(key, String(value))
      }
    }
  }

  private async fetch(url: URL): Promise<unknown> {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'User-Agent': POLYMARKET_USER_AGENT
      }
    })

    if (!response.ok) {
      const body = await response.text().catch(() => '')
      throw new Error(
        `Polymarket API ${url.toString()} failed: ${response.status} ${response.statusText} ${body}`
      )
    }

    const data: unknown = await response.json()
    return data
  }
}
