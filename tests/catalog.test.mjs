import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildCatalog,
  assessCatalogCsv,
  catalogHeaders,
  catalogSummary,
} from '../lib/catalog.js'
import {
  catalogUrl,
  fetchCatalog,
  parseCatalogManifest,
} from '../lib/catalogFeed.js'
import {
  CATALOG_CACHE_KEY,
  CATALOG_CACHE_MAX_BYTES,
  clearCatalogCache,
  readCatalogCache,
  writeCatalogCache,
} from '../lib/catalogCache.js'

const CSV = [
  'id,name,stream_broken,url,epg_file',
  '1,One,,https://one.example/stream,one.json',
  '2,Two,,https://two.example/stream,',
  '3,Three,true,,',
].join('\n')

const csvWith = (rows) =>
  ['id,name,stream_broken,url', ...rows.map(([id, url]) => `${id},S${id},,${url}`)].join('\n')

const fakeStorage = () => {
  const map = new Map()
  return {
    map,
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, value),
    removeItem: (key) => map.delete(key),
  }
}

const jsonResponse = (body) => ({ ok: true, json: async () => body })
const textResponse = (body) => ({ ok: true, text: async () => body })

/* ── catalog.js ─────────────────────────────────────────────────── */

test('catalogHeaders reads the first line and trims cells', () => {
  assert.deepEqual(catalogHeaders(CSV), ['id', 'name', 'stream_broken', 'url', 'epg_file'])
  assert.deepEqual(catalogHeaders(''), [])
})

test('buildCatalog drops rows the player cannot render and attaches health', () => {
  const stations = buildCatalog(CSV, {
    health: { 1: { status: 'ok', cors: 'any' } },
  })
  assert.deepEqual(stations.map((station) => station.id), [1, 2])
  assert.equal(stations[0].health.status, 'ok')
  assert.equal(stations[1].health, null)
})

test('buildCatalog keeps every row when the filter is off (dev)', () => {
  const stations = buildCatalog(CSV, { hideUnplayable: false })
  assert.deepEqual(stations.map((station) => station.id), [1, 2, 3])
})

test('catalogSummary counts unique ids only', () => {
  const summary = catalogSummary([
    { id: 1, url: 'https://a.example/x' },
    { id: 1, url: 'https://b.example/x' },
  ])
  assert.equal(summary.rows, 2)
  assert.equal(summary.uniqueIds, 1)
})

test('assessCatalogCsv accepts a well-formed file', () => {
  const verdict = assessCatalogCsv(CSV)
  assert.equal(verdict.ok, true)
  assert.equal(verdict.summary.playable, 2)
})

test('assessCatalogCsv refuses empty files and missing columns', () => {
  assert.equal(assessCatalogCsv('').ok, false)
  assert.equal(assessCatalogCsv('id,name\n1,One').ok, false)
})

test('assessCatalogCsv refuses duplicate ids', () => {
  const verdict = assessCatalogCsv(csvWith([[1, 'https://one.example/s'], [1, 'https://two.example/s']]))
  assert.equal(verdict.ok, false)
  assert.match(verdict.errors.join(' '), /duplicate/)
})

test('assessCatalogCsv refuses a catalog that mostly disappeared', () => {
  const current = buildCatalog(csvWith([
    [1, 'https://1.example/s'], [2, 'https://2.example/s'], [3, 'https://3.example/s'],
    [4, 'https://4.example/s'], [5, 'https://5.example/s'],
  ]))
  const truncated = csvWith([[1, 'https://1.example/s']])

  const verdict = assessCatalogCsv(truncated, { current })
  assert.equal(verdict.ok, false)
  assert.match(verdict.errors.join(' '), /down from 5/)
})

test('assessCatalogCsv allows a catalog that grows or shrinks a little', () => {
  const current = buildCatalog(csvWith([
    [1, 'https://1.example/s'], [2, 'https://2.example/s'], [3, 'https://3.example/s'],
    [4, 'https://4.example/s'], [5, 'https://5.example/s'],
  ]))
  const next = csvWith([[1, 'https://1.example/s'], [2, 'https://2.example/s'], [3, 'https://3.example/s']])
  assert.equal(assessCatalogCsv(next, { current }).ok, true)
})

/* ── catalogFeed.js ─────────────────────────────────────────────── */

test('catalogUrl adds the content hash as a cache key', () => {
  assert.equal(
    catalogUrl('https://epg.example/', 'stations.csv', 'abc123'),
    'https://epg.example/catalog/stations.csv?v=abc123'
  )
  assert.equal(catalogUrl('https://epg.example', 'stations.csv'), 'https://epg.example/catalog/stations.csv')
  assert.equal(catalogUrl('https://epg.example', ''), null)
})

