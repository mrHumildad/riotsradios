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
import { classifyProbe, mergeHealth, streamTargets } from '../lib/health.js'

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
    if (!entry.status) continue
    counts.set(entry.status, (counts.get(entry.status) || 0) + 1)
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1])
}

/* One merged entry for one probe, folded into the previous snapshot entry so a
   recurring failure keeps accumulating. */
function mergedFor(previousEntry, result) {
  const { status, cors } = classifyProbe(result)
  return {
    status,
    entry: mergeHealth(previousEntry, {
      status,
      cors,
      http_code: result.status ?? null,
      content_type: result.content_type || null,
      latency_ms: result.latency_ms,
    }),
  }
}

async function main() {
  const rows = parseStationRows(await readFile(CSV_PATH, 'utf8'))

  /* `url` plus every stored mirror: one job per distinct URL, so a row whose
     `url` is its own HTTPS mirror is probed once and reported under both. */
  const jobs = []
  for (const station of rows) {
    if (!Number.isInteger(station.id)) continue
    for (const target of streamTargets(station)) {
      if (!isValidStreamUrl(target.url)) continue
      jobs.push({ station, target })
    }
  }
  const previous = await readPrevious()
  const stationCount = new Set(jobs.map((job) => job.station.id)).size

  console.log(`\nProbing ${jobs.length} URL(s) across ${stationCount} station(s), ${CONCURRENCY} at a time…\n`)

  const probed = await runPool(jobs, async ({ station, target }) => {
    const result = await probe(target.url)
    return { station, target, result }
  }, CONCURRENCY)

  const health = {}
  for (const { station, target, result } of probed) {
    const id = String(station.id)
    const prev = previous[id]
    const record = health[id] || (health[id] = {})
    const parts = []

    if (target.schemes.includes('url')) {
      const { status, entry } = mergedFor(prev, result)
      Object.assign(record, entry)
      parts.push(`url:${status}`)
    }

    for (const scheme of target.schemes) {
      if (scheme === 'url') continue
      const { status, entry } = mergedFor(prev?.mirrors?.[scheme], result)
      record.mirrors ||= {}
      record.mirrors[scheme] = entry
      parts.push(`${scheme}:${status}`)
    }

    const flag = parts.some((part) => !/:(ok|cors_missing)$/.test(part)) ? '✗ ' : '  '
    console.log(`${flag}${String(station.id).padStart(3)} ${parts.join(' ').padEnd(34)} ${station.name}`)
  }

  /* Keys in catalog order so the committed diff stays readable. */
  const ordered = {}
  for (const id of Object.keys(health).sort((a, b) => Number(a) - Number(b))) ordered[id] = health[id]

  await mkdir('data', { recursive: true })
  await writeFile(HEALTH_PATH, `${JSON.stringify(ordered, null, 2)}\n`, 'utf8')

  console.log(`\nWrote ${HEALTH_PATH}`)
  for (const [status, count] of summarize(ordered)) console.log(`  ${status.padEnd(14)} ${count}`)
  console.log('')
}

main().catch((e) => {
  console.error('Probe failed:', e)
  process.exit(1)
})
