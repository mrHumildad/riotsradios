import csvRaw from './stations.csv?raw'
import healthRaw from './data/health.json'
import cleartextAllowlist from './data/cleartext-hosts.json'
import { buildCatalog, assessCatalogCsv } from './lib/catalog.js'
import { readCatalogCache, writeCatalogCache } from './lib/catalogCache.js'
import { fetchCatalog, CATALOG_BASE_URL } from './lib/catalogFeed.js'
import { parseAllowlist } from './lib/cleartext.js'
import { buildStationReport, describeStation } from './lib/stationReport.js'

export { isValidStreamUrl, parseStationRows, isPlayableStation } from './lib/stations.js'
export { catalogSummary, assessCatalogCsv } from './lib/catalog.js'

/* Only the Android bundle may render plain-HTTP stations: it serves its own
   origin over http and its network security config permits these hosts. The
   GitHub Pages bundle cannot — mixed content blocks them — so `__APP_BUILD__`
   is false there and the same rows stay hidden. */
const APP_BUILD = typeof __APP_BUILD__ !== 'undefined' && __APP_BUILD__ === true
const cleartextHosts = APP_BUILD ? parseAllowlist(cleartextAllowlist).hostSet : undefined

/* Development lists the whole catalog, hidden rows included, so a station that
   never reaches listeners — no stream yet, http-only, parked on stream_broken —
   can still be selected and investigated one by one. Both production bundles
   keep the renderable filter. */
/* Plain property access so the production build replaces it with `false` and
   drops the report code below from the bundle. */
const DEV = import.meta.env.DEV

const canPlay = (station) => isPlayableStation(station, { cleartextHosts })

/* ── catalog source ────────────────────────────────────────────────
   riotsradios-epg owns stations.csv. The file bundled here is its validated
   snapshot: it renders instantly, works offline and is what a cold Android
   start sees. A copy of the last published catalog is kept in storage, and the
   publish is re-read in the background on every launch — see syncCatalog(). */

let healthSnapshot = healthRaw
let source = { version: null, csv: csvRaw, origin: 'bundled' }

if (!DEV) {
  const cached = readCatalogCache()
  /* A cached copy is re-checked on the way in: storage can be edited by hand or
     left behind by an older release with different rules. */
  if (cached && assessCatalogCsv(cached.csv).ok) {
    source = { version: cached.version, csv: cached.csv, origin: 'cache' }
    if (cached.health) healthSnapshot = { ...healthRaw, ...cached.health }
  }
}

/**
 * The catalog the player renders. Stable identity: syncCatalog() splices into
 * this array, so `logic.js` and the list keep pointing at the same stations.
 */
export const stations = buildCatalog(source.csv, {
  health: healthSnapshot,
  cleartextHosts,
  hideUnplayable: !DEV,
})

/** Version (SHA-256) of the catalog currently in use; null for the bundled one. */
export function getCatalogVersion() {
  return source.version
}

/** 'bundled' | 'cache' | 'remote' | 'dev' — for the dev log only. */
export function getCatalogOrigin() {
  return source.origin
}

/**
 * Sync is on in production builds and off in development, where stations.csv is
 * the file the editor writes. `VITE_CATALOG_SYNC=1` forces it on (to try the
 * feed in dev), `VITE_CATALOG_SYNC=0` disables it everywhere (kill switch).
 */
const CATALOG_SYNC_FLAG = import.meta.env?.VITE_CATALOG_SYNC
export function catalogSyncEnabled() {
  if (CATALOG_SYNC_FLAG === '0' || CATALOG_SYNC_FLAG === 'false') return false
  if (CATALOG_SYNC_FLAG === '1' || CATALOG_SYNC_FLAG === 'true') return !!CATALOG_BASE_URL
  return !DEV && !!CATALOG_BASE_URL
}

let inFlight = null

/**
 * Re-read the published catalog and adopt it when it is newer.
 *
 * Never throws and never blocks a render: an unreachable feed, a rejected file or
 * an unchanged version all leave the current catalog in place. A remote file that
 * fails `assessCatalogCsv` — wrong columns, duplicate ids, a suspicious drop in
 * playable rows — is refused rather than shown.
 *
 * @returns {Promise<{ changed: boolean, reason?: string, version?: string,
 *   added?: number[], removed?: number[], errors?: string[] }>}
 */
export function syncCatalog() {
  if (!catalogSyncEnabled()) return Promise.resolve({ changed: false, reason: 'disabled' })
  if (inFlight) return inFlight

  inFlight = (async () => {
    const remote = await fetchCatalog({ ifVersion: source.version })
    if (!remote) return { changed: false, reason: 'unreachable' }
    if (!remote.changed) return { changed: false, reason: 'current' }

    const verdict = assessCatalogCsv(remote.csv, { current: stations })
    if (!verdict.ok) {
      if (DEV) console.warn('[catalog] refused the published catalog:', verdict.errors)
      return { changed: false, reason: 'rejected', errors: verdict.errors }
    }

    const nextHealth = remote.health
      ? { ...healthSnapshot, ...remote.health }
      : healthSnapshot
    const next = buildCatalog(remote.csv, {
      health: nextHealth,
      cleartextHosts,
      hideUnplayable: !DEV,
    })

    const before = new Map(stations.map((station) => [station.id, station]))
    const added = next.filter((station) => !before.has(station.id)).map((station) => station.id)
    const removed = [...before.keys()].filter((id) => !next.some((station) => station.id === id))

    healthSnapshot = nextHealth
    stations.splice(0, stations.length, ...next)
    source = { version: remote.version, csv: remote.csv, origin: 'remote' }
    writeCatalogCache(remote.version, remote.csv, nextHealth)

    if (DEV) {
      console.info(
        `[catalog] synced ${remote.version.slice(0, 12)} · ${added.length} new · ${removed.length} gone`,
        { added, removed }
      )
    }
    return { changed: true, version: remote.version, added, removed }
  })()
    .catch(() => ({ changed: false, reason: 'error' }))
    .finally(() => { inFlight = null })

  return inFlight
}

