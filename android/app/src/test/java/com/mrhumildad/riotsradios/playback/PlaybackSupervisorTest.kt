package com.mrhumildad.riotsradios.playback

import org.junit.Assert.assertEquals
import org.junit.Test

class PlaybackSupervisorTest {

    /* Deterministic clock + scheduler: no sleeps, no Android main looper. */
    private class FakeTime {
        var now = 0L
        private val tasks = mutableListOf<Task>()
        private var nextId = 0

        private inner class Task(val id: Int, val dueAt: Long, val action: () -> Unit) {
            var cancelled = false
        }

        val clock: () -> Long = { now }

        val scheduler = PlaybackSupervisor.Scheduler { delayMs, action ->
            val task = Task(nextId++, now + delayMs, action)
            tasks += task
            val cancel: () -> Unit = { task.cancelled = true }
            cancel
        }

        fun advanceTo(target: Long) {
            while (true) {
                val next = tasks
                    .filter { !it.cancelled && it.dueAt <= target }
                    .minByOrNull { it.dueAt } ?: break
                tasks.remove(next)
                now = next.dueAt
                next.action()
            }
            if (now < target) now = target
        }
    }

    @Test
    fun `start timeout retries at 1s 2s 4s then gives up`() {
        val time = FakeTime()
        val retriedAt = mutableListOf<Long>()
        var gaveUp = 0
        val supervisor = PlaybackSupervisor(
            positionMs = { 0L },
            onRetry = { retriedAt += time.now },
            onGiveUp = { gaveUp += 1 },
            clock = time.clock,
            scheduler = time.scheduler,
        )

        supervisor.start()

        time.advanceTo(12_999)
        assertEquals(emptyList<Long>(), retriedAt)

        time.advanceTo(13_000)
        assertEquals(listOf(13_000L), retriedAt)

        time.advanceTo(60_000)
        assertEquals("retry delays must be 1s, 2s, 4s", listOf(13_000L, 27_000L, 43_000L), retriedAt)
        assertEquals("one give-up after the third retry", 1, gaveUp)
    }

    @Test
    fun `reaching playing cancels the start timeout`() {
        val time = FakeTime()
        var retries = 0
        val supervisor = PlaybackSupervisor(
            positionMs = { time.now },
            onRetry = { retries += 1 },
            onGiveUp = {},
            clock = time.clock,
            scheduler = time.scheduler,
        )

        supervisor.start()
        time.advanceTo(5_000)
        supervisor.markPlaying()
        time.advanceTo(60_000)

        assertEquals(0, retries)
    }

    @Test
    fun `a frozen position is caught by the watchdog`() {
        val time = FakeTime()
        val retriedAt = mutableListOf<Long>()
        val supervisor = PlaybackSupervisor(
            positionMs = { 0L },
            onRetry = { retriedAt += time.now },
            onGiveUp = {},
            clock = time.clock,
            scheduler = time.scheduler,
        )

        supervisor.start()
        supervisor.markPlaying()

        time.advanceTo(7_999)
        assertEquals(emptyList<Long>(), retriedAt)

        time.advanceTo(9_000)
        assertEquals("8s of no progress, then the 1s retry delay", listOf(9_000L), retriedAt)
    }

    @Test
    fun `continuous buffering stalls after eight seconds`() {
        val time = FakeTime()
        var retries = 0
        val supervisor = PlaybackSupervisor(
            positionMs = { time.now },
            onRetry = { retries += 1 },
            onGiveUp = {},
            clock = time.clock,
            scheduler = time.scheduler,
        )

        supervisor.start()
        supervisor.markPlaying()
        time.advanceTo(2_000)
        supervisor.markBuffering()

        time.advanceTo(10_999)
        assertEquals("the retry delay runs before the reconnect", 0, retries)

        time.advanceTo(11_000)
        assertEquals(1, retries)
    }

    @Test
    fun `a pause stops watching and retrying`() {
        val time = FakeTime()
        var retries = 0
        var gaveUp = 0
        val supervisor = PlaybackSupervisor(
            positionMs = { 0L },
            onRetry = { retries += 1 },
            onGiveUp = { gaveUp += 1 },
            clock = time.clock,
            scheduler = time.scheduler,
        )

        supervisor.start()
        time.advanceTo(3_000)
        supervisor.markPaused()
        time.advanceTo(120_000)

        assertEquals(0, retries)
        assertEquals(0, gaveUp)
    }

    @Test
    fun `a load error consumes one retry from the same ladder`() {
        val time = FakeTime()
        val retriedAt = mutableListOf<Long>()
        var gaveUp = 0
        val supervisor = PlaybackSupervisor(
            positionMs = { time.now },
            onRetry = { retriedAt += time.now },
            onGiveUp = { gaveUp += 1 },
            clock = time.clock,
            scheduler = time.scheduler,
        )

        supervisor.start()
        supervisor.markPlaying()
        supervisor.requestRetry()
        time.advanceTo(1_000)
        assertEquals(listOf(1_000L), retriedAt)

        supervisor.requestRetry()
        time.advanceTo(3_500)
        assertEquals(listOf(1_000L, 3_000L), retriedAt)

        supervisor.requestRetry()
        time.advanceTo(8_000)
        assertEquals(listOf(1_000L, 3_000L, 7_500L), retriedAt)

        supervisor.requestRetry()
        assertEquals(1, gaveUp)
    }
}
