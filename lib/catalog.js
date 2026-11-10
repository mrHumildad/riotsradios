/**
 * Catalog construction and swap safety.
 *
 * The catalog CSV has two possible sources: the snapshot bundled with the build
 * and the copy published by riotsradios-epg. Both go through the exact same
 * pipeline here, so a remote row is never treated more leniently than a bundled
 * one.
 *
 * Pure module (no fetch, no storage, no React) so the guard that decides whether
 * a remote file may replace the shipped one is testable on its own.
 */

import { REQUIRED_COLUMNS, parseStationRows, isPlayableStation } from './stations.js'

/** Header cells of a CSV, trimmed, in file order. */
export function catalogHeaders(csvString) {
  const [first = ''] = String(csvString || '').replace(/^\uFEFF/, '').split(/\r?\n/)
  if (!first.trim()) return []
  return splitHeader(first).map((cell) => cell.trim())
}

/* Headers come from the first physical line: a quoted field cannot legally
   contain a newline before the header row is closed, and every real catalog is
   written header-first by the editor. */
function splitHeader(line) {
  const cells = []
  let value = ''
  let quoted = false
  for (let i = 0; i < line.length; i++) {
    const char = line[i]
    if (char === '"') {
      if (quoted && line[i + 1] === '"') { value += '"'; i++ } else quoted = !quoted
    } else if (char === ',' && !quoted) {
      cells.push(value)
      value = ''
    } else {
      value += char
    }
  }
  cells.push(value)
  return cells
}

/**
 * Turn CSV text into the array the player renders.
 *
 * @param {string} csvString
 * @param {object} [options]
 * @param {Record<string, object>} [options.health] id-keyed health snapshot
 * @param {Set<string>} [options.cleartextHosts] plain-HTTP hosts the app may carry
 * @param {boolean} [options.hideUnplayable] drop rows `isPlayableStation` rejects
 * @returns {Array<Record<string, unknown> & { _line: number, health: object|null }>}
 */
export function buildCatalog(csvString, {
  health = {},
  cleartextHosts,
  hideUnplayable = true,
} = {}) {
  return parseStationRows(csvString)
    .filter((station) => !hideUnplayable || isPlayableStation(station, { cleartextHosts }))
    .map((station) => ({ ...station, health: health[String(station.id)] || null }))
}

/** Counts used by the swap guard and the dev log. */
export function catalogSummary(stations) {
  const seen = new Set()
  let playable = 0
  let hidden = 0
  for (const station of stations) {
    if (!Number.isInteger(station.id) || station.id <= 0 || seen.has(station.id)) continue
    seen.add(station.id)
    if (isPlayableStation(station)) playable++
    if (station.stream_broken) hidden++
  }
  return { rows: stations.length, playable, hidden, uniqueIds: seen.size }
}

/**
 * Decide whether a remote catalog CSV may replace the catalog already on the
 * device.
 *
 * The publish side validates every row before it deploys, but this runs when the
 * file is already in the hands of a listener: a truncated push, a 404 page
 * served with 200 or a half-committed CSV must leave the last good catalog in
 * charge rather than empty the station list. Nothing here re-implements the row
 * rules — that is `isPlayableStation` in both places.
 *
 * @param {string} csvString candidate file
 * @param {object} [options]
 * @param {Array<object>} [options.current] stations currently in use
 * @param {number} [options.minRatio] floor, relative to the current playable count
 * @returns {{ ok: boolean, errors: string[], summary: object }}
 */
export function assessCatalogCsv(csvString, { current = [], minRatio = 0.6 } = {}) {
  const errors = []
  const text = typeof csvString === 'string' ? csvString : ''

  if (!text.trim()) {
    return { ok: false, errors: ['file is empty'], summary: catalogSummary([]) }
  }

  const headers = catalogHeaders(text)
  const missing = REQUIRED_COLUMNS.filter((column) => !headers.includes(column))
  if (missing.length > 0) {
    errors.push(`missing required column(s): ${missing.join(', ')}`)
    /* A file without the required columns is not a catalog; stop before the
       ratio check turns "0 playable rows" into a second, redundant error. */
    return { ok: false, errors, summary: catalogSummary([]) }
  }

  const rows = parseStationRows(text)
  const summary = catalogSummary(rows)

  const invalidIds = rows.filter((station) => !Number.isInteger(station.id) || station.id <= 0)
  if (invalidIds.length > 0) {
    errors.push(`${invalidIds.length} row(s) with an id that is not a positive integer`)
  }
  if (summary.uniqueIds !== rows.length) {
    errors.push(`${rows.length - summary.uniqueIds} duplicate id(s)`)
  }
  if (summary.playable === 0) {
    errors.push('no playable station')
  }

  const currentPlayable = catalogSummary(current).playable
  if (currentPlayable > 0 && summary.playable < Math.ceil(currentPlayable * minRatio)) {
    errors.push(
      `only ${summary.playable} playable row(s), down from ${currentPlayable} ` +
      `(a remote file may not drop more than ${Math.round((1 - minRatio) * 100)}%)`
    )
  }

  return { ok: errors.length === 0, errors, summary }
}
