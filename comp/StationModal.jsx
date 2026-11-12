import React, { useState, useRef, useEffect, useCallback } from 'react'
import MarqueeText from './MarqueeText'
import { loadStationPosts } from '../lib/stationFeeds.js'

/* A published post's date, short enough for the log row; a post without a
   readable date simply shows none. */
function postDate(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' })
}

/* The station modal: the homepage link on top, then what is on air from the
   station's guide. The NEWS button swaps the guide for the station's own log of
   published posts. One info button per row opens it, and that button exists for
   every station, so a station without an EPG still gets header and website. */
function StationModal({ station, epg, getDaySchedule, onClose, isFavorite, onToggleFavorite }) {
  const [dayOffset, setDayOffset] = useState(0)
  const [view, setView] = useState('epg')
  const [news, setNews] = useState({ status: 'idle', posts: [] })
  const scheduleRef = useRef(null)

  const categories = epg?.metadata?.categories || {}
  const daySchedule = epg ? getDaySchedule(station.id, dayOffset) : null

  const goPrevDay = useCallback(() => setDayOffset(d => d - 1), [])
  const goNextDay = useCallback(() => setDayOffset(d => d + 1), [])
  const goToday = useCallback(() => setDayOffset(0), [])

  const canGoPrev = epg ? getDaySchedule(station.id, dayOffset - 1) !== null : false
  const canGoNext = epg ? getDaySchedule(station.id, dayOffset + 1) !== null : false

  /* The log is fetched when the button is first used, not with the guide, so a
     station that is only opened for its schedule costs no feed request. */
  useEffect(() => {
    if (view !== 'news') return
    let disposed = false
    setNews({ status: 'loading', posts: [] })
    loadStationPosts(station.id)
      .then((posts) => {
        if (disposed) return
        setNews({ status: posts.length > 0 ? 'ready' : 'empty', posts })
      })
      .catch(() => {
        if (!disposed) setNews({ status: 'error', posts: [] })
      })
    return () => { disposed = true }
  }, [view, station.id])

  useEffect(() => {
    const isLeft  = e => ['ArrowLeft','Left'].includes(e.key) || e.keyCode === 37;
    const isRight = e => ['ArrowRight','Right'].includes(e.key) || e.keyCode === 39;
    const isUp    = e => ['ArrowUp','Up'].includes(e.key) || e.keyCode === 38;
    const isDown  = e => ['ArrowDown','Down'].includes(e.key) || e.keyCode === 40;
    const isEsc   = e => ['Escape','Esc','Backspace'].includes(e.key) || [27,8].includes(e.keyCode);
    const h = (e) => {
      if (e.isComposing) return;
      if (isEsc(e)) { onClose(); e.preventDefault(); return; }
      if (view === 'epg' && isLeft(e) && canGoPrev) { goPrevDay(); e.preventDefault(); return; }
      if (view === 'epg' && isRight(e) && canGoNext) { goNextDay(); e.preventDefault(); return; }
      if (isUp(e)) { scheduleRef.current?.scrollBy({top: -120, behavior: 'smooth'}); e.preventDefault(); return; }
      if (isDown(e)) { scheduleRef.current?.scrollBy({top: 120, behavior: 'smooth'}); e.preventDefault(); return; }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose, view, canGoPrev, canGoNext, goPrevDay, goNextDay]);

  return (
    <div className="station-modal-overlay" onClick={onClose}>
      <div
        className="station-modal"
        role="dialog"
        aria-modal="true"
        aria-label={`${station.name} station info`}
        onClick={e => e.stopPropagation()}
      >
        <div className="station-modal-header">
          <div className="station-modal-station">
            {station.favicon && (
              <img src={station.favicon} alt="" className="station-modal-icon" />
            )}
            <span className="station-modal-name">{station.name}</span>
          </div>
          <div className="station-modal-actions">
            <button
              type="button"
              className={`station-modal-news${view === 'news' ? ' is-active' : ''}`}
              onClick={() => setView(v => (v === 'news' ? 'epg' : 'news'))}
              aria-pressed={view === 'news'}
              aria-label={view === 'news' ? 'Show programme guide' : 'Show news log'}
              title={view === 'news' ? 'Programme guide' : 'News log'}
            >
              NEWS
            </button>
            <button
              type="button"
              className={`station-modal-fav${isFavorite ? ' is-fav' : ''}`}
              onClick={onToggleFavorite}
              aria-pressed={isFavorite}
              aria-label={isFavorite ? 'Remove from favourites' : 'Add to favourites'}
              title={isFavorite ? 'Favourite' : 'Not a favourite'}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <path
                  className="flame-body"
                  d="M12 2.5c2.9 3.3 5 6.3 5 9.4a5 5 0 0 1-10 0c0-2.2 1-3.9 2.3-5.3.3 1.2.9 2 1.8 2.5.3-2.4.7-4.9.9-6.6Z"
                />
              </svg>
            </button>
            {station.homepage && (
              <a
                className="station-modal-home-btn"
                href={station.homepage}
                target="_blank"
                rel="noopener noreferrer"
                onClick={e => e.stopPropagation()}
                aria-label={`Open ${station.name || 'station'} website`}
                title="Open website"
              >
                <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                  <path d="M3.5 10.8 12 4l8.5 6.8" />
                  <path d="M6 9.6V20h12V9.6" />
                  <path d="M10 20v-5.4h4V20" />
                </svg>
              </a>
            )}
            <button className="station-modal-close" onClick={onClose} aria-label="Close" autoFocus>✕</button>
          </div>
        </div>

        {view === 'news' ? (
          <div className="station-news">
            {news.status === 'loading' && (
              <div className="epg-no-data">Loading news…</div>
            )}
            {news.status === 'error' && (
              <div className="epg-no-data">News log unavailable</div>
            )}
            {news.status === 'empty' && (
              <div className="epg-no-data">No news log for this station</div>
            )}
            {news.posts.map((post) => (
              <a
                key={post.id || post.url}
                className="station-news-post"
                href={post.url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={e => e.stopPropagation()}
              >
                {postDate(post.date_published) && (
                  <div className="station-news-date">{postDate(post.date_published)}</div>
                )}
                <div className="station-news-title">{post.title}</div>
                {post.summary && <div className="station-news-summary">{post.summary}</div>}
              </a>
            ))}
          </div>
        ) : epg ? (
          <>
            <div className="station-modal-day-nav">
              <button className="epg-day-btn" onClick={goPrevDay} disabled={!canGoPrev} aria-label="Previous day">◀</button>
              <span className="epg-day-label">{daySchedule ? daySchedule.label : '—'}</span>
              <button className="epg-day-btn" onClick={goNextDay} disabled={!canGoNext} aria-label="Next day">▶</button>
            </div>

            {dayOffset !== 0 && (
              <button className="epg-today-btn" onClick={goToday}>TODAY</button>
            )}

            <div className="epg-schedule" ref={scheduleRef}>
              {daySchedule ? (
                daySchedule.programs.map((prog, i) => (
                  <div
                    key={i}
                    className={`epg-prog${prog.isCurrent ? ' is-current' : ''}${prog.isPast ? ' is-past' : ''}${prog.isGap ? ' is-gap' : ''}`}
                  >
                    <div className="epg-prog-time">
                      <span className="epg-start">{prog.start}</span>
                      <span className="epg-duration">{prog.durationMin}m</span>
                    </div>
                    <div className="epg-prog-body">
                      <div className="epg-prog-title-row">
                        {prog.live && <span className="epg-prog-live">● LIVE</span>}
                        <MarqueeText className="epg-prog-title" text={prog.title} />
                      </div>
                      <div className="epg-prog-cat">{categories[prog.category] || prog.category}</div>
                      {prog.recurrence_note && <div className="epg-prog-note">{prog.recurrence_note}</div>}
                    </div>
                    {prog.url && (
                      <a
                        href={prog.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="epg-prog-link"
                        onClick={e => e.stopPropagation()}
                      >
                        ↗
                      </a>
                    )}
                  </div>
                ))
              ) : (
                <div className="epg-no-data">No schedule for this day</div>
              )}
            </div>
          </>
        ) : (
          <div className="epg-no-data">No programme guide for this station</div>
        )}
      </div>
    </div>
  )
}

export default StationModal
