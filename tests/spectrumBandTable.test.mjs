import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { BAND_COUNT, MAX_DB, MIN_DB } from '../lib/audioBands.js'

import { BANDS_KOTLIN_PATH, renderSpectrumBandTable } from '../lib/spectrumBandsCodegen.js'

const KOTLIN = renderSpectrumBandTable()

/* Only the numbers inside `floatArrayOf(...)`; constants are written without a
   decimal point, so this cannot pick them up. */
function kotlinEdges(source) {
  const body = source.slice(source.indexOf('floatArrayOf('), source.indexOf('\n    )'))
  return [...body.matchAll(/(-?\d+\.\d+)f/g)].map((match) => Number(match[1]))
}

test('committed Kotlin band table matches the generator', async () => {
  let committed
  try {
    committed = await readFile(BANDS_KOTLIN_PATH, 'utf8')
  } catch {
    assert.fail(`${BANDS_KOTLIN_PATH} is missing — run \`npm run export:bands\``)
  }
  assert.equal(committed, KOTLIN, 'stale table — run `npm run export:bands`')
})

test('Kotlin table carries the same constants as lib/audioBands.js', () => {
  assert.match(KOTLIN, new RegExp(`const val BAND_COUNT = ${BAND_COUNT}\\b`))
  assert.match(KOTLIN, /const val FFT_SIZE = 1024\b/)
  assert.match(KOTLIN, new RegExp(`const val MIN_DB = ${MIN_DB.toFixed(4)}f`))
  assert.match(KOTLIN, new RegExp(`const val MAX_DB = ${MAX_DB.toFixed(4)}f`))
})

test('Kotlin edges cover the same band count, strictly increasing', () => {
  const edges = kotlinEdges(KOTLIN)
  assert.equal(edges.length, BAND_COUNT + 1)
  for (let i = 1; i < edges.length; i++) {
    assert.ok(edges[i] > edges[i - 1], `edge ${i} is not increasing: ${edges[i - 1]} → ${edges[i]}`)
  }
})

test('Kotlin edges line up with bandEdges() to 4 decimals', async () => {
  const { bandEdges, MAX_HZ, MIN_HZ } = await import('../lib/audioBands.js')
  const expected = [...bandEdges(BAND_COUNT, MIN_HZ, MAX_HZ)]
  const actual = kotlinEdges(KOTLIN)

  expected.forEach((hz, i) => {
    assert.ok(
      Math.abs(actual[i] - hz) < 5e-4,
      `edge ${i}: Kotlin ${actual[i]} vs JS ${hz} (regenerate the table)`
    )
  })
})
