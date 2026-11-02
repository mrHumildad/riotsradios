import csvRaw from './stations.csv?raw'
import healthRaw from './data/health.json'
import cleartextAllowlist from './data/cleartext-hosts.json'
import { parseStationRows, isPlayableStation } from './lib/stations.js'
import { parseAllowlist } from './lib/cleartext.js'

export { isValidStreamUrl, parseStationRows, isPlayableStation } from './lib/stations.js'

const allRows = parseStationRows(csvRaw)

/* Only the Android bundle may render plain-HTTP stations: it serves its own
   origin over http and its network security config permits these hosts. The
   GitHub Pages bundle cannot — mixed content blocks them — so `__APP_BUILD__`
   is false there and the same rows stay hidden. */
const APP_BUILD = typeof __APP_BUILD__ !== 'undefined' && __APP_BUILD__ === true
const cleartextHosts = APP_BUILD ? parseAllowlist(cleartextAllowlist).hostSet : undefined

/* `health` comes from the last probe run (data/health.json); null when a
   station has not been probed yet. */
export const stations = allRows
  .filter(s => isPlayableStation(s, { cleartextHosts }))
  .map((station) => ({ ...station, health: healthRaw[String(station.id)] || null }))

/* Make catalog problems visible in development instead of rendering a blank
   row the user can select. The build-time gate is scripts/validate-stations.js. */
if (import.meta.env?.DEV) {
  const dropped = allRows.filter(s => !s.stream_broken && !isPlayableStation(s, { cleartextHosts }))
  if (dropped.length > 0) {
    console.warn(
      `[stations] dropped ${dropped.length} invalid catalog row(s); run \`npm run validate:stations\` for details`,
      dropped.map(s => ({ line: s._line, id: s.id, name: s.name, url: s.url }))
    )
  }
}
