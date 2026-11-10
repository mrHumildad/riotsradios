/**
 * The snapshot's `language` column, carried into the published catalog.
 *
 * riotsradios-epg owns `stations.csv`, but it does not publish `language` yet.
 * This repository's snapshot does, because the LANG toggle needs `ca` and `eu` —
 * languages no country code can express. Until upstream adopts the column, every
 * sync re-appends it to the published file, filling values by station id.
 *
 * Once the published catalog has its own `language` column, that file wins and
 * this function becomes a passthrough, so the overlay disappears by itself.
 */

import { parseCsv } from './parseCsv.js'

export const LANGUAGE_COLUMN = 'language'

/** RFC 4180 output with minimal quoting: same style the catalog is authored in. */
function formatRow(cells) {
  return cells
    .map((cell) => {
      const value = cell ?? ''
      return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value
    })
    .join(',')
}

/**
 * @param {string} publishedCsv the catalog downloaded from riotsradios-epg
 * @param {string} snapshotCsv this repository's committed `stations.csv`
 * @returns {string} the file to compare against and write, with `language` kept
 */
export function applyLanguageOverlay(publishedCsv, snapshotCsv) {
  if (typeof publishedCsv !== 'string' || !publishedCsv.trim()) return publishedCsv

  const published = parseCsv(publishedCsv)
  if (published.length === 0) return publishedCsv

  const publishedHeaders = published[0].map((cell) => cell.trim())
  if (publishedHeaders.includes(LANGUAGE_COLUMN)) return publishedCsv

  const snapshot = parseCsv(snapshotCsv || '')
  if (snapshot.length === 0) return publishedCsv

  const snapshotHeaders = snapshot[0].map((cell) => cell.trim())
  const snapshotLanguage = snapshotHeaders.indexOf(LANGUAGE_COLUMN)
  const snapshotId = snapshotHeaders.indexOf('id')
  const publishedId = publishedHeaders.indexOf('id')
  if (snapshotLanguage === -1 || snapshotId === -1 || publishedId === -1) return publishedCsv

  const languageById = new Map()
  for (const row of snapshot.slice(1)) {
    const id = Number.parseInt((row[snapshotId] ?? '').trim(), 10)
    const language = (row[snapshotLanguage] ?? '').trim()
    if (Number.isInteger(id) && language) languageById.set(id, language)
  }

  const lines = [formatRow([...publishedHeaders, LANGUAGE_COLUMN])]
  for (const row of published.slice(1)) {
    const cells = [...row]
    /* A short row (an author forgot a trailing comma) must not shift the new
       value into the wrong column. */
    while (cells.length < publishedHeaders.length) cells.push('')
    const id = Number.parseInt((cells[publishedId] ?? '').trim(), 10)
    cells.push(languageById.get(id) || '')
    lines.push(formatRow(cells))
  }

  const body = lines.join('\n')
  return publishedCsv.endsWith('\n') ? `${body}\n` : body
}
