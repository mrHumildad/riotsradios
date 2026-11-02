/**
 * Renders the Kotlin band table used by the native spectrum analyzer.
 *
 * The native tap must fold its FFT into exactly the same 24 log-spaced bands the
 * web build draws, otherwise the two channels show different bars for the same
 * stream. Rather than keeping two hand-edited copies, `scripts/export-spectrum-bands.mjs`
 * writes `SpectrumBandTable.kt` from these constants and
 * `tests/spectrumBandTable.test.mjs` fails when the committed file is stale.
 */

import { BAND_COUNT, MAX_DB, MAX_HZ, MIN_DB, MIN_HZ, bandEdges } from './audioBands.js'
import { DEFAULT_FFT_SIZE } from './spectrumAnalyzer.js'

export const BANDS_KOTLIN_PATH =
  'android/app/src/main/java/com/mrhumildad/riotsradios/spectrum/SpectrumBandTable.kt'

const EDGES_PER_LINE = 8

/** Kotlin float literal with enough precision for the tightest low band. */
function kotlinFloat(value) {
  return `${value.toFixed(4)}f`
}

/**
 * The generated Kotlin source. Deterministic: same input, byte-identical output,
 * which is what lets the test compare the file instead of parsing it loosely.
 */
export function renderSpectrumBandTable() {
  const edges = Array.from(bandEdges(BAND_COUNT, MIN_HZ, MAX_HZ))

  const lines = []
  for (let i = 0; i < edges.length; i += EDGES_PER_LINE) {
    const chunk = edges.slice(i, i + EDGES_PER_LINE).map(kotlinFloat)
    lines.push(`        ${chunk.join(', ')},`)
  }

  return `// GENERATED FILE — do not edit by hand.
// Source: lib/audioBands.js (BAND_COUNT, MIN_HZ, MAX_HZ, MIN_DB, MAX_DB) and
// lib/spectrumAnalyzer.js (DEFAULT_FFT_SIZE).
// Regenerate: npm run export:bands
// Verified by tests/spectrumBandTable.test.mjs, so a stale table fails npm test.

package com.mrhumildad.riotsradios.spectrum

/**
 * Frequency geometry shared with the web analyzer. Change the JavaScript, not
 * this file, or the native bars drift away from the browser's.
 */
object SpectrumBandTable {
    const val BAND_COUNT = ${BAND_COUNT}
    const val FFT_SIZE = ${DEFAULT_FFT_SIZE}
    const val MIN_HZ = ${kotlinFloat(MIN_HZ)}
    const val MAX_HZ = ${kotlinFloat(MAX_HZ)}
    const val MIN_DB = ${kotlinFloat(MIN_DB)}
    const val MAX_DB = ${kotlinFloat(MAX_DB)}

    /** BAND_COUNT + 1 log-spaced edges in Hz, strictly increasing. */
    val EDGES = floatArrayOf(
${lines.join('\n')}
    )
}
`
}
