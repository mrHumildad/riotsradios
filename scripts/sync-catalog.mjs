// Catalog snapshot sync against riotsradios-epg.
//
//   node scripts/sync-catalog.mjs --check   # exit 2 when the snapshot is stale
//   node scripts/sync-catalog.mjs --write   # adopt the published catalog
//
// riotsradios-epg owns stations.csv and the health snapshot. The copies committed
// here are caches and release snapshots: they are what a fresh install and a cold
// Android start read, and what validate:stations checks. `--check` keeps the
// catalog from silently drifting; the scheduled workflow runs `--write` and opens
// a PR for both files.
//
// A network failure is not a catalog failure: `--check` warns and exits 0 so an
// offline build still works. Pass `--strict` (CI) to make it fail instead.
//
// The snapshot also carries an optional `language` column that the published file
// does not have yet (ca/eu cannot come from a country code). `applyLanguageOverlay`
// re-applies it on every sync, so adopting a new catalog never drops it.

import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { REQUIRED_COLUMNS, parseStationRows } from '../lib/stations.js'
import { assessCatalogCsv, catalogHeaders } from '../lib/catalog.js'
import { catalogUrl, parseCatalogManifest } from '../lib/catalogFeed.js'
import { applyLanguageOverlay } from '../lib/catalogLanguage.js'

const CSV_PATH = 'stations.csv'
const HEALTH_PATH = 'data/health.json'
const DEFAULT_BASE = 'https://mrhumildad.github.io/riotsradios-epg'

function parseArgs(argv) {
  const args = { mode: 'check', base: process.env.CATALOG_BASE_URL || DEFAULT_BASE, strict: false }
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--check') args.mode = 'check'
    else if (arg === '--write') args.mode = 'write'
    else if (arg === '--strict') args.strict = true
    else if (arg === '--no-health') args.noHealth = true
    else if (arg === '--base') args.base = argv[++i]
    else if (arg.startsWith('--base=')) args.base = arg.slice('--base='.length)
    else if (arg === '--help' || arg === '-h') args.mode = 'help'
    else throw new Error(`unknown argument: ${arg}`)
  }
  args.base = String(args.base).replace(/\/+$/, '')
  return args
}

const sha256 = (text) => createHash('sha256').update(text, 'utf8').digest('hex')

async function readLocal() {
  try {
    return await readFile(CSV_PATH, 'utf8')
  } catch {
    return null
  }
}

/** Ids added / removed / changed, for a human to read before merging. */
function diffCatalog(localCsv, remoteCsv) {
  const toMap = (csv) => new Map(parseStationRows(csv).map((row) => [row.id, row]))
  const before = toMap(localCsv || '')
  const after = toMap(remoteCsv)

  const added = [...after.keys()].filter((id) => !before.has(id))
  const removed = [...before.keys()].filter((id) => !after.has(id))
  const changed = [...after.keys()].filter((id) => {
    const a = before.get(id)
    const b = after.get(id)
    if (!a) return false
    return a.name !== b.name || a.url !== b.url || a.stream_broken !== b.stream_broken
  })

  const name = (id, map) => map.get(id)?.name || `id ${id}`
  return {
    added: added.map((id) => name(id, after)),
    removed: removed.map((id) => name(id, before)),
    changed: changed.map((id) => name(id, after)),
  }
}

/** Key-sorted clone: the snapshot is compared and written in a stable shape. */
function stable(value) {
  if (Array.isArray(value)) return value.map(stable)
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]))
  }
  return value
}

function isHealthSnapshot(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const entries = Object.values(value)
  return entries.length > 0 && entries.every((entry) => entry && typeof entry === 'object' && 'status' in entry)
}

/**
 * Adopt the published health snapshot.
 *
 * Health is owned by riotsradios-epg (`catalog/health.json`); this only mirrors
 * it, so the bundle ships badges for a fresh install and for an offline start.
 */
async function syncHealth({ baseUrl, write }) {
  let remote
  try {
    const response = await fetch(`${baseUrl}/catalog/health.json`, {
      headers: { 'cache-control': 'no-cache' },
      signal: AbortSignal.timeout(15000),
    })
    if (!response.ok) return { changed: false, reason: `HTTP ${response.status}` }
    remote = await response.json()
  } catch (e) {
    return { changed: false, reason: e.message }
  }
  if (!isHealthSnapshot(remote)) return { changed: false, reason: 'not a health snapshot' }

  let local = null
  try {
    local = JSON.parse(await readFile(HEALTH_PATH, 'utf8'))
  } catch {
    local = null
  }

  const changed = JSON.stringify(stable(local)) !== JSON.stringify(stable(remote))
  if (write && changed) {
    await writeFile(HEALTH_PATH, `${JSON.stringify(stable(remote), null, 2)}\n`, 'utf8')
  }
  return { changed, stations: Object.keys(remote).length }
}

