import { useState, useEffect } from 'react'
import { useRadioLogic } from './logic.js'
import { stations } from './stations.js'
import logoPng from '/logob_transp_ffc107.png'
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
      : `${stations[currentStationIndex]?.name || 'Unknown'}`;

  const modalEpg = epgModalStation ? epgData.get(epgModalStation.id) : null

  useEffect(() => {
    const isLeft  = e => ['ArrowLeft','Left'].includes(e.key) || e.keyCode === 37;
    const isRight = e => ['ArrowRight','Right'].includes(e.key) || e.keyCode === 39;
    const isUp    = e => ['ArrowUp','Up'].includes(e.key) || e.keyCode === 38;
    const isDown  = e => ['ArrowDown','Down'].includes(e.key) || e.keyCode === 40;
    const isEnter = e => ['Enter','NumpadEnter'].includes(e.key) || e.keyCode === 13;
    const isEsc   = e => ['Escape','Esc','Backspace'].includes(e.key) || [27,8].includes(e.keyCode);
    const isEPG   = e => (e.key && e.key.toLowerCase()==='e') || e.keyCode===69 || e.key==='ContextMenu' || e.keyCode===93 || (e.key && e.key.toLowerCase()==='i') || e.keyCode===73 || e.key==='Menu';
    const isMediaPP = e => e.code === 'MediaPlayPause' || e.keyCode === 179;
    const isMediaStop = e => e.code === 'MediaStop' || e.keyCode === 178;

    const h = (e) => {
      if (e.isComposing) return;
      const hasModal = !!epgModalStation;
      if (hasModal) {
        if (isEsc(e)) { setEpgModalStation(null); e.preventDefault(); }
        return;
      }
      if (isLeft(e)) { prevStation(); e.preventDefault(); return; }
      if (isRight(e)) { nextStation(); e.preventDefault(); return; }
      if (isUp(e)) { changeVolume(Math.min(1, volume+0.05)); e.preventDefault(); return; }
      if (isDown(e)) { changeVolume(Math.max(0, volume-0.05)); e.preventDefault(); return; }
      if (isEnter(e) || isMediaPP(e)) { togglePlay(); e.preventDefault(); return; }
      if (isMediaStop(e) && isPlaying) { togglePlay(); e.preventDefault(); return; }
      if (isEPG(e) && currentStationObject && epgData.has(currentStationObject.id)) {
        setEpgModalStation(currentStationObject); e.preventDefault();
      }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [epgModalStation, currentStationObject, epgData, prevStation, nextStation, volume, changeVolume, togglePlay, isPlaying, setEpgModalStation]);

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
          <img className="header-logo" src={logoPng} alt="" />
        </a>

        <h1 className="header-brand" data-text="RIOTSRadIOS">
          <span className="header-brand-r">R</span>
          <span className="header-brand-i">I</span>
          <span className="header-brand-o">O</span>
          <span className="header-brand-t">T</span>
          <span className="header-brand-s">S</span>
          <span className="header-brand-6">R</span>
          <span className="header-brand-a">A</span>
          <span className="header-brand-d">D</span>
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