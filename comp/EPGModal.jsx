import React, { useState, useRef, useEffect, useCallback } from 'react'

function EPGModal({ station, epg, getDaySchedule, onClose }) {
  const [dayOffset, setDayOffset] = useState(0)
  const scheduleRef = useRef(null)

  if (!epg) return null

  const blockUnit = epg.block_unit_minutes || epg.metadata?.block_unit_minutes || 30
  const categories = epg.metadata?.categories || {}
  const daySchedule = getDaySchedule(station.id, dayOffset)

  const goPrevDay = useCallback(() => setDayOffset(d => d - 1), [])
  const goNextDay = useCallback(() => setDayOffset(d => d + 1), [])
  const goToday = useCallback(() => setDayOffset(0), [])

  const canGoPrev = getDaySchedule(station.id, dayOffset - 1) !== null
  const canGoNext = getDaySchedule(station.id, dayOffset + 1) !== null

  useEffect(() => {
    const isLeft  = e => ['ArrowLeft','Left'].includes(e.key) || e.keyCode === 37;
    const isRight = e => ['ArrowRight','Right'].includes(e.key) || e.keyCode === 39;
    const isUp    = e => ['ArrowUp','Up'].includes(e.key) || e.keyCode === 38;
    const isDown  = e => ['ArrowDown','Down'].includes(e.key) || e.keyCode === 40;
    const isEsc   = e => ['Escape','Esc','Backspace'].includes(e.key) || [27,8].includes(e.keyCode);
    const h = (e) => {
      if (e.isComposing) return;
      if (isEsc(e)) { onClose(); e.preventDefault(); return; }
      if (isLeft(e) && canGoPrev) { goPrevDay(); e.preventDefault(); return; }
      if (isRight(e) && canGoNext) { goNextDay(); e.preventDefault(); return; }
      if (isUp(e)) { scheduleRef.current?.scrollBy({top: -120, behavior: 'smooth'}); e.preventDefault(); return; }
      if (isDown(e)) { scheduleRef.current?.scrollBy({top: 120, behavior: 'smooth'}); e.preventDefault(); return; }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose, canGoPrev, canGoNext, goPrevDay, goNextDay]);

  return (
    <div className="epg-modal-overlay" onClick={onClose}>
      <div className="epg-modal" onClick={e => e.stopPropagation()}>
        <div className="epg-modal-header">
          <div className="epg-modal-station">
            {station.icon && (
              <img src={station.icon} alt="" className="epg-modal-icon" />
            )}
            <span className="epg-modal-name">{station.name}</span>
          </div>
          <button className="epg-modal-close" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div className="epg-modal-day-nav">
          <button className="epg-day-btn" onClick={goPrevDay} disabled={!canGoPrev} aria-label="Previous day">◀</button>
          <span className="epg-day-label">{daySchedule ? daySchedule.label : '—'}</span>
          <button className="epg-day-btn" onClick={goNextDay} disabled={!canGoNext} aria-label="Next day">▶</button>
        </div>

        {daySchedule && daySchedule.isToday && dayOffset !== 0 && (
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
                  <span className="epg-duration">{prog.duration_blocks * blockUnit}m</span>
                </div>
                <div className="epg-prog-body">
                  <div className="epg-prog-title-row">
                    {prog.live && <span className="epg-prog-live">● LIVE</span>}
                    <span className="epg-prog-title">{prog.title}</span>
                  </div>
                  <div className="epg-prog-cat">{categories[prog.category] || prog.category}</div>
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
      </div>
    </div>
  )
}

export default EPGModal