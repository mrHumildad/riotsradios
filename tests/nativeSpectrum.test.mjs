import test from 'node:test'
import assert from 'node:assert/strict'
import { BAND_COUNT } from '../lib/audioBands.js'
import {
  createNativeSpectrum,
  nativePlaybackAvailable,
  PLUGIN_NAME,
  SPECTRUM_EVENT,
} from '../lib/nativeSpectrum.js'

function fakePlugin({ available = false } = {}) {
  const listeners = new Map()
  const calls = { addListener: 0, removed: 0 }
  return {
    listeners,
    calls,
    available,
    isNativePlaybackAvailable: async () => ({ available }),
    addListener(event, callback) {
      calls.addListener += 1
      listeners.set(event, callback)
      return Promise.resolve({
        remove: () => {
          calls.removed += 1
          listeners.delete(event)
        },
      })
    },
    emit(levels, event = SPECTRUM_EVENT) {
      listeners.get(event)?.({ levels })
    },
  }
}

const full = () => Array.from({ length: BAND_COUNT }, (_, i) => (i % 10) / 10)

test('no bridge: nothing to read, nothing to connect', () => {
  const analyzer = createNativeSpectrum({ plugin: null })
  assert.equal(analyzer.ensure(), false)
  assert.equal(analyzer.read(), null)
  assert.equal(analyzer.isConnected(), false)
  analyzer.close()
})

test('subscribes to the spectrum event on the playback plugin', async () => {
  const plugin = fakePlugin()
  const analyzer = createNativeSpectrum({ plugin })
  await Promise.resolve()

  assert.equal(analyzer.ensure(), true)
  assert.equal(plugin.calls.addListener, 1)
  assert.ok(plugin.listeners.has(SPECTRUM_EVENT))
  assert.ok(PLUGIN_NAME.length > 0)
  assert.equal(analyzer.isConnected(), true)
  assert.equal(analyzer.read(), null)
})

test('levels arrive as 24 clamped numbers', () => {
  const plugin = fakePlugin()
  const analyzer = createNativeSpectrum({ plugin })

  analyzer.read()
  plugin.emit([2.5, -1, Number.NaN, ...full()])

  const levels = analyzer.read()
  assert.ok(levels instanceof Float32Array)
  assert.equal(levels.length, BAND_COUNT)
  assert.equal(levels[0], 1)
  assert.equal(levels[1], 0)
  assert.equal(levels[2], 0)
  for (const level of levels) {
    assert.ok(level >= 0 && level <= 1)
  }
})

test('a silent tap falls back to SIM after the stale window', () => {
  let clock = 1000
  const plugin = fakePlugin()
  const analyzer = createNativeSpectrum({ plugin, now: () => clock, staleAfterMs: 1500 })

  plugin.emit(full())
  assert.notEqual(analyzer.read(), null)

  clock += 1500
  assert.notEqual(analyzer.read(), null, 'still fresh at exactly the window')

  clock += 1
  assert.equal(analyzer.read(), null, 'stale data must not freeze the canvas')

  plugin.emit(full())
  assert.notEqual(analyzer.read(), null, 'a new frame revives it')
})

test('malformed bridge payloads are ignored instead of drawn', () => {
  const plugin = fakePlugin()
  const analyzer = createNativeSpectrum({ plugin })

  plugin.emit(undefined)
  plugin.emit(null)
  plugin.emit([])
  plugin.emit('nope')
  assert.equal(analyzer.read(), null)
})

test('close() detaches the listener and drops the data', async () => {
  const plugin = fakePlugin()
  const analyzer = createNativeSpectrum({ plugin })
  await Promise.resolve()

  plugin.emit(full())
  analyzer.close()

  assert.equal(analyzer.read(), null)
  assert.equal(analyzer.isConnected(), false)
  assert.equal(plugin.calls.removed, 1)
  assert.equal(plugin.listeners.size, 0)

  plugin.emit(full())
  assert.equal(analyzer.read(), null)
})

test('close() before the subscription resolves does not leak a listener', async () => {
  const plugin = fakePlugin()
  const analyzer = createNativeSpectrum({ plugin })
  analyzer.close()
  await Promise.resolve()
  await Promise.resolve()

  assert.equal(plugin.calls.removed, 1)
  assert.equal(plugin.listeners.size, 0)
})

test('setVolume is a no-op: the native player owns its gain', () => {
  const analyzer = createNativeSpectrum({ plugin: fakePlugin() })
  assert.doesNotThrow(() => analyzer.setVolume(0.3))
})

test('nativePlaybackAvailable() only trusts an explicit true', async () => {
  assert.equal(await nativePlaybackAvailable(null), false)
  assert.equal(await nativePlaybackAvailable({}), false)
  assert.equal(await nativePlaybackAvailable(fakePlugin({ available: false })), false)
  assert.equal(await nativePlaybackAvailable(fakePlugin({ available: true })), true)
  assert.equal(
    await nativePlaybackAvailable({
      isNativePlaybackAvailable: async () => {
        throw new Error('bridge down')
      },
    }),
    false
  )
})
