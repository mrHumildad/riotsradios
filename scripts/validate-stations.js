// Catalog validator for stations.csv
// Run: node scripts/validate-stations.js  (also runs before `npm run build`)
//
// Fails on catalog defects that would reach the player as a blank row, a broken
// click target, an unsafe URL, or an active http:// stream nobody permits.
//
// An active http:// row is accepted only when its host is listed in
// data/cleartext-hosts.json with that station id: those rows are carried by the
// Android app (whose network security config is generated from the same file)
// and stay hidden by the https GitHub Pages build.

import { readFile, readdir } from 'node:fs/promises'
import { parseCsv } from '../lib/parseCsv.js'
import { REQUIRED_COLUMNS, parseStationRows, isPlayableStation } from '../lib/stations.js'
import {
  normalizeHost,
  parseAllowlist,
  renderNetworkSecurityConfig,
} from '../lib/cleartext.js'

const CSV_PATH = 'stations.csv'
const EPG_DIR = 'public/EPGs'
const ALLOWLIST_PATH = 'data/cleartext-hosts.json'
const CLEARTEXT_CONFIG_PATH = 'android/app/src/main/res/xml/network_security_config.xml'

const errors = []
const warnings = []
const info = []

const fail = (line, message) => errors.push({ line, message })
const warn = (line, message) => warnings.push({ line, message })

function label(station) {
  return `id ${station.id}${station.name ? ` (${station.name})` : ''}`
}

function isHttpUrl(value) {
  return /^https?:\/\//i.test(value)
}

