import React, { useState, useEffect } from 'react'
import { healthBadge } from '../lib/health.js'
import { stationPlace } from '../lib/stations.js'
import MarqueeText from './MarqueeText'

/* The API metadata a listener can use, on one muted line: country code, codec,
   bitrate and the station's own tags. Every part is optional — a row with bare
   metadata just shows fewer parts, and a row with none shows no line at all. */
function stationMeta(station) {
  const codec = String(station.codec || '').trim()
  const kbps = String(station.bitrate || '').trim()
  /* radio-browser stores tags comma-separated without spaces. */
  const tags = String(station.tags || '').replace(/\s*,\s*/g, ', ').trim()
  return [station.countrycode, codec, kbps && `${kbps} kbps`, tags]
    .map((part) => String(part || '').trim())
    .filter(Boolean)
    .join(' · ')
}

function StationItem({ station, index, isActive, isSelected, onSelect, currentShow, nowTitle, hasEpg, onOpenEpg, onEditStation }) {
  const [cycleStep, setCycleStep] = useState(0)
  /* The icon is a remote image. A dead URL hides it, and editing the URL must be
     able to bring it back — so the failure is component state that resets when
     the URL changes, never a style set on the DOM node by the error handler. */
  const [iconFailed, setIconFailed] = useState(false)
  const badge = healthBadge(station.health)
  const place = stationPlace(station)
  const meta = stationMeta(station)

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
      className={`station-item${isActive ? ' playing' : ''}${isSelected && !isActive ? ' selected' : ''}`}
      onClick={() => onSelect(index)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
          e.preventDefault()
          onSelect(index)
        }
      }}
    >
      <div className="station-num">{String(index + 1).padStart(2, '0')}</div>

      <div className="station-body">
        {station.favicon && !iconFailed && (
          <img
            key={station.favicon}
            src={station.favicon}
            alt=""
            width="34"
            height="34"
            loading="lazy"
            decoding="async"
            referrerPolicy="no-referrer"
            className="station-icon"
            onError={() => setIconFailed(true)}
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
          {place && <MarqueeText className="station-location-line" text={place} />}
          {meta && <MarqueeText className="station-meta-line" text={meta} title={meta} />}
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
        {hasEpg && (
          <button
            className="epg-badge-btn"
            onClick={(e) => { e.stopPropagation(); onOpenEpg(station) }}
            aria-label={`Open EPG for ${station.name}`}
          >
            EPG
          </button>
        )}
        {station.homepage && (
          <a
            href={station.homepage}
            target="_blank"
            rel="noopener noreferrer"
            className="homepage-btn"
            onClick={(e) => e.stopPropagation()}
          >
            WEB
          </a>
        )}
        <div className="play-ind" aria-hidden="true">
          {isActive ? '▶' : isSelected ? '■' : '▷'}
        </div>
      </div>
    </div>
  )
}

export default StationItem