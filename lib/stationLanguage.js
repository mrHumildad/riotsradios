/** Language of a station, in preference order:
 *
 *  1. the guide's own `language` (riotsradios-epg owns the guides),
 *  2. the catalog row's optional `language` column,
 *  3. the row's country code.
 *
 *  Catalan and Basque cannot come from a country code — every row in those
 *  languages is `ES` — so the guide or the column is the only way to say `ca`
 *  or `eu`. A row with none of the three yields '' and is never hidden by the
 *  language filter.
 */
const LANGUAGE_BY_COUNTRY = {
  AR: 'es',
  AT: 'de',
  BR: 'pt',
  CL: 'es',
  DE: 'de',
  EC: 'es',
  ES: 'es',
  FR: 'fr',
  GB: 'en',
  HU: 'hu',
  IT: 'it',
  JM: 'en',
  KP: 'ko',
  MX: 'es',
  NL: 'nl',
  NZ: 'en',
  US: 'en',
  UY: 'es',
  VE: 'es',
}

function normalizeLanguageTag(value) {
  const tag = String(value ?? '').trim().toLowerCase().split(/[-_]/)[0]
  return /^[a-z]{2}$/.test(tag) ? tag : ''
}

/** The language a guide declares, from `language` or `metadata.language`. */
export function epgLanguage(epg) {
  return normalizeLanguageTag(epg?.language) || normalizeLanguageTag(epg?.metadata?.language)
}

export function stationLanguage(station, epg = null) {
  return epgLanguage(epg)
    || normalizeLanguageTag(station?.language)
    || LANGUAGE_BY_COUNTRY[String(station?.countrycode ?? '').trim().toUpperCase()]
    || ''
}

/** Every language the catalog carries, most useful first: the browser's own
    preferences that the catalog actually has, then the rest by station count
    (ties alphabetical). Catalan and Basque guides/rows therefore get their own
    stop in the LANG toggle alongside ES. */
export function catalogLanguages(stations, browserLanguages = [], epgByStation = null) {
  const counts = new Map()
  for (const station of stations) {
    const language = stationLanguage(station, epgByStation?.get?.(station.id))
    if (language) counts.set(language, (counts.get(language) || 0) + 1)
  }

  const ordered = []
  for (const entry of browserLanguages) {
    const language = normalizeLanguageTag(entry)
    if (counts.has(language) && !ordered.includes(language)) ordered.push(language)
  }

  const rest = [...counts.keys()]
    .filter(language => !ordered.includes(language))
    .sort((a, b) => counts.get(b) - counts.get(a) || a.localeCompare(b))

  return ordered.concat(rest)
}

/** The language the LANG toggle starts from: the catalog's best match for the
    browser, or '' when no station carries a language at all. */
export function preferredLanguage(stations, browserLanguages = [], epgByStation = null) {
  return catalogLanguages(stations, browserLanguages, epgByStation)[0] || ''
}

/** Spoken name of a language for labels and tooltips, e.g. 'ca' -> 'Catalan'.
    Falls back to the uppercased code when Intl has no name for it. */
export function languageName(language, locale = 'en') {
  if (!language) return 'all languages'
  try {
    const names = new Intl.DisplayNames([locale], { type: 'language' })
    const name = names.of(language)
    /* Intl echoes an unknown code back unchanged; show it uppercased instead. */
    return !name || name.toLowerCase() === language.toLowerCase()
      ? language.toUpperCase()
      : name
  } catch {
    return language.toUpperCase()
  }
}
