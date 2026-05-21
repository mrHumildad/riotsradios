import { useState } from 'react'
import { useRadioLogic } from './logic.js'
import { stations } from './stations.js'
import PlayerDashboard from './comp/PlayerDashboard.jsx'
import StationList from './comp/StationList.jsx'
import EPGModal from './comp/EPGModal.jsx'

function App() {
  const {
    audioRef,
    currentStationIndex,
    isPlaying,
    volume,
    stationHasError,
    epgData,
    currentShows,
    getDaySchedule,
    selectStation,
    togglePlay,
    changeVolume,
    nextStation,
    prevStation
  } = useRadioLogic();

  const [epgModalStation, setEpgModalStation] = useState(null)

  const currentStationObject = currentStationIndex !== null ? stations[currentStationIndex] : null
  const currentShow = currentStationObject ? currentShows.get(currentStationObject.id) || null : null

  const currentStationName = currentStationIndex === null
    ? '-'
    : stationHasError
      ? stations[currentStationIndex]?.name || 'Unknown'
      : `Playing: ${stations[currentStationIndex]?.name || 'Unknown'}`;

  const modalEpg = epgModalStation ? epgData.get(epgModalStation.id) : null

  return (
    <div className="container">

      <div className="chassis-header">
        <span className="header-model">ONLYPUNKS Radio</span>
        <span className="header-spacer" aria-hidden="true" />
      </div>

      <PlayerDashboard
        currentStationName={currentStationName}
        currentStationIndex={currentStationIndex}
        isPlaying={isPlaying}
        volume={volume}
        currentShow={currentShow}
        onTogglePlay={togglePlay}
        onChangeVolume={changeVolume}
        onPrevStation={prevStation}
        onNextStation={nextStation}
      />

      <StationList
        stations={stations}
        currentStationIndex={currentStationIndex}
        onSelectStation={selectStation}
        epgData={epgData}
        currentShows={currentShows}
        onOpenEpg={setEpgModalStation}
      />

      <div className="chassis-footer" aria-hidden="true">
        <span className="footer-sig footer-logo">OPR</span>
        <span>2026@mrhumildad</span>
        <span>CH&nbsp;{currentStationIndex !== null ? String(currentStationIndex + 1).padStart(2,'0') : '--'}</span>
      </div>

      {epgModalStation && (
        <EPGModal
          station={epgModalStation}
          epg={modalEpg}
          getDaySchedule={getDaySchedule}
          onClose={() => setEpgModalStation(null)}
        />
      )}

    </div>
  )
}

export default App