// GENERATED FILE — do not edit by hand.
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
    const val BAND_COUNT = 24
    const val FFT_SIZE = 1024
    const val MIN_HZ = 40.0000f
    const val MAX_HZ = 16000.0000f
    const val MIN_DB = -90.0000f
    const val MAX_DB = -10.0000f

    /** BAND_COUNT + 1 log-spaced edges in Hz, strictly increasing. */
    val EDGES = floatArrayOf(
        40.0000f, 51.3428f, 65.9020f, 84.5897f, 108.5767f, 139.3657f, 178.8854f, 229.6118f,
        294.7225f, 378.2966f, 485.5698f, 623.2622f, 800.0000f, 1026.8551f, 1318.0392f, 1691.7940f,
        2171.5341f, 2787.3135f, 3577.7088f, 4592.2355f, 5894.4504f, 7565.9329f, 9711.3957f, 12465.2449f,
        16000.0000f,
    )
}
