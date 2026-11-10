import React, { useState, useEffect } from 'react'
import { healthBadge } from '../lib/health.js'
import { stationPlace } from '../lib/stations.js'
import MarqueeText from './MarqueeText'
/* Brand mark shown when a station has no artwork or its icon URL is dead. */
import fallbackIcon from '/logob_transp_ffc107.png'

function StationItem({ station, index, isActive, isSelected, playState, isFavorite, onSelect, currentShow, nowTitle, onOpenStation, onEditStation }) {
  const [cycleStep, setCycleStep] = useState(0)
  /* The icon is a remote image. A dead URL hides it, and editing the URL must be
     able to bring it back — so the failure is component state that resets when
     the URL changes, never a style set on the DOM node by the error handler. */
  const [iconFailed, setIconFailed] = useState(false)
  const badge = healthBadge(station.health)
  const place = stationPlace(station)
  /* Second line: the catalog's free-text place (city, province for most rows)
     with the country code in brackets after it. */
  const countryCode = String(station.countrycode || '').trim()
  const placeLine = place && countryCode ? `${place} (${countryCode})` : place
  /* The row the player owns also reports what the stream is doing: stopped is
     left to the plain red selected style, error and loading get their own
     blinking marker. A stalled stream is a failure, so it blinks like an
     error. */
  const playStateClass = isSelected && playState && playState !== 'playing'
    ? ` is-${playState === 'stalled' ? 'error' : playState}`
    : ''

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

  const liveIndicator = currentShow?.live
    ? <span className="epg-live-dot" />
    : <span className="epg-off-dot" />

  return (
    <div
      id={`station-${index}`}
      role="button"
      tabIndex={0}
      aria-label={`${station.name || '(unlisted)'}${isActive ? ', playing' : ''}`}
      className={`station-item${isActive ? ' playing' : ''}${isSelected && !isActive ? ' selected' : ''}${playStateClass}`}
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

      <div className="station-body">
        {station.favicon && !iconFailed ? (
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
        )}
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
          {placeLine && <MarqueeText className="station-location-line" text={placeLine} />}
          {badge && badge.tone !== 'ok' && (
            <span className={`health-badge ${badge.tone}`} title={badge.title}>{badge.label}</span>
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
    </div>
  )
}

export default StationItem