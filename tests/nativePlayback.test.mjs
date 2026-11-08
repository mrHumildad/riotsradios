import test from 'node:test'
import assert from 'node:assert/strict'
import {
  createNativePlaybackController,
  NATIVE_STATES,
  STATE_EVENT,
  TRACK_EVENT,
} from '../lib/nativePlayback.js'

const STATION = { id: 12, name: 'Radio Topo', state: 'Zaragoza', country: 'Spain', favicon: 'https://x/y.png' }
const URL = 'https://stream.example/s.mp3'

function fakeBridge() {
  const listeners = new Map()
  const calls = { playStation: [], stop: 0, setVolume: [], removed: 0, requestNotifications: 0 }
  return {
    listeners,
    calls,
    /* Nothing is playing by default: no title, no station. */
    getTrack: () => Promise.resolve({ title: '', id: '' }),
    playStation(payload) {
      calls.playStation.push(payload)
      return Promise.resolve({ ok: true })
    },
    stop() {
      calls.stop += 1
      return Promise.resolve()
    },
    setVolume(payload) {
      calls.setVolume.push(payload)
      return Promise.resolve()
    },
    requestNotifications() {
      calls.requestNotifications += 1
      return Promise.resolve({ granted: true })
    },
    addListener(event, callback) {
      listeners.set(event, callback)
      return Promise.resolve({
        remove: () => {
          calls.removed += 1
          listeners.delete(event)
        },
      })
    },
    emit(event, payload) {
      listeners.get(event)?.(payload)
    },
  }
}

function setup() {
  const bridge = fakeBridge()
  const states = []
  const errors = []
  const tracks = []
  const controller = createNativePlaybackController({
    bridge,
    onState: (state) => states.push(state),
    onStreamError: (reason) => errors.push(reason),
    onTrack: (title, id) => tracks.push({ title, id }),
  })
  return { bridge, controller, states, errors, tracks }
}

test('subscribes to the session state event', async () => {
  const { bridge, controller } = setup()
  await Promise.resolve()

  assert.ok(bridge.listeners.has(STATE_EVENT))
  assert.equal(controller.getState(), 'idle')
})

test('play() sends the resolved station to the native player', () => {
  const { bridge, controller, states, errors } = setup()

  controller.play(URL, { station: STATION })

  assert.deepEqual(bridge.calls.playStation, [
    {
      id: '12',
      url: URL,
      name: 'Radio Topo',
      location: 'Zaragoza, Spain',
      artworkUrl: 'https://x/y.png',
    },
  ])
  assert.equal(controller.getState(), 'loading')
  assert.deepEqual(states, ['loading'])
  assert.deepEqual(errors, [null])
})

test('session state events drive the same state names as the web controller', () => {
  const { bridge, controller, states } = setup()

  bridge.emit(STATE_EVENT, { state: 'playing' })
  assert.equal(controller.getState(), 'playing')

  bridge.emit(STATE_EVENT, { state: 'stalled' })
  assert.equal(controller.getState(), 'stalled')

  bridge.emit(STATE_EVENT, { state: 'idle' })
  assert.equal(controller.getState(), 'idle')

  assert.ok(states.every((state) => NATIVE_STATES.includes(state)))
  assert.deepEqual(states, ['playing', 'stalled', 'idle'])
})

test('a native error keeps its reason and a later playing clears it', () => {
  const { bridge, controller, errors } = setup()

  bridge.emit(STATE_EVENT, { state: 'error', error: 'format' })
  assert.equal(controller.getState(), 'error')
  assert.equal(errors.at(-1), 'format')

  bridge.emit(STATE_EVENT, { state: 'playing' })
  assert.equal(errors.at(-1), null)
})

test('unknown error reasons fall back to "playback"', () => {
  const { bridge, errors } = setup()

  bridge.emit(STATE_EVENT, { state: 'error', error: 'weird' })
  assert.equal(errors.at(-1), 'playback')

  bridge.emit(STATE_EVENT, { state: 'error' })
  assert.equal(errors.at(-1), 'playback')
})

test('an unknown state is reported as an error, not silently kept', () => {
  const { bridge, controller } = setup()

  bridge.emit(STATE_EVENT, { state: 'buffering-forever' })
  assert.equal(controller.getState(), 'error')
})

test('stop() releases playback and returns to idle', () => {
  const { bridge, controller } = setup()

  controller.play(URL, { station: STATION })
  controller.stop()

  assert.equal(bridge.calls.stop, 1)
  assert.equal(controller.getState(), 'idle')
})

