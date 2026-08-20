#!/usr/bin/env bun
/**
 * X-feed alpha — @Hedgeye + @KobeissiLetter latest posts.
 *
 * Operator-priority script (due 12:20Z): fetches the newest 10 non-retweet /
 * non-reply posts from each account via the X v2 API through the sandbox
 * egress proxy, writes raw JSON per account plus a compact merged markdown
 * with per-post "why this might be alpha" hooks, and never re-fetches a
 * page already written this run (write-then-read discipline).
 *
 * Cost discipline: $0.005 per post returned; max_results is hard-capped at 10
 * per account (one page, never paged); the id-resolution call is $0.010
 * (one user object) per account on the first run.
 *
 * Invoke:  bun scripts/x-feed-alpha.ts
 * Outputs: /root/workspace/x_alpha_<account>_latest.json  (+ merged .md)
 */
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const ACCOUNTS = ['Hedgeye', 'KobeissiLetter'] as const

const OUT_DIR = resolve('/root/workspace')

// A page written this window (10 min) is treated as already-fetched this run.
const REFETCH_WINDOW_MS = 10 * 60 * 1000

type Tweet = {
  id?: string
  text?: string
  created_at?: string
  public_metrics?: { like_count?: number; retweet_count?: number; reply_count?: number }
  author_id?: string
}

async function xGet(path: string, params: Record<string, string>): Promise<unknown> {
  const proxy = process.env.ZIPBOX_EGRESS_PROXY_URL
  const init: RequestInit = {
    headers: {
      Authorization: 'Bearer ZIPBOX_XCOM_KEY', // literal placeholder — the proxy swaps it
      Accept: 'application/json'
    }
  }
  if (proxy && proxy.length > 0) {
    // NOTE: node fetch does not honor env proxies; use undici's EnvHttpProxyAgent.
    const { EnvHttpProxyAgent } = await import('undici')
    ;(init as Record<string, unknown>).dispatcher = new EnvHttpProxyAgent({
      httpProxy: proxy,
      httpsProxy: proxy
    })
  }
  const url = new URL(`https://api.x.com/${path}`)
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)

  let res: Response
  try {
    res = await fetch(url.toString(), init)
  } catch (err) {
    // Transport failure — the ONE retryable class besides 429.
    const msg = err instanceof Error ? err.message : String(err)
    res = await fetch(url.toString(), init).catch((e2: unknown) => {
      throw new Error(`xGet ${path} transport-error (retried once): ${e2 instanceof Error ? e2.message : String(e2)} (first: ${msg})`)
    })
  }

  if (res.status === 429 || res.status === 402 || res.status === 501) {
    // 429 rate-limit (retry once), 402/501 = wallet/proxy-not-configured, not retryable.
    if (res.status === 429) {
      await new Promise((r) => setTimeout(r, 5000))
      const retry = await fetch(url.toString(), init)
      if (retry.ok) return (await retry.json()) as unknown
      res = retry
    }
    throw new Error(`xGet ${path} hard-fail status=${res.status}`)
  }
  if (!res.ok) {
    // 4xx from X is deterministic — do not retry.
    const body = await res.text().catch(() => '')
    throw new Error(`xGet ${path} status=${res.status} body=${body}`)
  }
  return (await res.json()) as unknown
}

function alphaHook(text: string): string {
  const lower = text.toLowerCase()
  const ticker = /\$([A-Za-z]{1,5})\b/.exec(text)
  const macro = /\b(fed|cpi|inflation|yield|gdp|unemployment|vix|brent|wti|gold|silver|oil|btc|bitcoin|ether|eth|s&p|sp500|nasdaq|dow)\b/i.test(text)
  const direction = /\b(up|down|rally|selloff|sell-off|surge|plunge|record|crash|jump|dump|slump)\b/i.test(lower)
  const bits: string[] = []
  if (ticker) bits.push(`$${ticker[1]}`)
  if (macro) bits.push('macro')
  if (direction) bits.push('direction')
  return bits.length > 0 ? bits.join(' ') : '—'
}

