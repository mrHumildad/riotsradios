package com.mrhumildad.riotsradios.spectrum

import android.Manifest
import android.content.ComponentName
import android.net.Uri
import android.os.Build
import androidx.core.content.ContextCompat
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import androidx.media3.session.MediaController
import androidx.media3.session.SessionToken
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.PermissionState
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.getcapacitor.annotation.Permission
import com.getcapacitor.annotation.PermissionCallback
import com.google.common.util.concurrent.ListenableFuture
import com.mrhumildad.riotsradios.playback.PlaybackBus
import com.mrhumildad.riotsradios.playback.RiotMediaService
import com.mrhumildad.riotsradios.playback.TrackBus

/* File-level so the @CapacitorPlugin annotation can reference it. */
private const val ALIAS_NOTIFICATIONS = "notifications"

/* Prefix of the item's mediaId; the page keys its stations by the bare id. */
private const val MEDIA_ID_PREFIX = "station:"

/**
 * Capacitor bridge between the WebView and the native Media3 session.
 *
 * The page never touches audio here: it sends the station it already resolved
 * and mirrors `state` events. Playback, retries, audio focus and the media
 * notification all live in [RiotMediaService].
 */
@CapacitorPlugin(
    name = "RiotsPlayback",
    permissions = [
        Permission(
            alias = ALIAS_NOTIFICATIONS,
            strings = [Manifest.permission.POST_NOTIFICATIONS],
        ),
    ],
)
class RiotsPlaybackPlugin : Plugin() {

    private var controllerFuture: ListenableFuture<MediaController>? = null

    @Volatile
    private var controller: MediaController? = null

    private val spectrumListener: (FloatArray) -> Unit = { levels ->
        if (hasListeners(EVENT_SPECTRUM)) {
            val payload = JSObject().put("levels", toJsArray(levels))
            activity?.runOnUiThread { notifyListeners(EVENT_SPECTRUM, payload) }
        }
    }

    private val stateListener: (PlaybackBus.Snapshot) -> Unit = { snapshot ->
        if (hasListeners(EVENT_STATE)) {
            val payload = JSObject().put("state", snapshot.state)
            snapshot.error?.let { payload.put("error", it) }
            activity?.runOnUiThread { notifyListeners(EVENT_STATE, payload) }
        }
    }

    /* The ICY title the service decoded from the stream. Empty means "no track
       for this station", which the page shows as no line at all. */
    private val trackListener: (TrackBus.Track?) -> Unit = { track ->
        if (hasListeners(EVENT_TRACK)) {
            activity?.runOnUiThread { notifyListeners(EVENT_TRACK, trackPayload(track)) }
        }
    }

    override fun load() {
        super.load()
        SpectrumBus.addListener(spectrumListener)
        PlaybackBus.addListener(stateListener)
        TrackBus.addListener(trackListener)
        connect()
    }

    override fun handleOnDestroy() {
        SpectrumBus.removeListener(spectrumListener)
        PlaybackBus.removeListener(stateListener)
        TrackBus.removeListener(trackListener)
        controller = null
        controllerFuture?.let { MediaController.releaseFuture(it) }
        controllerFuture = null
        super.handleOnDestroy()
    }

    private fun connect() {
        val context = context
        val token = SessionToken(context, ComponentName(context, RiotMediaService::class.java))
        val future = MediaController.Builder(context, token).buildAsync()
        controllerFuture = future
        future.addListener(
            {
                val connected = runCatching { future.get() }.getOrNull()
                if (connected != null) {
                    controller = connected
                    publishState()
                    /* The page may attach while a stream is already playing. */
                    trackListener(TrackBus.latest)
                }
            },
            ContextCompat.getMainExecutor(context)
        )
    }

    @PluginMethod
    fun playStation(call: PluginCall) {
        val id = call.getString("id")
        val url = call.getString("url")
        if (id.isNullOrBlank() || url.isNullOrBlank()) {
            call.reject("id and url are required")
            return
        }

        val metadata = MediaMetadata.Builder()
            .setTitle(call.getString("name") ?: "")
            .setArtist(call.getString("location") ?: "")
            .setAlbumTitle(ALBUM)
            .setIsBrowsable(false)
            .setIsPlayable(true)
            .apply {
                call.getString("artworkUrl")
                    ?.takeIf { it.isNotBlank() }
                    ?.let { artwork -> runCatching { Uri.parse(artwork) }.getOrNull()?.let(::setArtworkUri) }
            }
            .build()

        val item = MediaItem.Builder()
            .setMediaId("station:$id")
            .setUri(url)
            .setMediaMetadata(metadata)
            .build()

        withController(call) { native ->
            native.setMediaItem(item)
            native.prepare()
            native.play()
        }
    }

