// Catalog validator for stations.csv
// Run: node scripts/validate-stations.js  (also runs before `npm run build`)
//
// Fails on catalog defects that would reach the player as a blank row, a broken
// click target, an unsafe URL, or an active http:// stream (browsers block mixed
// content on the HTTPS deployment, so an https:// mirror or the relay is required).

import { readFile, readdir } from 'node:fs/promises'
import { parseCsv } from '../lib/parseCsv.js'
import { REQUIRED_COLUMNS, parseStationRows, isPlayableStation } from '../lib/stations.js'

const CSV_PATH = 'stations.csv'
const EPG_DIR = 'public/EPGs'

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

  /* ── row checks ────────────────────────────────────────────────── */
  const rows = parseStationRows(csv)
  const active = rows.filter(s => !s.stream_broken)
  const seenIds = new Map()
  const seenUrls = new Map()

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
        fail(line, `${label(station)}: active station uses http://, which browsers block on the HTTPS deployment — use an https:// mirror or the relay`)
      }
    }

    /* Links are rendered into the page, so clamp them to http(s). */
    for (const field of ['webpage', 'icon', 'epg_url']) {
      const value = station[field]
      if (value && !isHttpUrl(value)) {
        fail(line, `${label(station)}: ${field} must start with http:// or https:// — ${JSON.stringify(value)}`)
      }
    }

    if (station.epg_file && !station.stream_broken && epgFiles && !epgFiles.has(station.epg_file)) {
      fail(line, `${label(station)}: epg_file "${station.epg_file}" does not exist in ${EPG_DIR}/`)
    }
  }

  /* ── report ────────────────────────────────────────────────────── */
  const renderable = rows.filter(isPlayableStation).length
  console.log(`\n${CSV_PATH}`)
  console.log(`  rows: ${rows.length}   active: ${active.length}   marked broken: ${rows.length - active.length}   renderable: ${renderable}`)

  if (brokenWithoutUrl > 0) {
    info.push(`${brokenWithoutUrl} broken row(s) have no URL yet (needs a stream to be useful)`)
  }

  if (warnings.length > 0) {
    console.log(`\n⚠️  ${warnings.length} warning(s)`)
    for (const { line, message } of warnings) console.log(`   ${line ? `line ${line}  ` : ''}${message}`)
    console.log('   warnings do not block the build')
  }

  for (const message of info) console.log(`\nℹ️  ${message}`)

  if (errors.length > 0) {
    console.log(`\n❌ ${errors.length} error(s)`)
    for (const { line, message } of errors) console.log(`   line ${line}  ${message}`)
    console.log('')
    process.exit(1)
  }

  console.log('\n✅ Catalog valid\n')
}

main().catch(e => {
  console.error('Error:', e)
  process.exit(1)
})
