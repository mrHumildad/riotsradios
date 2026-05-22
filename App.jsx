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

      <header className="chassis-header">
        <a
          className="header-logo-link"
          href="https://github.com/mrhumildad/builtin"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="ONLYPUNKS repository"
        >
          <span className="header-logo" aria-hidden="true" />
        </a>

        <h1 className="header-brand">
          <span className="header-brand-r">R</span>
          <span className="header-brand-i">I</span>
          <span className="header-brand-o">O</span>
          <span className="header-brand-t">T</span>
          <span className="header-brand-s">S</span>
          <span className="header-brand-blink" aria-hidden="true">/</span>
          <span className="header-brand-r2">R</span>
          <span className="header-brand-a">a</span>
          <span className="header-brand-d">d</span>
          <span className="header-brand-i2">I</span>
          <span className="header-brand-o2">O</span>
          <span className="header-brand-s2">S</span>
        </h1>

        <button
          className="header-menu-btn"
          aria-label="Menu"
          type="button"
        >
          <span className="header-menu-icon" aria-hidden="true" />
          <span className="header-menu-icon" aria-hidden="true" />
          <span className="header-menu-icon" aria-hidden="true" />
        </button>
      </header>

      <PlayerDashboard
        audioRef={audioRef}
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