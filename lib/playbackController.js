/**
 * Playback state machine for a live radio stream.
 *
 * Owns one HTMLAudioElement and every listener it needs, so the React hook can
 * stay declarative. Plain DOM API only (no React), which makes it testable in
 * Node with a fake audio element.
 *
 *   idle ──play()──▶ loading ──"playing"──▶ playing
 *                      │                     │
 *                      ├─start timeout──┐    ├─"waiting"/"stalled"/frozen currentTime
 *                      ├─"error"────────┤    │        │
 *                      └─play() reject──┘    │        ▼
 *                                            │     stalled ──retry──▶ loading
 *                                            ▼        │
 *                                          error ◀────┴─ retries exhausted
 *
 * The element is never given an empty `src` (that fires MEDIA_ELEMENT_ERROR);
 * stopping removes the attribute and calls load() instead.
 */

export const PLAYBACK_TIMINGS = Object.freeze({
  startTimeout: 12000,
  stallAfter: 8000,
  watchdogInterval: 2000,
  retryDelays: [1000, 2000, 4000],
  maxRetries: 3,
})

/**
 * @param {object} options
 * @param {HTMLAudioElement} options.audio element to drive
 * @param {object} [options.timings] overrides for PLAYBACK_TIMINGS (tests)
 * @param {(url: string) => boolean} [options.isMixedContent]
 * @param {(state: string) => void} [options.onState]
 * @param {(reason: string|null) => void} [options.onStreamError]
 */
export function createPlaybackController({
  audio,
  timings,
  isMixedContent = () => false,
  onState,
  onStreamError,
}) {
  const t = { ...PLAYBACK_TIMINGS, ...timings }

  let state = 'idle'
  let wantsPlay = false
  let url = ''
  let corsEnabled = false
  let retries = 0
  let timers = { start: null, retry: null, watchdog: null, stall: null }
  let lastProgress = { time: -1, at: 0 }

  const emitState = (next) => {
    if (state === next) return
    state = next
    onState?.(next)
  }
  const emitError = (reason) => onStreamError?.(reason)

  const clearOne = (name) => {
    const id = timers[name]
    if (id === null) return
    if (name === 'watchdog') clearInterval(id)
    else clearTimeout(id)
    timers[name] = null
  }
  const clearTimers = () => {
    clearOne('start')
    clearOne('retry')
    clearOne('watchdog')
    clearOne('stall')
  }

  function startWatchdog() {
    clearOne('watchdog')
    lastProgress = { time: audio.currentTime, at: Date.now() }
    timers.watchdog = setInterval(() => {
      if (!wantsPlay || state !== 'playing') return
      const now = Date.now()
      if (audio.currentTime !== lastProgress.time) {
        lastProgress = { time: audio.currentTime, at: now }
        return
      }
      /* currentTime frozen and no usable buffer: the stream died silently. */
      if (audio.readyState < 3 && now - lastProgress.at >= t.stallAfter) scheduleRetry()
    }, t.watchdogInterval)
  }

  function fail(reason) {
    clearTimers()
    emitError(reason)
    emitState('error')
  }

  function scheduleRetry() {
    if (!wantsPlay || state === 'error') return
    if (timers.retry !== null) return
    clearOne('start')
    clearOne('watchdog')
    clearOne('stall')
    if (retries >= t.maxRetries) {
      fail('playback')
      return
    }
    retries += 1
    emitState('stalled')
    const delay = t.retryDelays[Math.min(retries - 1, t.retryDelays.length - 1)]
    timers.retry = setTimeout(() => {
      timers.retry = null
      if (!wantsPlay) return
      play(url, { isRetry: true })
    }, delay)
  }

  function play(nextUrl, { isRetry = false, cors } = {}) {
    if (!nextUrl) return
    if (cors !== undefined) corsEnabled = Boolean(cors)

    if (isMixedContent(nextUrl)) {
      wantsPlay = false
      clearTimers()
      emitError('mixed-content')
      emitState('error')
      return
    }

    wantsPlay = true
    if (!isRetry) {
      retries = 0
      clearTimers()
    }
    emitError(null)
    emitState(isRetry ? 'stalled' : 'loading')

    /* Re-assigning the source on retry forces a fresh connection, which is
       what recovers a stream whose TCP/TLS handshake silently stalled.
       crossOrigin must be set BEFORE src, and only when the station's health
       snapshot says CORS is available: setting it on a CORS-less stream makes
       the media element fail to load. */
    if (isRetry || url !== nextUrl) {
      url = nextUrl
      if (corsEnabled) audio.crossOrigin = 'anonymous'
      else audio.removeAttribute?.('crossorigin')
      audio.src = nextUrl
    }

    clearOne('start')
    timers.start = setTimeout(() => {
      timers.start = null
      if (!wantsPlay) return
      if (state === 'loading' || state === 'stalled') scheduleRetry()
    }, t.startTimeout)

    const played = audio.play()
    if (played && typeof played.catch === 'function') {
      played.catch((err) => {
        if (!wantsPlay) return
        const name = err && err.name
        if (name === 'AbortError') return            /* source changed mid-call */
        if (name === 'NotAllowedError') {            /* autoplay policy */
          wantsPlay = false
          clearTimers()
          emitError('blocked')
          emitState('error')
          return
        }
        if (name === 'SecurityError') {
          fail('mixed-content')
          return
        }
        if (name === 'NotSupportedError') {
          fail('format')
          return
        }
        scheduleRetry()
      })
    }
  }

  function stop() {
    wantsPlay = false
    retries = 0
    url = ''
    clearTimers()
    audio.pause()
    audio.removeAttribute('src')
    audio.load()
    emitError(null)
    emitState('idle')
  }

  const onPlaying = () => {
    if (!wantsPlay) {
      audio.pause()
      return
    }
    clearOne('start')
    clearOne('retry')
    clearOne('stall')
    retries = 0
    emitError(null)
    emitState('playing')
    startWatchdog()
  }

  const onPause = () => {
    /* Ignore the pause that a source swap/retry triggers internally. */
    if (state === 'loading' || state === 'stalled') return
    wantsPlay = false
    clearTimers()
    emitState('idle')
  }

  const onWaiting = () => {
    if (!wantsPlay || state !== 'playing') return
    emitState('stalled')
    clearOne('stall')
    timers.stall = setTimeout(() => {
      timers.stall = null
      if (wantsPlay && state === 'stalled') scheduleRetry()
    }, t.stallAfter)
  }

  const onEnded = () => {
    if (wantsPlay) scheduleRetry()
  }

  const onError = () => {
    if (!wantsPlay) return
    const code = audio.error && audio.error.code
    if (code === 4) fail('format')   /* MEDIA_ERR_SRC_NOT_SUPPORTED */
    else scheduleRetry()
  }

  audio.addEventListener('playing', onPlaying)
  audio.addEventListener('pause', onPause)
  audio.addEventListener('waiting', onWaiting)
  audio.addEventListener('stalled', onWaiting)
  audio.addEventListener('ended', onEnded)
  audio.addEventListener('error', onError)

  return {
    play,
    stop,
    getState: () => state,
    destroy() {
      wantsPlay = false
      clearTimers()
      audio.removeEventListener('playing', onPlaying)
      audio.removeEventListener('pause', onPause)
      audio.removeEventListener('waiting', onWaiting)
      audio.removeEventListener('stalled', onWaiting)
      audio.removeEventListener('ended', onEnded)
      audio.removeEventListener('error', onError)
      audio.pause()
      audio.removeAttribute('src')
      audio.load()
    },
  }
}
