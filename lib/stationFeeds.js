/**
 * Station blog feeds.
 *
 * The EPG repository publishes one small JSON Feed per station plus a manifest.
 * For now this module only merges the newest posts and logs them; the timeline
 * UI can build on loadLatestPosts() later.
 */

import { EPG_BASE_URL } from './epgFeed.js'

export const FEED_BASE_URL = EPG_BASE_URL
export const FEED_MANIFEST_URL = `${FEED_BASE_URL}/feeds/manifest.json`

function joinBase(baseUrl) {
  return String(baseUrl || FEED_BASE_URL).replace(/\/+$/, '')
}

export function feedUrl(baseUrl, file) {
  if (!file) return null
  return `${joinBase(baseUrl)}/feeds/${encodeURIComponent(file)}`
}

/** Only entries that have a published file are loaded. */
export function manifestEntries(manifest) {
  const entries = new Map()
  for (const [id, entry] of Object.entries(manifest?.stations || {})) {
    const stationId = Number(id)
    if (!Number.isInteger(stationId) || stationId <= 0) continue
    if (!entry || typeof entry.file !== 'string' || !entry.file) continue
    if (entry.status && entry.status !== 'ok') continue
    entries.set(stationId, entry)
  }
  return entries
}

async function mapLimit(items, limit, fn) {
  const results = new Array(items.length)
  let index = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (index < items.length) {
      const current = index++
      results[current] = await fn(items[current], current)
    }
  })
  await Promise.all(workers)
  return results
}

/**
 * Load every published station feed, merge the items by date and return the
 * newest `limit` posts.
 *
 * @param {object} options
 * @param {string} [options.baseUrl]
 * @param {number} [options.limit]
 * @param {typeof fetch} [options.fetchImpl]
 * @returns {Promise<Array<object>>}
 */
export async function loadLatestPosts({
  baseUrl = FEED_BASE_URL,
  limit = 10,
  fetchImpl = globalThis.fetch,
} = {}) {
  if (typeof fetchImpl !== 'function') return []

  const response = await fetchImpl(`${joinBase(baseUrl)}/feeds/manifest.json`, {
    cache: 'no-cache',
  })
  if (!response.ok) throw new Error(`feed manifest: HTTP ${response.status}`)

  const entries = [...manifestEntries(await response.json()).entries()].sort((a, b) => {
    const left = a[1].latest ? Date.parse(a[1].latest) : Number.NEGATIVE_INFINITY
    const right = b[1].latest ? Date.parse(b[1].latest) : Number.NEGATIVE_INFINITY
    return right - left
  })

  const feeds = await mapLimit(entries, 6, async ([stationId, entry]) => {
    try {
      const feedResponse = await fetchImpl(feedUrl(baseUrl, entry.file), { cache: 'no-cache' })
      if (!feedResponse.ok) return []
      const feed = await feedResponse.json()
      return (Array.isArray(feed.items) ? feed.items : []).map((item) => ({
        id: item.id,
        title: item.title,
        url: item.url,
        date_published: item.date_published || null,
        station_id: stationId,
        station_name: entry.name || feed._station_name || '',
      }))
    } catch {
      return []
    }
  })

  const seen = new Set()
  const posts = []
  for (const item of feeds.flat()) {
    if (!item.url || seen.has(item.url)) continue
    seen.add(item.url)
    posts.push(item)
  }

  posts.sort((a, b) => {
    const left = a.date_published ? Date.parse(a.date_published) : Number.NEGATIVE_INFINITY
    const right = b.date_published ? Date.parse(b.date_published) : Number.NEGATIVE_INFINITY
    return right - left
  })

  return posts.slice(0, limit)
}

/** Temporary console-only integration for testing the feed contract. */
export async function logLatestPosts(options = {}) {
  try {
    const posts = await loadLatestPosts(options)
    console.log(`[feeds] latest ${posts.length} posts`, posts)
    return posts
  } catch (error) {
    console.warn('[feeds] could not load station posts', error)
    return []
  }
}
