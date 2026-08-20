#!/usr/bin/env bun
/**
 * X-feed alpha — @Hedgeye + @KobeissiLetter latest posts.
 *
 * Fetches the newest 10 non-retweet / non-reply posts from each account via
 * the X v2 API through the sandbox egress proxy, writes raw JSON per account
 * plus a compact merged markdown with per-post "why this might be alpha"
 * hooks, and never re-fetches a page already written this run (write-then-
 * read discipline).
 *
 * Cost discipline: $0.005 per post returned; max_results capped at 10 per
 * account (one page, never paged); id resolution is $0.010 per account on
 * the first run only.
 *
 * Invoke:  bun scripts/XFeedAlpha.ts
 * Outputs: /root/workspace/x_alpha_Hedgeye_latest.json
 *          /root/workspace/x_alpha_KobeissiLetter_latest.json
 *          /root/workspace/x_alpha_merged.md
 */
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

import { ensureJsonTreeString, isRecord } from '@/utils/Lang'

type JsonObject = Record<string, unknown>

const ACCOUNTS = ['Hedgeye', 'KobeissiLetter'] as const

const OUT_DIR = resolve('/root/workspace')

// A page written inside this window is treated as already fetched this run.
const REFETCH_WINDOW_MS = 10 * 60 * 1000

type Tweet = {
  id?: string
  text?: string
  created_at?: string
  author_id?: string
  public_metrics?: {
    like_count?: number
    retweet_count?: number
    reply_count?: number
  }
}

function toRecord(value: unknown): JsonObject | null {
  return isRecord(value) ? value : null
}

function isTweet(value: unknown): value is Tweet {
  const record = toRecord(value)
  if (record === null) return false
  return typeof record['id'] === 'string' && typeof record['text'] === 'string'
}

function isTweetArray(value: unknown): value is Tweet[] {
  return Array.isArray(value) && value.every(isTweet)
}

function toId(payload: unknown): string | null {
  const record = toRecord(payload)
  if (record === null) return null
  const data = toRecord(record['data'])
  if (data === null) return null
  const id = data['id']
  return typeof id === 'string' ? id : null
}

async function xGet(path: string, params: Record<string, string>): Promise<JsonObject> {
  const proxy = process.env.ZIPBOX_EGRESS_PROXY_URL
  const init: RequestInit = {
    headers: {
      Authorization: 'Bearer ZIPBOX_XCOM_KEY', // literal placeholder; proxy swaps it
      Accept: 'application/json'
    }
  }
  if (proxy !== undefined && proxy.length > 0) {
    // bun's fetch honors HTTPS_PROXY/HTTP_PROXY env for explicit-proxy boxes.
    process.env.HTTPS_PROXY = proxy
    process.env.HTTP_PROXY = proxy
  }
  const base = new URL('https://api.x.com/')
  const url = new URL(path, base)
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value)
  }

  let res: Response
  try {
    res = await fetch(url.toString(), init)
  } catch (err) {
    const first = err instanceof Error ? err.message : String(err)
    res = await fetch(url.toString(), init).catch((again: unknown) => {
      const second = again instanceof Error ? again.message : String(again)
      throw new Error(`xGet ${path} transport-error after retry: ${second} (first: ${first})`)
    })
  }

  if (res.status === 429) {
    await new Promise((done) => setTimeout(done, 5000))
    const retried = await fetch(url.toString(), init)
    if (retried.ok) return toRecord(await retried.json()) ?? {}
    res = retried
  }
  if (res.status === 402 || res.status === 501) {
    throw new Error(`xGet ${path} hard-fail status=${res.status}`)
  }
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`xGet ${path} status=${res.status} body=${body}`)
  }
  return toRecord(await res.json()) ?? {}
}

function hookFor(text: string): string {
  const lower = text.toLowerCase()
  const ticker = /\$([A-Za-z]{1,5})\b/.exec(text)
  const macroWords =
    'fed|cpi|inflation|yield|gdp|unemployment|vix|brent|crude|gold|silver|oil|btc|bitcoin|ether|eth|s&p|sp500|nasdaq|dow'
  const macro = new RegExp(`\\b(${macroWords})\\b`, 'i').test(lower)
  const direction =
    /\b(up|down|rally|selloff|sell-off|surge|plunge|record|crash|jump|dump|slump)\b/.test(lower)
  const bits: string[] = []
  if (ticker !== null) bits.push(`$${ticker[1]}`)
  if (macro) bits.push('macro')
  if (direction) bits.push('direction')
  return bits.join(' ') || '—'
}

