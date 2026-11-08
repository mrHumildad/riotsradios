package com.mrhumildad.riotsradios.playback

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Before
import org.junit.Test

class TrackBusTest {

    @Before
    fun reset() {
        TrackBus.clear()
    }

    @Test
    fun `blank and missing titles mean no title`() {
        assertNull(TrackBus.clean(null))
        assertNull(TrackBus.clean(""))
        assertNull(TrackBus.clean("   "))
        assertNull(TrackBus.clean("\u0000\u0000"))
    }

    @Test
    fun `titles are trimmed and collapsed`() {
        assertEquals("Miley Cyrus - Bass Persuades", TrackBus.clean("  Miley Cyrus - Bass\tPersuades \n"))
    }

    @Test
    fun `overlong titles are cut, not passed through`() {
        val title = "x".repeat(TrackBus.MAX_TITLE_CHARS + 50)
        assertEquals(TrackBus.MAX_TITLE_CHARS, TrackBus.clean(title)?.length)
    }

    @Test
    fun `a title is published once and cleared once`() {
        val seen = mutableListOf<String?>()
        val listener: (TrackBus.Track?) -> Unit = { seen.add(it?.title) }
        TrackBus.addListener(listener)

        TrackBus.publish("station:12", "Los Fabulosos Cadillacs - Siguiendo La Luna")
        TrackBus.publish("station:12", "Los Fabulosos Cadillacs - Siguiendo La Luna")
        TrackBus.clear()
        TrackBus.clear()

        assertEquals(listOf("Los Fabulosos Cadillacs - Siguiendo La Luna", null), seen)
        assertEquals("station:12", TrackBus.latest?.mediaId ?: "station:12")
        assertNull(TrackBus.latest)

        TrackBus.removeListener(listener)
        TrackBus.publish("station:12", "Mika")
        assertEquals(2, seen.size)
    }

    @Test
    fun `an empty frame clears the previous title`() {
        TrackBus.publish("station:71", "Gay FM")
        TrackBus.publish("station:71", "  ")
        assertNull(TrackBus.latest)
    }
}
