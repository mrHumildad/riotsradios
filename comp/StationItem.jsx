import React, { useState, useEffect } from 'react'
import { healthBadge } from '../lib/health.js'
import { stationPlace } from '../lib/stations.js'
import { formatMinutes, getEpgWindow } from '../lib/epg.js'
import MarqueeText from './MarqueeText'
/* Brand mark shown when a station has no artwork or its icon URL is dead. */
import fallbackIcon from '/logob_transp_ffc107.png'

function StationItem({ station, index, isActive, isSelected, playState, isFavorite, onSelect, currentShow, nowTitle, onOpenStation, onEditStation, epgMode = false, epg = null, now = null }) {
  const [cycleStep, setCycleStep] = useState(0)
  /* The icon is a remote image. A dead URL hides it, and editing the URL must be
     able to bring it back — so the failure is component state that resets when
     the URL changes, never a style set on the DOM node by the error handler. */
  const [iconFailed, setIconFailed] = useState(false)
  /* Which of the two third-line fields is showing. */
  const [metaStep, setMetaStep] = useState(0)
  const badge = healthBadge(station.health)
  const place = stationPlace(station)
  /* Second line: the catalog's free-text place (city, province for most rows)
     with the country code in brackets after it. */
  const countryCode = String(station.countrycode || '').trim()
  const placeLine = place && countryCode ? `${place} (${countryCode})` : place
  /* The place and the stream's health share one line: they alternate in place
     instead of the badge pushing the row to a fifth line. A station with only
     one of the two simply shows that one. */
  const showBadge = Boolean(badge && badge.tone !== 'ok')
  const metaKinds = [placeLine && 'place', showBadge && 'badge'].filter(Boolean)
  const metaKey = metaKinds.join('|')
  /* The row the player owns also reports what the stream is doing: stopped is
     left to the plain red selected style, error and loading get their own
     blinking marker. A stalled stream is a failure, so it blinks like an
     error. */
  const playStateClass = isSelected && playState && playState !== 'playing'
    ? ` is-${playState === 'stalled' ? 'error' : playState}`
    : ''

  /* EPG mode: only a station with a guide trades its text for the lane. A
     station without one keeps its normal row, wherever it sits in the list. */
  const guide = epgMode ? getEpgWindow(epg, now || new Date()) : null
  const guideSpan = guide ? guide.endMin - guide.startMin : 0
  const guidePct = (minute) => ((minute - guide.startMin) / guideSpan) * 100

  useEffect(() => {
    setIconFailed(false)
  }, [station.favicon])

  /* One headline per row: the station name, the programme on air, then the
     stream's own ICY title, cycling in place. Showing what is playing costs no
     extra line this way — hence no separate now-playing row. */
  const headline = ['name']
  if (currentShow) headline.push('show')
  if (nowTitle) headline.push('track')
  /* restart only when a headline appears or disappears, not when a title
     changes — an ICY update must not cut the cycle short */
  const headlineKey = `${currentShow ? 'show' : ''}|${nowTitle ? 'track' : ''}`

  useEffect(() => {
    setCycleStep(0)
    if (headline.length < 2) return undefined
    const id = setInterval(() => setCycleStep(step => step + 1), 3500)
    return () => clearInterval(id)
  }, [headlineKey])

  const headlineKind = headline[cycleStep % headline.length]

  /* Same cadence as the headline cycle, restarting when a field appears or
     disappears (a health refresh can change the badge). */
  useEffect(() => {
    setMetaStep(0)
    if (metaKinds.length < 2) return undefined
    const id = setInterval(() => setMetaStep(step => step + 1), 4000)
    return () => clearInterval(id)
  }, [metaKey])

  const metaKind = metaKinds.length ? metaKinds[metaStep % metaKinds.length] : null

  const liveIndicator = currentShow?.live
    ? <span className="epg-live-dot" />
    : <span className="epg-off-dot" />

  const icon = station.favicon && !iconFailed ? (
    <img
      key={station.favicon}
      src={station.favicon}
      alt=""
      width="48"
      height="48"
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      className="station-icon"
      onError={() => setIconFailed(true)}
    />
  ) : (
    <img
      src={fallbackIcon}
      alt=""
      width="48"
      height="48"
      decoding="async"
      className="station-icon is-default"
    />
  )

  return (
    <div
      id={`station-${index}`}
      role="button"
      tabIndex={0}
      aria-label={`${station.name || '(unlisted)'}${isActive ? ', playing' : ''}`}
      className={`station-item${isActive ? ' playing' : ''}${isSelected && !isActive ? ' selected' : ''}${playStateClass}${guide ? ' is-epg' : ''}`}
      onClick={() => onSelect(index)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
          e.preventDefault()
          onSelect(index)
        }
      }}
    >
      <span
        className={`station-fav${isFavorite ? ' is-fav' : ''}`}
        title={isFavorite ? 'Favourite station' : 'Not a favourite'}
        aria-hidden="true"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path
            className="flame-body"
            d="M12 2.5c2.9 3.3 5 6.3 5 9.4a5 5 0 0 1-10 0c0-2.2 1-3.9 2.3-5.3.3 1.2.9 2 1.8 2.5.3-2.4.7-4.9.9-6.6Z"
          />
        </svg>
      </span>

      {guide ? (
        <div className="station-epg">
          {icon}
          {/* Two hours of the station's own day, one hour either side of now.
              The hairline at the exact middle is the wall clock; programs wrap
              it, so the one on air always straddles the line. */}
          <div className="epg-lane-wrap">
            <div
              className="epg-lane"
              role="img"
              aria-label={`Guide from ${formatMinutes(guide.startMin)} to ${formatMinutes(guide.endMin)}`}
            >
              {guide.segments.map((segment, segmentIndex) => (
                <span
                  key={`${segment.startMin}-${segmentIndex}`}
                  className={`epg-slot${segment.isCurrent ? ' is-current' : ''}`}
                  style={{
                    left: `${guidePct(segment.startMin)}%`,
                    width: `${guidePct(segment.endMin) - guidePct(segment.startMin)}%`,
                  }}
                  title={`${formatMinutes(segment.startMin)}–${formatMinutes(segment.endMin)} · ${segment.title}`}
                >
                  <span className="epg-slot-title">{segment.title}</span>
                </span>
              ))}
              <span className="epg-now" aria-hidden="true" />
            </div>
            {/* The lane's own hour ruler: the two ends of the window. */}
            <div className="epg-lane-times" aria-hidden="true">
              <span>{formatMinutes(guide.startMin)}</span>
              <span>{formatMinutes(guide.endMin)}</span>
            </div>
          </div>
        </div>
      ) : (
        <>
          <div className="station-body">
            {icon}
            <div className="station-info">
              <div className="station-name-container">
                {headlineKind === 'show' ? (
                  <span className={`station-show-text${currentShow.live ? ' is-live' : ''}`}>
                    {liveIndicator}
                    <MarqueeText className="station-show-mq" text={currentShow.title} />
                  </span>
                ) : headlineKind === 'track' ? (
                  <span className="station-show-text is-track">
                    <span className="station-track-mark" aria-hidden="true">♪</span>
                    <MarqueeText
                      className="station-show-mq"
                      text={nowTitle}
                      title={`Now playing: ${nowTitle}`}
                    />
                  </span>
                ) : (
                  <MarqueeText className="station-name-line" text={station.name || '(unlisted)'} />
                )}
              </div>
              {metaKind && (
                <div className="station-meta-line">
                  {metaKind === 'badge' ? (
                    <span className={`health-badge ${badge.tone}`} title={badge.title}>{badge.label}</span>
                  ) : (
                    <MarqueeText className="station-location-line" text={placeLine} />
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="station-aside">
            {import.meta.env.DEV && onEditStation && (
              <button
                className="station-edit-trigger"
                onClick={(e) => { e.stopPropagation(); onEditStation(station._line) }}
                aria-label={`Edit ${station.name || 'station'} in stations.csv`}
                title="Edit this station's catalog row"
              >
                EDIT
              </button>
            )}
            <button
              className="station-info-btn"
              onClick={(e) => { e.stopPropagation(); onOpenStation(station) }}
              aria-label={`Station info for ${station.name || 'station'}`}
              title="Station info"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <circle cx="12" cy="12" r="9" />
                <line x1="12" y1="11" x2="12" y2="16.5" />
                <circle className="info-btn-dot" cx="12" cy="7.4" r="1.15" />
              </svg>
            </button>
          </div>
        </>
      )}
    </div>
  )
}

export default StationItem
