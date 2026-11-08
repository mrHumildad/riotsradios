import { useState, useEffect, useCallback, useMemo, useReducer } from 'react'
import { useRadioLogic } from './logic.js'
import { stations, refreshStations } from './stations.js'
import logoPng from '/logob_transp_ffc107.png'
import PlayerDashboard from './comp/PlayerDashboard.jsx'
import StationList from './comp/StationList.jsx'
import EPGModal from './comp/EPGModal.jsx'
import StationEditModal from './comp/StationEditModal.jsx'
import { isFreshTitle } from './lib/icy.js'
import { version } from './package.json'
function App() {
const {
    spectrumRef,
    canAnalyze,
    currentStationIndex,
    playbackState,
    isPlaying,
    volume,
    stationHasError,
    streamError,
    epgData,
    nowPlaying,
    currentShows,
    getDaySchedule,
    selectStation,
    togglePlay,
    changeVolume,
    nextStation,
    prevStation
  } = useRadioLogic();
  const [epgModalStation, setEpgModalStation] = useState(null)
  const [brandState, setBrandState] = useState('riots')
  const [brandWord, setBrandWord] = useState('RIOTS')
  const [isMorphing, setIsMorphing] = useState(false)
  const [prefersReduced, setPrefersReduced] = useState(false)
  
  const currentStationObject = currentStationIndex !== null ? stations[currentStationIndex] : null
  const currentShow = currentStationObject ? currentShows.get(currentStationObject.id) || null : null

  /* Stream titles go stale: a station whose reader stopped answering is shown
     without a track rather than with the last one it ever played. */
  const trackTitles = useMemo(() => {
    const out = {}
    nowPlaying.forEach((entry, id) => {
      if (isFreshTitle(entry)) out[id] = entry.title
    })
    return out
  }, [nowPlaying])
  const currentTrack = currentStationObject ? trackTitles[currentStationObject.id] || '' : ''

  const currentStationName = currentStationIndex === null
    ? '-'
    : stationHasError
      ? stations[currentStationIndex]?.name || 'Unknown'
      : `${stations[currentStationIndex]?.name || 'Unknown'}`;

  const modalEpg = epgModalStation ? epgData.get(epgModalStation.id) : null

  /* Development-only catalog editor. The station is looked up by its CSV line
     so the modal keeps following the row after the list is refreshed. */
  const [editStationLine, setEditStationLine] = useState(null)
  const [isCreating, setIsCreating] = useState(false)
  const [, refreshCatalogView] = useReducer((tick) => tick + 1, 0)
  const editStation = editStationLine == null
    ? null
    : stations.find((station) => station._line === editStationLine) || null
  const nextFreeId = stations.reduce((max, station) => {
    const id = Number(station.id)
    return Number.isInteger(id) && id > max ? id : max
  }, 0) + 1

  const openEditor = useCallback((line) => {
    setIsCreating(false)
    setEditStationLine(line)
  }, [])

  const openCreator = useCallback(() => {
    setEditStationLine(null)
    setIsCreating(true)
  }, [])

  const closeEditor = useCallback(() => {
    setIsCreating(false)
    setEditStationLine(null)
  }, [])

  const handleStationSaved = useCallback(async (data) => {
    await refreshStations()
    if (data?.created) {
      setIsCreating(false)
      setEditStationLine(data.row.line)
    }
    refreshCatalogView()
  }, [])

  const handleStationDeleted = useCallback(async () => {
    setIsCreating(false)
    setEditStationLine(null)
    await refreshStations()
    refreshCatalogView()
  }, [])

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
      if (epgModalStation) {
        if (isEsc(e)) { setEpgModalStation(null); e.preventDefault(); }
        return;
      }
      /* The station editor owns the keyboard while it is open; playback
         shortcuts must not fire behind its modal. */
      if (editStation || isCreating) return;
      /* Never hijack keys from a focused control (slider, link, row button). */
      const target = e.target
      if (target instanceof Element && target.closest('input, textarea, select, a, button, [role="button"], [contenteditable="true"]')) return
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
  }, [epgModalStation, editStation, isCreating, currentStationObject, epgData, prevStation, nextStation, volume, changeVolume, togglePlay, isPlaying, setEpgModalStation]);

  useEffect(() => {
    const m = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = (e) => setPrefersReduced(e.matches);
    setPrefersReduced(m.matches);
    m.addEventListener('change', onChange);
    return () => m.removeEventListener('change', onChange);
  }, []);

  useEffect(() => {
    if (prefersReduced) return;
    let timer;
    let phase = 0;
    const timings = [4500, 1100, 4500, 1100];
    const step = () => {
      if (phase === 0) {
        setBrandState('riots');
        setBrandWord('RIOTS');
      } else if (phase === 1) {
        setBrandState('radios');
        setBrandWord('RADIOS');
        setIsMorphing(true);
        setTimeout(() => setIsMorphing(false), 650);
      } else if (phase === 2) {
        setBrandState('radios');
        setBrandWord('RADIOS');
      } else if (phase === 3) {
        setBrandState('riots');
        setBrandWord('RIOTS');
        setIsMorphing(true);
        setTimeout(() => setIsMorphing(false), 650);
      }
      const delay = timings[phase];
      timer = setTimeout(() => {
        phase = (phase + 1) % 4;
        step();
      }, delay);
    };
    step();
    return () => { clearTimeout(timer); };
  }, [prefersReduced]);

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

        <h1 className={`header-brand ${brandState}${prefersReduced ? ' reduced-motion' : ''}${isMorphing ? ' is-morphing' : ''}`} data-text={brandWord} aria-label="RIOTSRADIOS">
          <span className="visually-hidden">{brandWord}</span>
          {prefersReduced ? (
            <>
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
            </>
          ) : (
            <>
              <span className="header-brand-r">R</span>
              <span className="ad-cluster">
                <span className="header-brand-a">A</span>
                <span className="header-brand-d">D</span>
              </span>
              <span className="header-brand-i">I</span>
              <span className="header-brand-o">O</span>
              <span className="header-brand-t">T</span>
              <span className="header-brand-s">S</span>
            </>
          )}
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

