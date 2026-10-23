import { parseCsv } from './parseCsv.js'

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
    and no `stream_broken` mark. */
export function isPlayableStation(station) {
  return Boolean(
    station &&
    Number.isInteger(station.id) &&
    station.id > 0 &&
    !station.stream_broken &&
    isValidStreamUrl(station.url)
  )
}
