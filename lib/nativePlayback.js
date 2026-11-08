/**
 * Playback controller for the native Media3 engine.
 *
 * Mirrors the contract of `lib/playbackController.js` (`play`, `stop`,
 * `getState`, `destroy` + `onState`/`onStreamError`) so `logic.js` and every
 * component stay engine-agnostic. The differences are deliberate:
 *
 * - the WebView never owns audio; it sends the station to `RiotsPlayback` and
 *   mirrors the session's state events,
 * - retries, audio focus and the notification live in Kotlin,
 * - `stalled` is reported by the session (ExoPlayer rebuffering), not by a JS
 *   watchdog.
 */

import { nativePlugin } from './nativeSpectrum.js'

export const STATE_EVENT = 'state'

/* The stream's ICY title, decoded by ExoPlayer (`IcyInfo`). The web reader in
   lib/icy.js can only ask servers that answer the Icy-MetaData preflight; here
   the socket belongs to the player, so every station reports a track. */
export const TRACK_EVENT = 'track'

export const NATIVE_STATES = Object.freeze([
  'idle',
  'loading',
  'playing',
  'stalled',
  'error',
])

/* Same vocabulary lib/playbackController.js emits, so the dashboard copy and
   the existing tests keep their meaning. */
const STREAM_ERRORS = new Set(['mixed-content', 'blocked', 'format', 'playback'])

/**
 * @param {object} [options]
 * @param {object|null} [options.bridge] RiotsPlayback plugin (tests inject a fake)
 * @param {(state: string) => void} [options.onState]
 * @param {(reason: string|null) => void} [options.onStreamError]
 * @param {(title: string|null, stationId: string) => void} [options.onTrack]
 */
export function createNativePlaybackController({
  bridge = nativePlugin(),
  onState,
  onStreamError,
  onTrack,
} = {}) {
  let state = 'idle'
  let closed = false
  let askedForNotifications = false
  let currentStationId = null
  const handles = new Map()

  const emit = (next) => {
    if (!NATIVE_STATES.includes(next) || state === next) return
    state = next
    onState?.(next)
  }

  function adopt(event) {
    if (closed) return
    const next = NATIVE_STATES.includes(event?.state) ? event.state : 'error'
    if (next === 'error') {
      onStreamError?.(STREAM_ERRORS.has(event?.error) ? event.error : 'playback')
    } else {
      onStreamError?.(null)
    }
    emit(next)
  }

  /**
   * Same shape as the ICY reader: a title, or null when the stream has none.
   * `replay` is the one-shot `getTrack()` answer, which describes a stream the
   * session kept playing while this page was away — nothing is playing *here*,
   * so it may arrive before any `play()`.
   */
  function adoptTrack(event, replay = false) {
    if (closed) return
    const title = typeof event?.title === 'string' ? event.title.trim() : ''
    const given = event?.id == null || event.id === '' ? null : String(event.id)
    const id = given ?? currentStationId
    if (!id) return
    /* Live blocks only mean something while this page owns playback: after a
       stop, one more ICY frame can still land and must not revive a title. */
    if (!replay && !currentStationId) return
    /* A block that belongs to the station we just left must not be pinned to
       the new one: Media3 can deliver one more ICY frame during the switch. */
    if (currentStationId && id !== currentStationId) return
    onTrack?.(title || null, id)
  }

  function listen(event, handler) {
    const subscription = bridge?.addListener?.(event, handler)
    if (subscription && typeof subscription.then === 'function') {
      subscription
        .then((registered) => {
          if (closed) registered?.remove?.()
          else handles.set(event, registered ?? null)
        })
        .catch(() => {})
    } else if (subscription) {
      handles.set(event, subscription)
    }
  }

  listen(STATE_EVENT, adopt)
  listen(TRACK_EVENT, adoptTrack)

  /* A page that attaches while a stream is already playing has missed every
     event so far, so the current title is asked for once. */
  if (bridge?.getTrack) {
    Promise.resolve(bridge.getTrack())
      .then((current) => adoptTrack(current, true))
      .catch(() => {})
  }

  return {
    /** Same first argument as the Web Audio controller; `station` carries the id. */
    play(url, { station } = {}) {
      if (!bridge?.playStation || !url || !station?.id) {
        onStreamError?.('playback')
        emit('error')
        return
      }
      /* Tag the stream before asking for it, so the first ICY block has a
         station to belong to. */
      const nextId = String(station.id)
      if (currentStationId && currentStationId !== nextId) onTrack?.(null, currentStationId)
      currentStationId = nextId

      /* Asked once per engine, before the first playback: Android 13+ hides the
         media notification until this is granted, and the foreground service
         runs either way, so the answer never blocks play. */
      if (!askedForNotifications) {
        askedForNotifications = true
        Promise.resolve(bridge.requestNotifications?.()).catch(() => {})
      }

      onStreamError?.(null)
      emit('loading')
      Promise.resolve(
        bridge.playStation({
          id: String(station.id),
          url,
          name: station.name ?? '',
          location: [station.state, station.country].filter(Boolean).join(', '),
          artworkUrl: station.favicon ?? '',
        })
      ).catch(() => {
        onStreamError?.('playback')
        emit('error')
      })
    },

    stop() {
      /* Stop must release the connection: the service calls player.stop() +
         clearMediaItems(), the foreground service ends, the notification goes. */
      Promise.resolve(bridge?.stop?.()).catch(() => {})
      onStreamError?.(null)
      if (currentStationId) onTrack?.(null, currentStationId)
      currentStationId = null
      emit('idle')
    },

    getState: () => state,

    /** Per-app gain, mirroring the GainNode on the web path. */
    setVolume(value) {
      if (!bridge?.setVolume) return
      Promise.resolve(bridge.setVolume({ volume: value })).catch(() => {})
    },

    destroy() {
      closed = true
      for (const handle of handles.values()) {
        try {
          handle?.remove?.()
        } catch {
          /* already detached */
        }
      }
      handles.clear()
      Promise.resolve(bridge?.stop?.()).catch(() => {})
    },
  }
}
