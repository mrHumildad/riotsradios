import React from 'react'

function StationItem({ station, index, isPlaying, onSelect }) {
  return (
    <div
      id={`station-${index}`}
      className={`station-item${isPlaying ? ' playing' : ''}`}
      onClick={() => onSelect(index)}
    >
      {/* chiselled channel number */}
      <div className="station-num">{String(index + 1).padStart(2, '0')}</div>

      <div className="station-body">
        {station.icon && (
          <img
            src={station.icon}
            alt=""
            className="station-icon"
            onError={(e) => { e.target.style.display = 'none' }}
          />
        )}
        <div className="station-info">
          <span className="station-name-line">{station.name || '(unlisted)'}</span>
          {station.location && <div className="station-location-line">{station.location}</div>}
        </div>
      </div>

      {/* right side strip: homepage + signal arrow */}
      <div className="station-aside">
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
          {isPlaying ? '▶' : '▷'}
        </div>
      </div>
    </div>
  )
}

export default StationItem