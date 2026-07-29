import { z } from 'zod'

// ---------------------------------------------------------------------------
// Apify (api.apify.com) — an actor marketplace. You start someone else's scraper
// and read dataset items back.
//
// Only ONE actor is wrapped: apidojo~tweet-scraper (id 61RPP7dywgiy0JPD0), the
// store's most-used X/Twitter scraper. It is PAY_PER_EVENT at $0.0004 per tweet,
// flat across every subscription tier. Reddit was considered and rejected: the
// popular actor there is FLAT_PRICE_PER_MONTH (rental), and Apify retires rental
// entirely on 2026-10-01, so it is not a foundation worth building on.
//
// SPEND IS THE WHOLE PROBLEM WITH THIS PROVIDER. A run bills AFTER the HTTP
// response returns, and its cost scales with the number of results, which the
// egress meter cannot see. The actor ships `timeoutSecs: 0` — no timeout — and
// `maxItems` has no default and is not required, so an omitted value is
// unbounded: one uncapped call can return ~288k tweets and bill ~$115 while the
// meter charges a $0.50 reserve. Every request this harness sends therefore
// pins BOTH `maxItems` (how many results) and `maxTotalChargeUsd` (a hard dollar
// ceiling Apify enforces server-side). That enforcement lives here, in our
// client — the proxy cannot add it, because it sits in the query string.
// ---------------------------------------------------------------------------

// One tweet as the scraper emits it. The actor returns a wide, unstable record;
// only the fields a sentiment read actually uses are named, and passthrough
// keeps the rest rather than discarding it.
export const ApifyTweetSchema = z
  .object({
    id: z.string().nullish(),
    url: z.string().nullish(),
    // The actor's placeholder row for a run it will not serve. Modelled
    // explicitly because these rows are BILLED like real ones, so they have to
    // be detectable rather than passed through as empty tweets.
    noResults: z.boolean().nullish(),
    text: z.string().nullish(),
    createdAt: z.string().nullish(),
    retweetCount: z.number().nullish(),
    replyCount: z.number().nullish(),
    likeCount: z.number().nullish(),
    quoteCount: z.number().nullish(),
    viewCount: z.number().nullish(),
    lang: z.string().nullish(),
    author: z
      .object({
        userName: z.string().nullish(),
        name: z.string().nullish(),
        followers: z.number().nullish(),
        isVerified: z.boolean().nullish()
      })
      .passthrough()
      .nullish()
  })
  .passthrough()
export type ApifyTweet = z.infer<typeof ApifyTweetSchema>

// run-sync-get-dataset-items answers with the dataset array itself, not an
// envelope around it.
export const ApifyTweetsSchema = z.array(ApifyTweetSchema)
export type ApifyTweets = z.infer<typeof ApifyTweetsSchema>

// ---------------------------------------------------------------------------
// `tribes-cli social` command options.
// ---------------------------------------------------------------------------

const OutOptionSchema = z.string().nullish()

// Ceilings, not defaults-with-an-escape-hatch. `--limit` is bounded because the
// cost is linear in it and nothing downstream of this process can cap it.
const MAX_TWEETS = 500

export const SocialTweetsCommandOptionsSchema = z
  .object({
    // Either a search term (a cashtag like '$BTC', or any query) or a handle.
    query: z.array(z.string().min(1)).nullish(),
    handle: z.array(z.string().min(1)).nullish(),
    limit: z.number().int().min(1).max(MAX_TWEETS).nullish(),
    since: z.string().min(1).nullish(),
    until: z.string().min(1).nullish(),
    sort: z.enum(['Latest', 'Top']).nullish(),
    out: OutOptionSchema
  })
  .superRefine((options, ctx) => {
    const queries = options.query ?? []
    const handles = options.handle ?? []
    if (queries.length === 0 && handles.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'provide at least one --query or --handle'
      })
    }
  })
export type SocialTweetsCommandOptions = z.infer<typeof SocialTweetsCommandOptionsSchema>

export const APIFY_MAX_TWEETS = MAX_TWEETS
