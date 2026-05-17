import React from 'react'
import StationItem from './StationItem'
function StationList({ stations, currentStationIndex, onSelectStation }) {
  return (
    <div className="station-list">
      {stations.map((station, index) => (
        <StationItem
          key={index}
          station={station}
          index={index}
          isPlaying={currentStationIndex === index}
          onSelect={onSelectStation}
        />
      ))}
    </div>
  )
}

export default StationList