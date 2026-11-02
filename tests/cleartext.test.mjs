import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

import {
  normalizeHost,
  parseAllowlist,
  isCleartextHostAllowed,
  renderNetworkSecurityConfig,
} from '../lib/cleartext.js'
import { isPlayableStation } from '../lib/stations.js'

test('normalizeHost: accepts URLs and bare hosts, drops port/path/case', () => {
  assert.equal(normalizeHost('http://radiomalva.ddns.net:8000/rmbc.ogg'), 'radiomalva.ddns.net')
  assert.equal(normalizeHost('HTTPS://Example.ORG/x'), 'example.org')
  assert.equal(normalizeHost('kehuelga.net:8000'), 'kehuelga.net')
  assert.equal(normalizeHost('http://192.99.46.171:10052/stream.mp3'), '192.99.46.171')
  assert.equal(normalizeHost(''), '')
  assert.equal(normalizeHost(undefined), '')
})

test('parseAllowlist: keeps host, ids and note; skips unusable rows', () => {
  const { entries, hostSet } = parseAllowlist({
    hosts: [
      { host: 'http://A.example:8000/x', station_ids: ['14', 'nope'], note: 'Radio A' },
      { host: '', station_ids: [1] },
      { station_ids: [2] },
    ],
  })

  assert.deepEqual(entries, [{ host: 'a.example', station_ids: [14], note: 'Radio A' }])
  assert.deepEqual([...hostSet], ['a.example'])
})

test('parseAllowlist: tolerates a missing/invalid document', () => {
  assert.deepEqual(parseAllowlist(null).entries, [])
  assert.deepEqual(parseAllowlist({}).hostSet.size, 0)
})

test('isCleartextHostAllowed: host must match exactly and the set must exist', () => {
  const { hostSet } = parseAllowlist({ hosts: [{ host: 'a.example', station_ids: [1] }] })
  assert.equal(isCleartextHostAllowed('http://A.example:8000/s.mp3', hostSet), true)
  assert.equal(isCleartextHostAllowed('http://sub.a.example/s.mp3', hostSet), false)
  assert.equal(isCleartextHostAllowed('http://a.example/s.mp3', undefined), false)
  assert.equal(isCleartextHostAllowed('http://a.example/s.mp3', new Set()), false)
})

test('isPlayableStation: http rows follow the allowlist, https never does', () => {
  const { hostSet } = parseAllowlist({ hosts: [{ host: 'a.example', station_ids: [1] }] })
  const httpRow = { id: 1, name: 'A', stream_broken: '', url: 'http://a.example/live.mp3' }
  const httpsRow = { id: 2, name: 'B', stream_broken: '', url: 'https://b.example/live.mp3' }

  assert.equal(isPlayableStation(httpRow), false)                                   // website
  assert.equal(isPlayableStation(httpRow, { cleartextHosts: hostSet }), true)        // app
  assert.equal(isPlayableStation(httpsRow), true)
  assert.equal(isPlayableStation({ ...httpRow, stream_broken: 'true' }, { cleartextHosts: hostSet }), false)
})

test('renderNetworkSecurityConfig: localhost always, hosts sorted, deterministic', () => {
  const entries = [
    { host: 'zzz.example', station_ids: [2], note: 'Z' },
    { host: 'aaa.example', station_ids: [1], note: '' },
  ]
  const xml = renderNetworkSecurityConfig(entries)

  assert.match(xml, /<domain includeSubdomains="true">localhost<\/domain>/)
  assert.ok(xml.indexOf('aaa.example') < xml.indexOf('zzz.example'))
  assert.match(xml, /cleartextTrafficPermitted="true"/)
  assert.equal(xml, renderNetworkSecurityConfig([...entries].reverse()))
})

test('renderNetworkSecurityConfig: a note cannot break out of its XML comment', () => {
  const xml = renderNetworkSecurityConfig([{ host: 'a.example', station_ids: [1], note: 'bad --> <evil/>' }])
  assert.equal(xml.includes('-->'), true)
  assert.equal(/bad --?>/.test(xml), true)
  assert.equal(xml.includes('<evil/>'), true)   // text only: it stays inside the comment
  assert.equal(xml.split('<!--').length, xml.split('-->').length, 'balanced comment markers')
})

test('shipped allowlist parses and every host is a station host', async () => {
  const { entries, hostSet } = parseAllowlist(
    JSON.parse(await readFile(new URL('../data/cleartext-hosts.json', import.meta.url), 'utf8'))
  )

  assert.ok(entries.length > 0)
  for (const entry of entries) {
    assert.ok(entry.station_ids.length > 0, `${entry.host} must name its station id(s)`)
    assert.equal(hostSet.has(entry.host), true)
  }
})
