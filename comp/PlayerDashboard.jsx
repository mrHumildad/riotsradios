import React, { useState, useEffect, useMemo } from 'react'
import { useSpectrum } from './useSpectrum.js'
import MarqueeText from './MarqueeText'

/* ─────────────────────────────────────────────────
   PlayerDashboard
   ───────────────────────────────────────────────── */
function PlayerDashboard({
  currentStationName, currentStationIndex, playbackState, canAnalyze,
  codec, bitrate, timeZone, countryCode,
  volume, currentShow, currentTrack, stationHasError, streamError, spectrumRef,
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

  /* Catalog metadata (codec + kbps) for the soundbar header label. */
  const streamFormat = [codec, bitrate ? `${bitrate}k` : ''].filter(Boolean).join(' ')

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
  const modeClass = hasError
    ? 'soundbar-mode error-state'
    : playbackState === 'loading'
      ? 'soundbar-mode tuning-state'
      : 'soundbar-mode'

  /* Wall clock for the station's own timezone (from its EPG file), shown where
     the volume readout used to sit. Ticks on the minute so the header does not
     re-render the whole dashboard every second. */
  const [clock, setClock] = useState(() => new Date())

  useEffect(() => {
    if (!timeZone) return
    let timer
    const tick = () => {
      setClock(new Date())
      timer = setTimeout(tick, 60000 - (Date.now() % 60000))
    }
    timer = setTimeout(tick, 60000 - (Date.now() % 60000))
    return () => clearTimeout(timer)
  }, [timeZone])

  const stationClock = useMemo(() => {
    /* The readout is "NATION(hh:mm)": a zone to read the time and a catalog
       country to label it. A station with neither — or with only one of the
       two — shows no clock at all rather than a bare or unlabelled time. */
    const nation = String(countryCode || '').trim().toUpperCase()
    if (!timeZone || !nation) return null
    try {
      const time = new Intl.DateTimeFormat('en-GB', {
        timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
      }).format(clock)
      return { nation, time }
    } catch {
      return null   /* unknown zone: no clock rather than a wrong one */
    }
  }, [timeZone, clock, countryCode])

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
        <MarqueeText id="current-station" className={displayClass} text={crtText} />
      </div>

      {currentTrack && !hasError && (
        <MarqueeText
          className="crt-track"
          text={`♪ ${currentTrack}`}
          title={`Now playing: ${currentTrack}`}
        />
      )}


      <div
        className="soundbar-module"
        aria-label={spectrumMode === 'sim' ? 'Spectrum analyzer (simulated)' : 'Spectrum analyzer'}
        role="img"
      >
        <div className="soundbar-header">
          <span className="soundbar-label-group">
            {isLive && streamFormat && (
              <span className="soundbar-label stream-format">{streamFormat}</span>
            )}
            {spectrumMode === 'sim' && (
              <span
                className="sim-badge"
                title="Visualization simulated — this station does not expose audio data to the browser"
              >SIM</span>
            )}
          </span>
          <span className={modeClass}>{modeLabel}</span>
          {stationClock && (
            <span className="soundbar-clock" title={timeZone}>
              {stationClock.nation}({stationClock.time})
            </span>
          )}
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