<div className="main-columns">

      <PlayerDashboard
         spectrumRef={spectrumRef}
         canAnalyze={canAnalyze}
         currentStationName={currentStationName}
         currentStationIndex={currentStationIndex}
         playbackState={playbackState}
         volume={volume}
         currentShow={currentShow}
         currentTrack={currentTrack}
         stationHasError={stationHasError}
         streamError={streamError}
         onTogglePlay={togglePlay}
         onChangeVolume={changeVolume}
         onPrevStation={prevStation}
         onNextStation={nextStation}
       />

      <StationList
        stations={stations}
        currentStationIndex={currentStationIndex}
        isPlaying={isPlaying}
        onSelectStation={selectStation}
        epgData={epgData}
        currentShows={currentShows}
        trackTitles={trackTitles}
        onOpenEpg={setEpgModalStation}
        onEditStation={openEditor}
        onAddStation={openCreator}
      />

      </div>

      <div className="chassis-footer" aria-hidden="true">
        <span className="footer-sig footer-logo footer-version">v{version}</span>
        <span>mrhumildad</span>
      </div>

      {epgModalStation && (
        <EPGModal
          station={epgModalStation}
          epg={modalEpg}
          getDaySchedule={getDaySchedule}
          onClose={() => setEpgModalStation(null)}
        />
      )}

      {/* Development-only catalog editor; dropped from production builds. */}
      {import.meta.env.DEV && (isCreating || editStation) && (
        <StationEditModal
          station={isCreating ? null : editStation}
          nextId={nextFreeId}
          onClose={closeEditor}
          onSaved={handleStationSaved}
          onDeleted={handleStationDeleted}
        />
      )}

    </div>
  )
}

export default App