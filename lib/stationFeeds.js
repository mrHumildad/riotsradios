/**
 * Station blog feeds.
 *
 * The EPG repository publishes one small JSON Feed per station plus a manifest.
 * `loadLatestPosts` merges every station for the timeline; `loadStationPosts`
 * returns one station's own posts for the news view in the station modal.
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

function normalizePost(item, stationId, stationName) {
  if (!item || typeof item.url !== 'string' || !item.url) return null
  return {
    id: item.id,
    title: item.title || item.url,
    url: item.url,
    summary: item.summary || item.content_text || '',
    date_published: item.date_published || null,
    station_id: stationId,
    station_name: stationName,
  }
}

function newestFirst(a, b) {
  const left = a.date_published ? Date.parse(a.date_published) : Number.NEGATIVE_INFINITY
  const right = b.date_published ? Date.parse(b.date_published) : Number.NEGATIVE_INFINITY
  return right - left
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
      const stationName = entry.name || feed._station_name || ''
      return (Array.isArray(feed.items) ? feed.items : [])
        .map((item) => normalizePost(item, stationId, stationName))
        .filter(Boolean)
    } catch {
      return []
    }
  })

  const seen = new Set()
  const posts = []
  for (const item of feeds.flat()) {
    if (seen.has(item.url)) continue
    seen.add(item.url)
    posts.push(item)
  }

  posts.sort(newestFirst)
  return posts.slice(0, limit)
}

/**
 * Load one station's published feed, newest first.
 *
 * A station the manifest does not list has no feed at all and returns `[]`;
 * a manifest or feed that fails to load rejects, so the UI can tell "nothing
 * published" from "could not load".
 *
 * @param {number} stationId
 * @param {object} options
 * @param {string} [options.baseUrl]
 * @param {number} [options.limit]
 * @param {typeof fetch} [options.fetchImpl]
 * @returns {Promise<Array<object>>}
 */
export async function loadStationPosts(stationId, {
  baseUrl = FEED_BASE_URL,
  limit = 20,
  fetchImpl = globalThis.fetch,
} = {}) {
  const id = Number(stationId)
  if (!Number.isInteger(id) || id <= 0) return []
  if (typeof fetchImpl !== 'function') return []

  const response = await fetchImpl(`${joinBase(baseUrl)}/feeds/manifest.json`, {
    cache: 'no-cache',
  })
  if (!response.ok) throw new Error(`feed manifest: HTTP ${response.status}`)

  const entry = manifestEntries(await response.json()).get(id)
  if (!entry) return []

  const feedResponse = await fetchImpl(feedUrl(baseUrl, entry.file), { cache: 'no-cache' })
  if (!feedResponse.ok) throw new Error(`station feed: HTTP ${feedResponse.status}`)

  const feed = await feedResponse.json()
  const stationName = entry.name || feed._station_name || ''
  const seen = new Set()
  const posts = []
  for (const item of Array.isArray(feed.items) ? feed.items : []) {
    const post = normalizePost(item, id, stationName)
    if (!post || seen.has(post.url)) continue
    seen.add(post.url)
    posts.push(post)
  }

  posts.sort(newestFirst)
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
