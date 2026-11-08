import test from 'node:test'
import assert from 'node:assert/strict'
import {
  guideUrl,
  loadEpgData,
  localGuideUrl,
  manifestEntries,
} from '../lib/epgFeed.js'

const jsonResponse = (body) => ({
  ok: true,
  json: async () => body,
})

test('guide URLs join without doubling slashes', () => {
  assert.equal(
    guideUrl('https://epg.example/', 'radio-topo.json'),
    'https://epg.example/EPGs/radio-topo.json'
  )
  assert.equal(localGuideUrl('/riotsradios/', 'topo.json'), '/riotsradios/EPGs/topo.json')
  assert.equal(localGuideUrl('./', 'topo.json'), './EPGs/topo.json')
  assert.equal(guideUrl('https://epg.example', ''), null)
})

test('manifestEntries ignores partial, failed and malformed entries', () => {
  const entries = manifestEntries({
    stations: {
      1: { file: 'one.json', status: 'ok' },
      2: { file: 'two.json', status: 'legacy' },
      3: { file: 'three.json', status: 'partial' },
      4: { file: 'four.json', status: 'failed' },
      5: { file: '', status: 'ok' },
      bad: { file: 'bad.json', status: 'ok' },
    },
  })
  assert.deepEqual([...entries.keys()], [1, 2])
})

test('loadEpgData prefers the remote guide and falls back per station', async () => {
  const calls = []
  const fetchImpl = async (url) => {
    calls.push(url)
    if (url.endsWith('/EPGs/manifest.json')) {
      return jsonResponse({
        stations: {
          1: { file: 'remote-one.json', status: 'ok' },
          3: { file: 'remote-three.json', status: 'ok' },
        },
      })
    }
    if (url.endsWith('/EPGs/remote-one.json')) return jsonResponse({ station_id: 1, remote: true })
    if (url.endsWith('/EPGs/remote-three.json')) return { ok: false, json: async () => null }
    if (url.endsWith('/EPGs/local-three.json')) return jsonResponse({ station_id: 3, local: true })
    return { ok: false, json: async () => null }
  }

  const data = await loadEpgData({
    stations: [
      { id: 1, epg_file: 'local-one.json' },
      { id: 3, epg_file: 'local-three.json' },
    ],
    baseUrl: 'https://epg.example/',
    localBase: '/riotsradios/',
    fetchImpl,
  })

  assert.equal(data.get(1).remote, true)
  assert.equal(data.get(3).local, true)
  assert.ok(calls.includes('https://epg.example/EPGs/remote-one.json'))
  assert.ok(calls.includes('/riotsradios/EPGs/local-three.json'))
  assert.ok(!calls.includes('/riotsradios/EPGs/local-one.json'))
})

test('loadEpgData uses every bundled guide when the manifest is unavailable', async () => {
  const calls = []
  const fetchImpl = async (url) => {
    calls.push(url)
    if (url.endsWith('/EPGs/manifest.json')) throw new Error('CORS')
    if (url.endsWith('/EPGs/local.json')) return jsonResponse({ station_id: 9, local: true })
    return { ok: false, json: async () => null }
  }

  const data = await loadEpgData({
    stations: [{ id: 9, epg_file: 'local.json' }],
    baseUrl: 'https://epg.example',
    localBase: '/riotsradios/',
    fetchImpl,
  })

  assert.equal(data.get(9).local, true)
  assert.deepEqual(calls, [
    'https://epg.example/EPGs/manifest.json',
    '/riotsradios/EPGs/local.json',
  ])
})
