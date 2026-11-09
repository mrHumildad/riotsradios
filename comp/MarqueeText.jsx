import React, { useEffect, useRef, useState } from 'react'

/* A station row is four fixed lines — name, stream title, place, catalogue meta
   — and none of them may grow a fifth. When a field is wider than its column it
   slides through the gap like a broadcast caption and loops, instead of
   wrapping or dropping its tail behind an ellipsis.

   The track carries two copies of the text and shifts by exactly one copy plus
   the gap, so the seam is invisible. A field that already fits is rendered once
   and never animates; with reduced motion requested it stays a plain clipped
   line with an ellipsis. */

const SPEED = 42 // px per second — readable at arm's length, not a blur
const GAP = 40 // must match the gap on .mq.is-scrolling .mq-track
const HOLD = 0.12 // share of each loop parked at the start; matches @keyframes

/* One observer for the whole list: only the handful of rows on screen animate. */
let sharedObserver = null
const visibilityHandlers = new Map()

function watchVisibility(el, onChange) {
  if (!('IntersectionObserver' in window)) return () => {}
  if (!sharedObserver) {
    sharedObserver = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) visibilityHandlers.get(entry.target)?.(entry.isIntersecting)
      },
      { rootMargin: '120px 0px' },
    )
  }
  visibilityHandlers.set(el, onChange)
  sharedObserver.observe(el)
  return () => {
    sharedObserver?.unobserve(el)
    visibilityHandlers.delete(el)
  }
}

export default function MarqueeText({ text, className = '', title, id }) {
  const frameRef = useRef(null)
  const [scroll, setScroll] = useState({ on: false, shift: 0, duration: 0 })

  useEffect(() => {
    const frame = frameRef.current
    if (!frame) return undefined
    let raf = 0
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)')

    const measure = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        const part = frame.querySelector('[data-mq-part]')
        if (!part) return
        const full = part.scrollWidth
        /* padding is inside clientWidth but is not room for the text */
        const box = getComputedStyle(frame)
        const room =
          frame.clientWidth -
          (parseFloat(box.paddingLeft) || 0) -
          (parseFloat(box.paddingRight) || 0)
        const on = !reduce?.matches && full - room > 1
        setScroll((prev) => {
          if (!on) return prev.on ? { on: false, shift: 0, duration: 0 } : prev
          const shift = full + GAP
          if (prev.on && Math.abs(prev.shift - shift) < 1) return prev
          /* the hold is a slice of the same loop, so the travel keeps its speed */
          return { on, shift, duration: shift / SPEED / (1 - HOLD) }
        })
      })
    }

    measure()
    const resize = new ResizeObserver(measure)
    resize.observe(frame)
    document.fonts?.ready.then(measure).catch(() => {})
    document.fonts?.addEventListener?.('loadingdone', measure)
    reduce?.addEventListener?.('change', measure)

    const unwatch = watchVisibility(frame, (visible) => {
      frame.classList.toggle('mq-paused', !visible)
    })

    return () => {
      cancelAnimationFrame(raf)
      resize.disconnect()
      unwatch()
      document.fonts?.removeEventListener?.('loadingdone', measure)
      reduce?.removeEventListener?.('change', measure)
    }
  }, [text])

  const style = scroll.on
    ? { '--mq-shift': `${scroll.shift}px`, '--mq-duration': `${scroll.duration.toFixed(2)}s` }
    : undefined

  return (
    <div
      ref={frameRef}
      id={id}
      className={`mq ${scroll.on ? 'is-scrolling' : 'mq-static'}${className ? ` ${className}` : ''}`}
      style={style}
      title={title}
    >
      <span className="mq-track">
        <span className="mq-part" data-mq-part>{text}</span>
        {scroll.on && <span className="mq-part" aria-hidden="true">{text}</span>}
      </span>
    </div>
  )
}
