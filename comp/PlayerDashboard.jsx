import React, { useState, useEffect } from 'react'
import { useSpectrum } from './useSpectrum.js'

/* ─────────────────────────────────────────────────
   PlayerDashboard
   ───────────────────────────────────────────────── */
function PlayerDashboard({
  currentStationName, currentStationIndex, playbackState, canAnalyze,
  volume, currentShow, stationHasError, streamError, spectrumRef,
  onTogglePlay, onChangeVolume, onPrevStation, onNextStation,
}) {
  const isIdle    = currentStationIndex === null
  const hasError  = stationHasError || Boolean(streamError)
  /* Only animate while audio is actually live; otherwise the canvas freezes. */
  const isLive    = playbackState === 'playing' && !hasError
  const isActive  = playbackState === 'loading' || playbackState === 'playing' || playbackState === 'stalled'

  const { canvasRef, mode: spectrumMode } = useSpectrum({
    spectrumRef,
    canAnalyze,
    isLive,
    stationIndex: currentStationIndex,
    volume,
  })

  const modeLabel = isIdle
    ? 'IDLE'
    : hasError
      ? 'ERROR'
      : playbackState === 'loading'
        ? 'TUNING'
        : playbackState === 'stalled'
          ? 'RECONNECTING'
          : playbackState === 'playing'
            ? 'LIVE'
            : 'STOPPED'
  const modeClass = hasError ? 'soundbar-mode error-state' : 'soundbar-mode'

  const [showEpgName, setShowEpgName] = useState(false)

  useEffect(() => {
    if (!currentShow) { setShowEpgName(false); return }
    setShowEpgName(true)
    const id = setInterval(() => setShowEpgName(v => !v), 3500)
    return () => clearInterval(id)
  }, [currentShow])

  const crtText = currentShow && showEpgName && !stationHasError
    ? (currentShow.live ? '● ' : '▷ ') + currentShow.title
    : stationHasError && streamError === 'mixed-content'
    ? 'STREAM ERROR (HTTPS)'
    : stationHasError && streamError === 'playback'
    ? 'PLAYBACK ERROR'
    : currentStationName

  const displayClass = streamError ? 'display-text stream-error' : 'display-text'

  return (
    <div className="player-dashboard">


      <div className="crt-display" aria-label="Current station">
        <span id="current-station" className={displayClass}>{crtText}</span>
      </div>


      <div
        className="soundbar-module"
        aria-label={spectrumMode === 'sim' ? 'Spectrum analyzer (simulated)' : 'Spectrum analyzer'}
        role="img"
      >
        <div className="soundbar-header">
          <span className="soundbar-label-group">
            <span className="soundbar-label">SPECTRUM</span>
            {spectrumMode === 'sim' && (
              <span
                className="sim-badge"
                title="Visualization simulated — this station does not expose audio data to the browser"
              >SIM</span>
            )}
          </span>
          <span className={modeClass}>{modeLabel}</span>
          <span className="soundbar-vol">VOL {Math.round(volume * 100)}</span>
        </div>
        <div className="soundbar-scale">
          <span className="scale-tick">+6</span>
          <span className="scale-tick">0</span>
          <span className="scale-tick">-6</span>
          <span className="scale-tick">-12</span>
          <span className="scale-tick">-20</span>
        </div>
        <div className={`soundbar-bars${isLive ? ' is-active' : ''}`}>
          <canvas ref={canvasRef} className="soundbar-canvas" aria-hidden="true" />
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


      <div className="ctrl-row">
        <div className="ctrl-left">
          <div className="transport-btns">

            <button
              id="prev-station-btn"
              className="push-btn skip-btn"
              onClick={onPrevStation}
              disabled={isIdle}
              aria-label="Previous station"
            >
              <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                <path d="M11 12 4 8l7-4z"/><path d="M4 4h2v8H4z"/>
              </svg>
            </button>

            <button
              id="play-pause-btn"
              className={`push-btn play-btn${isActive ? ' is-playing' : ''}`}
              onClick={onTogglePlay}
              disabled={isIdle}
              aria-label={isIdle ? 'Play (select a station first)' : isActive ? 'Stop' : 'Play'}
            >
              {isActive
                ? <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                    <rect x="3" y="3" width="10" height="10" rx="1"/>
                  </svg>
                : <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
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
              <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
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

      </div>

    </div>
  )
}

export default PlayerDashboard
