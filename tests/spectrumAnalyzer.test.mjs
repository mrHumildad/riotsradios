import test from 'node:test'
import assert from 'node:assert/strict'
import { createSpectrumAnalyzer } from '../lib/spectrumAnalyzer.js'
import { BAND_COUNT } from '../lib/audioBands.js'

function fakeContext({ bins } = {}) {
  const ctx = {
    sampleRate: 48000,
    state: 'running',
    destination: { id: 'destination' },
    gainNodes: [],
    analysers: [],
    resumeCalls: 0,
    resume() {
      this.resumeCalls += 1
      return Promise.resolve()
    },
    createMediaElementSource() {
      return { connect() {}, disconnect() {} }
    },
    createAnalyser() {
      const analyser = {
        fftSize: 1024,
        frequencyBinCount: 512,
        smoothingTimeConstant: 0,
        minDecibels: 0,
        maxDecibels: 0,
        connect() {},
        disconnect() {},
        getFloatFrequencyData(target) {
          target.set(bins)
        },
      }
      this.analysers.push(analyser)
      return analyser
    },
    createGain() {
      const gain = { gain: { value: 1 }, connect() {}, disconnect() {} }
      this.gainNodes.push(gain)
      return gain
    },
    close() {
      this.state = 'closed'
    },
  }
  return ctx
}

test('ensure(): builds the graph once and is idempotent', () => {
  const ctx = fakeContext({ bins: new Float32Array(512).fill(-90) })
  const analyzer = createSpectrumAnalyzer({ audio: {}, createContext: () => ctx })

  assert.equal(analyzer.isConnected(), false)
  assert.equal(analyzer.ensure(), true)
  assert.equal(analyzer.ensure(), true)
  assert.equal(analyzer.isConnected(), true)
  assert.equal(ctx.analysers.length, 1)
  assert.equal(ctx.gainNodes.length, 1)
  assert.equal(ctx.analysers[0].fftSize, 1024)
})

test('read(): tainted or silent audio returns null', () => {
  const ctx = fakeContext({ bins: new Float32Array(512).fill(-Infinity) })
  const analyzer = createSpectrumAnalyzer({ audio: {}, createContext: () => ctx })
  assert.equal(analyzer.read(), null)
})

test('read(): real bins become log-spaced band levels', () => {
  const bins = new Float32Array(512).fill(-90)
  const centre = Math.round(1000 / (48000 / 1024))
  for (let i = centre - 6; i <= centre + 6; i++) bins[i] = -10

  const ctx = fakeContext({ bins })
  const analyzer = createSpectrumAnalyzer({ audio: {}, createContext: () => ctx })
  const levels = analyzer.read()

  assert.equal(levels.length, BAND_COUNT)
  assert.ok(Math.max(...levels) > 0.5)
  assert.equal(levels[0], 0)
})

test('setVolume(): clamps and writes to the gain node', () => {
  const ctx = fakeContext({ bins: new Float32Array(512).fill(-90) })
  const analyzer = createSpectrumAnalyzer({ audio: {}, createContext: () => ctx })
  analyzer.ensure()

  analyzer.setVolume(0.4)
  assert.equal(ctx.gainNodes[0].gain.value, 0.4)
  analyzer.setVolume(5)
  assert.equal(ctx.gainNodes[0].gain.value, 1)
  analyzer.setVolume(-2)
  assert.equal(ctx.gainNodes[0].gain.value, 0)
})

test('ensure(): no AudioContext support fails gracefully', () => {
  const analyzer = createSpectrumAnalyzer({ audio: {}, createContext: () => undefined })
  assert.equal(analyzer.ensure(), false)
  assert.equal(analyzer.isConnected(), false)
  assert.equal(analyzer.read(), null)
})

test('ensure(): a throwing graph fails once and stays disabled', () => {
  const ctx = fakeContext({ bins: new Float32Array(512).fill(-90) })
  ctx.createMediaElementSource = () => {
    throw new Error('already connected')
  }
  const analyzer = createSpectrumAnalyzer({ audio: {}, createContext: () => ctx })

  assert.equal(analyzer.ensure(), false)
  assert.equal(analyzer.ensure(), false)
  assert.equal(analyzer.isConnected(), false)
})
