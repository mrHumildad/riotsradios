import React, { useEffect, useMemo, useRef } from 'react'
import StationItem from './StationItem'
import { orderStations } from '../lib/stationOrder.js'

function StationList({ stations, favoriteIds, currentStationIndex, isPlaying, playbackState, onSelectStation, currentShows, trackTitles, onOpenStation, onEditStation, onAddStation }) {
  const listRef = useRef(null)
  const favoriteSet = useMemo(() => new Set(favoriteIds || []), [favoriteIds])
  /* Favourites float to the top, newest first; the rest keep catalog order.
     Each row keeps its catalog index, so selection and playback are unaffected. */
  const ordered = useMemo(() => orderStations(stations, favoriteIds), [stations, favoriteIds])

  useEffect(() => {
    if (currentStationIndex == null) return
    const container = listRef.current
    if (!container) return
    const itemEl = container.querySelector(`#station-${currentStationIndex}`)
    if (itemEl) {
      // Use live rects + scrollBy delta for accurate centering
      // with variable-height items (names vs long EPG titles)
      const itemRect = itemEl.getBoundingClientRect()
      const contRect = container.getBoundingClientRect()
      const delta = (itemRect.top + itemRect.height / 2) - (contRect.top + contRect.height / 2)
      container.scrollBy({ top: delta, behavior: 'smooth' })
    }
    /* Re-centre when a favourite moves rows, so the station that is playing
       cannot slide out of view because the list reordered around it. */
  }, [currentStationIndex, ordered])

  return (
    <div className="station-list-wrapper">
      <div className="station-section-label">
        <span>CHANNELS</span>
        {import.meta.env.DEV && onAddStation && (
          <button
            type="button"
            className="station-add-btn"
            onClick={onAddStation}
            aria-label="Add a station to stations.csv"
            title="Add a station to stations.csv"
          >
            + NEW
          </button>
        )}
      </div>
      <div className="station-list-inner" ref={listRef}>
        {ordered.map(({ station, index }) => (
        <StationItem
          key={station.id ?? index}
          station={station}
          index={index}
          isActive={currentStationIndex === index && isPlaying}
          isSelected={currentStationIndex === index}
          playState={currentStationIndex === index ? playbackState : null}
          isFavorite={favoriteSet.has(station.id)}
          onSelect={onSelectStation}
          currentShow={currentShows.get(station.id) || null}
          nowTitle={trackTitles?.[station.id] || ''}
          onOpenStation={onOpenStation}
          onEditStation={onEditStation}
         />
         ))}
        </div>
    </div>
  )
}

export default StationList