function engagement(tweet: Tweet): string {
  const metrics = tweet.public_metrics
  if (metrics === undefined) return ''
  const parts: string[] = []
  if (typeof metrics.like_count === 'number') parts.push(`L${metrics.like_count}`)
  if (typeof metrics.retweet_count === 'number') parts.push(`RT${metrics.retweet_count}`)
  if (typeof metrics.reply_count === 'number') parts.push(`R${metrics.reply_count}`)
  return parts.join(' ')
}

async function resolveUserId(username: string): Promise<string> {
  const payload = await xGet(`2/users/by/username/${username}`, {})
  const id = toId(payload)
  if (id === null) throw new Error(`resolve ${username} returned no id`)
  return id
}

async function fetchTweets(userId: string): Promise<Tweet[]> {
  const payload = await xGet(`2/users/${userId}/tweets`, {
    max_results: '10',
    exclude: 'retweets,replies',
    'tweet.fields': 'created_at,public_metrics,author_id',
    expansions: 'author_id'
  })
  const data = payload['data']
  return isTweetArray(data) ? data : []
}

const idCache = new Map<string, string>()

async function userIdFor(username: string): Promise<string> {
  const cached = idCache.get(username)
  if (cached !== undefined) return cached
  const id = await resolveUserId(username)
  idCache.set(username, id)
  return id
}

function mergedLines(tweets: Tweet[], account: string): string[] {
  const lines: string[] = [`## @${account}`, '']
  for (const tweet of tweets) {
    const eng = engagement(tweet)
    const id = tweet.id ?? ''
    const created = tweet.created_at ?? ''
    lines.push(`- ${id} (${created})${eng !== '' ? ` ${eng}` : ''}`)
    lines.push(`  ${(tweet.text ?? '').replace(/\n/g, ' ')}`)
    lines.push(`  hook: ${hookFor(tweet.text ?? '')}`)
    lines.push('')
  }
  return lines
}

function writeJson(path: string, obj: JsonObject): void {
  const output = ensureJsonTreeString(obj)
  if (output === null) throw new Error(`not JSON-serializable: ${path}`)
  writeFileSync(path, `${output}\n`)
}

async function main(): Promise<void> {
  const now = Date.now()
  const merged: string[] = [
    '# X-feed alpha — latest posts',
    `fetched ${new Date(now).toISOString()}`,
    ''
  ]
  for (const account of ACCOUNTS) {
    const rawPath = join(OUT_DIR, `x_alpha_${account}_latest.json`)
    try {
      if (existsSync(rawPath)) {
        const age = now - statSync(rawPath).mtimeMs
        if (age >= 0 && age < REFETCH_WINDOW_MS) {
          const cached = toRecord(JSON.parse(readFileSync(rawPath, 'utf8')))
          if (cached !== null) {
            const cachedTweets = cached['tweets']
            if (isTweetArray(cachedTweets)) merged.push(...mergedLines(cachedTweets, account))
          }
          continue
        }
      }
      const id = await userIdFor(account)
      const tweets = await fetchTweets(id)
      writeJson(rawPath, { account, id, tweets, fetchedAt: new Date(now).toISOString() })
      if (tweets.length === 0) merged.push(`## @${account} — empty`, '')
      else merged.push(...mergedLines(tweets, account))
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err)
      writeJson(`${rawPath}.empty.json`, {
        account,
        empty: true,
        reason,
        at: new Date(now).toISOString()
      })
      merged.push(`## @${account} — EMPTY`, `reason: ${reason}`, '')
    }
  }
  writeFileSync(join(OUT_DIR, 'x_alpha_merged.md'), merged.join('\n') + '\n')
  console.error(`x-feed alpha: wrote ${ACCOUNTS.length} account files + merged`)
}

void main().catch((err: unknown) => {
  console.error(`x-feed-alpha fatal: ${err instanceof Error ? err.message : String(err)}`)
  process.exit(1)
})
