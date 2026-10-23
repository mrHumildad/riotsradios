// Stream-health probe for the catalog.
// Run: node scripts/probe-stations.js   (or `npm run probe:health`)
//
// Probes every station that has a valid URL, classifies the response and writes
// data/health.json. The app imports that file, so statuses are visible without a
// network request. Safe to run from CI on a schedule.
//
// The response body is never consumed: live radio streams never end, so only
// headers are read and the connection is dropped immediately.

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { parseStationRows, isValidStreamUrl } from '../lib/stations.js'
import { classifyProbe, mergeHealth } from '../lib/health.js'

const CSV_PATH = 'stations.csv'
const HEALTH_PATH = 'data/health.json'
const PAGE_ORIGIN = 'https://mrhumildad.github.io'
const USER_AGENT = 'RIOTSRADIOS-health/1.0 (+https://github.com/mrHumildad/riotsradios)'
const TIMEOUT_MS = 10000
const CONCURRENCY = 6

async function probe(url) {
  const started = Date.now()

  try {
    const res = await fetch(url, {
      redirect: 'follow',
      headers: {
        Origin: PAGE_ORIGIN,
        Range: 'bytes=0-1',
        'User-Agent': USER_AGENT,
      },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })

    const contentType = res.headers.get('content-type') || ''
    const acao = res.headers.get('access-control-allow-origin')
    /* Do not read the body: a live stream would stream forever. */
    res.body?.cancel().catch(() => {})

    return {
      url,
      status: res.status,
      content_type: contentType,
      acao,
      latency_ms: Date.now() - started,
      error: null,
    }
  } catch (e) {
    const name = e?.name || e?.cause?.name || ''
    const code = String(e?.cause?.code || e?.code || e?.message || '')
    const error = name === 'TimeoutError'
      ? 'timeout'
      : /CERT|TLS|SSL|certificate|cert/i.test(code)
        ? 'tls'
        : 'network'
    return { url, latency_ms: Date.now() - started, error }
  }
}

async function runPool(items, worker, concurrency = CONCURRENCY) {
  const results = new Array(items.length)
  let next = 0

  async function lane() {
    while (next < items.length) {
      const index = next++
      results[index] = await worker(items[index], index)
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, lane))
  return results
}

async function readPrevious() {
  try {
    return JSON.parse(await readFile(HEALTH_PATH, 'utf8'))
  } catch {
    return {}
  }
}

function summarize(health) {
  const counts = new Map()
  for (const entry of Object.values(health)) {
    counts.set(entry.status, (counts.get(entry.status) || 0) + 1)
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1])
}

async function main() {
  const rows = parseStationRows(await readFile(CSV_PATH, 'utf8'))
  const targets = rows.filter((s) => Number.isInteger(s.id) && isValidStreamUrl(s.url))
  const previous = await readPrevious()

  console.log(`\nProbing ${targets.length} station URL(s), ${CONCURRENCY} at a time…\n`)

  const probed = await runPool(targets, async (station) => {
    const result = await probe(station.url)
    const { status, cors } = classifyProbe(result)
    const merged = mergeHealth(previous[String(station.id)], {
      status,
      cors,
      http_code: result.status ?? null,
      content_type: result.content_type || null,
      latency_ms: result.latency_ms,
    })
    const flag = ['ok', 'cors_missing'].includes(status) ? '  ' : '✗ '
    console.log(`${flag}${String(station.id).padStart(3)} ${status.padEnd(13)} ${station.name}`)
    return [String(station.id), merged]
  }, CONCURRENCY)

  const health = {}
  for (const [id, entry] of probed.sort((a, b) => Number(a[0]) - Number(b[0]))) health[id] = entry

  await mkdir('data', { recursive: true })
  await writeFile(HEALTH_PATH, `${JSON.stringify(health, null, 2)}\n`, 'utf8')

  console.log(`\nWrote ${HEALTH_PATH}`)
  for (const [status, count] of summarize(health)) console.log(`  ${status.padEnd(14)} ${count}`)
  console.log('')
}

main().catch((e) => {
  console.error('Probe failed:', e)
  process.exit(1)
})
