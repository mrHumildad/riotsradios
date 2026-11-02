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
 */
export function createNativePlaybackController({
  bridge = nativePlugin(),
  onState,
  onStreamError,
} = {}) {
  let state = 'idle'
  let handle = null
  let closed = false
  let askedForNotifications = false

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

  const subscription = bridge?.addListener?.(STATE_EVENT, adopt)
  if (subscription?.then) {
    subscription
      .then((registered) => {
        if (closed) registered?.remove?.()
        else handle = registered ?? null
      })
      .catch(() => {})
  } else if (subscription) {
    handle = subscription
  }

  return {
    /** Same first argument as the Web Audio controller; `station` carries the id. */
    play(url, { station } = {}) {
      if (!bridge?.playStation || !url || !station?.id) {
        onStreamError?.('playback')
        emit('error')
        return
      }
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
          location: station.location ?? '',
          artworkUrl: station.icon ?? '',
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
      try {
        handle?.remove?.()
      } catch {
        /* already detached */
      }
      handle = null
      Promise.resolve(bridge?.stop?.()).catch(() => {})
    },
  }
}
