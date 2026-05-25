import React from 'react'
import StationItem from './StationItem'

function StationList({ stations, currentStationIndex, isPlaying, onSelectStation, epgData, currentShows, onOpenEpg }) {
  return (
    <div className="station-list-wrapper">
      <div className="station-section-label">CHANNELS</div>
      <div className="station-list-inner">
        {stations.map((station, index) => (
        <StationItem
          key={index}
          station={station}
          index={index}
          isActive={currentStationIndex === index && isPlaying}
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