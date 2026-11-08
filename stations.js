import csvRaw from './stations.csv?raw'
import healthRaw from './data/health.json'
import cleartextAllowlist from './data/cleartext-hosts.json'
import { parseStationRows, isPlayableStation } from './lib/stations.js'
import { parseAllowlist } from './lib/cleartext.js'
import { buildStationReport, describeStation } from './lib/stationReport.js'

export { isValidStreamUrl, parseStationRows, isPlayableStation } from './lib/stations.js'

const allRows = parseStationRows(csvRaw)

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

/* `health` comes from the last probe run (data/health.json); null when a
   station has not been probed yet. */
export const stations = allRows
  .filter((station) => DEV || canPlay(station))
  .map((station) => ({ ...station, health: healthRaw[String(station.id)] || null }))

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
