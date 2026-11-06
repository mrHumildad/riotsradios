/**
 * Development catalog report.
 *
 * Pure on purpose (no DOM, no console): it turns parsed catalog rows into a
 * plain description of what each station is missing, so `stations.js` can log
 * the whole catalog while you explore it. Production never calls it.
 */

/** Fields a listener-facing row is expected to carry. */
export const REPORTED_FIELDS = ['name', 'url', 'icon', 'webpage', 'location', 'mailto']

function streamScheme(url) {
  if (!url) return null
  if (/^https:\/\//i.test(url)) return 'https'
  if (/^http:\/\//i.test(url)) return 'http'
  return null
}

/**
 * Describe one station and list what it lacks.
 *
 * @param {object} station parsed row (optionally with `health`)
 * @param {(station: object) => boolean} [isPlayable] renderable predicate
 */
export function describeStation(station, isPlayable) {
  const missing = []
  for (const field of REPORTED_FIELDS) {
    if (!station[field]) missing.push(field)
  }
  const scheme = streamScheme(station.url)
  if (station.url && scheme !== 'https') missing.push('https stream')
  if (!station.health) missing.push('health snapshot')

  return {
    line: station._line ?? null,
    id: station.id,
    name: station.name || '(unnamed)',
    hidden: Boolean(station.stream_broken),
    playable: isPlayable ? Boolean(isPlayable(station)) : false,
    scheme,
    missing,
    location: station.location || '',
    webpage: station.webpage || '',
    url: station.url || '',
    mirrorHttp: station.url_http || '',
    mirrorHttps: station.url_https || '',
    mirrorStatus: {
      http: station.health?.mirrors?.http?.status || '',
      https: station.health?.mirrors?.https?.status || '',
    },
    icon: station.icon || '',
    mailto: station.mailto || '',
    epg: station.epg_file || station.epg_url || '',
    ads: station.has_ads || '',
    health: station.health?.status || '',
  }
}

/**
 * Describe the whole catalog and count how often each gap occurs.
 *
 * @param {Array<object>} rows parsed rows, with `health` already merged in
 * @param {(station: object) => boolean} [isPlayable]
 */
export function buildStationReport(rows, isPlayable) {
  const entries = rows.map((row) => describeStation(row, isPlayable))

  const missingCounts = {}
  for (const entry of entries) {
    for (const gap of entry.missing) missingCounts[gap] = (missingCounts[gap] || 0) + 1
  }

  return {
    total: entries.length,
    hidden: entries.filter((e) => e.hidden).length,
    playable: entries.filter((e) => e.playable).length,
    unplayable: entries.length - entries.filter((e) => e.playable).length,
    /* Active rows with no usable stream at all — the rows that are genuine
       catalog defects. An http-only row is not one: it is carried app-only. */
    invalidActive: entries.filter((e) => !e.hidden && (!e.url || !e.scheme)),
    missingCounts,
    entries,
  }
}