/**
 * Re-read the catalog from the dev editor API, in place.
 *
 * The EDIT modal writes stations.csv through the dev server, which the watcher
 * deliberately ignores so a save cannot reload the page mid-playback. Mutating
 * the exported array (rather than replacing it) keeps `logic.js` and the list
 * pointing at the same stations while their values update.
 *
 * @returns {Promise<boolean>} false when the API is unavailable (production)
 */
export async function refreshStations() {
  if (!DEV) return false
  try {
    const response = await fetch(`${import.meta.env.BASE_URL}__catalog/stations`, { cache: 'no-store' })
    if (!response.ok) return false
    const { rows } = await response.json()
    const next = rows.map((row) => ({
      ...row.values,
      id: Number.parseInt(row.values.id, 10),
      _line: row.line,
      health: healthRaw[String(row.values.id)] || null,
    }))
    stations.splice(0, stations.length, ...next.filter((station) => DEV || canPlay(station)))
    source = { ...source, version: null, origin: 'dev' }
    return true
  } catch {
    return false
  }
}

/**
 * Log the complete catalog once, in development only.
 *
 * Collapsed groups keep it quiet until opened: a summary, one table of every
 * station, then a group per station with its full row and what it is missing.
 * The build-time gate is still scripts/validate-stations.js.
 */
function logCatalogReport(rows, isPlayable) {
  const report = buildStationReport(rows, isPlayable)
  const { entries } = report

  console.groupCollapsed(
    `[stations] dev catalog · ${report.total} rows · ${report.total - report.hidden} active · ${report.hidden} hidden · ${report.playable} playable`
  )

  console.log('missing data across the catalog:', report.missingCounts)

  if (report.invalidActive.length > 0) {
    console.warn(
      `[stations] ${report.invalidActive.length} active row(s) have no usable stream URL — run \`npm run validate:stations\` for the build gate`,
      report.invalidActive.map((e) => ({ line: e.line, id: e.id, name: e.name, url: e.url, missing: e.missing }))
    )
  }

  console.table(
    entries.map((e) => ({
      id: e.id,
      play: e.playable ? 'yes' : 'no',
      hidden: e.hidden ? 'yes' : '',
      name: e.name,
      stream: e.scheme || '—',
      mirrors: [e.mirrorHttp && 'http', e.mirrorHttps && 'https'].filter(Boolean).join('+') || '—',
      icon: e.favicon ? 'yes' : '—',
      web: e.homepage ? 'yes' : '—',
      mail: e.mailto ? 'yes' : '—',
      eps: e.epg ? 'yes' : '—',
      health: e.health || '—',
      missing: e.missing.join(', ') || 'nothing',
    }))
  )

  for (const e of entries) {
    console.groupCollapsed(
      `${String(e.id).padStart(3, ' ')} · ${e.name}${e.hidden ? '  [hidden]' : ''}${e.playable ? '' : '  [not playable]'}`
    )
    logStationFields(e)
    console.groupEnd()
  }

  console.groupEnd()
}

/** The full row, one labelled line per field. Shared by the catalog table and
    the click log so both always show the same thing. */
function mirrorLine(e, scheme) {
  const url = scheme === 'http' ? e.mirrorHttp : e.mirrorHttps
  if (!url) return '—'
  const status = e.mirrorStatus?.[scheme]
  return status ? `${url}  [${status}]` : url
}

function logStationFields(e) {
  console.log('catalog line  ', e.line)
  console.log('status        ', `${e.hidden ? 'hidden' : 'active'} · ${e.playable ? 'playable' : 'not playable'}`)
  console.log('place         ', e.place || '—')
  console.log('country       ', [e.country, e.countrycode].filter(Boolean).join(' / ') || '—')
  console.log('stream        ', e.url || '—')
  console.log('stream scheme ', e.scheme || '—')
  console.log('http mirror   ', mirrorLine(e, 'http'))
  console.log('https mirror  ', mirrorLine(e, 'https'))
  console.log('homepage      ', e.homepage || '—')
  console.log('favicon       ', e.favicon || '—')
  console.log('mailto        ', e.mailto || '—')
  console.log('epg           ', e.epg || '—')
  console.log('health        ', e.health || 'not probed')
  console.log('missing       ', e.missing.join(', ') || 'nothing')
}

/**
 * Log the station just selected — development only. `selectStation` calls this
 * for every click, including the rows the production build hides, so a station
 * can be inspected the moment it is picked.
 */
export function logStationClick(station) {
  if (!DEV || !station) return
  const entry = describeStation(station, canPlay)
  console.group(`[stations] clicked · ${String(entry.id).padStart(3, ' ')} · ${entry.name}`)
  logStationFields(entry)
  console.groupEnd()
}

if (DEV) logCatalogReport(stations, canPlay)
