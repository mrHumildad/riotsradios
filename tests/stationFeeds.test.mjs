import test from 'node:test'
import assert from 'node:assert/strict'
import {
  feedUrl,
  loadLatestPosts,
  manifestEntries,
} from '../lib/stationFeeds.js'

const jsonResponse = (body) => ({
  ok: true,
  json: async () => body,
})

test('feed URLs join without doubling slashes', () => {
  assert.equal(
    feedUrl('https://epg.example/', 'radio-contrabanda.json'),
    'https://epg.example/feeds/radio-contrabanda.json',
  )
  assert.equal(feedUrl('https://epg.example', ''), null)
})

test('manifestEntries ignores empty and non-ok entries', () => {
  const entries = manifestEntries({
    stations: {
      1: { file: 'one.json', status: 'ok', name: 'One' },
      2: { file: null, status: 'empty' },
      3: { file: 'three.json', status: 'error' },
      4: { file: '', status: 'ok' },
      bad: { file: 'bad.json', status: 'ok' },
    },
  })
  assert.deepEqual([...entries.keys()], [1])
})

test('loadLatestPosts merges stations, orders by date, dedupes and limits', async () => {
  const fetchImpl = async (url) => {
    if (url.endsWith('/feeds/manifest.json')) {
      return jsonResponse({
        stations: {
          1: { file: 'one.json', status: 'ok', name: 'One', latest: '2026-11-12T10:00:00Z' },
          2: { file: 'two.json', status: 'ok', name: 'Two', latest: '2026-11-11T10:00:00Z' },
          3: { file: null, status: 'no_feed', name: 'Three', latest: null },
        },
      })
    }
    if (url.endsWith('/feeds/one.json')) {
      return jsonResponse({
        _station_name: 'One',
        items: [
          { id: 'a', url: 'https://example.org/a', title: 'A', date_published: '2026-11-10T09:00:00Z' },
          { id: 'b', url: 'https://example.org/b', title: 'B', date_published: '2026-11-12T09:00:00Z' },
        ],
      })
    }
    if (url.endsWith('/feeds/two.json')) {
      return jsonResponse({
        items: [
          { id: 'a', url: 'https://example.org/a', title: 'A duplicate', date_published: '2026-11-10T09:00:00Z' },
          { id: 'c', url: 'https://example.org/c', title: 'C' },
        ],
      })
    }
    return { ok: false, status: 404, json: async () => null }
  }

  const posts = await loadLatestPosts({
    baseUrl: 'https://epg.example',
    limit: 3,
    fetchImpl,
  })

  assert.equal(posts.length, 3)
  assert.deepEqual(
    posts.map((post) => post.title),
    ['B', 'A', 'C'],
  )
  assert.equal(posts[0].station_name, 'One')
  assert.equal(posts[2].date_published, null)
})
