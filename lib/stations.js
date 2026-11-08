import { parseCsv } from './parseCsv.js'
import { isCleartextHostAllowed } from './cleartext.js'

/* Column the player relies on; other columns are passed through untouched. */
export const REQUIRED_COLUMNS = ['id', 'name', 'stream_broken', 'url']

/* Whitespace (including newlines) inside a URL is never valid, even though a
   stray newline inside a quoted CSV field is legal CSV. */
export function isValidStreamUrl(value) {
  const raw = typeof value === 'string' ? value : ''
  if (!raw || /\s/.test(raw)) return false
  try {
    const url = new URL(raw)
    return (url.protocol === 'http:' || url.protocol === 'https:') && url.hostname !== ''
  } catch {
    return false
  }
}

/**
 * Parse the catalog CSV into station objects without filtering.
 * Every row is kept (including malformed ones) so tooling can report on them;
 * use `isPlayableStation` to decide what the player may render.
 *
 * @param {string} csvString raw stations.csv contents
 * @returns {Array<Record<string, unknown> & { _line: number }>}
 */
export function parseStationRows(csvString) {
  const rows = parseCsv(csvString)
  if (rows.length === 0) return []

  const headers = rows[0].map(h => h.trim())

  return rows.slice(1).map((values, index) => {
    const station = { _line: index + 2, _fieldCount: values.length }
    headers.forEach((header, idx) => {
      if (!header) return
      const value = (values[idx] ?? '').trim()
      station[header] = header === 'id' ? Number.parseInt(value, 10) : value
    })
    return station
  })
}

/** A station is renderable only with a positive numeric id, a valid http(s) URL
    and no `stream_broken` mark.

    An http:// URL is renderable only when its host is in `cleartextHosts` — the
    allowlist shipped as data/cleartext-hosts.json. The website never passes one,
    because browsers block plain-HTTP audio on the https GitHub Pages deployment;
    the Android build passes it for the hosts its network security config
    permits. */
export function isPlayableStation(station, { cleartextHosts } = {}) {
  if (!station || !Number.isInteger(station.id) || station.id <= 0) return false
  if (station.stream_broken) return false
  if (!isValidStreamUrl(station.url)) return false
  if (!station.url.startsWith('http://')) return true
  return isCleartextHostAllowed(station.url, cleartextHosts)
}

/** Human place line for a station.

    The catalog follows the radio-browser shape, where the free-text place is
    `state` and the country lives in its own column — so the list shows the
    place and falls back to the country when a row has no state. */
export function stationPlace(station) {
  const state = String(station?.state ?? '').trim()
  return state || String(station?.country ?? '').trim()
}
