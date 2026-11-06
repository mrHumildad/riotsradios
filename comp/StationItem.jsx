import React, { useState, useEffect } from 'react'
import { healthBadge } from '../lib/health.js'

function StationItem({ station, index, isActive, isSelected, onSelect, currentShow, hasEpg, onOpenEpg, onEditStation }) {
  const [showEpgName, setShowEpgName] = useState(false)
  /* The icon is a remote image. A dead URL hides it, and editing the URL must be
     able to bring it back — so the failure is component state that resets when
     the URL changes, never a style set on the DOM node by the error handler. */
  const [iconFailed, setIconFailed] = useState(false)
  const badge = healthBadge(station.health)

  useEffect(() => {
    setIconFailed(false)
  }, [station.icon])

  useEffect(() => {
    if (!currentShow) {
      setShowEpgName(false)
      return
    }
    setShowEpgName(true)
    const id = setInterval(() => setShowEpgName(v => !v), 3500)
    return () => clearInterval(id)
  }, [currentShow])

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
        {station.icon && !iconFailed && (
          <img
            key={station.icon}
            src={station.icon}
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
            {currentShow && showEpgName ? (
              <span className={`station-show-text${currentShow.live ? ' is-live' : ''}`}>
                {liveIndicator} {currentShow.title}
              </span>
            ) : (
              <span className="station-name-line">{station.name || '(unlisted)'}</span>
            )}
          </div>
          {station.location && <div className="station-location-line">{station.location}</div>}
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
        {station.webpage && (
          <a
            href={station.webpage}
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