import csvRaw from './stations.csv?raw'
import healthRaw from './data/health.json'
import { parseStationRows, isPlayableStation } from './lib/stations.js'

export { isValidStreamUrl, parseStationRows, isPlayableStation } from './lib/stations.js'

const allRows = parseStationRows(csvRaw)

/* `health` comes from the last probe run (data/health.json); null when a
   station has not been probed yet. */
export const stations = allRows
  .filter(isPlayableStation)
  .map((station) => ({ ...station, health: healthRaw[String(station.id)] || null }))

/* Make catalog problems visible in development instead of rendering a blank
   row the user can select. The build-time gate is scripts/validate-stations.js. */
if (import.meta.env?.DEV) {
  const dropped = allRows.filter(s => !s.stream_broken && !isPlayableStation(s))
  if (dropped.length > 0) {
    console.warn(
      `[stations] dropped ${dropped.length} invalid catalog row(s); run \`npm run validate:stations\` for details`,
      dropped.map(s => ({ line: s._line, id: s.id, name: s.name, url: s.url }))
    )
  }
}
