/**
 * In-app update check.
 *
 * Every build publishes `version.json` next to the site (`scripts/version-plugin.mjs`).
 * On launch the player compares that published version with the one it was built
 * with, so a listener running an older deploy is told there is something newer.
 *
 * The check is deliberately quiet: an unreachable, malformed or older file shows
 * nothing and never errors. Playback must not depend on it.
 *
 * Android builds update through the store, not by reloading the WebView, so the
 * caller asks `isNativeApp()` and sends the listener there instead.
 */

export const DEFAULT_APP_VERSION_URL = 'https://mrhumildad.github.io/riotsradios/version.json'

const configured = import.meta.env?.VITE_APP_VERSION_URL
export const APP_VERSION_URL = String(configured || DEFAULT_APP_VERSION_URL)

export const PLAY_STORE_URL = 'https://play.google.com/store/apps/details?id=com.mrhumildad.riotsradios'

const DIGITS = /^\d+$/

/**
 * Parse a dotted version into `[major, minor, patch]`.
 * A leading "v" and a pre-release/build suffix are ignored; anything that is not
 * two or three numeric parts is not a version.
 *
 * @param {unknown} value
 * @returns {[number, number, number]|null}
 */
export function parseVersion(value) {
  if (typeof value !== 'string') return null
  const cleaned = value.trim().replace(/^v/i, '')
  if (!cleaned) return null
  const core = cleaned.split(/[-+]/, 1)[0]
  const parts = core.split('.')
  if (parts.length < 2 || parts.length > 3) return null
  if (!parts.every((part) => DIGITS.test(part))) return null
  const numbers = parts.map(Number)
  while (numbers.length < 3) numbers.push(0)
  return numbers
}

/**
 * True only when `latest` is strictly newer than `current`.
 * Equal, older or unparsable versions never prompt — a bad file must not nag.
 *
 * @param {unknown} latest
 * @param {unknown} current
 */
export function isNewerVersion(latest, current) {
  const next = parseVersion(latest)
  const now = parseVersion(current)
  if (!next || !now) return false
  for (let index = 0; index < 3; index++) {
    if (next[index] !== now[index]) return next[index] > now[index]
  }
  return false
}

/**
 * Read the published version. Never throws, never caches a stale answer.
 *
 * @param {object} [options]
 * @param {string} [options.url]
 * @param {typeof fetch} [options.fetchImpl]
 * @returns {Promise<string|null>}
 */
export async function fetchLatestVersion({
  url = APP_VERSION_URL,
  fetchImpl = globalThis.fetch,
} = {}) {
  if (typeof fetchImpl !== 'function') return null
  try {
    const response = await fetchImpl(url, { cache: 'no-cache' })
    if (!response.ok) return null
    const payload = await response.json()
    const version = typeof payload?.version === 'string' ? payload.version.trim() : ''
    return version || null
  } catch {
    return null
  }
}

/**
 * The published version when it is newer than `current`, otherwise null.
 *
 * @param {object} [options]
 * @param {string} [options.current]
 * @param {string} [options.url]
 * @param {typeof fetch} [options.fetchImpl]
 * @returns {Promise<string|null>}
 */
export async function checkForUpdate({ current, url, fetchImpl } = {}) {
  const latest = await fetchLatestVersion({ url, fetchImpl })
  return latest && isNewerVersion(latest, current) ? latest : null
}

/**
 * The Capacitor WebView identifies itself through the injected global.
 * On the web (and in tests) there is no bridge, so this is false.
 *
 * @param {object} [globalObject]
 */
export function isNativeApp(globalObject = typeof window !== 'undefined' ? window : undefined) {
  return globalObject?.Capacitor?.isNativePlatform?.() === true
}
