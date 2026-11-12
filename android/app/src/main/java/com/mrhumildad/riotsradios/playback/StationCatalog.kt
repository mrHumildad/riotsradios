package com.mrhumildad.riotsradios.playback

import android.content.Context
import android.net.Uri
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import org.json.JSONArray
import org.json.JSONObject

/**
 * The station order the page cached with the service.
 *
 * Headset next/previous must keep working after the WebView is gone (activity
 * swiped away, screen off), so the service cannot ask the page which station
 * comes next. `RiotsPlayback.setCatalog` writes this list once per catalog; the
 * service walks it directly and publishes the station it lands on, which the
 * page adopts when it reattaches.
 */
object StationCatalog {

    data class Station(
        val id: String,
        val name: String,
        val location: String,
        val url: String,
        val artworkUrl: String?,
    ) {
        /** Same item shape `RiotsPlayback.playStation` builds from the page. */
        fun mediaItem(): MediaItem {
            val metadata = MediaMetadata.Builder()
                .setTitle(name)
                .setArtist(location)
                .setAlbumTitle(ALBUM)
                .setIsBrowsable(false)
                .setIsPlayable(true)
                .apply {
                    artworkUrl
                        ?.takeIf { it.isNotBlank() }
                        ?.let { artwork -> runCatching { Uri.parse(artwork) }.getOrNull() }
                        ?.let(::setArtworkUri)
                }
                .build()
            return MediaItem.Builder()
                .setMediaId(mediaId(id))
                .setUri(url)
                .setMediaMetadata(metadata)
                .build()
        }
    }

    const val ALBUM = "RIOTSRADIOS"

    private const val MEDIA_ID_PREFIX = "station:"
    private const val PREFS = "riots_catalog"
    private const val KEY = "stations"

    fun mediaId(id: String): String = "$MEDIA_ID_PREFIX$id"

    /** The bare station id behind a player item, or null when it is not one. */
    fun stationId(mediaId: String?): String? =
        mediaId?.takeIf { it.startsWith(MEDIA_ID_PREFIX) }?.removePrefix(MEDIA_ID_PREFIX)

    fun replace(context: Context, stations: List<Station>) {
        val rows = JSONArray()
        for (station in stations) {
            if (station.id.isBlank() || station.url.isBlank()) continue
            rows.put(
                JSONObject()
                    .put("id", station.id)
                    .put("name", station.name)
                    .put("location", station.location)
                    .put("url", station.url)
                    .put("artworkUrl", station.artworkUrl ?: "")
            )
        }
        prefs(context).edit().putString(KEY, rows.toString()).apply()
    }

    fun read(context: Context): List<Station> {
        val raw = prefs(context).getString(KEY, null) ?: return emptyList()
        val rows = runCatching { JSONArray(raw) }.getOrNull() ?: return emptyList()
        val stations = ArrayList<Station>(rows.length())
        for (index in 0 until rows.length()) {
            val row = rows.optJSONObject(index) ?: continue
            val id = row.optString("id")
            val url = row.optString("url")
            if (id.isBlank() || url.isBlank()) continue
            stations.add(
                Station(
                    id = id,
                    name = row.optString("name"),
                    location = row.optString("location"),
                    url = url,
                    artworkUrl = row.optString("artworkUrl").takeIf { it.isNotBlank() },
                )
            )
        }
        return stations
    }

    /**
     * Next/previous station with the same wraparound as the page. The player's
     * item is the anchor; an unknown or missing one starts at the top of the
     * list rather than refusing to switch.
     */
    fun neighbour(context: Context, currentId: String?, step: Int): Station? {
        val stations = read(context)
        if (stations.isEmpty()) return null
        val current = stations.indexOfFirst { it.id == currentId }
        val index = if (current < 0) 0 else Math.floorMod(current + step, stations.size)
        return stations[index]
    }

    private fun prefs(context: Context) =
        context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
}