test('parseCatalogManifest needs a version and a file', () => {
  assert.deepEqual(parseCatalogManifest({ version: 'v1', file: 'stations.csv', rows: 3, health: 'health.json' }), {
    version: 'v1',
    file: 'stations.csv',
    rows: 3,
    health: 'health.json',
  })
  assert.equal(parseCatalogManifest({ file: 'stations.csv' }), null)
  assert.equal(parseCatalogManifest({ version: 'v1' }), null)
  assert.equal(parseCatalogManifest(null), null)
})

test('fetchCatalog stops after the manifest when the version is current', async () => {
  const calls = []
  const fetchImpl = async (url) => {
    calls.push(url)
    return jsonResponse({ version: 'same', file: 'stations.csv' })
  }

  const result = await fetchCatalog({ baseUrl: 'https://epg.example', ifVersion: 'same', fetchImpl })
  assert.deepEqual(result, { version: 'same', changed: false })
  assert.deepEqual(calls, ['https://epg.example/catalog/manifest.json'])
})

test('fetchCatalog downloads the CSV by version and carries the health snapshot', async () => {
  const calls = []
  const fetchImpl = async (url) => {
    calls.push(url)
    if (url.endsWith('/catalog/manifest.json')) {
      return jsonResponse({ version: 'abc', file: 'stations.csv', health: 'health.json' })
    }
    if (url.includes('stations.csv')) return textResponse(CSV)
    if (url.includes('health.json')) return jsonResponse({ 1: { status: 'ok' } })
    return { ok: false }
  }

  const result = await fetchCatalog({ baseUrl: 'https://epg.example', fetchImpl })
  assert.equal(result.changed, true)
  assert.equal(result.version, 'abc')
  assert.equal(result.csv, CSV)
  assert.equal(result.health[1].status, 'ok')
  assert.ok(calls.includes('https://epg.example/catalog/stations.csv?v=abc'))
})

test('fetchCatalog returns null when the feed is missing or offline', async () => {
  assert.equal(await fetchCatalog({ fetchImpl: async () => ({ ok: false }) }), null)
  assert.equal(await fetchCatalog({ fetchImpl: async () => { throw new Error('CORS') } }), null)
  assert.equal(await fetchCatalog({ fetchImpl: null }), null)
  assert.equal(
    await fetchCatalog({
      fetchImpl: async (url) => (url.endsWith('manifest.json')
        ? jsonResponse({ version: 'abc', file: 'stations.csv' })
        : { ok: false }),
    }),
    null
  )
})

/* ── catalogCache.js ────────────────────────────────────────────── */

test('the catalog cache round-trips a version, its CSV and its health snapshot', () => {
  const storage = fakeStorage()
  const health = { 1: { status: 'ok' } }
  assert.equal(writeCatalogCache('abc', CSV, health, storage), true)
  assert.deepEqual(readCatalogCache(storage), { version: 'abc', csv: CSV, health })
  assert.ok(storage.map.has(CATALOG_CACHE_KEY))
  clearCatalogCache(storage)
  assert.equal(readCatalogCache(storage), null)
})

test('a cached catalog without health still reads back', () => {
  const storage = fakeStorage()
  writeCatalogCache('abc', CSV, null, storage)
  assert.deepEqual(readCatalogCache(storage), { version: 'abc', csv: CSV, health: null })
})

test('the catalog cache ignores corrupt or oversized entries', () => {
  const storage = fakeStorage()
  storage.setItem(CATALOG_CACHE_KEY, '{not json')
  assert.equal(readCatalogCache(storage), null)

  storage.setItem(CATALOG_CACHE_KEY, JSON.stringify({ version: '', csv: CSV }))
  assert.equal(readCatalogCache(storage), null)

  storage.setItem(CATALOG_CACHE_KEY, JSON.stringify({ version: 'abc', csv: '' }))
  assert.equal(readCatalogCache(storage), null)

  storage.setItem(CATALOG_CACHE_KEY, 'x'.repeat(CATALOG_CACHE_MAX_BYTES + 1))
  assert.equal(readCatalogCache(storage), null)
})

test('the catalog cache survives storage that refuses to work', () => {
  const hostile = {
    getItem: () => { throw new Error('private mode') },
    setItem: () => { throw new Error('quota') },
    removeItem: () => { throw new Error('nope') },
  }
  assert.equal(readCatalogCache(hostile), null)
  assert.equal(writeCatalogCache('abc', CSV, null, hostile), false)
  clearCatalogCache(hostile)
  assert.equal(writeCatalogCache('', CSV, null, fakeStorage()), false)
  assert.equal(writeCatalogCache('abc', '', null, fakeStorage()), false)
})
