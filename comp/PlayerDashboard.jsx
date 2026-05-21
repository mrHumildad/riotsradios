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
        const v = volume
        for (let i = 0; i < 24; i++) {
          const band = i / 23
          const bassBoost = band < 0.3 ? 1.4 : band > 0.8 ? 0.7 : 1.0
          const peak = Math.random() * v * bassBoost
          targetRef.current[i] = Math.min(1, peak)
        }
      }
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
  const isBass = band < 0.25
  const isMid = band >= 0.25 && band < 0.7
  const isHigh = band >= 0.7
  const isHot = level > 0.85

  let colorClass = 'bar-bass'
  if (isMid) colorClass = 'bar-mid'
  if (isHigh) colorClass = 'bar-high'
  if (isHot) colorClass = 'bar-hot'

  const segments = 12
  const litCount = Math.round(level * segments)

  return (
    <div className="sound-bar" role="meter" aria-valuenow={pct} aria-valuemin="0" aria-valuemax="100">
      {Array.from({ length: segments }, (_, i) => {
        const segLit = i < litCount
        const segIdx = segments - 1 - i
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

function PlayerDashboard({ currentStationName, currentStationIndex, isPlaying, volume, currentShow, onTogglePlay, onChangeVolume, onPrevStation, onNextStation }) {
  const bars = useSoundBars(isPlaying, volume)
  const isIdle = currentStationIndex === null
  const modeLabel = isIdle ? 'IDLE' : isPlaying ? 'LIVE' : 'STOPPED'

  const [showEpgName, setShowEpgName] = useState(false)

  useEffect(() => {
    if (!currentShow) {
      setShowEpgName(false)
      return
    }
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
          <svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="M11 12 4 8l7-4z"/><path d="M4 4h2v8H4z"/></svg>
        </button>

        <button
          id="play-pause-btn"
          className={`push-btn play-btn${isPlaying ? ' is-playing' : ''}`}
          onClick={onTogglePlay}
          disabled={isIdle}
          aria-label={isIdle ? 'Play (select a station first)' : isPlaying ? 'Pause' : 'Play'}
        >
          {isPlaying
            ? <svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor" aria-hidden="true"><rect x="2" y="2" width="4" height="12" rx="1"/><rect x="10" y="2" width="4" height="12" rx="1"/></svg>
            : <svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="M4 2l10 6-10 6z"/></svg>
          }
        </button>

        <button
          id="next-station-btn"
          className="push-btn skip-btn"
          onClick={onNextStation}
          disabled={isIdle}
          aria-label="Next station"
        >
          <svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="M5 4l7 4-7 4z"/><path d="M10 4h2v8h-2z"/></svg>
        </button>

          </div>
        </div>

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