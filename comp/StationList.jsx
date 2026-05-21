import React from 'react'
import StationItem from './StationItem'

function StationList({ stations, currentStationIndex, onSelectStation, epgData, currentShows, onOpenEpg }) {
  return (
    <div className="station-list">
      {stations.map((station, index) => (
        <StationItem
          key={index}
          station={station}
          index={index}
          isPlaying={currentStationIndex === index}
          onSelect={onSelectStation}
          hasEpg={epgData.has(station.id)}
          currentShow={currentShows.get(station.id) || null}
          onOpenEpg={onOpenEpg}
        />
      ))}
    </div>
  )
}

export default StationList