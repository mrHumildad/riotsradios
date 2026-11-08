/**
 * EPG feed loading.
 *
 * The published EPG repository owns the guides. The player asks for its
 * manifest first and falls back to the guides bundled in public/EPGs/ per
 * station. A failed manifest, a missing guide or a CORS error must never stop
 * the rest of the catalog from loading.
 */

export const DEFAULT_EPG_BASE_URL = 'https://mrhumildad.github.io/riotsradios-epg'

const configuredBase = import.meta.env?.VITE_EPG_BASE_URL
export const EPG_BASE_URL = String(configuredBase || DEFAULT_EPG_BASE_URL).replace(/\/+$/, '')
export const EPG_MANIFEST_URL = `${EPG_BASE_URL}/EPGs/manifest.json`

function joinBase(baseUrl) {
  return String(baseUrl || DEFAULT_EPG_BASE_URL).replace(/\/+$/, '')
}

export function guideUrl(baseUrl, file) {
  if (!file) return null
  return `${joinBase(baseUrl)}/EPGs/${encodeURIComponent(file)}`
}

export function localGuideUrl(localBase, file) {
  if (!file) return null
  const base = String(localBase || '/')
  return `${base.endsWith('/') ? base : `${base}/`}EPGs/${encodeURIComponent(file)}`
}

/** Only fully usable entries are advertised; partial/failed guides are ignored. */
export function manifestEntries(manifest) {
  const entries = new Map()
  for (const [id, entry] of Object.entries(manifest?.stations || {})) {
    const stationId = Number(id)
    if (!Number.isInteger(stationId) || stationId <= 0) continue
    if (!entry || typeof entry.file !== 'string' || !entry.file) continue
    if (entry.status !== 'ok' && entry.status !== 'legacy') continue
    entries.set(stationId, entry)
  }
  return entries
}

/**
 * Load EPG data keyed by station id.
 *
 * @param {object} options
 * @param {Array<{id: number, epg_file?: string}>} options.stations
 * @param {string} [options.baseUrl]
 * @param {string} [options.localBase] Vite's BASE_URL
 * @param {typeof fetch} [options.fetchImpl]
 * @returns {Promise<Map<number, object>>}
 */
export async function loadEpgData({
  stations = [],
  baseUrl = EPG_BASE_URL,
  localBase = import.meta.env?.BASE_URL || '/',
  fetchImpl = globalThis.fetch,
} = {}) {
  const data = new Map()
  if (typeof fetchImpl !== 'function') return data

  let manifest = null
  try {
    const response = await fetchImpl(`${joinBase(baseUrl)}/EPGs/manifest.json`, {
      cache: 'no-cache',
    })
    if (response.ok) manifest = await response.json()
  } catch {
    /* offline or CORS: every station falls back to its bundled guide */
  }

  const remote = manifestEntries(manifest)

  await Promise.all(stations.map(async (station) => {
    const id = Number(station.id)
    if (!Number.isInteger(id) || id <= 0) return

    const entry = remote.get(id)
    if (entry) {
      try {
        const response = await fetchImpl(guideUrl(baseUrl, entry.file), { cache: 'no-cache' })
        if (response.ok) {
          data.set(id, await response.json())
          return
        }
      } catch {
        /* fall through to the bundled guide */
      }
    }

    if (!station.epg_file) return
    try {
      const response = await fetchImpl(localGuideUrl(localBase, station.epg_file), {
        cache: 'no-cache',
      })
      if (response.ok) data.set(id, await response.json())
    } catch {
      /* no guide is better than blocking the station */
    }
  }))

  return data
}
