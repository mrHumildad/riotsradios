package com.mrhumildad.riotsradios.spectrum

import androidx.media3.common.C
import androidx.media3.common.audio.AudioProcessor
import androidx.media3.common.audio.AudioProcessor.AudioFormat
import androidx.media3.common.audio.AudioProcessor.StreamMetadata
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.util.concurrent.Executor
import kotlin.math.PI
import kotlin.math.sin

class SpectrumTapTest {

    private val levels = mutableListOf<FloatArray>()

    /* Inline executor: deterministic, no worker thread, no sleeps. */
    private val inline = Executor { it.run() }

    private fun tap(intervalMs: Long = 0L): SpectrumTap = SpectrumTap(
        executor = inline,
        intervalMs = intervalMs,
        clock = { 0L },
        onLevels = { levels += it },
    )

    private fun configuredTap(intervalMs: Long = 0L): SpectrumTap = tap(intervalMs).apply {
        configure(FORMAT)
        flush(StreamMetadata.DEFAULT)
    }

    /** 16-bit stereo PCM with a 1 kHz tone, as the decoder hands it to the sink. */
    private fun tone(frames: Int): ByteBuffer {
        val buffer = ByteBuffer.allocateDirect(frames * 4).order(ByteOrder.nativeOrder())
        for (frame in 0 until frames) {
            val sample = (0.5 * sin(2.0 * PI * 1_000.0 * frame / 44_100.0) * Short.MAX_VALUE).toInt().toShort()
            buffer.putShort(sample)
            buffer.putShort(sample)
        }
        buffer.flip()
        return buffer
    }

    private fun remainingBytes(buffer: ByteBuffer): ByteArray =
        ByteArray(buffer.remaining()).also { buffer.duplicate().get(it) }

    @Test
    fun `the empty poll before the first decoded buffer does not throw`() {
        val tap = configuredTap()

        /* AudioProcessingPipeline.getOutput() calls this on every processor with
           the shared EMPTY_BUFFER; replaceOutputBuffer(0) hands that same buffer
           back, so putting it into itself aborted playback on the device. */
        tap.queueInput(AudioProcessor.EMPTY_BUFFER)

        assertFalse(tap.getOutput().hasRemaining())
        assertTrue("an empty poll must not produce a frame", levels.isEmpty())
    }

    @Test
    fun `pass-through keeps the exact PCM bytes and consumes the input`() {
        val tap = configuredTap()
        val input = tone(SpectrumBandTable.FFT_SIZE)
        val expected = remainingBytes(input)

        tap.queueInput(input)
        val actual = remainingBytes(tap.getOutput())

        assertArrayEquals(expected, actual)
        assertEquals("the pipeline expects its input fully consumed", 0, input.remaining())
    }

    @Test
    fun `a full hop reports one 24 band frame`() {
        val tap = configuredTap()
        val frames = SpectrumBandTable.FFT_SIZE
        tap.queueInput(tone(frames))

        assertEquals("one frame per hopSize samples", 2, levels.size)
        assertEquals(SpectrumBandTable.BAND_COUNT, levels[0].size)
        assertTrue("a full-scale tone must light at least one band", levels[0].any { it > 0f })
        assertTrue(levels[0].all { it in 0f..1f })
    }

    private companion object {
        val FORMAT = AudioFormat(44_100, 2, C.ENCODING_PCM_16BIT)
    }
}
