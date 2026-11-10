import React, { useEffect, useMemo, useRef, useState } from 'react'
import StationItem from './StationItem'
import { orderStations } from '../lib/stationOrder.js'
import { catalogLanguages, languageName, stationLanguage } from '../lib/stationLanguage.js'

function StationList({ stations, favoriteIds, currentStationIndex, isPlaying, playbackState, onSelectStation, currentShows, trackTitles, onOpenStation, onEditStation, onAddStation, epgByStation }) {
  const listRef = useRef(null)
  const favoriteSet = useMemo(() => new Set(favoriteIds || []), [favoriteIds])

  /* The LANG toggle steps through ALL and every language the catalog carries,
     starting with the browser's own match. A guide's own `language` counts here
     too — that is how Catalan and Basque stations are told apart. */
  const languages = useMemo(() => {
    const nav = typeof navigator === 'undefined' ? null : navigator
    const browserLanguages = nav ? (nav.languages?.length ? nav.languages : [nav.language]) : []
    return catalogLanguages(stations, browserLanguages, epgByStation)
  }, [stations, epgByStation])
  const [languageStep, setLanguageStep] = useState(0)

  /* EPG mode swaps each guide station's row for a two-hour programme lane.
     The lane is anchored on the wall clock, so it advances on its own timer
     even when no stream title changes. */
  const [epgMode, setEpgMode] = useState(false)
  const hasGuides = Boolean(epgByStation?.size)
  const [epgNow, setEpgNow] = useState(() => new Date())
  const stepCount = languages.length + 1
  const languageIndex = languageStep % stepCount
  const activeLanguage = languageIndex > 0 ? languages[languageIndex - 1] : ''
  const languageFiltered = Boolean(activeLanguage)

  /* Favourites float to the top, newest first; the rest keep catalog order.
     Each row keeps its catalog index, so selection and playback are unaffected.
     The language filter runs on the ordered entries, never on the array handed
     to orderStations, so indexes stay those of the full catalog. */
  const ordered = useMemo(() => {
    const all = orderStations(stations, favoriteIds)
    if (!languageFiltered) return all
    return all.filter(({ station }) =>
      stationLanguage(station, epgByStation?.get?.(station.id)) === activeLanguage)
  }, [stations, favoriteIds, languageFiltered, activeLanguage, epgByStation])

  useEffect(() => {
    if (!epgMode) return undefined
    setEpgNow(new Date())
    const id = setInterval(() => setEpgNow(new Date()), 60000)
    return () => clearInterval(id)
  }, [epgMode])

  /* Guide stations rise to the top; the rest keep their order at the bottom
     and render exactly as they do with the lane off. */
  const displayed = useMemo(() => {
    if (!epgMode) return ordered
    const withGuide = []
    const withoutGuide = []
    for (const entry of ordered) {
      const target = epgByStation?.get?.(entry.station.id) ? withGuide : withoutGuide
      target.push(entry)
    }
    return [...withGuide, ...withoutGuide]
  }, [ordered, epgMode, epgByStation])

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
    /* Re-centre when a favourite moves rows, so the station that is playing
       cannot slide out of view because the list reordered around it. */
  }, [currentStationIndex, displayed])

  return (
    <div className="station-list-wrapper">
      <div className="station-section-label">
        <button
          type="button"
          className={`station-filter-btn${languageFiltered ? ' is-on' : ''}`}
          onClick={() => setLanguageStep(step => (step + 1) % stepCount)}
          disabled={languages.length === 0}
          aria-label={languageFiltered
            ? `Language: ${languageName(activeLanguage)}. Click for the next language.`
            : `Language: all. Click to filter to ${languageName(languages[0])}.`}
          title={languageFiltered
            ? `Showing ${languageName(activeLanguage)} stations — click for the next language`
            : 'Showing all languages — click to filter'}
        >
          <span className="station-filter-key" aria-hidden="true">LANG</span>
          <span className="station-filter-value">
            {languageFiltered ? activeLanguage.toUpperCase() : 'ALL'}
          </span>
        </button>
        <button
          type="button"
          className={`station-filter-btn${epgMode ? ' is-on' : ''}`}
          onClick={() => setEpgMode(on => !on)}
          disabled={!hasGuides}
          aria-pressed={epgMode}
          aria-label={epgMode ? 'EPG lanes on. Click to show the station rows.' : 'EPG lanes off. Click to show the two-hour guide.'}
          title={hasGuides
            ? (epgMode ? 'Showing two-hour guide lanes — click to hide them' : 'Show a two-hour guide lane on stations with an EPG')
            : 'No station in the catalog has a guide yet'}
        >
          EPG
        </button>
        {import.meta.env.DEV && onAddStation && (
          <button
            type="button"
            className="station-add-btn"
            onClick={onAddStation}
            aria-label="Add a station to stations.csv"
            title="Add a station to stations.csv"
          >
            + NEW
          </button>
        )}
      </div>
      <div className="station-list-inner" ref={listRef}>
        {displayed.map(({ station, index }) => (
        <StationItem
          key={station.id ?? index}
          station={station}
          index={index}
          isActive={currentStationIndex === index && isPlaying}
          isSelected={currentStationIndex === index}
          playState={currentStationIndex === index ? playbackState : null}
          isFavorite={favoriteSet.has(station.id)}
          onSelect={onSelectStation}
          currentShow={currentShows.get(station.id) || null}
          nowTitle={trackTitles?.[station.id] || ''}
          onOpenStation={onOpenStation}
          onEditStation={onEditStation}
          epgMode={epgMode}
          epg={epgByStation?.get?.(station.id) || null}
          now={epgNow}
         />
         ))}
        </div>
    </div>
  )
}

export default StationList
