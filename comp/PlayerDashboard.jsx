import React, { useState, useEffect, useMemo, useRef } from 'react'
import { useSpectrum } from './useSpectrum.js'
import { useMetalSurface } from './useMetalSurface.js'
import MarqueeText from './MarqueeText'
import ViewIcon from './ViewIcon'

/* ─────────────────────────────────────────────────
   PlayerDashboard
   ───────────────────────────────────────────────── */
function PlayerDashboard({
  currentStationName, currentStationIndex, playbackState, canAnalyze,
  codec, bitrate, timeZone, countryCode,
  volume, currentShow, currentTrack, stationHasError, streamError, spectrumRef,
  onTogglePlay, onChangeVolume, onPrevStation, onNextStation,
  listView, hasGuides, hasStationPanel, onCycleListView,
  language, hasLanguages, onCycleLanguage, languageLabel, nextLanguageLabel,
}) {
  const isIdle    = currentStationIndex === null
  const hasError  = stationHasError || Boolean(streamError)
  /* The chassis plate is one metallic surface; --metal/--convexity live in CSS. */
  const surfaceRef = useRef(null)
  useMetalSurface(surfaceRef)
  /* Only animate while audio is actually live; otherwise the canvas freezes. */
  const isLive    = playbackState === 'playing' && !hasError
  const isActive  = playbackState === 'loading' || playbackState === 'playing' || playbackState === 'stalled'
  const volumePct = Math.round(Math.min(1, Math.max(0, Number(volume) || 0)) * 100)

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

  /* One display line, cycling in place: the station name, the programme on air,
     then the stream's own track. The track needs no row of its own. */
  const displayTexts = useMemo(() => {
    if (stationHasError && streamError === 'mixed-content') return ['STREAM ERROR (HTTPS)']
    if (stationHasError && streamError === 'playback') return ['PLAYBACK ERROR']
    if (hasError) return [currentStationName]
    const texts = [currentStationName]
    if (currentShow) texts.push(`${currentShow.live ? '● ' : '▷ '}${currentShow.title}`)
    if (currentTrack) texts.push(`♪ ${currentTrack}`)
    return texts
  }, [stationHasError, streamError, hasError, currentStationName, currentShow, currentTrack])

  const [displayStep, setDisplayStep] = useState(0)
  const displayCount = displayTexts.length

  /* Restart only when the set of texts changes, so an ICY update does not cut
     the cycle short. */
  useEffect(() => {
    setDisplayStep(0)
    if (displayCount < 2) return undefined
    const id = setInterval(() => setDisplayStep(step => step + 1), 3500)
    return () => clearInterval(id)
  }, [displayCount, currentStationIndex])

  const displayIndex = displayStep % displayCount
  const crtText = displayTexts[displayIndex]
  const crtTitle = !hasError && currentTrack && displayIndex === displayCount - 1
    ? `Now playing: ${currentTrack}`
    : undefined

  const displayClass = streamError ? 'display-text stream-error' : 'display-text'

  /* The list-mode key: one icon per view, the icon showing what the station
     list is doing now. Its label names the current view and the next one, so
     the key never needs a text caption. */
  const view = listView || 'list'
  const viewLabel = view === 'epg'
    ? 'guide lanes'
    : view === 'news' ? 'station feed' : view === 'station' ? 'station info' : 'station rows'
  /* The key walks rows → lanes → feed → info. A catalog with no guide skips the
     lanes, and the info step only exists once there is a station to show, so
     the label names exactly the view the key will land on next. */
  const nextViewLabel = view === 'station'
    ? 'station rows'
    : hasStationPanel
      ? (view === 'list'
          ? (hasGuides ? 'guide lanes' : 'station feed')
          : view === 'epg' ? 'station feed' : 'station info')
      : hasGuides
        ? (view === 'epg' ? 'station feed' : view === 'news' ? 'station rows' : 'guide lanes')
        : (view === 'news' ? 'station rows' : 'station feed')

  return (
    <div className="player-dashboard metal-surface" ref={surfaceRef}>


      <div className="crt-display" aria-label="Current station">
        <MarqueeText id="current-station" className={displayClass} text={crtText} title={crtTitle} />
      </div>


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
        <div className={`soundbar-bars${isLive ? ' is-active' : ''}`}>
          <canvas ref={canvasRef} className="soundbar-canvas" aria-hidden="true" />
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
          <div className="fader">
            <input
              type="range"
              min="0" max="1" step="0.05"
              value={volume}
              onChange={e => onChangeVolume(e.target.value)}
              aria-label="Volume"
              aria-valuetext={`${volumePct}%`}
            />
          </div>
        </div>

        {/* The two view keys stand apart from the transport keys and the fader,
            so the row reads as "transport + volume" then "language + mode". */}
        <div className="ctrl-right">

          <button
            type="button"
            id="lang-btn"
            className="push-btn skip-btn lang-btn"
            onClick={onCycleLanguage}
            disabled={!hasLanguages}
            aria-label={`Language: ${languageLabel}. Click for ${nextLanguageLabel}.`}
            title={`Showing ${languageLabel} — click for ${nextLanguageLabel}`}
          >
            <span
              className={`lang-btn-code${language ? '' : ' is-all'}`}
              aria-hidden="true"
            >
              {language ? language.toUpperCase() : '*'}
            </span>
          </button>

          <button
            type="button"
            id="list-mode-btn"
            className={`push-btn skip-btn mode-btn${view === 'epg' ? ' is-guide' : view === 'news' ? ' is-feed' : view === 'station' ? ' is-info' : ''}`}
            onClick={onCycleListView}
            aria-label={`Mode: ${viewLabel}. Click for ${nextViewLabel}.`}
            title={`Showing ${viewLabel} — click for ${nextViewLabel}`}
          >
            {/* Keyed on the view: the icon is redrawn on every mode change,
                which is what replays its entrance. */}
            <ViewIcon key={view} view={view} />
          </button>

        </div>

      </div>

    </div>
  )
}

export default PlayerDashboard
