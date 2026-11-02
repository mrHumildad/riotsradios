package com.mrhumildad.riotsradios.spectrum

import kotlin.math.PI
import kotlin.math.ceil
import kotlin.math.cos
import kotlin.math.floor
import kotlin.math.hypot
import kotlin.math.log10
import kotlin.math.round
import kotlin.math.sin

/**
 * 1024-point analysis → the same 24 log-spaced bands `lib/audioBands.js` draws.
 *
 * Pure Kotlin on purpose: no Android or Media3 imports, so this maths runs in
 * JVM unit tests (`SpectrumFftTest`) exactly as it runs on the device.
 *
 * Not thread-safe: one instance per thread, and the tap only ever calls it from
 * its own worker.
 */
class SpectrumFft(
    private val fftSize: Int = SpectrumBandTable.FFT_SIZE,
    private val bandCount: Int = SpectrumBandTable.BAND_COUNT,
) {
    /* Symmetric Hann window; its coherent gain (0.5) is undone in
       [magnitudesToDecibels] so a full-scale tone lands at 0 dBFS. */
    private val window = DoubleArray(fftSize) {
        0.5 - 0.5 * cos(2.0 * PI * it / (fftSize - 1))
    }
    private val real = DoubleArray(fftSize)
    private val imaginary = DoubleArray(fftSize)
    private val bins = DoubleArray(fftSize / 2)

    /**
     * @param samples exactly [fftSize] mono samples in -1..1
     * @param sampleRate the rate the samples were decoded at
     * @return [bandCount] levels in 0..1; all zeros for silence
     */
    fun levels(samples: FloatArray, sampleRate: Int): FloatArray {
        require(samples.size == fftSize) { "expected $fftSize samples, got ${samples.size}" }
        require(sampleRate > 0) { "sampleRate must be positive, was $sampleRate" }

        for (i in 0 until fftSize) {
            real[i] = samples[i] * window[i]
            imaginary[i] = 0.0
        }
        transform()
        magnitudesToDecibels()
        return foldBands(sampleRate)
    }

    /** Iterative radix-2 Cooley–Tukey, in place. */
    private fun transform() {
        var reversed = 0
        for (i in 1 until fftSize) {
            var bit = fftSize shr 1
            while (reversed and bit != 0) {
                reversed = reversed xor bit
                bit = bit shr 1
            }
            reversed = reversed or bit
            if (i < reversed) {
                val realSwap = real[i]
                real[i] = real[reversed]
                real[reversed] = realSwap
                val imaginarySwap = imaginary[i]
                imaginary[i] = imaginary[reversed]
                imaginary[reversed] = imaginarySwap
            }
        }

        var length = 2
        while (length <= fftSize) {
            val angle = -2.0 * PI / length
            val stepReal = cos(angle)
            val stepImaginary = sin(angle)
            val half = length / 2

            var start = 0
            while (start < fftSize) {
                var twiddleReal = 1.0
                var twiddleImaginary = 0.0
                for (k in 0 until half) {
                    val even = start + k
                    val odd = even + half

                    val oddReal = real[odd] * twiddleReal - imaginary[odd] * twiddleImaginary
                    val oddImaginary = real[odd] * twiddleImaginary + imaginary[odd] * twiddleReal

                    real[odd] = real[even] - oddReal
                    imaginary[odd] = imaginary[even] - oddImaginary
                    real[even] += oddReal
                    imaginary[even] += oddImaginary

                    val nextReal = twiddleReal * stepReal - twiddleImaginary * stepImaginary
                    twiddleImaginary = twiddleReal * stepImaginary + twiddleImaginary * stepReal
                    twiddleReal = nextReal
                }
                start += length
            }
            length = length shl 1
        }
    }

    /**
     * Single-sided magnitude in dBFS. `2 / fftSize` undoes the transform's
     * factor of two, and `/ 0.5` the window's coherent gain.
     *
     * Bins are clamped to the same window AnalyserNode reports, which floors an
     * empty bin at `minDecibels` (-90) instead of its true noise floor. Without
     * that clamp a narrow tone in a wide band averages toward -180 dB and the
     * bar disappears, while the browser shows it.
     */
    private fun magnitudesToDecibels() {
        val scale = 4.0 / fftSize
        val floorDb = SpectrumBandTable.MIN_DB.toDouble()
        val ceilingDb = SpectrumBandTable.MAX_DB.toDouble()
        for (i in bins.indices) {
            val magnitude = hypot(real[i], imaginary[i]) * scale
            bins[i] = (20.0 * log10(magnitude + 1e-9)).coerceIn(floorDb, ceilingDb)
        }
    }

    /** Mirrors `frequencyToBands()` in lib/audioBands.js bin for bin. */
    private fun foldBands(sampleRate: Int): FloatArray {
        val levels = FloatArray(bandCount)
        val binHz = sampleRate.toDouble() / fftSize
        val lastBin = bins.size - 1

        for (band in 0 until bandCount) {
            val from = SpectrumBandTable.EDGES[band].toDouble()
            val to = SpectrumBandTable.EDGES[band + 1].toDouble()
            val first = ceil(from / binHz).toInt().coerceAtLeast(0)
            val last = floor(to / binHz).toInt().coerceAtMost(lastBin)

            levels[band] = if (first > last) {
                /* Narrower than one bin: sample the nearest, like the web side. */
                val nearest = round((from + to) / 2.0 / binHz).toInt().coerceIn(0, lastBin)
                decibelsToUnit(bins[nearest])
            } else {
                var sum = 0.0
                for (i in first..last) sum += bins[i]
                decibelsToUnit(sum / (last - first + 1))
            }
        }
        return levels
    }

    private fun decibelsToUnit(decibels: Double): Float {
        val floorDb = SpectrumBandTable.MIN_DB.toDouble()
        val ceilingDb = SpectrumBandTable.MAX_DB.toDouble()
        if (decibels.isNaN() || decibels <= floorDb) return 0f
        if (decibels >= ceilingDb) return 1f
        return ((decibels - floorDb) / (ceilingDb - floorDb)).toFloat()
    }
}