function engagement(t: Tweet): string {
  const m = t.public_metrics
  if (!m) return ''
  const parts: string[] = []
  if (typeof m.like_count === 'number') parts.push(`L${m.like_count}`)
  if (typeof m.retweet_count === 'number') parts.push(`RT${m.retweet_count}`)
  if (typeof m.reply_count === 'number') parts.push(`R${m.reply_count}`)
  return parts.join(' ')
}

async function resolveUserId(username: string): Promise<string> {
  const data = (await xGet(`2/users/by/username/${username}`, { 'user.fields': 'public_metrics' })) as {
    data?: { id?: string }
  }
  const id = data?.data?.id
  if (!id) throw new Error(`resolve ${username} no-id`)
  return id
}

async function fetchTweets(userId: string): Promise<Tweet[]> {
  const data = (await xGet(`2/users/${userId}/tweets`, {
    max_results: '10',
    exclude: 'retweets,replies',
    'tweet.fields': 'created_at,public_metrics,author_id',
    expansions: 'author_id'
  })) as { data?: Tweet[] }
  return Array.isArray(data?.data) ? data.data : []
}

const idCache = new Map<string, string>()

async function userIdFor(username: string): Promise<string> {
  const cached = idCache.get(username)
  if (cached) return cached
  const id = await resolveUserId(username)
  idCache.set(username, id)
  return id
}

function mergedLines(tweets: Tweet[], account: string): string[] {
  const lines: string[] = [`## @${account}`, '']
  for (const t of tweets) {
    const eng = engagement(t)
    lines.push(`- ${t.id ?? ''} (${t.created_at ?? ''})${eng ? ` · ${eng}` : ''}`)
    lines.push(`  ${(t.text ?? '').replace(/\n/g, ' ')}`)
    lines.push(`  hook: ${alphaHook(t.text ?? '')}`)
    lines.push('')
  }
  return lines
}

async function main(): Promise<void> {
  const now = Date.now()
  const merged: string[] = ['# X-feed alpha — latest posts', `fetched ${new Date(now).toISOString()}`, '']
  for (const account of ACCOUNTS) {
    const rawPath = join(OUT_DIR, `x_alpha_${account}_latest.json`)
    try {
      // Re-read discipline: if we wrote this page inside the window, use it, don't re-bill.
      if (existsSync(rawPath)) {
        const age = now - statSync(rawPath).mtimeMs
        if (age >= 0 && age < REFETCH_WINDOW_MS) {
          const cached = JSON.parse(readFileSync(rawPath, 'utf8')) as { tweets?: Tweet[]; account?: string }
          merged.push(...mergedLines(cached.tweets ?? [], account))
          continue
        }
      }
      const id = await userIdFor(account)
      const tweets = await fetchTweets(id)
      writeFileSync(rawPath, JSON.stringify({ account, id, tweets, fetchedAt: new Date(now).toISOString() }, null, 2))
      if (tweets.length === 0) {
        merged.push(...linesForEmpty(account))
      } else {
        merged.push(...mergedLines(tweets, account))
      }
    } catch (err) {
      const why = err instanceof Error ? err.message : String(err)
      // Graceful empty-with-marker: an account failure must not fail the run.
      writeFileSync(`${rawPath}.empty.json`, JSON.stringify({ account, empty: true, reason: why, at: new Date(now).toISOString() }, null, 2))
      merged.push(`## @${account} — EMPTY`, `reason: ${why}`, '')
    }
  }
  writeFileSync(join(OUT_DIR, 'x_alpha_merged.md'), merged.join('\n') + '\n')
  // eslint-disable-next-line no-console
  console.error(`x-feed alpha: wrote ${ACCOUNTS.length} account files + merged`)
}

// eslint-disable-next-line no-unused-vars
function linesForEmpty(account: string): string[] {
  return [`## @${account} — empty`, '']
}

main().catch((err: unknown) => {
  console.error(`x-feed-alpha fatal: ${err instanceof Error ? err.message : String(err)}`)
  process.exit(1)
})