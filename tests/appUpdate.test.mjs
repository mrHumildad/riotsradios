import test from 'node:test'
import assert from 'node:assert/strict'
import {
  checkForUpdate,
  fetchLatestVersion,
  isNativeApp,
  isNewerVersion,
  parseVersion,
} from '../lib/appUpdate.js'

const jsonResponse = (body, ok = true) => ({ ok, json: async () => body })

test('parseVersion accepts dotted versions and ignores a v prefix or suffix', () => {
  assert.deepEqual(parseVersion('1.4.0'), [1, 4, 0])
  assert.deepEqual(parseVersion('v1.4.0'), [1, 4, 0])
  assert.deepEqual(parseVersion(' 1.10.2 '), [1, 10, 2])
  assert.deepEqual(parseVersion('1.5'), [1, 5, 0])
  assert.deepEqual(parseVersion('1.5.0-beta.2'), [1, 5, 0])
  assert.equal(parseVersion('1'), null)
  assert.equal(parseVersion('1.4.0.1'), null)
  assert.equal(parseVersion('1.x.0'), null)
  assert.equal(parseVersion(''), null)
  assert.equal(parseVersion(null), null)
  assert.equal(parseVersion(140), null)
})

test('isNewerVersion compares numerically and never nags on equal or older', () => {
  assert.equal(isNewerVersion('1.10.0', '1.9.0'), true)
  assert.equal(isNewerVersion('1.4.1', '1.4.0'), true)
  assert.equal(isNewerVersion('2.0.0', '1.99.99'), true)
  assert.equal(isNewerVersion('1.4.0', '1.4.0'), false)
  assert.equal(isNewerVersion('1.3.9', '1.4.0'), false)
  assert.equal(isNewerVersion('garbage', '1.4.0'), false)
  assert.equal(isNewerVersion('1.5.0', 'garbage'), false)
})

test('fetchLatestVersion revalidates the file and reads only a version string', async () => {
  let requested = null
  const fetchImpl = async (url, init) => {
    requested = { url, init }
    return jsonResponse({ version: '1.5.0' })
  }

  assert.equal(await fetchLatestVersion({ url: 'https://example.test/version.json', fetchImpl }), '1.5.0')
  assert.deepEqual(requested, {
    url: 'https://example.test/version.json',
    init: { cache: 'no-cache' },
  })

  assert.equal(await fetchLatestVersion({ fetchImpl: async () => jsonResponse({}) }), null)
  assert.equal(await fetchLatestVersion({ fetchImpl: async () => jsonResponse({ version: '  ' }) }), null)
  assert.equal(await fetchLatestVersion({ fetchImpl: async () => jsonResponse({}, false) }), null)
  assert.equal(
    await fetchLatestVersion({ fetchImpl: async () => { throw new Error('offline') } }),
    null
  )
  assert.equal(await fetchLatestVersion({ fetchImpl: undefined, url: 'https://example.test/version.json' }), null)
})

test('checkForUpdate returns the published version only when it is newer', async () => {
  const fetchImpl = async () => jsonResponse({ version: '1.5.0' })

  assert.equal(await checkForUpdate({ current: '1.4.0', fetchImpl }), '1.5.0')
  assert.equal(await checkForUpdate({ current: '1.5.0', fetchImpl }), null)
  assert.equal(await checkForUpdate({ current: '1.6.0', fetchImpl }), null)
})

test('isNativeApp is false on the web and true behind the Capacitor bridge', () => {
  assert.equal(isNativeApp(undefined), false)
  assert.equal(isNativeApp({}), false)
  assert.equal(isNativeApp({ Capacitor: { isNativePlatform: () => false } }), false)
  assert.equal(isNativeApp({ Capacitor: { isNativePlatform: () => true } }), true)
})
