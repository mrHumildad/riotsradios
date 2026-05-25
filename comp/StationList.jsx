import React, { useEffect, useRef } from 'react'
import StationItem from './StationItem'

function StationList({ stations, currentStationIndex, isPlaying, onSelectStation, epgData, currentShows, onOpenEpg }) {
  const listRef = useRef(null)

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
  }, [currentStationIndex])

  return (
    <div className="station-list-wrapper">
      <div className="station-section-label">CHANNELS</div>
      <div className="station-list-inner" ref={listRef}>
        {stations.map((station, index) => (
        <StationItem
          key={index}
          station={station}
          index={index}
          isActive={currentStationIndex === index && isPlaying}
          isSelected={currentStationIndex === index}
          onSelect={onSelectStation}
          hasEpg={epgData.has(station.id)}
          currentShow={currentShows.get(station.id) || null}
          onOpenEpg={onOpenEpg}
         />
         ))}
        </div>
    </div>
  )
}

export default StationList