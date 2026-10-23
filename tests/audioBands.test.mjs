import test from 'node:test'
import assert from 'node:assert/strict'
import {
  BAND_COUNT,
  bandEdges,
  binFrequency,
  dbToUnit,
  frequencyToBands,
  isSilentSpectrum,
  smoothLevels,
} from '../lib/audioBands.js'

test('bandEdges: log-spaced, increasing, covering 40 Hz..16 kHz', () => {
  const edges = bandEdges()
  assert.equal(edges.length, BAND_COUNT + 1)
  assert.ok(Math.abs(edges[0] - 40) < 0.001)
  assert.ok(Math.abs(edges[edges.length - 1] - 16000) < 0.01)

  for (let i = 1; i < edges.length; i++) {
    assert.ok(edges[i] > edges[i - 1], `edge ${i} not increasing`)
    /* Log spacing: each step multiplies by roughly the same ratio. */
    const ratio = edges[i] / edges[i - 1]
    const expected = Math.pow(16000 / 40, 1 / BAND_COUNT)
    assert.ok(Math.abs(ratio - expected) < 1e-6 || i === 1)
  }
})

test('binFrequency: maps FFT bins to Hz', () => {
  /* fftSize 1024 at 48 kHz -> 46.875 Hz per bin */
  assert.equal(binFrequency(1, 1024, 48000), 46.875)
  assert.equal(binFrequency(0, 1024, 48000), 0)
})

test('dbToUnit: gates silence and clamps loud input', () => {
  assert.equal(dbToUnit(-Infinity), 0)
  assert.equal(dbToUnit(-120), 0)
  assert.equal(dbToUnit(-90), 0)
  assert.equal(dbToUnit(-10), 1)
  assert.equal(dbToUnit(0), 1)
  assert.ok(Math.abs(dbToUnit(-50) - 0.5) < 1e-9)
})

test('frequencyToBands: silence yields zero levels', () => {
  const bins = new Float32Array(512).fill(-Infinity)
  const levels = frequencyToBands(bins, 48000)
  assert.equal(levels.length, BAND_COUNT)
  assert.ok([...levels].every((v) => v === 0))
})

test('frequencyToBands: loud content fills the matching band only', () => {
  const sampleRate = 48000
  const fftSize = 1024
  const bins = new Float32Array(512).fill(-90)
  const target = 1000
  /* Light a run of bins around 1 kHz, not a single bin: band levels are averages. */
  const centre = Math.round(target / (sampleRate / fftSize))
  for (let i = centre - 6; i <= centre + 6; i++) bins[i] = -10

  const levels = frequencyToBands(bins, sampleRate)
  const edges = bandEdges()
  /* The FFT bin snaps to 984 Hz, which is the band that must light up. */
  const actualHz = binFrequency(Math.round(target / (sampleRate / fftSize)), fftSize, sampleRate)
  const band = [...edges].findIndex((edge, i) => actualHz >= edge && actualHz < edges[i + 1])
  assert.ok(levels[band] > 0.5, `band ${band} should be loud, got ${levels[band]}`)
  assert.equal(levels[0], 0)
  assert.equal(levels[BAND_COUNT - 1], 0)
})

test('frequencyToBands: full-scale input saturates every band', () => {
  const bins = new Float32Array(512).fill(0)
  const levels = frequencyToBands(bins, 44100)
  assert.ok([...levels].every((v) => v === 1))
})

test('smoothLevels: ramps toward the target without snapping', () => {
  const previous = new Float32Array([0, 0])
  const next = new Float32Array([1, 0.5])
  const out = smoothLevels(previous, next, 0.5)
  assert.ok(Math.abs(out[0] - 0.5) < 1e-6)
  assert.ok(Math.abs(out[1] - 0.25) < 1e-6)

  const fresh = smoothLevels(null, next, 0.5)
  assert.deepEqual([...fresh], [1, 0.5])
})

test('isSilentSpectrum: detects tainted/silent analyser output', () => {
  assert.equal(isSilentSpectrum(new Float32Array(512).fill(-Infinity)), true)
  assert.equal(isSilentSpectrum(new Float32Array(512).fill(-90)), false)
  assert.equal(isSilentSpectrum([]), true)
})
