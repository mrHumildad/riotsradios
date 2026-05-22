import React, { useState, useEffect, useRef, useCallback } from 'react'

/* ─────────────────────────────────────────────────
   useAudioBars
   Purely cosmetic spectrum ticker that reacts to
   isPlaying, volume and stationIndex, but never
   touches the Web Audio API or the <audio> element.
   Cannot break audio playback under any condition.
   ───────────────────────────────────────────────── */
function useAudioBars(isPlaying, volume, stationIndex) {
  const [bars, setBars] = useState(Array(24).fill(0))

  /* mutable slots — updated on every render, read inside rAF
     without causing the effect to re-subscribe */
  const volRef    = useRef(volume)
  const stallRef  = useRef(0)     /* frames since last update */
  const rafIdRef  = useRef(null)
  const running   = useRef(false)
  const phaseRef  = useRef(0)
  const idxRef    = useRef(stationIndex)
  const seedRef   = useRef((stationIndex + 1) * 0.31)

  /* keep refs in sync without re-running the effect */
  useEffect(() => { volRef.current =  volume },        [volume])
  useEffect(() => { idxRef.current  =  stationIndex
                     seedRef.current = (stationIndex + 1) * 0.31 }, [stationIndex])

  /* ── per-frame update ──────────────────────── */
  const step = useCallback(() => {
    if (!running.current) return
    phaseRef.current += 0.072

    const v         = volRef.current
    const seed      = seedRef.current
    const wave      = phaseRef.current
    const next      = Array.from({ length: 24 }, (_, i) => {
      /* pseudo-random, station-specific, bass-biased envelope */
      const noise  = ((i * 27182.718) % 1)
      const foo    = (noise + wave * 0.00314 + seed) % 1
      const shape  = Math.exp(-(i / 23) * 1.5)
      return Math.max(0, (foo * 0.25 + shape * 0.75) * v)
    })

    /* ramp toward the target value — smooth, never snaps */
    setBars(prev => prev.map((val, i) => val + (next[i] - val) * 0.30))
    rafIdRef.current = requestAnimationFrame(step)
  }, [])

  /* ── subscribe / unsubscribe ──────────────── */
  useEffect(() => {
    if (!isPlaying) {
      running.current = false
      if (rafIdRef.current) cancelAnimationFrame(rafIdRef.current)
      rafIdRef.current = null
      setBars(Array(24).fill(0))
      return
    }
    if (!running.current) {
      running.current = true
      rafIdRef.current = requestAnimationFrame(step)
    }
    return () => { running.current = false }
  }, [isPlaying, step])

  return bars
}

/* ─────────────────────────────────────────────────
   SoundBar — one 12-segment LED EQ column
   ───────────────────────────────────────────────── */
function SoundBar({ level, index, total }) {
  const pct     = Math.round(level * 100)
  const band    = index / (total - 1)
  const isBass  = band < 0.25
  const isLoud  = level > 0.55

  const segments = 12
  const litCount = Math.round(level * segments)

  return (
    <div className="sound-bar" role="meter" aria-valuenow={pct} aria-valuemin="0" aria-valuemax="100">
      {Array.from({ length: segments }, (_, i) => {
        const lit    = i < litCount
        const segIdx = segments - 1 - i
        let segClass = 'seg-off'
        if (lit) {
          if      (segIdx >= 10) segClass = isLoud ? 'seg-hot'   : 'seg-warm'
          else if (segIdx >= 7)  segClass = isLoud ? 'seg-hot'   : 'seg-warm'
          else if (segIdx >= 4)  segClass = isLoud ? 'seg-warm'  : 'seg-mid'
          else                   segClass = isLoud ? 'seg-mid'   : isBass ? 'seg-bass' : 'seg-base'
        }
        return <div key={i} className={`bar-seg ${segClass}`} />
      })}
    </div>
  )
}

/* ─────────────────────────────────────────────────
   PlayerDashboard
   ───────────────────────────────────────────────── */
