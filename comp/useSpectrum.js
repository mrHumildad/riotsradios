import { useEffect, useRef, useState } from 'react'
import { BAND_COUNT, smoothLevels } from '../lib/audioBands.js'

const SEGMENTS = 12
const TARGET_FPS = 30
const FALLBACK_MS = 1500
const OFF_COLOR = '#0a0500'

/* Bottom-up LED palette, mirroring the old CSS segment colours. */
const SEG_COLORS = [
  '#007828', '#007828', '#00a030', '#00a030',
  '#80d000', '#80d000', '#e8a000', '#e8a000',
  '#e8a000', '#ff5a2b', '#ff5a2b', '#ff2e2e',
]

function draw(canvas, levels, peaks) {
  if (!canvas) return
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  const cssW = canvas.clientWidth
  const cssH = canvas.clientHeight
  if (!cssW || !cssH) return

  const width = Math.round(cssW * dpr)
  const height = Math.round(cssH * dpr)
  if (canvas.width !== width) canvas.width = width
  if (canvas.height !== height) canvas.height = height

  const g = canvas.getContext('2d')
  if (!g) return

  g.clearRect(0, 0, width, height)

  const count = levels.length
  const gap = Math.max(1, Math.round(dpr))
  const barWidth = Math.max(1, (width - gap * (count - 1)) / count)
  const segHeight = Math.max(1, (height - gap * (SEGMENTS - 1)) / SEGMENTS)

  for (let i = 0; i < count; i++) {
    const x = i * (barWidth + gap)
    const lit = Math.round(levels[i] * SEGMENTS)

    for (let s = 0; s < SEGMENTS; s++) {
      const y = height - (s + 1) * segHeight - s * gap
      g.fillStyle = s < lit ? SEG_COLORS[s] : OFF_COLOR
      g.fillRect(x, y, barWidth, segHeight)
    }

    const peak = Math.min(SEGMENTS, Math.round(peaks[i] * SEGMENTS))
    if (peak > 0) {
      const y = height - peak * segHeight - (peak - 1) * gap
      g.fillStyle = '#ff2e2e'
      g.fillRect(x, y, barWidth, Math.max(1, Math.round(dpr)))
    }
  }
}

/**
 * Spectrum for the dashboard.
 *
 * - Real FFT data when the station exposes CORS (`canAnalyze` and the graph is
 *   connected), otherwise the deterministic SIM pattern.
 * - Freezes when audio is not actually live; stops the rAF loop in hidden tabs.
 * - Honours `prefers-reduced-motion` by drawing one static frame.
 *
 * @param {object} options
 * @param {{ current: object|null }} options.spectrumRef analyzer from the logic hook
 * @param {boolean} options.canAnalyze station health says CORS is available
 * @param {boolean} options.isLive audio is playing
 * @param {number|null} options.stationIndex
 * @param {number} options.volume
 */
export function useSpectrum({ spectrumRef, canAnalyze, isLive, stationIndex, volume }) {
  const canvasRef = useRef(null)
  const [mode, setMode] = useState('idle')      /* idle | sim | live */
  const modeRef = useRef('idle')
  const levelsRef = useRef(new Float32Array(BAND_COUNT))
  const peaksRef = useRef(new Float32Array(BAND_COUNT))
  const volumeRef = useRef(volume)
  const seedRef = useRef((stationIndex + 1) * 0.31)

  useEffect(() => {
    volumeRef.current = volume
  }, [volume])

  useEffect(() => {
    seedRef.current = (stationIndex + 1) * 0.31
    levelsRef.current = new Float32Array(BAND_COUNT)
    peaksRef.current = new Float32Array(BAND_COUNT)
  }, [stationIndex])

  useEffect(() => {
    const setModeIfChanged = (next) => {
      if (modeRef.current === next) return
      modeRef.current = next
      setMode(next)
    }

    if (!isLive) {
      setModeIfChanged('idle')
      return undefined
    }

    const reducedMotion =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches

    if (reducedMotion) {
      const staticLevels = new Float32Array(BAND_COUNT).fill(0.35)
      draw(canvasRef.current, staticLevels, staticLevels)
      setModeIfChanged(canAnalyze ? 'live' : 'sim')
      return undefined
    }

    let raf = null
    let last = 0
    let silenceAt = 0
    let disposed = false

    const simulate = (ts) => {
      const out = new Float32Array(BAND_COUNT)
      const t = ts * 0.001
      const seed = seedRef.current
      const v = volumeRef.current
      for (let i = 0; i < BAND_COUNT; i++) {
        const noise = (i * 27182.718) % 1
        const wave = (noise + t * 0.35 + seed) % 1
        const shape = Math.exp(-(i / (BAND_COUNT - 1)) * 1.5)
        out[i] = Math.max(0, Math.min(1, (wave * 0.25 + shape * 0.75) * v))
      }
      return out
    }

    const frame = (ts) => {
      if (disposed) return
      raf = requestAnimationFrame(frame)
      if (typeof document !== 'undefined' && document.hidden) return
      if (ts - last < 1000 / TARGET_FPS) return
      last = ts

      let next = null
      if (canAnalyze && spectrumRef?.current) {
        next = spectrumRef.current.read()
        if (next) {
          silenceAt = 0
          setModeIfChanged('live')
        }
      }

      if (!next) {
        if (!silenceAt) silenceAt = ts
        if (!canAnalyze || ts - silenceAt > FALLBACK_MS) setModeIfChanged('sim')
        next = simulate(ts)
      }

      levelsRef.current = smoothLevels(levelsRef.current, next, 0.35)
      const peaks = peaksRef.current
      for (let i = 0; i < BAND_COUNT; i++) {
        peaks[i] = Math.max(levelsRef.current[i], peaks[i] - 0.01)
      }
      draw(canvasRef.current, levelsRef.current, peaks)
    }

    const onVisibility = () => {
      if (typeof document === 'undefined') return
      if (document.hidden) {
        if (raf !== null) cancelAnimationFrame(raf)
        raf = null
      } else if (raf === null && !disposed) {
        raf = requestAnimationFrame(frame)
      }
    }

    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVisibility)
    raf = requestAnimationFrame(frame)

    return () => {
      disposed = true
      if (raf !== null) cancelAnimationFrame(raf)
      if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [isLive, canAnalyze, spectrumRef])

  return { canvasRef, mode }
}