    @PluginMethod
    fun stop(call: PluginCall) {
        withController(call) { native ->
            /* The stop rule from lib/playbackController.js: release everything,
               do not leave a notification, a socket or a stale song behind. */
            native.stop()
            native.clearMediaItems()
            SpectrumBus.clear()
            TrackBus.clear()
            PlaybackBus.reset()
        }
    }

    @PluginMethod
    fun setVolume(call: PluginCall) {
        val volume = (call.getFloat("volume") ?: 1f).coerceIn(0f, 1f)
        withController(call) { native -> native.volume = volume }
    }

    @PluginMethod
    fun getState(call: PluginCall) {
        call.resolve(snapshotPayload())
    }

    /** Latest spectrum frame, for a page that attaches after playback started. */
    @PluginMethod
    fun getSpectrum(call: PluginCall) {
        val levels = SpectrumBus.latest()
        val result = JSObject()
            .put("available", levels != null)
            .put("ageMs", SpectrumBus.ageMillis())
        if (levels != null) result.put("levels", toJsArray(levels))
        call.resolve(result)
    }

    /** Latest ICY title, for a page that attaches after playback started. */
    @PluginMethod
    fun getTrack(call: PluginCall) {
        call.resolve(trackPayload(TrackBus.latest))
    }

    @PluginMethod
    fun isNativePlaybackAvailable(call: PluginCall) {
        call.resolve(JSObject().put("available", true))
    }

    /**
     * Android 13+ hides the media notification until this is granted. The JS
     * engine asks once, before the first playback, and never blocks on it: the
     * foreground service still runs either way.
     */
    @PluginMethod
    fun requestNotifications(call: PluginCall) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
            call.resolve(JSObject().put("granted", true))
            return
        }
        if (getPermissionState(ALIAS_NOTIFICATIONS) == PermissionState.GRANTED) {
            call.resolve(JSObject().put("granted", true))
            return
        }
        /* The system dialog can only be raised from the UI thread. */
        activity?.runOnUiThread {
            requestPermissionForAlias(ALIAS_NOTIFICATIONS, call, "notificationsResult")
        } ?: call.reject("no activity to request the notification permission from")
    }

    @PermissionCallback
    private fun notificationsResult(call: PluginCall) {
        val granted = getPermissionState(ALIAS_NOTIFICATIONS) == PermissionState.GRANTED
        call.resolve(JSObject().put("granted", granted))
    }

    /**
     * A MediaController is bound to the looper that built it (main), while
     * Capacitor runs plugin methods on its own thread. Every controller call
     * therefore has to hop to the UI thread, including the already-connected
     * fast path — calling setMediaItem() from the plugin thread kills the app.
     */
    private fun withController(call: PluginCall, block: (MediaController) -> Unit) {
        val ui = activity
        if (ui == null) {
            call.reject("no activity to run the playback command on")
            return
        }

        ui.runOnUiThread {
            val ready = controller
            if (ready != null) {
                block(ready)
                call.resolve()
                return@runOnUiThread
            }

            val future = controllerFuture
            if (future == null) {
                call.reject("playback service is not available")
                return@runOnUiThread
            }

            val deliver: (MediaController?) -> Unit = { connected ->
                if (connected == null) {
                    call.reject("could not connect to the playback service")
                } else {
                    controller = connected
                    block(connected)
                    call.resolve()
                }
            }

            if (future.isDone && !future.isCancelled) {
                deliver(runCatching { future.get() }.getOrNull())
                return@runOnUiThread
            }

            future.addListener(
                { ui.runOnUiThread { deliver(runCatching { future.get() }.getOrNull()) } },
                ContextCompat.getMainExecutor(context)
            )
        }
    }

    private fun publishState() {
        stateListener(PlaybackBus.snapshot)
    }

    private fun snapshotPayload(): JSObject {
        val snapshot = PlaybackBus.snapshot
        val payload = JSObject().put("state", snapshot.state)
        snapshot.error?.let { payload.put("error", it) }
        return payload
    }

    private fun trackPayload(track: TrackBus.Track?): JSObject {
        val payload = JSObject().put("title", track?.title ?: "")
        track?.mediaId?.removePrefix(MEDIA_ID_PREFIX)?.let { payload.put("id", it) }
        return payload
    }

    private fun toJsArray(levels: FloatArray): JSArray {
        val array = JSArray()
        for (level in levels) array.put(level.toDouble())
        return array
    }

    private companion object {
        const val ALBUM = "RIOTSRADIOS"
        const val EVENT_SPECTRUM = "spectrum"
        const val EVENT_STATE = "state"
        const val EVENT_TRACK = "track"
    }
}