function PlayerDashboard({ audioRef, currentStationName, currentStationIndex,
                           isPlaying, volume, currentShow,
                           onTogglePlay, onChangeVolume,
                           onPrevStation, onNextStation }) {
  const bars      = useAudioBars(isPlaying, volume, currentStationIndex)
  const isIdle    = currentStationIndex === null
  const modeLabel = isIdle ? 'IDLE' : isPlaying ? 'LIVE' : 'STOPPED'

  const [showEpgName, setShowEpgName] = useState(false)

  useEffect(() => {
    if (!currentShow) { setShowEpgName(false); return }
    setShowEpgName(true)
    const id = setInterval(() => setShowEpgName(v => !v), 3500)
    return () => clearInterval(id)
  }, [currentShow])

  const crtText = currentShow && showEpgName
    ? (currentShow.live ? '● ' : '▷ ') + currentShow.title
    : currentStationName

  return (
    <div className="player-dashboard">
      <span className="corner-screw tl" aria-hidden="true" />
      <span className="corner-screw tr" aria-hidden="true" />
      <span className="corner-screw bl" aria-hidden="true" />
      <span className="corner-screw br" aria-hidden="true" />

      <div className="crt-display" aria-label="Current station">
        <span id="current-station" className="display-text">{crtText}</span>
      </div>

      <div className="panel-divider" />

      <div className="soundbar-module" aria-label="Spectrum analyzer" role="img">
        <div className="soundbar-header">
          <span className="soundbar-label">SPECTRUM</span>
          <span className="soundbar-mode">{modeLabel}</span>
          <span className="soundbar-vol">VOL {Math.round(volume * 100)}</span>
        </div>
        <div className="soundbar-scale">
          <span className="scale-tick">+6</span>
          <span className="scale-tick">0</span>
          <span className="scale-tick">-6</span>
          <span className="scale-tick">-12</span>
          <span className="scale-tick">-20</span>
        </div>
        <div className={`soundbar-bars${isPlaying ? ' is-active' : ''}`}>
          {bars.map((level, i) => (
            <SoundBar key={i} level={level} index={i} total={bars.length} />
          ))}
        </div>
        <div className="soundbar-footer">
          <span className="freq-band">20</span>
          <span className="freq-band">50</span>
          <span className="freq-band">200</span>
          <span className="freq-band">1K</span>
          <span className="freq-band">5K</span>
          <span className="freq-band">20K</span>
        </div>
      </div>

      <div className="panel-divider" />

      <div className="ctrl-row">
        <div className="ctrl-left" />
        <div className="ctrl-left">
          <div className="transport-btns">

            <button
              id="prev-station-btn"
              className="push-btn skip-btn"
              onClick={onPrevStation}
              disabled={isIdle}
              aria-label="Previous station"
            >
              <svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor" aria-hidden="true">
                <path d="M11 12 4 8l7-4z"/><path d="M4 4h2v8H4z"/>
              </svg>
            </button>

            <button
              id="play-pause-btn"
              className={`push-btn play-btn${isPlaying ? ' is-playing' : ''}`}
              onClick={onTogglePlay}
              disabled={isIdle}
              aria-label={isIdle ? 'Play (select a station first)' : isPlaying ? 'Pause' : 'Play'}
            >
              {isPlaying
                ? <svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor" aria-hidden="true">
                    <rect x="2" y="2" width="4" height="12" rx="1"/>
                    <rect x="10" y="2" width="4" height="12" rx="1"/>
                  </svg>
                : <svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor" aria-hidden="true">
                    <path d="M4 2l10 6-10 6z"/>
                  </svg>}
            </button>

            <button
              id="next-station-btn"
              className="push-btn skip-btn"
              onClick={onNextStation}
              disabled={isIdle}
              aria-label="Next station"
            >
              <svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor" aria-hidden="true">
                <path d="M5 4l7 4-7 4z"/><path d="M10 4h2v8h-2z"/>
              </svg>
            </button>

          </div>
        </div>

        <div className="vol-rail">
          <input
            type="range"
            min="0" max="1" step="0.05"
            value={volume}
            onChange={e => onChangeVolume(e.target.value)}
            aria-label="Volume"
          />
        </div>

        <div className="ctrl-left" />
      </div>

    </div>
  )
}

export default PlayerDashboard
