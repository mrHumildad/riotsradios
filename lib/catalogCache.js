/**
 * Persisted copy of the catalog published by riotsradios-epg.
 *
 * The copy is what makes the sync a performance win instead of a startup cost:
 * the first launch after a publish downloads a few kilobytes, and every launch
 * after it renders from storage with no network in the path. A missing, corrupt
 * or oversized entry is simply no cache — the bundled snapshot covers it.
 *
 * Storage is injected so the module stays testable and safe where localStorage
 * throws (private mode, disabled cookies, the Capacitor WebView quota).
 */

export const CATALOG_CACHE_KEY = 'riotsradios.catalog.v1'

/* A catalog is ~15 KB. Anything far past this is not a catalog and should not
   eat the origin's storage quota. */
export const CATALOG_CACHE_MAX_BYTES = 512 * 1024

function resolveStorage(storage) {
  if (storage) return storage
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null
  } catch {
    return null   /* storage access itself can throw */
  }
}

/**
 * Health travels with the CSV so a station that arrived from the feed keeps its
 * badge on the next launch, when the catalog is already current and nothing is
 * re-downloaded.
 *
 * @param {Storage} [storage]
 * @returns {{ version: string, csv: string, health: object|null }|null}
 */
export function readCatalogCache(storage) {
  const store = resolveStorage(storage)
  if (!store) return null
  try {
    const raw = store.getItem(CATALOG_CACHE_KEY)
    if (!raw) return null
    if (raw.length > CATALOG_CACHE_MAX_BYTES) return null
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed.version !== 'string' || !parsed.version) return null
    if (typeof parsed.csv !== 'string' || !parsed.csv.trim()) return null
    const health = parsed.health && typeof parsed.health === 'object' && !Array.isArray(parsed.health)
      ? parsed.health
      : null
    return { version: parsed.version, csv: parsed.csv, health }
  } catch {
    return null
  }
}

/**
 * @returns {boolean} false when the write failed (quota, private mode)
 */
export function writeCatalogCache(version, csv, health = null, storage) {
  const store = resolveStorage(storage)
  if (!store) return false
  if (typeof version !== 'string' || !version) return false
  if (typeof csv !== 'string' || !csv.trim()) return false
  if (csv.length > CATALOG_CACHE_MAX_BYTES) return false
  const snapshot = health && typeof health === 'object' && !Array.isArray(health) ? health : null
  try {
    store.setItem(CATALOG_CACHE_KEY, JSON.stringify({ version, csv, health: snapshot }))
    return true
  } catch {
    return false
  }
}

export function clearCatalogCache(storage) {
  const store = resolveStorage(storage)
  if (!store) return
  try {
    store.removeItem(CATALOG_CACHE_KEY)
  } catch {
    /* nothing to clear */
  }
}
