import React, { useState, useEffect, useRef, useCallback } from 'react'

function useSoundBars(isPlaying, volume) {
  const [bars, setBars] = useState(Array(24).fill(0))
  const frameRef = useRef(null)
  const targetRef = useRef(Array(24).fill(0))

  useEffect(() => {
    if (!isPlaying) {
      setBars(Array(24).fill(0))
      return
    }

    let lastTick = 0
    const tick = (now) => {
      if (now - lastTick > 50) {
        lastTick = now
        // generate new random targets based on volume
        const v = volume
        for (let i = 0; i < 24; i++) {
          const band = i / 23
          // shape the spectrum: lower bands typically louder
          const bassBoost = band < 0.3 ? 1.4 : band > 0.8 ? 0.7 : 1.0
          const peak = Math.random() * v * bassBoost
          targetRef.current[i] = Math.min(1, peak)
        }
      }
      // smooth interpolation toward targets
      setBars(prev => prev.map((val, i) => {
        const target = targetRef.current[i]
        const diff = target - val
        return val + diff * 0.35
      }))
      frameRef.current = requestAnimationFrame(tick)
    }
    frameRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frameRef.current)
  }, [isPlaying, volume])

  return bars
}

function SoundBar({ level, index, total }) {
  const pct = Math.round(level * 100)
  const band = index / (total - 1)
  // color zones: bass=amber, mids=green, highs=cyan/red
  const isBass = band < 0.25
  const isMid = band >= 0.25 && band < 0.7
  const isHigh = band >= 0.7
  const isHot = level > 0.85

  let colorClass = 'bar-bass'
  if (isMid) colorClass = 'bar-mid'
  if (isHigh) colorClass = 'bar-high'
  if (isHot) colorClass = 'bar-hot'

  // number of lit segments (12 segments per bar)
  const segments = 12
  const litCount = Math.round(level * segments)

  return (
    <div className="sound-bar" role="meter" aria-valuenow={pct} aria-valuemin="0" aria-valuemax="100">
      {Array.from({ length: segments }, (_, i) => {
        const segLit = i < litCount
        const segIdx = segments - 1 - i // bottom=0, top=11
        let segClass = 'seg-off'
        if (segLit) {
          if (segIdx >= 10) segClass = 'seg-hot'
          else if (segIdx >= 7) segClass = 'seg-warm'
          else if (segIdx >= 4) segClass = 'seg-mid'
          else segClass = 'seg-base'
        }
        return <div key={i} className={`bar-seg ${segClass}`} />
      })}
    </div>
  )
}

function PlayerDashboard({ currentStationName, isPlaying, volume, onTogglePlay, onStopRadio, onChangeVolume }) {
  const bars = useSoundBars(isPlaying, volume)

  return (
    <div className="player-dashboard">
      {/* corner screws */}
      <span className="corner-screw tl" aria-hidden="true" />
      <span className="corner-screw tr" aria-hidden="true" />
      <span className="corner-screw bl" aria-hidden="true" />
      <span className="corner-screw br" aria-hidden="true" />

      {/* ── §1 CRT AMBER DISPLAY ───────────────────── */}
      <div className="crt-display" aria-label="Current station">
        <span id="current-station" className="display-text">{currentStationName}</span>
      </div>

      <div className="panel-divider" />

      {/* ── §2 RETRO SOUND BAR / EQ VISUALIZER ─────── */}
      <div className="soundbar-module" aria-label="Spectrum analyzer" role="img">
        <div className="soundbar-header">
          <span className="soundbar-label">SPECTRUM</span>
          <span className="soundbar-mode">{isPlaying ? 'LIVE' : 'STANDBY'}</span>
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

      {/* ── §3 DECK-KEY BUTTON RACK + VOLUME  (single row) ── */}
      <div className="ctrl-row">
        <div className="ctrl-left" />

        {/* Play / Pause */}
        <button
          id="play-pause-btn"
          className={`push-btn play-btn${isPlaying ? ' is-playing' : ''}`}
          onClick={onTogglePlay}
          aria-label={isPlaying ? 'Pause' : 'Play'}
        >
          {isPlaying
            ? <svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor" aria-hidden="true"><rect x="2" y="2" width="4" height="12" rx="1"/><rect x="10" y="2" width="4" height="12" rx="1"/></svg>
            : <svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="M4 2l10 6-10 6z"/></svg>
          }
        </button>

        {/* Stop */}
        <button
          className="push-btn stop-btn"
          onClick={onStopRadio}
          aria-label="Stop"
        >
          <svg viewBox="0 0 16 16" width="15" height="15" fill="currentColor" aria-hidden="true"><rect x="2" y="2" width="12" height="12" rx="1"/></svg>
        </button>

        {/* Volume slider — in rail */}
        <div className="vol-rail">
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={volume}
            onChange={(e) => onChangeVolume(e.target.value)}
            aria-label="Volume"
          />

        </div>

        <div className="ctrl-left" />
      </div>

    </div>
  )
}

export default PlayerDashboard
