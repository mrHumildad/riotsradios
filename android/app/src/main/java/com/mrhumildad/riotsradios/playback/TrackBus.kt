package com.mrhumildad.riotsradios.playback

import java.util.concurrent.CopyOnWriteArrayList

/**
 * The current in-stream (ICY) title, published by [RiotMediaService] and read by
 * the `RiotsPlayback` plugin.
 *
 * Separate from [PlaybackBus] on purpose: the state flips several times while a
 * stream tunes, whereas a title only changes when the server sends a new
 * metadata block, and the WebView must not have to poll the state to notice it.
 *
 * Deliberately free of Android and Media3 types, so the cleaning rules run in a
 * plain JVM unit test.
 */
object TrackBus {

    /** `mediaId` is the player's item, so a title can be pinned to its station. */
    data class Track(val mediaId: String?, val title: String)

    /** Stations pad their titles; anything longer than this is a broken frame. */
    const val MAX_TITLE_CHARS = 200

    @Volatile
    private var current: Track? = null

    private val listeners = CopyOnWriteArrayList<(Track?) -> Unit>()

    val latest: Track?
        get() = current

    /**
     * A title is copied off the wire, so it can arrive padded, empty, or as a
     * lone `StreamTitle='';` frame. Those all mean "no title" — never `""`,
     * which the row would render as an empty track line.
     */
    fun clean(raw: String?): String? {
        val source = raw ?: return null
        /* Padding that survived the decoder shows up as control bytes; a title
           made only of those is an empty frame, not a song. Whitespace becomes
           a space first, so a tab between two words does not glue them. */
        val printable = source
            .map { char -> if (char.isWhitespace()) ' ' else char }
            .filterNot { it.isISOControl() }
            .joinToString("")
            .trim()
        if (printable.isEmpty()) return null
        val collapsed = printable.replace(WHITESPACE, " ")
        return if (collapsed.length <= MAX_TITLE_CHARS) collapsed else collapsed.take(MAX_TITLE_CHARS).trim()
    }

    fun publish(mediaId: String?, rawTitle: String?) {
        val next = clean(rawTitle)?.let { Track(mediaId, it) }
        if (next == current) return
        current = next
        for (listener in listeners) {
            runCatching { listener(next) }
        }
    }

    fun addListener(listener: (Track?) -> Unit) {
        listeners.addIfAbsent(listener)
    }

    fun removeListener(listener: (Track?) -> Unit) {
        listeners.remove(listener)
    }

    /** Stop, failure and station switches must not leave the last song on screen. */
    fun clear() = publish(null, null)

    private val WHITESPACE = Regex("\\s+")
}
