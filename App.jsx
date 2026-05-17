import { useRadioLogic } from './logic.js'
import { stations } from './stations.js'
import PlayerDashboard from './comp/PlayerDashboard.jsx'
import StationItem from './comp/StationItem.jsx'
import StationList from './comp/StationList.jsx'

function App() {
  const {
    audioRef,
    currentStationIndex,
    currentStationName,
    isPlaying,
    volume,
    selectStation,
    togglePlay,
    stopRadio,
    changeVolume
  } = useRadioLogic();

  return (
    <div className="container">

      {/* ── Chassis header strip ──────────────────────── */}
      <div className="chassis-header">
        <span className="header-model">ONLYPUNKS Radio</span>
 
        <span className="header-spacer" aria-hidden="true" />
      </div>
     

      <PlayerDashboard
        currentStationName={currentStationName}
        isPlaying={isPlaying}
        volume={volume}
        onTogglePlay={togglePlay}
        onStopRadio={stopRadio}
        onChangeVolume={changeVolume}
      />

      <StationList
        stations={stations}
        currentStationIndex={currentStationIndex}
        onSelectStation={selectStation}
      />

      {/* ── chassis status footer ─────────────────────── */}
      <div className="chassis-footer" aria-hidden="true">
        <span className="footer-sig footer-logo">OPR</span>
        <span>2026@mrhumildad</span>
        <span>CH&nbsp;{currentStationIndex !== null ? String(currentStationIndex + 1).padStart(2,'0') : '--'}</span>
      </div>

    </div>
  )
}

export default App