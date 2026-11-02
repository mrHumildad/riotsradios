package com.mrhumildad.riotsradios.spectrum

import androidx.media3.common.C
import androidx.media3.common.audio.AudioProcessor
import androidx.media3.common.audio.BaseAudioProcessor
import androidx.media3.common.util.UnstableApi
import java.nio.ByteBuffer
import java.util.concurrent.Executor
import java.util.concurrent.Executors

private const val DEFAULT_INTERVAL_MS = 33L

/**
 * A pass-through [AudioProcessor] that taps the decoded PCM on its way to the
 * audio sink and reports 24 band levels at ~30 fps.
 *
 * Why a processor and not `android.media.audiofx.Visualizer`: this needs no
 * `RECORD_AUDIO` permission, sees the stream (not the shared output mix) and
 * keeps working for every station, CORS or not. See docs/SPECTRUM-ANDROID.md.
 *
 * Install it on the Media3 audio sink chain:
 *
 *     val tap = SpectrumTap { levels -> SpectrumBus.publish(levels) }
 *     // DefaultRenderersFactory.buildAudioProcessors(): super + tap
 *     // or DefaultAudioSink.Builder.setAudioProcessors(from, input, tap)
 *
 * The samples are never modified: [queueInput] copies its analysis window out
 * and forwards the original buffer untouched, so playback cannot be affected
 * even if the worker falls behind.
 *
 * Callbacks ([onConfigure], [queueInput], [onReset]) happen on the playback
 * thread; the FFT and [onLevels] run on [executor]. Do not block in [queueInput].
 */
@UnstableApi
class SpectrumTap(
    private val executor: Executor = newWorker(),
    private val intervalMs: Long = DEFAULT_INTERVAL_MS,
    private val clock: () -> Long = { System.nanoTime() / 1_000_000L },
    private val onLevels: (FloatArray) -> Unit,
) : BaseAudioProcessor() {

    private val fftSize = SpectrumBandTable.FFT_SIZE
    private val hopSize = fftSize / 2
    private val fft = SpectrumFft()

    /* Rolling analysis window: the newest fftSize mono samples, oldest first. */
    private val history = FloatArray(fftSize)
    private var writeIndex = 0
    private var samplesSinceDispatch = 0
    private var lastDispatchMs = 0L

    private var sampleRate = 48_000
    private var channelCount = 2
    private var encoding = C.ENCODING_INVALID

    override fun onConfigure(inputAudioFormat: AudioProcessor.AudioFormat): AudioProcessor.AudioFormat {
        sampleRate = inputAudioFormat.sampleRate
        channelCount = inputAudioFormat.channelCount.coerceAtLeast(1)
        encoding = inputAudioFormat.encoding
        resetWindow()
        // Same format back: the tap inspects the stream and changes nothing.
        return inputAudioFormat
    }

    override fun queueInput(inputBuffer: ByteBuffer) {
        /* AudioProcessingPipeline polls every processor with the shared
           AudioProcessor.EMPTY_BUFFER before the first decoded buffer arrives.
           replaceOutputBuffer(0) hands that very buffer back (its capacity is
           already 0), so a blind put() copies a buffer onto itself and throws
           "The source buffer is this buffer" — which killed playback on every
           stream. Media3's own processors return early for the same reason. */
        if (!inputBuffer.hasRemaining()) return

        val bytes = inputBuffer.remaining()
        collect(inputBuffer, bytes)

        val output = replaceOutputBuffer(bytes)
        output.put(inputBuffer)
        output.flip()
    }

    override fun onReset() {
        resetWindow()
        lastDispatchMs = 0L
    }

    private fun resetWindow() {
        history.fill(0f)
        writeIndex = 0
        samplesSinceDispatch = 0
    }

    /** Reads absolute, so [queueInput] can still forward the buffer afterwards. */
    private fun collect(inputBuffer: ByteBuffer, bytes: Int) {
        val base = inputBuffer.position()
        val bytesPerSample = when (encoding) {
            C.ENCODING_PCM_16BIT -> 2
            C.ENCODING_PCM_FLOAT -> 4
            else -> return
        }
        val frameBytes = bytesPerSample * channelCount
        val frames = bytes / frameBytes
        for (frame in 0 until frames) {
            var sum = 0f
            for (channel in 0 until channelCount) {
                val index = base + frame * frameBytes + channel * bytesPerSample
                sum += if (bytesPerSample == 2) {
                    inputBuffer.getShort(index) / 32768f
                } else {
                    inputBuffer.getFloat(index)
                }
            }
            push(sum / channelCount)
        }
    }

    private fun push(sample: Float) {
        history[writeIndex] = sample
        writeIndex = (writeIndex + 1) % fftSize
        if (++samplesSinceDispatch >= hopSize) dispatchIfDue()
    }

    private fun dispatchIfDue() {
        if (samplesSinceDispatch < hopSize) return
        samplesSinceDispatch = 0

        val now = clock()
        if (now - lastDispatchMs < intervalMs) return
        lastDispatchMs = now

        val samples = FloatArray(fftSize) { offset -> history[(writeIndex + offset) % fftSize] }
        val rate = sampleRate
        executor.execute {
            /* Worker-thread only; SpectrumFft is not thread-safe by design. */
            onLevels(fft.levels(samples, rate))
        }
    }

    private companion object {
        fun newWorker(): Executor = Executors.newSingleThreadExecutor { runnable ->
            Thread(runnable, "spectrum-tap").apply { isDaemon = true }
        }
    }
}
