package com.mrhumildad.riotsradios.spectrum

import android.os.SystemClock
import java.util.concurrent.CopyOnWriteArrayList

/**
 * The seam between the player that owns the [SpectrumTap] and the Capacitor
 * plugin that forwards levels to the WebView.
 *
 * M1 in docs/ANDROID-AUTO.md creates the player in `RiotMediaService`; the
 * bridge lives in [RiotsPlaybackPlugin]. Neither can hand the other a
 * reference, so the levels go through this small object.
 */
object SpectrumBus {
    private val listeners = CopyOnWriteArrayList<(FloatArray) -> Unit>()

    @Volatile
    private var levels: FloatArray? = null

    @Volatile
    private var publishedAtMillis: Long = 0L

    /** Called from the tap's worker thread. A misbehaving listener must not stop the others. */
    fun publish(levels: FloatArray) {
        this.levels = levels
        publishedAtMillis = SystemClock.elapsedRealtime()
        for (listener in listeners) {
            runCatching { listener(levels) }
        }
    }

    fun latest(): FloatArray? = levels

    /** Milliseconds since the last frame, or -1 when nothing has arrived yet. */
    fun ageMillis(): Long {
        if (levels == null) return -1L
        return SystemClock.elapsedRealtime() - publishedAtMillis
    }

    fun addListener(listener: (FloatArray) -> Unit) {
        listeners.addIfAbsent(listener)
    }

    fun removeListener(listener: (FloatArray) -> Unit) {
        listeners.remove(listener)
    }

    /** Stop must clear the levels instead of freezing the last frame on screen. */
    fun clear() {
        levels = null
        publishedAtMillis = 0L
    }
}
