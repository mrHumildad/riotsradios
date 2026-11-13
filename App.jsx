import { useState, useEffect, useCallback, useMemo, useReducer, useRef } from 'react'
import { useRadioLogic } from './logic.js'
import { stations, refreshStations } from './stations.js'
import logoPng from '/logob_transp_ffc107.png'
import PlayerDashboard from './comp/PlayerDashboard.jsx'
import StationList from './comp/StationList.jsx'
import StationEditModal from './comp/StationEditModal.jsx'
import UpdateNotice from './comp/UpdateNotice.jsx'
import { useFavorites } from './comp/useFavorites.js'
import { stationTimeZone } from './lib/stationTime.js'
import { catalogLanguages, languageName } from './lib/stationLanguage.js'
import { isFreshTitle } from './lib/icy.js'
import { version } from './package.json'
import { useMetalSurface } from './comp/useMetalSurface.js'
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
  const { ids: favoriteIds, isFavorite, toggleFavorite } = useFavorites()

  /* Header and footer carry the same metallic finish as the two main plates;
     --metal/--convexity live in styles.css. */
  const headerRef = useRef(null)
  const footerRef = useRef(null)
  useMetalSurface(headerRef)
  useMetalSurface(footerRef)

  /* The station list's view — rows, guide lanes, the merged station feed, or a
     station's own info. It lives here because the button that cycles it is in
     the player's control row, beside the fader, while the list itself renders
     the view. */
  const [listView, setListView] = useState('list')
  const hasGuides = Boolean(epgData?.size)

  /* Station info is one of those views, not an overlay: the info button puts
     the panel into it where the rows were. The station is pinned at the moment
     the panel opens, so a change of the playing station does not swap the
     panel's contents, and the view you came from is kept so ✕/Esc goes back
     there rather than to the rows. */
  const [stationPanelStation, setStationPanelStation] = useState(null)
  const viewBeforeStation = useRef('list')
  /* The panel needs a station to be a mode: the one opened last, or the one
     that is playing. With neither, the mode key simply skips that step. */
  const stationViewTarget = stationPanelStation
    || (currentStationIndex != null ? stations[currentStationIndex] : null)

  const cycleListView = useCallback(() => {
    /* A catalog with no guide skips the lane step rather than showing a view
       that looks exactly like the station rows. */
    const cycle = hasGuides ? ['list', 'epg', 'news'] : ['list', 'news']
    if (stationViewTarget) cycle.push('station')
    setListView((current) => {
      const next = cycle[(cycle.indexOf(current) + 1) % cycle.length]
      if (next === 'station') setStationPanelStation(stationViewTarget)
      return next
    })
  }, [hasGuides, stationViewTarget])

  const openStationPanel = useCallback((station) => {
    if (!station) return
    setStationPanelStation(station)
    setListView((current) => {
      if (current !== 'station') viewBeforeStation.current = current
      return 'station'
    })
  }, [])

  const closeStationPanel = useCallback(() => {
    setStationPanelStation(null)
    setListView(viewBeforeStation.current || 'list')
  }, [])

  /* The language filter used to be a button above the station list. Its key is
     in the control row now, between the fader and the mode key, so the step
     lives here: 0 is every language, 1..n are the catalog's own, browser match
     first. An empty code passed to the list means ALL. */
  /* Languages the loaded station feed actually publishes in, reported up by
     the station list. Null until a feed has loaded. */
  const [feedLanguages, setFeedLanguages] = useState(null)
  const languages = useMemo(() => {
    const nav = typeof navigator === 'undefined' ? null : navigator
    const browserLanguages = nav ? (nav.languages?.length ? nav.languages : [nav.language]) : []
    const all = catalogLanguages(stations, browserLanguages, epgData)
    /* The feed view is built from blog posts, and the catalog carries languages
       no station writes in. While that view is open, cycling through them would
       only reach "No news in this language", so they are dropped here — the row
       and guide views keep every language. Unknown or empty coverage keeps the
       full cycle rather than leaving the key with nothing to step through. */
    if (listView !== 'news' || !feedLanguages) return all
    const withPosts = all.filter((language) => feedLanguages.has(language))
    return withPosts.length ? withPosts : all
  }, [epgData, listView, feedLanguages])
  const [languageStep, setLanguageStep] = useState(0)
  const languageCount = languages.length + 1
  const languageIndex = languageStep % languageCount
  const activeLanguage = languageIndex > 0 ? languages[languageIndex - 1] : ''
  const nextLanguageIndex = (languageIndex + 1) % languageCount
  const nextLanguage = nextLanguageIndex > 0 ? languages[nextLanguageIndex - 1] : ''
  const cycleLanguage = useCallback(() => {
    setLanguageStep((step) => (step + 1) % languageCount)
  }, [languageCount])
  const [brandState, setBrandState] = useState('riots')
  const [brandWord, setBrandWord] = useState('RIOTS')
  const [isMorphing, setIsMorphing] = useState(false)
  const [prefersReduced, setPrefersReduced] = useState(false)
  
  const currentStationObject = currentStationIndex !== null ? stations[currentStationIndex] : null
  const currentShow = currentStationObject ? currentShows.get(currentStationObject.id) || null : null
  /* The guide owns the station's zone; a station without one falls back to the
     zone of the place it broadcasts from. */
  const currentTimeZone = currentStationObject
    ? stationTimeZone(currentStationObject, epgData.get(currentStationObject.id))
    : null

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
    const isInfo  = e => (e.key && e.key.toLowerCase()==='e') || e.keyCode===69 || e.key==='ContextMenu' || e.keyCode===93 || (e.key && e.key.toLowerCase()==='i') || e.keyCode===73 || e.key==='Menu';
    const isMediaPP = e => e.code === 'MediaPlayPause' || e.keyCode === 179;
    const isMediaStop = e => e.code === 'MediaStop' || e.keyCode === 178;

    const h = (e) => {
      if (e.isComposing) return;
      if (listView === 'station') {
        /* The panel's own guide owns the day keys and its schedule owns up/down
           (comp/StationPanel.jsx); here only leaving is decided. */
        if (isEsc(e)) { closeStationPanel(); e.preventDefault(); return; }
        if (isInfo(e)) { closeStationPanel(); e.preventDefault(); }
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
      if (isInfo(e) && currentStationObject) {
        openStationPanel(currentStationObject); e.preventDefault();
      }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [listView, closeStationPanel, openStationPanel, editStation, isCreating, currentStationObject, prevStation, nextStation, volume, changeVolume, togglePlay, isPlaying]);

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

      <header className="chassis-header metal-surface" ref={headerRef}>
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
         codec={currentStationObject?.codec}
         bitrate={currentStationObject?.bitrate}
         timeZone={currentTimeZone}
         countryCode={currentStationObject?.countrycode}
         volume={volume}
         currentShow={currentShow}
         currentTrack={currentTrack}
         stationHasError={stationHasError}
         streamError={streamError}
         onTogglePlay={togglePlay}
         onChangeVolume={changeVolume}
         onPrevStation={prevStation}
         onNextStation={nextStation}
         listView={listView}
         hasGuides={hasGuides}
         onCycleListView={cycleListView}
         language={activeLanguage}
         hasLanguages={languages.length > 0}
         onCycleLanguage={cycleLanguage}
         languageLabel={languageName(activeLanguage)}
         nextLanguageLabel={languageName(nextLanguage)}
         hasStationPanel={Boolean(stationViewTarget)}
       />

      <StationList
        stations={stations}
        currentStationIndex={currentStationIndex}
        isPlaying={isPlaying}
        playbackState={playbackState}
        favoriteIds={favoriteIds}
        onSelectStation={selectStation}
        currentShows={currentShows}
        trackTitles={trackTitles}
        onOpenStation={openStationPanel}
        epgByStation={epgData}
        view={listView}
        activeLanguage={activeLanguage}
        panelStation={stationPanelStation}
        onClosePanel={closeStationPanel}
        isFavorite={isFavorite}
        onToggleFavorite={toggleFavorite}
        getDaySchedule={getDaySchedule}
        onFeedLanguages={setFeedLanguages}
      />

      </div>

      <UpdateNotice />

      <div className="chassis-footer metal-surface" aria-hidden="true" ref={footerRef}>
        <span className="footer-sig footer-logo footer-version">v{version}</span>
        <span>mrhumildad</span>
      </div>

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