package com.mrhumildad.riotsradios.playback

/**
 * The retry/stall rules from `lib/playbackController.js`, ported to the native
 * engine:
 *
 * - 12 s to reach "playing" after a play/retry, or the stream is reconnected;
 * - 8 s of a frozen position (or of continuous buffering) before reconnecting;
 * - three retries at 1 s / 2 s / 4 s, then a hard `playback` error.
 *
 * Deliberately free of Android and Media3 types: the clock and the scheduler are
 * injected, so `PlaybackSupervisorTest` can walk the whole ladder in milliseconds.
 */
class PlaybackSupervisor(
    private val positionMs: () -> Long,
    private val onRetry: () -> Unit,
    private val onGiveUp: () -> Unit,
    private val timings: Timings = Timings(),
    private val clock: () -> Long = { System.nanoTime() / 1_000_000L },
    private val scheduler: Scheduler = Scheduler { _, _ -> {} },
) {
    data class Timings(
        val startTimeoutMs: Long = 12_000,
        val stallAfterMs: Long = 8_000,
        val watchdogIntervalMs: Long = 2_000,
        val retryDelaysMs: List<Long> = listOf(1_000, 2_000, 4_000),
    ) {
        val maxRetries: Int get() = retryDelaysMs.size
    }

    fun interface Scheduler {
        /** Schedules [action] and returns a function that cancels it. */
        fun schedule(delayMs: Long, action: () -> Unit): () -> Unit
    }

    private var wantsPlay = false
    private var playing = false
    private var retries = 0
    private var lastPosition = Long.MIN_VALUE
    private var lastProgressAt = 0L

    private var cancelStart: (() -> Unit)? = null
    private var cancelRetry: (() -> Unit)? = null
    private var cancelWatchdog: (() -> Unit)? = null
    private var cancelStall: (() -> Unit)? = null

    /** A station was selected, or a paused stream resumed. */
    fun start() {
        wantsPlay = true
        playing = false
        retries = 0
        cancelAll()
        armStart()
    }

    /** The player reached READY with playWhenReady: playback is really running. */
    fun markPlaying() {
        if (!wantsPlay) return
        playing = true
        retries = 0
        cancelAll()
        lastPosition = positionMs()
        lastProgressAt = clock()
        armWatchdog()
    }

    /** Rebuffer during playback: the stream has [Timings.stallAfterMs] to recover. */
    fun markBuffering() {
        if (!wantsPlay || !playing) return
        cancelTimer(cancelStall)
        cancelStall = scheduler.schedule(timings.stallAfterMs) {
            if (wantsPlay) retry()
        }
    }

    /** Paused/stopped: nothing to watch, nothing to retry. */
    fun markPaused() {
        wantsPlay = false
        playing = false
        retries = 0
        cancelAll()
    }

    fun stop() = markPaused()

    /** A load error from the player: reconnect through the same ladder. */
    fun requestRetry() = retry()

    private fun armStart() {
        cancelTimer(cancelStart)
        cancelStart = scheduler.schedule(timings.startTimeoutMs) {
            if (wantsPlay && !playing) retry()
        }
    }

    private fun armWatchdog() {
        cancelTimer(cancelWatchdog)
        cancelWatchdog = scheduler.schedule(timings.watchdogIntervalMs) {
            if (!wantsPlay) return@schedule
            val now = clock()
            val position = positionMs()
            if (position != lastPosition) {
                lastPosition = position
                lastProgressAt = now
            } else if (now - lastProgressAt >= timings.stallAfterMs) {
                retry()
                return@schedule
            }
            armWatchdog()
        }
    }

    private fun retry() {
        if (!wantsPlay) return
        cancelAll()
        if (retries >= timings.maxRetries) {
            wantsPlay = false
            playing = false
            onGiveUp()
            return
        }
        val delay = timings.retryDelaysMs[retries]
        retries += 1
        cancelRetry = scheduler.schedule(delay) {
            if (!wantsPlay) return@schedule
            onRetry()
            armStart()
        }
    }

    private fun cancelAll() {
        cancelTimer(cancelStart)
        cancelTimer(cancelRetry)
        cancelTimer(cancelWatchdog)
        cancelTimer(cancelStall)
        cancelStart = null
        cancelRetry = null
        cancelWatchdog = null
        cancelStall = null
    }

    private fun cancelTimer(cancel: (() -> Unit)?) {
        cancel?.invoke()
    }
}