async function main() {
  let csv
  try {
    csv = await readFile(CSV_PATH, 'utf8')
  } catch (e) {
    console.error(`Cannot read ${CSV_PATH}: ${e.message}`)
    process.exit(1)
  }

  /* ── structural checks ─────────────────────────────────────────── */
  const rawRows = parseCsv(csv)
  if (rawRows.length < 2) {
    console.error(`${CSV_PATH} has no data rows`)
    process.exit(1)
  }

  const headers = rawRows[0].map(h => h.trim())
  const missing = REQUIRED_COLUMNS.filter(c => !headers.includes(c))
  if (missing.length > 0) {
    console.error(`${CSV_PATH} is missing required column(s): ${missing.join(', ')}`)
    process.exit(1)
  }

  for (const [index, values] of rawRows.slice(1).entries()) {
    if (values.length !== headers.length) {
      fail(index + 2, `expected ${headers.length} fields, found ${values.length} — is a quoted field unterminated?`)
    }
  }

  /* ── cleartext allowlist (shared with the Android build) ───────── */
  let allowlist
  try {
    allowlist = parseAllowlist(JSON.parse(await readFile(ALLOWLIST_PATH, 'utf8')))
  } catch (e) {
    console.error(`Cannot read ${ALLOWLIST_PATH}: ${e.message}`)
    process.exit(1)
  }

  /* ── row checks ────────────────────────────────────────────────── */
  const rows = parseStationRows(csv)
  const active = rows.filter(s => !s.stream_broken)
  const seenIds = new Map()
  const seenUrls = new Map()
  const carriedByApp = []

  let epgFiles = null
  try {
    epgFiles = new Set(await readdir(EPG_DIR))
  } catch {
    warn(null, `cannot read ${EPG_DIR}; skipping EPG file checks`)
  }

  let brokenWithoutUrl = 0

  for (const station of rows) {
    const line = station._line

    if (!Number.isInteger(station.id) || station.id <= 0) {
      fail(line, `invalid id "${station.id}" — ids must be positive integers`)
    } else if (seenIds.has(station.id)) {
      fail(line, `duplicate id ${station.id} (also on line ${seenIds.get(station.id)})`)
    } else {
      seenIds.set(station.id, line)
    }

    if (station.stream_broken && station.stream_broken !== 'true') {
      warn(line, `${label(station)}: stream_broken is "${station.stream_broken}", expected "" or "true"`)
    }

    if (!station.stream_broken && !station.name) {
      fail(line, `active station id ${station.id} has no name`)
    }

    /* A defect only blocks the build when the row is actually rendered;
       broken rows are already hidden, so their defects are reported as warnings. */
    const problem = station.stream_broken ? warn : fail

    if (!station.url) {
      if (station.stream_broken) brokenWithoutUrl++
      else fail(line, `${label(station)}: active station has no stream URL`)
    } else if (/\s/.test(station.url)) {
      problem(line, `${label(station)}: stream URL contains whitespace/newline — ${JSON.stringify(station.url)}`)
    } else if (!isHttpUrl(station.url)) {
      problem(line, `${label(station)}: stream URL must start with http:// or https:// — ${JSON.stringify(station.url)}`)
    } else if (!station.stream_broken) {
      if (seenUrls.has(station.url)) {
        fail(line, `${label(station)}: duplicate stream URL (also id ${seenUrls.get(station.url).id} on line ${seenUrls.get(station.url).line})`)
      } else {
        seenUrls.set(station.url, { id: station.id, line })
      }

      if (station.url.startsWith('http://')) {
        const host = normalizeHost(station.url)
        const entry = allowlist.entries.find((e) => e.host === host)
        if (!entry) {
          fail(line, `${label(station)}: active station uses http://, which browsers block on the HTTPS deployment — use an https:// mirror, or add ${host} to ${ALLOWLIST_PATH} to carry it in the app only`)
        } else if (!entry.station_ids.includes(station.id)) {
          fail(line, `${label(station)}: ${host} is allowlisted, but id ${station.id} is not in its station_ids in ${ALLOWLIST_PATH}`)
        } else {
          carriedByApp.push(station)
        }
      }
    }

    /* Links are rendered into the page, so clamp them to http(s). */
    for (const field of ['homepage', 'favicon']) {
      const value = station[field]
      if (value && !isHttpUrl(value)) {
        fail(line, `${label(station)}: ${field} must start with http:// or https:// — ${JSON.stringify(value)}`)
      }
    }

    /* Stored mirrors are never rendered or played, so a bad one is a warning:
       the column name promises the scheme, and a silent mismatch hides a typo. */
    for (const [field, prefix] of [['url_http', 'http://'], ['url_https', 'https://']]) {
      const value = station[field]
      if (!value) continue
      if (/\s/.test(value)) {
        warn(line, `${label(station)}: ${field} contains whitespace/newline — ${JSON.stringify(value)}`)
      } else if (!value.startsWith(prefix)) {
        warn(line, `${label(station)}: ${field} must start with ${prefix} — ${JSON.stringify(value)}`)
      }
    }

    /* API-shaped metadata: the shapes are checked so a hand edit cannot smuggle
       in a value the player would misread. A blank field is always fine. */
    if (station.countrycode && !/^[A-Z]{2}$/.test(station.countrycode)) {
      warn(line, `${label(station)}: countrycode should be a two-letter ISO code — ${JSON.stringify(station.countrycode)}`)
    }
    if (station.language && !/^[a-z]{2}$/.test(station.language)) {
      warn(line, `${label(station)}: language should be a lowercase ISO 639-1 code — ${JSON.stringify(station.language)}`)
    }
    if (station.bitrate && !/^\d+$/.test(station.bitrate)) {
      warn(line, `${label(station)}: bitrate should be whole kbps — ${JSON.stringify(station.bitrate)}`)
    }
    for (const field of ['hls', 'lastcheckok']) {
      const value = station[field]
      if (value && !/^[01]$/.test(value)) {
        warn(line, `${label(station)}: ${field} is "0" or "1" — ${JSON.stringify(value)}`)
      }
    }

    if (station.epg_file && !station.stream_broken && epgFiles && !epgFiles.has(station.epg_file)) {
      fail(line, `${label(station)}: epg_file "${station.epg_file}" does not exist in ${EPG_DIR}/`)
    }
  }

  /* ── allowlist consistency ─────────────────────────────────────── */
  for (const entry of allowlist.entries) {
    const used = rows.some(
      (s) =>
        !s.stream_broken &&
        s.url &&
        normalizeHost(s.url) === entry.host &&
        entry.station_ids.includes(s.id)
    )
    if (!used) {
      fail(null, `${ALLOWLIST_PATH} lists ${entry.host}, but no active http:// station uses it — remove the entry or its stale station id(s)`)
    }
  }

  /* The Android config is generated from the allowlist; a hand edit drifts. */
  try {
    const committed = await readFile(CLEARTEXT_CONFIG_PATH, 'utf8')
    if (committed !== renderNetworkSecurityConfig(allowlist.entries)) {
      fail(null, `${CLEARTEXT_CONFIG_PATH} is stale — run \`npm run cleartext:config\``)
    }
  } catch {
    /* android/ not generated yet: nothing to compare */
  }

  /* ── report ────────────────────────────────────────────────────── */
  const renderable = rows.filter(s => isPlayableStation(s, { cleartextHosts: allowlist.hostSet })).length
  console.log(`\n${CSV_PATH}`)
  console.log(`  rows: ${rows.length}   active: ${active.length}   marked broken: ${rows.length - active.length}   renderable: ${renderable}`)

  if (brokenWithoutUrl > 0) {
    info.push(`${brokenWithoutUrl} broken row(s) have no URL yet (needs a stream to be useful)`)
  }

  if (carriedByApp.length > 0) {
    info.push(
      `${carriedByApp.length} active http:// row(s) carried by the app only (${ALLOWLIST_PATH}): ${carriedByApp.map(s => s.id).join(', ')} — hidden by the Pages build`
    )
  }

  if (warnings.length > 0) {
    console.log(`\n⚠️  ${warnings.length} warning(s)`)
    for (const { line, message } of warnings) console.log(`   ${line ? `line ${line}  ` : ''}${message}`)
    console.log('   warnings do not block the build')
  }

  for (const message of info) console.log(`\nℹ️  ${message}`)

  if (errors.length > 0) {
    console.log(`\n❌ ${errors.length} error(s)`)
    for (const { line, message } of errors) console.log(`   ${line ? `line ${line}  ` : ''}${message}`)
    console.log('')
    process.exit(1)
  }

  console.log('\n✅ Catalog valid\n')
}

main().catch(e => {
  console.error('Error:', e)
  process.exit(1)
})
