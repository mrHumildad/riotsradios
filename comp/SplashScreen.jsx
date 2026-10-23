import { useEffect, useState } from 'react'

/* Boot splash: the brand emblem, then a short fade-out. Self-removing, so the
   overlay never stays in the DOM once it has played. */
const HOLD_MS = 1100
const FADE_MS = 320
const REDUCED_FADE_MS = 120

function prefersReducedMotion() {
  if (typeof window === 'undefined' || !window.matchMedia) return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

function SplashScreen() {
  const [reduced] = useState(prefersReducedMotion)
  const [phase, setPhase] = useState('hold')

  useEffect(() => {
    const hold = reduced ? 0 : HOLD_MS
    const fade = reduced ? REDUCED_FADE_MS : FADE_MS
    const fadeTimer = setTimeout(() => setPhase('fading'), hold)
    const doneTimer = setTimeout(() => setPhase('done'), hold + fade)
    return () => {
      clearTimeout(fadeTimer)
      clearTimeout(doneTimer)
    }
  }, [reduced])

  if (phase === 'done') return null

  return (
    <div
      className={`splash-screen${phase === 'fading' ? ' is-fading' : ''}`}
      aria-hidden="true"
      data-reduced-motion={reduced ? 'true' : 'false'}
    >
      <img
        className="splash-logo"
        src={`${import.meta.env.BASE_URL}splash-logo.png`}
        alt=""
        width="720"
        height="656"
        decoding="async"
        fetchPriority="high"
      />
    </div>
  )
}

export default SplashScreen
