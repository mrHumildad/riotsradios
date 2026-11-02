package com.mrhumildad.riotsradios.spectrum

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.sin

class SpectrumFftTest {
    private val sampleRate = 48_000
    private val fft = SpectrumFft()

    private fun sine(toneHz: Double, amplitude: Double = 0.8): FloatArray =
        FloatArray(SpectrumBandTable.FFT_SIZE) { index ->
            (amplitude * sin(2.0 * PI * toneHz * index / sampleRate)).toFloat()
        }

    private fun bandContaining(hz: Double): Int {
        val edges = SpectrumBandTable.EDGES
        for (band in 0 until SpectrumBandTable.BAND_COUNT) {
            if (hz >= edges[band] && hz < edges[band + 1]) return band
        }
        error("$hz Hz is outside the band table")
    }

    @Test
    fun silenceIsAllZeros() {
        val levels = fft.levels(FloatArray(SpectrumBandTable.FFT_SIZE), sampleRate)
        assertEquals(SpectrumBandTable.BAND_COUNT, levels.size)
        assertTrue(levels.all { it == 0f })
    }

    @Test
    fun oneKilohertzPeaksInTheBandThatContainsIt() {
        val levels = fft.levels(sine(1_000.0), sampleRate)
        val band = bandContaining(1_000.0)
        val peak = levels.indices.maxByOrNull { levels[it] }!!

        assertTrue("band $band was ${levels[band]}", levels[band] > 0.6f)
        assertTrue("peak band was $peak, expected ~$band", abs(peak - band) <= 1)
    }

    @Test
    fun fullScaleToneIsNearZeroDbfsAndStaysClamped() {
        val levels = fft.levels(sine(1_000.0, amplitude = 1.0), sampleRate)
        assertEquals(1f, levels[bandContaining(1_000.0)], 0.2f)
        assertTrue(levels.all { it in 0f..1f })
    }

    @Test
    fun aQuieterToneDrawsLowerBars() {
        val band = bandContaining(1_000.0)
        val loud = fft.levels(sine(1_000.0, amplitude = 0.8), sampleRate)
        val quiet = fft.levels(sine(1_000.0, amplitude = 0.01), sampleRate)
        assertTrue("quiet ${quiet[band]} vs loud ${loud[band]}", quiet[band] < loud[band])
    }

    @Test
    fun bassAndTrebleStayInTheirOwnBands() {
        val bass = fft.levels(sine(80.0), sampleRate)
        val treble = fft.levels(sine(12_000.0), sampleRate)

        assertTrue("80 Hz did not reach its band: ${bass.toList()}", bass[bandContaining(80.0)] > 0.5f)
        // Bands are averaged in dB like the web analyzer, so a single tone in a
        // 2.7 kHz-wide band reads low on purpose — it must still register.
        assertTrue("12 kHz did not reach its band", treble[bandContaining(12_000.0)] > 0f)

        assertTrue("80 Hz leaked into the treble", bass[bandContaining(12_000.0)] < 0.05f)
        assertTrue("12 kHz leaked into the bass", treble[bandContaining(80.0)] < 0.05f)
    }

    @Test
    fun tableIsStrictlyIncreasing() {
        val edges = SpectrumBandTable.EDGES
        assertEquals(SpectrumBandTable.BAND_COUNT + 1, edges.size)
        for (i in 1 until edges.size) {
            assertTrue("edge $i: ${edges[i - 1]} → ${edges[i]}", edges[i] > edges[i - 1])
        }
    }
}