test('asks for the notification permission once, before the first playback', () => {
  const { bridge, controller } = setup()

  controller.play(URL, { station: STATION })
  controller.play(URL, { station: STATION })

  assert.equal(bridge.calls.requestNotifications, 1)
})

test('setVolume forwards to the native player', () => {
  const { bridge, controller } = setup()

  controller.setVolume(0.35)
  assert.deepEqual(bridge.calls.setVolume, [{ volume: 0.35 }])
})

test('play() without a bridge or a station fails as a playback error', () => {
  const silent = createNativePlaybackController({ bridge: null })
  const errors = []
  const controller = createNativePlaybackController({
    bridge: fakeBridge(),
    onStreamError: (reason) => errors.push(reason),
  })

  silent.play(URL, { station: STATION })
  assert.equal(silent.getState(), 'error')

  controller.play(URL)
  assert.equal(controller.getState(), 'error')
  assert.equal(errors.at(-1), 'playback')
})

test('a rejected playStation call becomes a playback error', async () => {
  const bridge = fakeBridge()
  bridge.playStation = () => Promise.reject(new Error('bridge down'))
  const controller = createNativePlaybackController({ bridge })

  controller.play(URL, { station: STATION })
  await Promise.resolve()
  await Promise.resolve()

  assert.equal(controller.getState(), 'error')
})

test('an ICY title from the player is reported with its station', () => {
  const { bridge, controller, tracks } = setup()

  controller.play(URL, { station: STATION })
  bridge.emit(TRACK_EVENT, { title: 'Mika y su Kilombo', id: '12' })

  assert.deepEqual(tracks, [{ title: 'Mika y su Kilombo', id: '12' }])
})

test('a title is attributed to the playing station when the bridge omits the id', () => {
  const { bridge, controller, tracks } = setup()

  controller.play(URL, { station: STATION })
  bridge.emit(TRACK_EVENT, { title: 'Radio Topo' })

  assert.deepEqual(tracks, [{ title: 'Radio Topo', id: '12' }])
})

test('a title that belongs to another station is ignored', () => {
  const { bridge, controller, tracks } = setup()

  controller.play(URL, { station: STATION })
  bridge.emit(TRACK_EVENT, { title: 'Wrong station', id: '71' })

  assert.deepEqual(tracks, [])
})

test('a blank title clears the track instead of showing an empty line', () => {
  const { bridge, controller, tracks } = setup()

  controller.play(URL, { station: STATION })
  bridge.emit(TRACK_EVENT, { title: '   ', id: '12' })

  assert.deepEqual(tracks, [{ title: null, id: '12' }])
})

test('switching stations drops the title of the station we left', () => {
  const { bridge, controller, tracks } = setup()

  controller.play(URL, { station: STATION })
  bridge.emit(TRACK_EVENT, { title: 'Song A', id: '12' })
  controller.play(URL, { station: { ...STATION, id: 71, name: 'Zoy Milton' } })

  assert.deepEqual(tracks, [
    { title: 'Song A', id: '12' },
    { title: null, id: '12' },
  ])
  assert.equal(controller.getState(), 'loading')
})

test('stop() clears the title and stops owning the station', () => {
  const { bridge, controller, tracks } = setup()

  controller.play(URL, { station: STATION })
  controller.stop()
  bridge.emit(TRACK_EVENT, { title: 'Late block', id: '12' })

  assert.deepEqual(tracks, [{ title: null, id: '12' }])
})

test('a title already playing is adopted when the page attaches late', async () => {
  const bridge = fakeBridge()
  bridge.getTrack = () => Promise.resolve({ title: 'Nirvana - Jesus Don', id: '121' })
  const tracks = []
  createNativePlaybackController({ bridge, onTrack: (title, id) => tracks.push({ title, id }) })

  await Promise.resolve()
  await Promise.resolve()

  assert.deepEqual(tracks, [{ title: 'Nirvana - Jesus Don', id: '121' }])
})

test('destroy() detaches the listener and stops the session', async () => {
  const { bridge, controller } = setup()
  await Promise.resolve()

  controller.destroy()

  /* state + track */
  assert.equal(bridge.calls.removed, 2)
  assert.equal(bridge.calls.stop, 1)
  assert.equal(bridge.listeners.size, 0)

  bridge.emit(STATE_EVENT, { state: 'playing' })
  assert.equal(controller.getState(), 'idle')
})
