import { type ApifyTweets, ApifyTweetsSchema } from '@/types/Apify'
import { ensureJsonTreeString, isNullish } from '@/utils/Lang'

const APIFY_BASE_URL = 'https://api.apify.com'

// The store's most-used X/Twitter scraper, PAY_PER_EVENT at $0.0004/tweet flat
// across every subscription tier. The id is the tilde form on purpose: it is ONE
// path segment, where `owner/name` would split into two and 404.
const TWEET_SCRAPER_ACTOR = 'apidojo~tweet-scraper'

// Synchronous run: start the actor, block, return the dataset. Apify caps this
// leg at 300s and then 408s — but the RUN keeps going and keeps billing, which
// is the reason maxTotalChargeUsd below is not optional.
const RUN_SYNC_PATH = 'run-sync-get-dataset-items'

const USD_PER_TWEET = 0.0004
// Headroom over limit x unit price so a run is never killed a few results short
// by rounding, while still bounding the bill. Apify enforces this server-side.
const CHARGE_CEILING_MULTIPLIER = 1.5

type ApifyServiceParams = {
  readonly apiKey: string
}

type SearchTweetsParams = {
  readonly queries: string[]
  readonly handles: string[]
  readonly limit: number
  readonly since: string | null
  readonly until: string | null
  readonly sort: string | null
}

// Apify's X/Twitter scraper, and nothing else.
//
// Unlike every other service here, this one is responsible for its own spend
// ceiling. The egress meter charges a flat reserve per request and cannot see
// how many results a run will return, so the only real cap is the pair of
// bounds this class attaches to every call.
export class ApifyService {
  private readonly apiKey: string

  constructor(params: ApifyServiceParams) {
    this.apiKey = params.apiKey
  }

  // Tweets matching search terms and/or handles.
  //
  // `limit` is load-bearing, not cosmetic: cost is linear in the result count,
  // and the actor's own schema neither defaults nor requires it. It is sent as
  // `maxItems` (what the actor should return) AND converted into
  // `maxTotalChargeUsd` (what Apify will let the run spend) so a scraper that
  // ignores or overshoots the item cap still cannot run up an open-ended bill.
  async searchTweets(params: SearchTweetsParams): Promise<ApifyTweets> {
    const input: Record<string, unknown> = {
      maxItems: params.limit,
      sort: params.sort ?? 'Latest'
    }
    if (params.queries.length > 0) {
      input.searchTerms = params.queries
    }
    if (params.handles.length > 0) {
      input.twitterHandles = params.handles
    }
    if (!isNullish(params.since)) {
      input.start = params.since
    }
    if (!isNullish(params.until)) {
      input.end = params.until
    }

    const json = await this.runActorSync({
      actorId: TWEET_SCRAPER_ACTOR,
      input,
      maxTotalChargeUsd: this.chargeCeilingUsd(params.limit)
    })
    const tweets = ApifyTweetsSchema.parse(json)
    this.assertNotSentinel(tweets)
    return tweets
  }

  // The actor answers a run it cannot serve with `{noResults: true}` placeholder
  // rows rather than an empty array or an error — and those rows are BILLED as
  // dataset items, so a run that returned nothing still costs money.
  //
  // Observed live on a FREE Apify plan: ten sentinels, charged as ten items
  // ($0.004), on a run reporting SUCCEEDED with statusMessage "Please subscribe
  // to a paid plan". Handing those straight back would give the desk ten empty
  // objects that look like a genuine absence of chatter, which is a materially
  // wrong read — absence of tweets about $BTC would itself be a signal.
  private assertNotSentinel(tweets: ApifyTweets): void {
    if (tweets.length === 0) {
      return
    }
    const allSentinel = tweets.every(
      (tweet) => tweet.noResults === true && isNullish(tweet.id) && isNullish(tweet.text)
    )
    if (allSentinel) {
      throw new Error(
        `Apify ${TWEET_SCRAPER_ACTOR} returned ${tweets.length} placeholder rows and no tweets — ` +
          'the run was billed anyway. This usually means the Apify account is on the FREE plan; ' +
          'the actor gates real results behind a paid plan. Treat as NO DATA, not as an absence of chatter'
      )
    }
  }

  // The dollar ceiling for a run of `limit` results, rounded up to the cent.
  // Never zero: a 0 would be read as "spend nothing" and the run would return
  // empty rather than being uncapped, which is a confusing way to fail.
  private chargeCeilingUsd(limit: number): number {
    const rawCents = limit * USD_PER_TWEET * CHARGE_CEILING_MULTIPLIER * 100
    // Normalise before rounding up. 250 x 0.0004 x 1.5 x 100 is 15.000000000000002
    // in binary floating point, and a bare Math.ceil would turn an exact $0.15
    // into $0.16 — a silent, permanent overcharge on every capped run.
    const cents = Math.ceil(Number(rawCents.toFixed(6)))
    return Math.max(0.01, cents / 100)
  }

  private async runActorSync(params: {
    readonly actorId: string
    readonly input: Record<string, unknown>
    readonly maxTotalChargeUsd: number
  }): Promise<unknown> {
    if (this.apiKey === '') {
      throw new Error(
        'APIFY_API_KEY is not set — the `social` command group is unavailable on this box'
      )
    }
    const url = new URL(`/v2/acts/${params.actorId}/${RUN_SYNC_PATH}`, APIFY_BASE_URL)
    // Apify enforces this itself and aborts the run at the ceiling. It has to
    // ride the query string — the actor input is the actor's own schema and has
    // no field for it.
    url.searchParams.set('maxTotalChargeUsd', String(params.maxTotalChargeUsd))

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        // The scheme is mandatory: a bare token in this header is discarded and
        // the request reads as having no credential at all.
        Authorization: `Bearer ${this.apiKey}`
      },
      body: ensureJsonTreeString(params.input)
    })
    if (!response.ok) {
      throw new Error(this.transportError({ status: response.status, response }))
    }
    const json: unknown = await response.json()
    return json
  }

  // 408 is the one status worth translating. Apify returns it when the
  // synchronous leg exceeds 300s — but the run itself is a separate object that
  // keeps executing and keeps billing, so this is emphatically not "nothing
  // happened, retry". Retrying is how one timed-out scrape becomes several
  // concurrent paid ones.
  private transportError(params: { readonly status: number; readonly response: Response }): string {
    const base = `Apify ${TWEET_SCRAPER_ACTOR} failed: ${params.status} ${params.response.statusText}`
    return params.status === 408
      ? `${base} — the synchronous leg timed out at 300s, but the run is still executing and still billing; do not retry, and narrow --limit or the date range instead`
      : base
  }
}
