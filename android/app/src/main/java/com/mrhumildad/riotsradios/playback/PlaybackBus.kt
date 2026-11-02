package com.mrhumildad.riotsradios.playback

import java.util.concurrent.CopyOnWriteArrayList

/**
 * Latest playback state, published by [RiotMediaService] and read by the
 * `RiotsPlayback` Capacitor plugin.
 *
 * The service owns the player and the WebView only sends commands through a
 * `MediaController`, so the state has to travel the other way on its own. Using
 * the bus (rather than a controller listener) also keeps `getState()` and the
 * `state` event correct while the activity is gone.
 */
object PlaybackBus {
    data class Snapshot(val state: String, val error: String?)

    @Volatile
    private var current = Snapshot("idle", null)

    private val listeners = CopyOnWriteArrayList<(Snapshot) -> Unit>()

    val snapshot: Snapshot
        get() = current

    fun publish(state: String, error: String?) {
        val next = Snapshot(state, error)
        if (next == current) return
        current = next
        for (listener in listeners) {
            runCatching { listener(next) }
        }
    }

    fun addListener(listener: (Snapshot) -> Unit) {
        listeners.addIfAbsent(listener)
    }

    fun removeListener(listener: (Snapshot) -> Unit) {
        listeners.remove(listener)
    }

    fun reset() = publish("idle", null)
}
