/**
 * Spectrum levels from the native Media3 player.
 *
 * The native tap (`SpectrumTap.kt`) decodes PCM inside ExoPlayer, folds it into
 * the same 24 bands as `lib/audioBands.js` and pushes them over the
 * `RiotsPlayback` plugin. This module exposes that stream through the same
 * contract as `createSpectrumAnalyzer`, so `comp/useSpectrum.js` and the canvas
 * do not know which engine feeds them:
 *
 *   ensure()     → the graph is never built; true when a bridge exists
 *   read()       → 24 band levels 0..1, or null when the tap has gone quiet
 *   isConnected()→ a subscription or a levels event has arrived
 *   setVolume()  → no-op; the native player owns its own gain
 *   close()      → detach the listener
 */

import { BAND_COUNT } from './audioBands.js'

export const SPECTRUM_EVENT = 'spectrum'
export const PLUGIN_NAME = 'RiotsPlayback'

/* A tap that stops publishing (player stopped, stream errored, offload took
   over) must fall back to SIM, exactly like a silent Web Audio analyzer. */
export const STALE_AFTER_MS = 1500

export function nativePlugin() {
  if (typeof window === 'undefined') return null
  if (window.Capacitor?.isNativePlatform?.() !== true) return null
  return window.Capacitor?.Plugins?.[PLUGIN_NAME] ?? null
}

/**
 * True when the Android build plays through Media3 rather than the WebView's
 * `<audio>` element. The plugin answers false until M1 lands, which keeps the
 * web analyzer in charge of a build that still plays through the WebView.
 */
export async function nativePlaybackAvailable(plugin = nativePlugin()) {
  if (!plugin?.isNativePlaybackAvailable) return false
  try {
    const result = await plugin.isNativePlaybackAvailable()
    return result?.available === true
  } catch {
    return false
  }
}

/** Bridge payloads may be JS arrays or typed arrays; never trust their values. */
function toLevels(raw) {
  const shaped = Array.isArray(raw) || ArrayBuffer.isView(raw)
  if (!shaped || raw.length === 0) return null
  const out = new Float32Array(BAND_COUNT)
  for (let i = 0; i < BAND_COUNT; i++) {
    const value = Number(raw[i])
    out[i] = Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0
  }
  return out
}

export function createNativeSpectrum({
  plugin = nativePlugin(),
  now = () => Date.now(),
  staleAfterMs = STALE_AFTER_MS,
} = {}) {
  let levels = null
  let receivedAt = 0
  let handle = null
  let connected = false
  let closed = false

  function adopt(payload) {
    if (closed) return
    const next = toLevels(payload?.levels ?? payload)
    if (!next) return
    levels = next
    receivedAt = now()
  }

  const subscription = plugin?.addListener?.(SPECTRUM_EVENT, adopt)
  if (subscription && typeof subscription.then === 'function') {
    subscription
      .then((registered) => {
        if (closed) registered?.remove?.()
        else {
          handle = registered ?? null
          connected = true
        }
      })
      .catch(() => {})
  } else if (subscription) {
    handle = subscription
    connected = true
  }

  return {
    ensure: () => Boolean(plugin),
    read() {
      if (!levels) return null
      if (now() - receivedAt > staleAfterMs) return null
      return levels
    },
    isConnected: () => connected || levels !== null,
    setVolume() {},
    close() {
      closed = true
      try {
        handle?.remove?.()
      } catch {
        /* a bridge that already dropped the listener is fine */
      }
      handle = null
      levels = null
      connected = false
    },
  }
}
