import test from 'node:test'
import assert from 'node:assert/strict'
import { createPlaybackController } from '../lib/playbackController.js'

/* Fast timings so the suite stays sub-second. */
const FAST = {
  /* Long start window by default so only the behaviour under test fires;
     the start-timeout test overrides it. */
  startTimeout: 200,
  stallAfter: 40,
  watchdogInterval: 10,
  retryDelays: [10, 10, 10],
  maxRetries: 2,
}

const URL = 'https://stream.example/s.mp3'
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

class FakeAudio {
  constructor() {
    this.listeners = {}
    this._src = ''
    this.crossOrigin = null
    this.srcHistory = []
    this.currentTime = 0
    this.readyState = 4
    this.error = null
    this.volume = 1
    this.playCalls = 0
    this.loads = 0
    this.rejectNextPlay = null
  }

  addEventListener(type, fn) {
    ;(this.listeners[type] ||= []).push(fn)
  }

  removeEventListener(type, fn) {
    this.listeners[type] = (this.listeners[type] || []).filter((f) => f !== fn)
  }

  dispatch(type) {
    for (const fn of this.listeners[type] || []) fn({ type })
  }

  play() {
    this.playCalls += 1
    if (this.rejectNextPlay) {
      const props = this.rejectNextPlay
      this.rejectNextPlay = null
      return Promise.reject(Object.assign(new Error('play rejected'), props))
    }
    return Promise.resolve()
  }

  pause() {
    this.dispatch('pause')
  }

  get src() {
    return this._src
  }

  set src(value) {
    this._src = value
    this.srcHistory.push({ src: value, crossOrigin: this.crossOrigin })
  }

  removeAttribute(name) {
    if (name === 'src') this.src = ''
    if (name === 'crossorigin') this.crossOrigin = null
  }

  load() {
    this.loads += 1
  }

  getAttribute(name) {
    return name === 'src' ? this.src || null : null
  }
}

function setup({ timings = FAST, isMixedContent = () => false } = {}) {
  const audio = new FakeAudio()
  const states = []
  const errors = []
  const controller = createPlaybackController({
    audio,
    timings,
    isMixedContent,
    onState: (s) => states.push(s),
    onStreamError: (e) => errors.push(e),
  })
  return { audio, controller, states, errors }
}

test('play() reaches playing only after the "playing" event', (t) => {
  const { audio, controller, states } = setup()
  t.after(() => controller.destroy())

  controller.play(URL)
  assert.equal(controller.getState(), 'loading')
  assert.equal(audio.src, URL)

  audio.dispatch('playing')
  assert.equal(controller.getState(), 'playing')
  assert.deepEqual(states, ['loading', 'playing'])
})

test('stop() removes the source, reloads and never reports an error', (t) => {
  const { audio, controller, errors } = setup()
  t.after(() => controller.destroy())

  controller.play(URL)
  audio.dispatch('playing')
  controller.stop()

  assert.equal(controller.getState(), 'idle')
  assert.equal(audio.getAttribute('src'), null)
  assert.ok(audio.loads >= 1)
  assert.ok(!errors.includes('playback'))
  assert.ok(!errors.includes('mixed-content'))
})

test('start timeout retries with backoff, then fails after maxRetries', async (t) => {
  const { audio, controller, errors } = setup({
    timings: { ...FAST, startTimeout: 15, retryDelays: [5, 5], maxRetries: 2 },
  })
  t.after(() => controller.destroy())

  controller.play(URL)
  await wait(150)

  assert.equal(controller.getState(), 'error')
  assert.equal(audio.playCalls, 3)          /* initial + 2 retries */
  assert.ok(errors.includes('playback'))
})

test('a media error retries, and the next "playing" recovers it', async (t) => {
  const { audio, controller } = setup({ timings: { ...FAST, retryDelays: [10] } })
  t.after(() => controller.destroy())

  controller.play(URL)
  audio.dispatch('playing')

  audio.error = { code: 2 }
  audio.dispatch('error')
  assert.equal(controller.getState(), 'stalled')

  await wait(30)
  assert.equal(audio.playCalls, 2)          /* retried */

  audio.dispatch('playing')
  assert.equal(controller.getState(), 'playing')
})

test('"waiting" freezes the state and reconnects after the stall window', async (t) => {
  const { audio, controller } = setup({
    timings: { ...FAST, stallAfter: 20, retryDelays: [5] },
  })
  t.after(() => controller.destroy())

  controller.play(URL)
  audio.dispatch('playing')
  audio.readyState = 2
  audio.dispatch('waiting')

  assert.equal(controller.getState(), 'stalled')
  await wait(60)
  assert.equal(audio.playCalls, 2)
})

test('a frozen currentTime with no buffer is caught by the watchdog', async (t) => {
  const { audio, controller } = setup({
    timings: { ...FAST, watchdogInterval: 10, stallAfter: 20, retryDelays: [5] },
  })
  t.after(() => controller.destroy())

  controller.play(URL)
  audio.currentTime = 5
  audio.dispatch('playing')

  audio.currentTime = 5          /* no progress */
  audio.readyState = 0           /* no buffer */
  await wait(70)

  assert.equal(audio.playCalls, 2)
})

test('mixed-content URLs are rejected without touching the element', (t) => {
  const { audio, controller, errors } = setup({ isMixedContent: () => true })
  t.after(() => controller.destroy())

  controller.play('http://stream.example/s.mp3')

  assert.equal(audio.playCalls, 0)
  assert.equal(controller.getState(), 'error')
  assert.equal(errors.at(-1), 'mixed-content')
})

test('NotAllowedError maps to a "blocked" error instead of retrying', async (t) => {
  const { audio, controller, errors } = setup()
  t.after(() => controller.destroy())

  audio.rejectNextPlay = { name: 'NotAllowedError' }
  controller.play(URL)
  await wait(5)

  assert.equal(controller.getState(), 'error')
  assert.equal(errors.at(-1), 'blocked')
  assert.equal(audio.playCalls, 1)
})

test('crossOrigin is set before src only when CORS is allowed', (t) => {
  const { audio, controller } = setup()
  t.after(() => controller.destroy())

  controller.play(URL, { cors: true })
  assert.equal(audio.crossOrigin, 'anonymous')
  assert.equal(audio.srcHistory[0].crossOrigin, 'anonymous')

  controller.play('https://stream.example/other.mp3', { cors: false })
  assert.equal(audio.crossOrigin, null)
  assert.equal(audio.srcHistory.at(-1).crossOrigin, null)
})

test('retries keep the CORS setting', async (t) => {
  const { audio, controller } = setup({ timings: { ...FAST, retryDelays: [10] } })
  t.after(() => controller.destroy())

  controller.play(URL, { cors: true })
  audio.error = { code: 2 }
  audio.dispatch('error')
  await wait(30)

  assert.equal(audio.playCalls, 2)
  assert.equal(audio.srcHistory.at(-1).crossOrigin, 'anonymous')
})

test('an external pause (OS/Bluetooth) mirrors the UI back to idle', (t) => {
  const { audio, controller } = setup()
  t.after(() => controller.destroy())

  controller.play(URL)
  audio.dispatch('playing')
  audio.dispatch('pause')

  assert.equal(controller.getState(), 'idle')
})
