/** Favourites on this device only.

    One versioned envelope in localStorage: the web build and the Capacitor
    WebView both provide it, so favourites need no native plugin and never
    leave the device. Every read and write is guarded — private-mode Safari or
    a full quota must degrade to "no favourites", never break the station list.
*/

export const FAVORITES_KEY = 'riotsradios.favorites.v1'
export const FAVORITES_VERSION = 1
/* Bounds a hand-edited or corrupted value and keeps the envelope small. */
export const MAX_FAVORITES = 500

/* Drops anything that is not a positive integer station id and de-duplicates,
   preserving order (which is add order). */
function cleanIds(ids) {
  const out = []
  if (!Array.isArray(ids)) return out
  for (const id of ids) {
    if (!Number.isInteger(id) || id <= 0 || out.includes(id)) continue
    out.push(id)
    if (out.length >= MAX_FAVORITES) break
  }
  return out
}

/** Parse a raw localStorage value. Anything malformed — bad JSON, another
    version, a non-array, junk entries — reads as "no favourites", so a bad
    value can never take the app down with it. */
export function parseFavorites(raw) {
  if (typeof raw !== 'string' || raw === '') return []
  let data
  try {
    data = JSON.parse(raw)
  } catch {
    return []
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) return []
  if (data.v !== FAVORITES_VERSION) return []
  return cleanIds(data.ids)
}

/** The envelope written back to storage. Ids keep their order, so the newest
    favourite is simply the last one and no timestamps are needed. */
export function serializeFavorites(ids) {
  return JSON.stringify({ v: FAVORITES_VERSION, ids: cleanIds(ids) })
}

/** A favourites store over any Storage-like object (`getItem`/`setItem`), so
    tests can pass a plain stub and the app passes `window.localStorage`.
    `save` and `toggle` return the ids actually stored. */
export function createFavoritesStore({ storage, key = FAVORITES_KEY } = {}) {
  const backend = storage ?? (typeof window !== 'undefined' ? window.localStorage : null)

  function read() {
    if (!backend) return []
    try {
      return parseFavorites(backend.getItem(key))
    } catch {
      return []
    }
  }

  function save(ids) {
    const clean = cleanIds(ids)
    if (!backend) return clean
    try {
      backend.setItem(key, serializeFavorites(clean))
    } catch {
      /* Private mode or quota: keep the in-memory result for this session. */
    }
    return clean
  }

  /* The caller supplies the current ids, so two quick toggles in one tick
     cannot read a stale list. */
  function toggle(id, ids = read()) {
    if (!Number.isInteger(id) || id <= 0) return cleanIds(ids)
    const current = cleanIds(ids)
    const next = current.includes(id)
      ? current.filter(fav => fav !== id)
      : [...current, id]
    return save(next)
  }

  return { key, read, save, toggle }
}
