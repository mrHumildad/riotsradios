import React, { useEffect, useMemo, useRef, useState } from 'react'
import StationItem from './StationItem'
import StationPanel from './StationPanel'
import { useMetalSurface } from './useMetalSurface.js'
import { orderStations } from '../lib/stationOrder.js'
import { stationLanguage } from '../lib/stationLanguage.js'
import { loadLatestPosts } from '../lib/stationFeeds.js'
import { stationPlace } from '../lib/stations.js'
import fallbackIcon from '/logob_transp_ffc107.png'

/* Short date for a feed row; a post without a readable date shows none. */
function postDate(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' })
}

/* The feed's station mark: the station row's own icon, same classes and size. */
function FeedIcon({ src, label }) {
  const [failed, setFailed] = useState(false)
  useEffect(() => setFailed(false), [src])
  const usable = Boolean(src) && !failed
  return (
    <img
      src={usable ? src : fallbackIcon}
      alt=""
      title={label || ''}
      width="48"
      height="48"
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      className={`station-icon${usable ? '' : ' is-default'}`}
      onError={() => setFailed(true)}
    />
  )
}

function StationList({ stations, favoriteIds, currentStationIndex, isPlaying, playbackState, onSelectStation, currentShows, trackTitles, onOpenStation, epgByStation, view, activeLanguage, panelStation, onClosePanel, isFavorite, onToggleFavorite, getDaySchedule, onFeedLanguages }) {
  const listRef = useRef(null)
  /* The list plate is the second metallic surface; --metal/--convexity in CSS. */
  const plateRef = useRef(null)
  useMetalSurface(plateRef)
  const favoriteSet = useMemo(() => new Set(favoriteIds || []), [favoriteIds])

  /* The language filter is stepped by the LANG key in the player's control row,
     so App owns it and hands the active code down; empty means ALL. A guide's
     own `language` counts here too — that is how Catalan and Basque stations
     are told apart. */

  /* The view is owned by App — the mode button that cycles it sits in the
     player's control row. The lane is anchored on the wall clock, so it
     advances on its own timer even when no stream title changes. */
  const epgMode = view === 'epg'
  const readerMode = view === 'news'
  /* Station info is a view of this panel too, so it renders in the list's own
     place and takes the same plate-and-shutter entrance as the other modes. */
  const stationMode = view === 'station' && Boolean(panelStation)
  const [epgNow, setEpgNow] = useState(() => new Date())

  /* Reader mode: the newest posts from every station feed, capped at 100. It is
     loaded only while the feed is on screen and follows the LANG filter. A
     loaded feed is kept for the session, so toggling reader mode back on shows
     the same posts instead of downloading every station feed again; a failed
     load is not kept, so re-entering retries it. */
  const [feed, setFeed] = useState({ status: 'idle', posts: [] })
  const feedCacheRef = useRef(null)
  const stationById = useMemo(() => {
    const map = new Map()
    for (const station of stations) map.set(String(station.id), station)
    return map
  }, [stations])
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

  useEffect(() => {
    if (!readerMode) return undefined
    if (feedCacheRef.current) {
      setFeed(feedCacheRef.current)
      return undefined
    }
    let disposed = false
    setFeed({ status: 'loading', posts: [] })
    loadLatestPosts({ limit: 100 })
      .then((posts) => {
        const next = { status: posts.length > 0 ? 'ready' : 'empty', posts }
        /* Keep the result even if reader mode was closed mid-load, so the next
           visit starts from it rather than a second round of feed requests. */
        feedCacheRef.current = next
        if (!disposed) setFeed(next)
      })
      .catch(() => {
        if (!disposed) setFeed({ status: 'error', posts: [] })
      })
    return () => { disposed = true }
  }, [readerMode])

  /* A post's station decides its language, so LANG filters the feed the same
     way it filters the rows. */
  const feedPosts = useMemo(() => {
    if (!languageFiltered) return feed.posts
    return feed.posts.filter((post) => {
      const station = stationById.get(String(post.station_id))
      if (!station) return false
      return stationLanguage(station, epgByStation?.get?.(station.id)) === activeLanguage
    })
  }, [feed.posts, languageFiltered, activeLanguage, stationById, epgByStation])

  /* Every language the loaded feed publishes in, ignoring the active filter:
     App drops the rest from the LANG cycle while this view is open. */
  const feedLanguages = useMemo(() => {
    const codes = new Set()
    for (const post of feed.posts) {
      const station = stationById.get(String(post.station_id))
      if (!station) continue
      const code = stationLanguage(station, epgByStation?.get?.(station.id))
      if (code) codes.add(code)
    }
    return codes
  }, [feed.posts, stationById, epgByStation])

  useEffect(() => {
    onFeedLanguages?.(feedLanguages)
  }, [feedLanguages, onFeedLanguages])

  useEffect(() => {
    if (readerMode) listRef.current?.scrollTo({ top: 0 })
  }, [readerMode])

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
    <div className="station-list-wrapper metal-surface" ref={plateRef}>
      {/* The list carries no header of its own: the language and mode keys both
          live in the player's control row. */}
      {/* `data-view` selects the entrance animation, so a mode change is seen
          as well as read: the CSS restarts it because the animation-name
          changes with the view. */}
      {/* Keyed on the view so the steel sweep is rebuilt for every change and
          always plays; it clears itself when the animation ends. */}
      <span
        key={view || 'list'}
        className={`list-shift${view === 'epg' ? ' list-shift-guide' : view === 'news' ? ' list-shift-feed' : view === 'station' ? ' list-shift-panel' : ''}`}
        aria-hidden="true"
      />
      <div
        className={`station-list-inner${readerMode ? ' station-news' : ''}`}
        data-view={view || 'list'}
        ref={listRef}
      >
        {stationMode ? (
          <StationPanel
            station={panelStation}
            epg={epgByStation?.get?.(panelStation.id) || null}
            getDaySchedule={getDaySchedule}
            onClose={onClosePanel}
          />
        ) : readerMode ? (
          <>
            {feed.status === 'loading' && (
              <div className="epg-no-data">Loading news…</div>
            )}
            {feed.status === 'error' && (
              <div className="epg-no-data">News feed unavailable</div>
            )}
            {feed.status === 'empty' && (
              <div className="epg-no-data">No news yet</div>
            )}
            {feed.status === 'ready' && feedPosts.length === 0 && (
              <div className="epg-no-data">No news in this language</div>
            )}
            {feedPosts.map((post) => {
              const date = postDate(post.date_published)
              const station = stationById.get(String(post.station_id))
              const stationName = post.station_name || station?.name || ''
              const city = station ? stationPlace(station) : ''
              return (
                <a
                  key={post.id || post.url}
                  className="station-news-post station-news-post-icon"
                  href={post.url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <FeedIcon
                    src={station?.favicon || ''}
                    label={stationName}
                  />
                  <span className="station-news-body">
                    {(stationName || city || date) && (
                      <div className="station-news-meta">
                        {stationName && <span className="station-news-station">{stationName}</span>}
                        {city && <span className="station-news-city">{city}</span>}
                        {date && <span className="station-news-date">{date}</span>}
                      </div>
                    )}
                    <div className="station-news-title">{post.title}</div>
                    {post.summary && <div className="station-news-summary">{post.summary}</div>}
                  </span>
                </a>
              )
            })}
          </>
        ) : displayed.map(({ station, index }) => (
        <StationItem
          key={station.id ?? index}
          station={station}
          index={index}
          isActive={currentStationIndex === index && isPlaying}
          isSelected={currentStationIndex === index}
          playState={currentStationIndex === index ? playbackState : null}
          isFavorite={favoriteSet.has(station.id)}
          onToggleFavorite={onToggleFavorite}
          onSelect={onSelectStation}
          currentShow={currentShows.get(station.id) || null}
          nowTitle={trackTitles?.[station.id] || ''}
          onOpenStation={onOpenStation}
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