function reportHealth(result, mode) {
  if (!result || result.reason) return
  if (!result.changed) return
  if (mode === 'write') console.log(`✅ ${HEALTH_PATH} updated (${result.stations} station(s))`)
  else console.warn(`⚠️  ${HEALTH_PATH} is behind the published snapshot — run \`npm run catalog:sync\``)
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.mode === 'help') {
    console.log('usage: sync-catalog.mjs [--check|--write] [--base URL] [--strict] [--no-health]')
    return 0
  }

  const local = await readLocal()

  let manifest
  try {
    const response = await fetch(`${args.base}/catalog/manifest.json`, {
      headers: { 'cache-control': 'no-cache' },
      signal: AbortSignal.timeout(15000),
    })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    manifest = parseCatalogManifest(await response.json())
    if (!manifest) throw new Error('manifest is missing version/file')
  } catch (e) {
    const message = `cannot read ${args.base}/catalog/manifest.json (${e.message})`
    if (args.strict) {
      console.error(`❌ ${message}`)
      return 1
    }
    console.warn(`⚠️  ${message} — skipping the catalog drift check`)
    return 0
  }

  const response = await fetch(catalogUrl(args.base, manifest.file, manifest.version), {
    signal: AbortSignal.timeout(30000),
  })
  if (!response.ok) {
    console.error(`❌ cannot download ${manifest.file} (HTTP ${response.status})`)
    return 1
  }
  const remote = await response.text()

  /* The version is the content hash; a mismatch means the publish wrote a stale
     manifest and the version can no longer be trusted as a cache key. */
  const published = sha256(remote)
  if (published !== manifest.version) {
    console.error(
      `❌ published ${manifest.file} hashes to ${published.slice(0, 12)}, but the manifest says ` +
      `${manifest.version.slice(0, 12)} — republish the manifest`
    )
    return 1
  }

  const missing = REQUIRED_COLUMNS.filter((column) => !catalogHeaders(remote).includes(column))
  if (missing.length > 0) {
    console.error(`❌ published catalog is missing required column(s): ${missing.join(', ')}`)
    return 1
  }

  const verdict = assessCatalogCsv(remote, { current: parseStationRows(local || '') })
  if (!verdict.ok) {
    console.error('❌ published catalog is not usable:')
    for (const error of verdict.errors) console.error(`   ${error}`)
    return 1
  }

  const health = args.noHealth
    ? null
    : await syncHealth({ baseUrl: args.base, write: args.mode === 'write' })
  if (health?.reason) {
    if (args.strict) console.warn(`⚠️  ${HEALTH_PATH} not synced: ${health.reason}`)
  }

  /* Keep the snapshot's `language` column across the swap. Once the published
     file has its own column, `adopted` is the published bytes unchanged. */
  const adopted = applyLanguageOverlay(remote, local || '')
  const localHash = local === null ? null : sha256(local)
  if (localHash === sha256(adopted)) {
    console.log(`✅ ${CSV_PATH} matches the published catalog (${manifest.version.slice(0, 12)})`)
    reportHealth(health, args.mode)
    return 0
  }

  const diff = diffCatalog(local, adopted)
  const describe = () =>
    [
      `published ${manifest.version.slice(0, 12)} · ${verdict.summary.playable} playable of ${verdict.summary.rows} rows`,
      `  new:     ${diff.added.join(', ') || '—'}`,
      `  removed: ${diff.removed.join(', ') || '—'}`,
      `  changed: ${diff.changed.join(', ') || '—'}`,
    ].join('\n')

  if (args.mode === 'check') {
    console.error(`❌ ${CSV_PATH} does not match the published catalog\n${describe()}`)
    console.error('   run `npm run catalog:sync` to adopt it')
    return 2
  }

  await writeFile(CSV_PATH, adopted, 'utf8')
  console.log(`✅ ${CSV_PATH} updated\n${describe()}`)
  reportHealth(health, args.mode)
  return 0
}

main()
  .then((code) => process.exit(code))
  .catch((e) => {
    console.error('Error:', e.message)
    process.exit(1)
  })
