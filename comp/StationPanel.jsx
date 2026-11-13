import React, { useState, useRef, useEffect, useCallback } from 'react'
import MarqueeText from './MarqueeText'
import ViewIcon from './ViewIcon'
import { loadStationPosts } from '../lib/stationFeeds.js'

/* A published post's date, short enough for the log row; a post without a
   readable date simply shows none. */
function postDate(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' })
}

/* Station info is a mode of the station list, not a dialog over it: the panel
   fills the list column, so the homepage link, the guide and the log render
   where the rows do, and the list's own plate-and-shutter entrance plays on
   the way in. The NEWS button swaps the guide for the station's own log of
   published posts. One info button per row opens it, and that button exists
   for every station, so a station without an EPG still gets header and
   website. */
function StationPanel({ station, epg, getDaySchedule, onClose }) {
  const [dayOffset, setDayOffset] = useState(0)
  const [view, setView] = useState('epg')
  const [news, setNews] = useState({ status: 'idle', posts: [] })
  const scheduleRef = useRef(null)

  const categories = epg?.metadata?.categories || {}
  const daySchedule = epg ? getDaySchedule(station.id, dayOffset) : null

  /* Which way the last day step went. The schedule enters from that side, the
     way a page inside one guide moves: the frame around it — the panel header
     and the day nav — stays put, and the schedule is keyed on the offset, so
     every step replays its entrance. Empty until the first step, so opening a
     station does not animate a day nobody asked for. */
  const [dayStep, setDayStep] = useState('')
  const goPrevDay = useCallback(() => { setDayStep('prev'); setDayOffset(d => d - 1) }, [])
  const goNextDay = useCallback(() => { setDayStep('next'); setDayOffset(d => d + 1) }, [])
  const goToday = useCallback(() => { setDayStep('today'); setDayOffset(0) }, [])

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

  /* The panel keeps the modal's guide keys — arrows step the day, up and down
     turn the guide — but leaving is the app's decision: it owns Esc and the
     info key, and knows which view to go back to. */
  useEffect(() => {
    const isLeft  = e => ['ArrowLeft','Left'].includes(e.key) || e.keyCode === 37;
    const isRight = e => ['ArrowRight','Right'].includes(e.key) || e.keyCode === 39;
    const isUp    = e => ['ArrowUp','Up'].includes(e.key) || e.keyCode === 38;
    const isDown  = e => ['ArrowDown','Down'].includes(e.key) || e.keyCode === 40;
    const h = (e) => {
      if (e.isComposing) return;
      if (view === 'epg' && isLeft(e) && canGoPrev) { goPrevDay(); e.preventDefault(); return; }
      if (view === 'epg' && isRight(e) && canGoNext) { goNextDay(); e.preventDefault(); return; }
      if (isUp(e)) { scheduleRef.current?.scrollBy({top: -120, behavior: 'smooth'}); e.preventDefault(); return; }
      if (isDown(e)) { scheduleRef.current?.scrollBy({top: 120, behavior: 'smooth'}); e.preventDefault(); return; }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [view, canGoPrev, canGoNext, goPrevDay, goNextDay]);

  return (
    <div className="station-panel" aria-label={`${station.name || 'Station'} station info`}>
      <div className="station-panel-header">
        <div className="station-panel-station">
          {station.favicon && (
            <img src={station.favicon} alt="" className="station-panel-icon" />
          )}
          <span className="station-panel-name">{station.name}</span>
        </div>
        <div className="station-panel-actions">
          <button
            type="button"
            className={`station-panel-news${view === 'news' ? ' is-active' : ''}`}
            onClick={() => setView(v => (v === 'news' ? 'epg' : 'news'))}
            aria-pressed={view === 'news'}
            aria-label={view === 'news' ? 'Show programme guide' : 'Show news log'}
            title={view === 'news' ? 'Programme guide' : 'News log'}
          >
            {/* The feed's own mark, the same glyph the mode key wears for this
                view, so the button reads as the feed rather than as a caption
                in the smallest type on the panel. */}
            <ViewIcon view="news" />
          </button>
          {station.homepage && (
            <a
              className="station-panel-home-btn"
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
          <button
            type="button"
            className="station-panel-close"
            onClick={onClose}
            aria-label="Leave station info"
            title="Back to the list"
            autoFocus
          >
            ✕
          </button>
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
          <div className="station-panel-day-nav">
            <button className="epg-day-btn" onClick={goPrevDay} disabled={!canGoPrev} aria-label="Previous day">◀</button>
            <span className="epg-day-label">{daySchedule ? daySchedule.label : '—'}</span>
            <button className="epg-day-btn" onClick={goNextDay} disabled={!canGoNext} aria-label="Next day">▶</button>
          </div>

          {dayOffset !== 0 && (
            <button className="epg-today-btn" onClick={goToday}>TODAY</button>
          )}

          <div
            key={dayOffset}
            className={`epg-schedule${dayStep ? ` epg-day-step-${dayStep}` : ''}`}
            ref={scheduleRef}
          >
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
  )
}

export default StationPanel
