/**
 * Station local time.
 *
 * The authoritative per-station timezone lives in the station's EPG file, but
 * most of the catalog ships no guide. The player clock still has to show the
 * broadcaster's local time, so the station's country stands in — with a state
 * hint for the one country in the catalog that spans two zones.
 */

/** Zones covering the catalog by ISO country code. */
const COUNTRY_ZONES = {
  AR: 'America/Argentina/Buenos_Aires',
  AT: 'Europe/Vienna',
  BR: 'America/Recife',
  CL: 'America/Santiago',
  DE: 'Europe/Berlin',
  EC: 'America/Guayaquil',
  ES: 'Europe/Madrid',
  FR: 'Europe/Paris',
  GB: 'Europe/London',
  HU: 'Europe/Budapest',
  IT: 'Europe/Rome',
  JM: 'America/Jamaica',
  KP: 'Asia/Pyongyang',
  MX: 'America/Mexico_City',
  NL: 'Europe/Amsterdam',
  NZ: 'Pacific/Auckland',
  UY: 'America/Montevideo',
  VE: 'America/Caracas',
  /* The catalog's only US station is in Connecticut (Eastern). A station from
     another US zone would need an entry in STATE_ZONES below. */
  US: 'America/New_York',
}

/* The Canaries keep their own zone all year, an hour behind the mainland. */
const STATE_ZONES = [
  { countrycode: 'ES', match: /canarias|las palmas|tenerife/i, zone: 'Atlantic/Canary' },
]

/**
 * IANA timezone for a station: the guide's own zone when known, otherwise the
 * zone of the place the station broadcasts from.
 *
 * @param {object|null} station catalog row (`countrycode`, `state`)
 * @param {object|null} [epg] the station's EPG file, if it has one
 * @returns {string|null} null when the place is unknown
 */
export function stationTimeZone(station, epg) {
  const guideZone = typeof epg?.timezone === 'string' ? epg.timezone.trim() : ''
  if (guideZone) return guideZone

  const countrycode = String(station?.countrycode || '').trim().toUpperCase()
  const state = String(station?.state || '')
  const override = STATE_ZONES.find(
    (entry) => entry.countrycode === countrycode && entry.match.test(state)
  )
  if (override) return override.zone

  return COUNTRY_ZONES[countrycode] || null
}
