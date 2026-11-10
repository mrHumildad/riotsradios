/**
 * Catalog feed loading.
 *
 * riotsradios-epg owns `stations.csv` and publishes it next to its guides. This
 * module asks for the catalog manifest first and only downloads the CSV when the
 * published version differs from the one already on the device, so a launch with
 * an up-to-date copy costs a single conditional request.
 *
 * The catalog has its own manifest on purpose: a broken guide pipeline must not
 * be able to take the station list down with it.
 *
 * `version` is the SHA-256 of the CSV bytes. Content-addressed, it doubles as a
 * cache key: the CSV is fetched as `?v=<hash>`, so a CDN edge can never answer a
 * new version with the old bytes.
 */

export const DEFAULT_CATALOG_BASE_URL = 'https://mrhumildad.github.io/riotsradios-epg'

const configuredBase = import.meta.env?.VITE_CATALOG_BASE_URL
export const CATALOG_BASE_URL = String(configuredBase || DEFAULT_CATALOG_BASE_URL).replace(/\/+$/, '')
export const CATALOG_MANIFEST_URL = `${CATALOG_BASE_URL}/catalog/manifest.json`

function joinBase(baseUrl) {
  return String(baseUrl || DEFAULT_CATALOG_BASE_URL).replace(/\/+$/, '')
}

/**
 * URL of a published catalog file. `version` adds the content-addressed query so
 * a new publish is a new URL.
 */
export function catalogUrl(baseUrl, file, version = null) {
  if (!file) return null
  const url = `${joinBase(baseUrl)}/catalog/${encodeURIComponent(file)}`
  return version ? `${url}?v=${encodeURIComponent(version)}` : url
}

/**
 * @param {unknown} manifest parsed catalog/manifest.json
 * @returns {{ version: string, file: string, rows: number|null, health: string|null }|null}
 */
export function parseCatalogManifest(manifest) {
  if (!manifest || typeof manifest !== 'object') return null
  const { version, file } = manifest
  if (typeof version !== 'string' || !version.trim()) return null
  if (typeof file !== 'string' || !file.trim()) return null
  return {
    version: version.trim(),
    file: file.trim(),
    rows: Number.isInteger(manifest.rows) ? manifest.rows : null,
    health: typeof manifest.health === 'string' && manifest.health.trim() ? manifest.health.trim() : null,
  }
}

/**
 * Fetch the published catalog.
 *
 * @param {object} [options]
 * @param {string} [options.baseUrl]
 * @param {string|null} [options.ifVersion] version already on the device
 * @param {typeof fetch} [options.fetchImpl]
 * @returns {Promise<{ version: string, changed: boolean, csv?: string, health?: object|null }|null>}
 *   null when the feed is unreachable, malformed or CORS-blocked — the copy on
 *   the device stays in charge and nothing is reported as an error to the user.
 */
export async function fetchCatalog({
  baseUrl = CATALOG_BASE_URL,
  ifVersion = null,
  fetchImpl = globalThis.fetch,
} = {}) {
  if (typeof fetchImpl !== 'function') return null

  let manifest
  try {
    const response = await fetchImpl(`${joinBase(baseUrl)}/catalog/manifest.json`, {
      cache: 'no-cache',
    })
    if (!response.ok) return null
    manifest = parseCatalogManifest(await response.json())
  } catch {
    return null
  }
  if (!manifest) return null

  if (ifVersion && ifVersion === manifest.version) {
    return { version: manifest.version, changed: false }
  }

  let csv
  try {
    const response = await fetchImpl(catalogUrl(baseUrl, manifest.file, manifest.version), {
      cache: 'force-cache',
    })
    if (!response.ok) return null
    csv = await response.text()
  } catch {
    return null
  }
  if (!csv || !csv.trim()) return null

  /* Health is optional and never gates the catalog: a missing or broken snapshot
     costs badges, not stations. */
  let health = null
  if (manifest.health) {
    try {
      const response = await fetchImpl(catalogUrl(baseUrl, manifest.health, manifest.version), {
        cache: 'force-cache',
      })
      if (response.ok) {
        const parsed = await response.json()
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) health = parsed
      }
    } catch {
      health = null
    }
  }

  return { version: manifest.version, changed: true, csv, health }
}
