/**
 * Frequency-band math for the spectrum visualizer.
 *
 * Pure functions: no Web Audio, no DOM. The analyzer feeds FFT data in, the
 * canvas reads 0..1 levels out, and both sides stay unit-testable.
 */

export const BAND_COUNT = 24
export const MIN_HZ = 40
export const MAX_HZ = 16000
export const MIN_DB = -90
export const MAX_DB = -10

/** Centre frequency of an FFT bin. */
export function binFrequency(index, fftSize, sampleRate) {
  return (index * sampleRate) / fftSize
}

/**
 * Log-spaced band edges, from `minHz` to `maxHz`.
 * Length is bandCount + 1, strictly increasing.
 */
export function bandEdges(bandCount = BAND_COUNT, minHz = MIN_HZ, maxHz = MAX_HZ) {
  const edges = new Float64Array(bandCount + 1)
  const logMin = Math.log(minHz)
  const logMax = Math.log(maxHz)
  for (let i = 0; i <= bandCount; i++) {
    edges[i] = Math.exp(logMin + ((logMax - logMin) * i) / bandCount)
  }
  return edges
}

/** Map a dBFS value to 0..1, clamped and noise-gated below `minDb`. */
export function dbToUnit(db, minDb = MIN_DB, maxDb = MAX_DB) {
  if (!Number.isFinite(db)) return 0
  if (db <= minDb) return 0
  if (db >= maxDb) return 1
  return (db - minDb) / (maxDb - minDb)
}

/**
 * Average the FFT bins that fall in each log-spaced band.
 *
 * @param {Float32Array|number[]} bins per-bin dBFS values
 * @param {number} sampleRate
 * @param {object} [options]
 * @returns {Float32Array} band levels 0..1
 */
export function frequencyToBands(
  bins,
  sampleRate,
  { bandCount = BAND_COUNT, minHz = MIN_HZ, maxHz = MAX_HZ, minDb = MIN_DB, maxDb = MAX_DB } = {}
) {
  const levels = new Float32Array(bandCount)
  if (!bins || bins.length === 0 || !sampleRate) return levels

  const fftSize = bins.length * 2          /* getFloatFrequencyData returns N/2 bins */
  const edges = bandEdges(bandCount, minHz, maxHz)
  const binHz = sampleRate / fftSize

  for (let band = 0; band < bandCount; band++) {
    const from = edges[band]
    const to = edges[band + 1]
    const first = Math.max(0, Math.ceil(from / binHz))
    const last = Math.min(bins.length - 1, Math.floor(to / binHz))

    let sum = 0
    let count = 0
    for (let i = first; i <= last; i++) {
      sum += bins[i]
      count++
    }
    if (count === 0) {
      /* Band narrower than one bin: sample the nearest bin. */
      const nearest = Math.min(bins.length - 1, Math.max(0, Math.round((from + to) / 2 / binHz)))
      levels[band] = dbToUnit(bins[nearest], minDb, maxDb)
    } else {
      levels[band] = dbToUnit(sum / count, minDb, maxDb)
    }
  }

  return levels
}

/** Exponential smoothing toward the new level (0 = frozen, 1 = instant). */
export function smoothLevels(previous, next, amount = 0.35) {
  if (!previous || previous.length !== next.length) return Float32Array.from(next)
  const out = new Float32Array(next.length)
  for (let i = 0; i < next.length; i++) {
    out[i] = previous[i] + (next[i] - previous[i]) * amount
  }
  return out
}

/** True when every bin is -Infinity: a tainted or silent analyser. */
export function isSilentSpectrum(bins) {
  if (!bins || bins.length === 0) return true
  for (let i = 0; i < bins.length; i++) {
    if (Number.isFinite(bins[i])) return false
  }
  return true
}
