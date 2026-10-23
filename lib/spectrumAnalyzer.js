/**
 * Web Audio graph for the real spectrum analyzer.
 *
 *   <audio> → MediaElementSource → AnalyserNode → GainNode → destination
 *
 * One graph per audio element: `createMediaElementSource` may only be called
 * once per element, and the element must already have a CORS-safe `crossOrigin`
 * setting before its `src` is assigned. The caller decides that; this module
 * only builds the graph lazily and reports silence honestly (tainted audio
 * yields -Infinity bins, which read() returns as null).
 */

import { BAND_COUNT, MAX_HZ, MIN_HZ, frequencyToBands, isSilentSpectrum } from './audioBands.js'

export const DEFAULT_FFT_SIZE = 1024

export function createSpectrumAnalyzer({
  audio,
  createContext,
  fftSize = DEFAULT_FFT_SIZE,
  bandCount = BAND_COUNT,
} = {}) {
  let ctx = null
  let source = null
  let analyser = null
  let gain = null
  let bins = null
  let failed = false

  function ensure() {
    if (failed) return false
    if (analyser) {
      if (ctx?.state === 'suspended') ctx.resume?.().catch?.(() => {})
      return true
    }

    try {
      if (!ctx) {
        /* `createContext` is a factory (tests); the browser API is a constructor. */
        if (createContext) ctx = createContext()
        else {
          const Context = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext)
          if (!Context) return false
          ctx = new Context()
        }
        if (!ctx) return false
      }
      if (ctx.state === 'suspended') ctx.resume?.().catch?.(() => {})

      source = ctx.createMediaElementSource(audio)
      analyser = ctx.createAnalyser()
      analyser.fftSize = fftSize
      analyser.smoothingTimeConstant = 0.8
      analyser.minDecibels = -90
      analyser.maxDecibels = -10

      gain = ctx.createGain()
      gain.gain.value = 1

      source.connect(analyser)
      analyser.connect(gain)
      gain.connect(ctx.destination)

      bins = new Float32Array(analyser.frequencyBinCount)
      return true
    } catch {
      failed = true
      return false
    }
  }

  /** @returns {Float32Array|null} 24 band levels, or null when no usable data. */
  function read() {
    if (!ensure() || !analyser || !bins) return null
    analyser.getFloatFrequencyData(bins)
    if (isSilentSpectrum(bins)) return null
    return frequencyToBands(bins, ctx.sampleRate, {
      bandCount,
      minHz: MIN_HZ,
      maxHz: MAX_HZ,
    })
  }

  function setVolume(value) {
    const v = Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 1
    if (gain) gain.gain.value = v
  }

  return {
    ensure,
    read,
    setVolume,
    isConnected: () => Boolean(analyser),
    close() {
      try {
        source?.disconnect()
        analyser?.disconnect()
        gain?.disconnect()
        ctx?.close?.()
      } catch {
        /* closing an already-closed context is fine */
      }
      ctx = null
      source = null
      analyser = null
      gain = null
      bins = null
    },
  }
}
