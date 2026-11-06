// Development-only catalog API for the in-app station editor.
//
// The player's EDIT buttons talk to this middleware, which reads and writes
// stations.csv for real and runs the catalog validator after every save. It
// exists only in `npm run dev` (`apply: 'serve'`), so neither the button nor
// these endpoints are part of the production bundle or the GitHub Pages site.
//
//   GET  <base>/__catalog/stations  → { columns, rows }
//   PUT  <base>/__catalog/stations  → { line, edits } → saved row + validation
//   POST <base>/__catalog/validate  → { ok, output }
//
// Only the edited row is re-serialized; a no-op save leaves stations.csv byte
// for byte identical.

import { execFile } from 'node:child_process'
import { readFile, rename, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { parseCsv } from '../lib/parseCsv.js'
import { stationField } from '../lib/stationFields.js'

const CSV_PATH = fileURLToPath(new URL('../stations.csv', import.meta.url))
const VALIDATOR_PATH = fileURLToPath(new URL('./validate-stations.js', import.meta.url))
const PROJECT_ROOT = fileURLToPath(new URL('..', import.meta.url))

const API_PREFIX = '/__catalog/'
const MAX_BODY_BYTES = 1024 * 1024

function sendJson(res, status, payload) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  res.end(JSON.stringify(payload))
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks = []
    req.on('data', (chunk) => {
      size += chunk.length
      if (size > MAX_BODY_BYTES) {
        reject(new Error('Request body is too large'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

async function loadCatalog() {
  const text = await readFile(CSV_PATH, 'utf8')
  const parsed = parseCsv(text)
  if (parsed.length === 0) throw new Error('stations.csv is empty')

  const headers = parsed[0].map((header) => header.trim())
  const rows = parsed.slice(1).map((values, index) => {
    const row = values.slice()
    while (row.length < headers.length) row.push('')
    return { line: index + 2, values: row }
  })
  return { headers, rows }
}

/* RFC 4180 quoting, applied only when a value would otherwise change the shape
   of the row — this reproduces the committed stations.csv exactly. */
function formatField(value) {
  const raw = String(value ?? '')
  return /[",\r\n]/.test(raw) || /^\s|\s$/.test(raw) ? `"${raw.replace(/"/g, '""')}"` : raw
}

const serialize = (headers, rows) =>
  [headers, ...rows.map((row) => row.values)]
    .map((fields) => fields.map(formatField).join(','))
    .join('\n') + '\n'

function toValues(headers, row) {
  const values = {}
  headers.forEach((header, idx) => {
    if (header) values[header] = row.values[idx] ?? ''
  })
  return values
}

const publicRow = (headers, row) => ({ line: row.line, values: toValues(headers, row) })

async function writeCatalog(catalog) {
  const tmpPath = `${CSV_PATH}.tmp`
  await writeFile(tmpPath, serialize(catalog.headers, catalog.rows), 'utf8')
  await rename(tmpPath, CSV_PATH)
}

function runValidator() {
  return new Promise((resolve) => {
    execFile(
      process.execPath,
      [VALIDATOR_PATH],
      { cwd: PROJECT_ROOT, timeout: 30_000 },
      (error, stdout, stderr) => {
        const output = [stdout, stderr].filter(Boolean).join('\n').trim()
        resolve({ ok: !error, output })
      }
    )
  })
}

/* Saves are serialized: each one reads, edits, writes and renames the file, and
   two overlapping saves would otherwise drop one of them. */
let writeQueue = Promise.resolve()
function enqueue(task) {
  const run = writeQueue.then(task, task)
  writeQueue = run.then(
    () => {},
    () => {}
  )
  return run
}

async function saveStation({ line, edits }) {
  const catalog = await loadCatalog()
  const row = catalog.rows.find((candidate) => candidate.line === Number(line))
  if (!row) {
    return { status: 404, payload: { ok: false, error: 'That station is gone — reload the page.' } }
  }
  if (!edits || typeof edits !== 'object') {
    return { status: 400, payload: { ok: false, error: 'Malformed request: expected `edits`.' } }
  }

  const changes = []
  for (const [key, value] of Object.entries(edits)) {
    const column = catalog.headers.indexOf(key)
    if (column === -1) continue     /* unknown column: ignore */
    if (key === 'id') continue      /* identity is fixed here */

    const next = String(value ?? '').trim()
    const current = row.values[column] ?? ''
    if (next === current) continue

    changes.push({ field: key, from: current, to: next })
    row.values[column] = next
  }

  if (changes.length === 0) {
    return {
      status: 200,
      payload: {
        ok: true,
        saved: false,
        row: publicRow(catalog.headers, row),
        changes,
        validation: await runValidator(),
      },
    }
  }

  await writeCatalog(catalog)

  return {
    status: 200,
    payload: {
      ok: true,
      saved: true,
      row: publicRow(catalog.headers, row),
      changes,
      validation: await runValidator(),
    },
  }
}

/* Append a station, assigning the requested id when it is free and the next
   free id otherwise. Name and stream URL are required: a blank row would only
   reach listeners as a broken entry. */
async function createStation({ values }) {
  const catalog = await loadCatalog()
  if (!values || typeof values !== 'object') {
    return { status: 400, payload: { ok: false, error: 'Malformed request: expected `values`.' } }
  }

  const idColumn = catalog.headers.indexOf('id')
  const existing = catalog.rows
    .map((row) => Number(row.values[idColumn]))
    .filter((id) => Number.isInteger(id) && id > 0)
  const nextFree = existing.reduce((max, id) => Math.max(max, id), 0) + 1

  const requested = Number.parseInt(values.id, 10)
  const id =
    Number.isInteger(requested) && requested > 0 && !existing.includes(requested) ? requested : nextFree

  const rowValues = catalog.headers.map((header) => {
    if (header === 'id') return String(id)
    const raw = values[header]
    return raw === undefined || raw === null ? '' : String(raw).trim()
  })

  const read = (header) => rowValues[catalog.headers.indexOf(header)] || ''
  if (!read('name')) {
    return { status: 400, payload: { ok: false, error: 'A new station needs a name.' } }
  }
  if (!read('url')) {
    return { status: 400, payload: { ok: false, error: 'A new station needs a stream URL.' } }
  }

  const row = { line: catalog.rows.length + 2, values: rowValues }
  catalog.rows.push(row)
  await writeCatalog(catalog)

  return {
    status: 201,
    payload: {
      ok: true,
      created: true,
      saved: true,
      row: publicRow(catalog.headers, row),
      changes: [],
      validation: await runValidator(),
    },
  }
}

/* Remove a row. Lines after it shift up one, so the response is validated and
   the app re-reads the catalog rather than trusting the old line numbers. */
async function deleteStation({ line }) {
  const catalog = await loadCatalog()
  const index = catalog.rows.findIndex((row) => row.line === Number(line))
  if (index === -1) {
    return { status: 404, payload: { ok: false, error: 'That row is gone — reload the page.' } }
  }

  const [removed] = catalog.rows.splice(index, 1)
  catalog.rows.forEach((row, idx) => {
    row.line = idx + 2
  })
  await writeCatalog(catalog)

  return {
    status: 200,
    payload: {
      ok: true,
      deleted: true,
      removed: publicRow(catalog.headers, removed),
      validation: await runValidator(),
    },
  }
}

async function handleApi(req, res, pathname) {
  if (req.method === 'GET' && pathname === `${API_PREFIX}stations`) {
    const catalog = await loadCatalog()
    sendJson(res, 200, {
      columns: catalog.headers.map((key) => stationField(key)),
      rows: catalog.rows.map((row) => publicRow(catalog.headers, row)),
    })
    return
  }

  if (req.method === 'POST' && pathname === `${API_PREFIX}validate`) {
    sendJson(res, 200, await runValidator())
    return
  }

  if (req.method === 'PUT' && pathname === `${API_PREFIX}stations`) {
    let body
    try {
      body = JSON.parse(await readBody(req))
    } catch (error) {
      sendJson(res, 400, { ok: false, error: `Malformed JSON: ${error.message}` })
      return
    }
    const result = await enqueue(() => saveStation(body))
    sendJson(res, result.status, result.payload)
    return
  }

  if (req.method === 'POST' && pathname === `${API_PREFIX}stations`) {
    let body
    try {
      body = JSON.parse(await readBody(req))
    } catch (error) {
      sendJson(res, 400, { ok: false, error: `Malformed JSON: ${error.message}` })
      return
    }
    const result = await enqueue(() => createStation(body))
    sendJson(res, result.status, result.payload)
    return
  }

  if (req.method === 'DELETE' && pathname === `${API_PREFIX}stations`) {
    let body
    try {
      body = JSON.parse(await readBody(req))
    } catch (error) {
      sendJson(res, 400, { ok: false, error: `Malformed JSON: ${error.message}` })
      return
    }
    const result = await enqueue(() => deleteStation(body))
    sendJson(res, result.status, result.payload)
    return
  }

  sendJson(res, 404, { ok: false, error: 'Not found' })
}

/**
 * Vite plugin: dev-server middleware for the catalog editor.
 *
 * stations.csv is ignored by the file watcher so a save does not reload the page
 * (which would stop playback and lose the modal); the app refreshes its station
 * list from this API instead.
 */
export function stationCatalogPlugin() {
  let base = '/'

  return {
    name: 'riotsradios-station-editor',
    apply: 'serve',

    configResolved(config) {
      base = config.base || '/'
    },

    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = new URL(req.url ?? '/', 'http://localhost')
        let pathname = url.pathname
        if (base !== '/' && pathname.startsWith(base)) {
          pathname = `/${pathname.slice(base.length)}`
        }
        if (!pathname.startsWith(API_PREFIX)) return next()

        handleApi(req, res, pathname).catch((error) => {
          sendJson(res, 500, { ok: false, error: error.message })
        })
      })
    },
  }
}
