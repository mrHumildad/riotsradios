package com.mrhumildad.riotsradios.playback

import android.content.Context
import android.os.Handler
import android.os.Looper
import androidx.media3.common.AudioAttributes
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import androidx.media3.common.Metadata
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.common.audio.AudioProcessor
import androidx.media3.exoplayer.DefaultRenderersFactory
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.audio.AudioSink
import androidx.media3.exoplayer.audio.DefaultAudioSink
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory
import androidx.media3.exoplayer.upstream.DefaultLoadErrorHandlingPolicy
import androidx.media3.extractor.metadata.icy.IcyInfo
import androidx.media3.session.DefaultMediaNotificationProvider
import androidx.media3.session.MediaLibraryService
import androidx.media3.session.MediaSession
import androidx.media3.session.SessionResult
import com.mrhumildad.riotsradios.spectrum.SpectrumBus
import com.mrhumildad.riotsradios.spectrum.SpectrumTap

/**
 * The only thing on Android that produces sound (docs/ANDROID-AUTO.md §3).
 *
 * A `MediaLibraryService` — not just a `MediaSessionService` — so the same
 * session can later serve a browse tree to Android Auto without a second
 * player. For M1 the phone drives it through `RiotsPlayback`; the library
 * callbacks keep their defaults until M2 builds the tree.
 *
 * The WebView being killed, the screen going off or the activity being swiped
 * away does not stop playback: the session and the foreground notification live
 * here.
 */
class RiotMediaService : MediaLibraryService() {

    private lateinit var player: ExoPlayer
    private var session: MediaLibrarySession? = null

    private val mainHandler = Handler(Looper.getMainLooper())

    /* A frame is computed on the tap's worker, so one can land just as playback
       stops and republish after the clear — leaving frozen bars on screen. The
       flag is set by [clearSpectrum] and cleared again once the player is live. */
    @Volatile
    private var spectrumMuted = false

    /* Tapped on the way to the audio sink, so the bars come from the exact
       samples the listener hears — no RECORD_AUDIO, no CORS. */
    private val spectrumTap = SpectrumTap { levels ->
        if (!spectrumMuted) SpectrumBus.publish(levels)
    }

    /* Distinguishes the first buffer from a stream that died mid-playback. */
    private var hasBeenReady = false

    /* Set while re-preparing after a retry, so the item transition does not
       restart the retry ladder. */
    private var rearming = false

    /* A hard failure the supervisor gave up on; overrides the player state until
       the next station is selected. */
    private var terminalError: String? = null

    /* A retryable load error is in flight. The player keeps its error until the
       rearm, but the listener must see "reconnecting", not a dead stream. */
    private var retrying = false

    private val supervisor = PlaybackSupervisor(
        positionMs = { if (::player.isInitialized) player.currentPosition else 0L },
        onRetry = { rearmPlayer() },
        onGiveUp = { giveUp() },
        scheduler = object : PlaybackSupervisor.Scheduler {
            override fun schedule(delayMs: Long, action: () -> Unit): () -> Unit {
                val runnable = Runnable { action() }
                mainHandler.postDelayed(runnable, delayMs)
                return { mainHandler.removeCallbacks(runnable) }
            }
        },
    )

    /**
     * Headset and Bluetooth next/previous buttons arrive as player commands.
     * There is no queue to seek through, so the command moves the session to
     * the neighbouring station in the catalog the page cached — whether the
     * WebView is still attached or not.
     */
    private val libraryCallback = object : MediaLibrarySession.Callback {
        override fun onPlayerCommandRequest(
            session: MediaSession,
            controller: MediaSession.ControllerInfo,
            playerCommand: Int,
        ): Int {
            val step = when (playerCommand) {
                Player.COMMAND_SEEK_TO_NEXT,
                Player.COMMAND_SEEK_TO_NEXT_MEDIA_ITEM -> 1
                Player.COMMAND_SEEK_TO_PREVIOUS,
                Player.COMMAND_SEEK_TO_PREVIOUS_MEDIA_ITEM -> -1
                else -> 0
            }
            if (step != 0 && skipStation(step)) return SessionResult.RESULT_SUCCESS
            return super.onPlayerCommandRequest(session, controller, playerCommand)
        }
    }

    override fun onCreate() {
        super.onCreate()

        setMediaNotificationProvider(DefaultMediaNotificationProvider(this))

        val renderers = object : DefaultRenderersFactory(this) {
            override fun buildAudioSink(
                context: Context,
                enableFloatOutput: Boolean,
                enableAudioTrackPlaybackParams: Boolean,
            ): AudioSink = DefaultAudioSink.Builder(context)
                .setEnableFloatOutput(enableFloatOutput)
                .setEnableAudioTrackPlaybackParams(false)
                .setAudioProcessors(arrayOf<AudioProcessor>(spectrumTap))
                .build()
        }

        /* The supervisor owns the retry ladder: 1 s / 2 s / 4 s, then a hard
           error. Media3's default policy retries three times with its own
           backoff *inside* each attempt, so every supervisor step inherited a
           second ladder and a dead host took ~19 s to give up instead of 7 s.
           With zero internal retries the player fails fast and the timing is
           the one PlaybackSupervisor promises (and the one the JS engine has). */
        player = ExoPlayer.Builder(this, renderers)
            .setAudioAttributes(AUDIO_ATTRIBUTES, /* handleAudioFocus = */ true)
            .setHandleAudioBecomingNoisy(true)
            /* The policy lives on the media source factory, not the builder, in
               Media3 1.11: ExoPlayer.Builder has no setLoadErrorHandlingPolicy. */
            .setMediaSourceFactory(
                DefaultMediaSourceFactory(this).setLoadErrorHandlingPolicy(
                    DefaultLoadErrorHandlingPolicy(/* minimumLoadableRetryCount= */ 0)
                )
            )
            .build()

        player.addListener(object : Player.Listener {
            override fun onMediaItemTransition(mediaItem: MediaItem?, reason: Int) {
                hasBeenReady = false
                /* A new station starts without a title. A rearm reloads the same
                   stream, so its title is still true and must not blink out. */
                if (!rearming) TrackBus.clear()
                if (rearming) {
                    publishState()
                    return
                }
                terminalError = null
                retrying = false
                if (mediaItem == null) supervisor.stop() else supervisor.start()
                publishState()
            }

            override fun onPlaybackStateChanged(playbackState: Int) {
                when (playbackState) {
                    Player.STATE_READY -> {
                        hasBeenReady = true
                        retrying = false
                        if (player.playWhenReady) supervisor.markPlaying()
                    }
                    Player.STATE_BUFFERING -> supervisor.markBuffering()
                    Player.STATE_IDLE, Player.STATE_ENDED -> {
                        if (player.currentMediaItem == null) supervisor.stop()
                    }
                }
                publishState()
            }

            override fun onIsPlayingChanged(isPlaying: Boolean) {
                if (isPlaying) supervisor.markPlaying()
                publishState()
            }

            override fun onPlayWhenReadyChanged(playWhenReady: Boolean, reason: Int) {
                if (playWhenReady) {
                    /* A play request from the user (or the notification/Bluetooth)
                       is a fresh attempt: drop the give-up error. */
                    terminalError = null
                    when (player.playbackState) {
                        Player.STATE_READY -> supervisor.markPlaying()
                        Player.STATE_IDLE -> supervisor.start()
                    }
                } else if (player.playbackState != Player.STATE_BUFFERING) {
                    /* A pause from the notification/Bluetooth mirrors to idle. */
                    supervisor.markPaused()
                }
                publishState()
            }

            /**
             * ICY titles arrive as dynamic metadata: ExoPlayer sends
             * `Icy-MetaData: 1`, parses the padded block and hands the title over
             * as an [IcyInfo] entry. This is the app's whole answer to the web
             * build's CORS problem — the socket belongs to the player, so every
             * station reports a track here, including the ones a WebView fetch
             * cannot preflight.
             */
            override fun onMetadata(metadata: Metadata) {
                for (index in 0 until metadata.length()) {
                    val entry = metadata.get(index)
                    if (entry is IcyInfo) {
                        TrackBus.publish(player.currentMediaItem?.mediaId, entry.title)
                        return
                    }
                }
            }

            /**
             * Some servers deliver the title folded into the media metadata
             * instead. Accept it only when it is not the station name this app
             * wrote into the item, or the row would show the station twice.
             */
            override fun onMediaMetadataChanged(mediaMetadata: MediaMetadata) {
                val written = player.currentMediaItem?.mediaMetadata?.title?.toString()
                val title = mediaMetadata.title?.toString()
                if (title != null && title != written) {
                    TrackBus.publish(player.currentMediaItem?.mediaId, title)
                }
            }

            override fun onPlayerError(error: PlaybackException) {
                val reason = streamErrorFor(error)
                if (reason == "format" || reason == "mixed-content") {
                    terminalError = reason
                    retrying = false
                    supervisor.stop()
                    player.stop()
                } else {
                    retrying = true
                    supervisor.requestRetry()
                }
                publishState()
            }
        })

        session = MediaLibrarySession.Builder(this, player, libraryCallback).build()
    }

    override fun onGetSession(controllerInfo: MediaSession.ControllerInfo): MediaLibrarySession =
        session ?: error("session requested before onCreate")

    override fun onDestroy() {
        supervisor.stop()
        mainHandler.removeCallbacksAndMessages(null)
        session?.release()
        session = null
        if (::player.isInitialized) player.release()
        clearSpectrum()
        TrackBus.clear()
        PlaybackBus.reset()
        super.onDestroy()
    }

    /** Fresh media item per retry: the JS controller re-assigns `src` for the same reason. */
    private fun rearmPlayer() {
        val item = player.currentMediaItem ?: return
        rearming = true
        player.setMediaItem(item)
        rearming = false
        player.prepare()
        player.play()
    }

    /**
     * The ladder ran out. The item stays loaded on purpose: clearing it fires
     * `onMediaItemTransition(null)`, which is the user-stop path, and that would
     * flip the error straight to `idle`. The JS controller keeps the failed
     * station in `error` until another station is picked, so this does too.
     * `stop()` still clears the item and returns to `idle`.
     */
    private fun giveUp() {
        terminalError = "playback"
        retrying = false
        player.stop()
        TrackBus.clear()
        clearSpectrum()
        publishState()
    }

    /** Maps ExoPlayer to the state names `lib/playbackController.js` already uses. */
    private fun publishState() {
        val mediaId = if (::player.isInitialized) player.currentMediaItem?.mediaId else null
        val forced = terminalError
        if (forced != null) {
            PlaybackBus.publish("error", forced, mediaId)
            TrackBus.clear()
            clearSpectrum()
            return
        }

        val error = player.playerError
        val state = when {
            /* Nothing loaded: stop() has run, so there is nothing left to load.
               The old order read STATE_IDLE + playWhenReady as "loading" and
               left the spinner up after the user pressed stop. */
            player.currentMediaItem == null -> "idle"
            error != null && !retrying -> "error"
            error != null -> if (hasBeenReady) "stalled" else "loading"
            player.playbackState == Player.STATE_BUFFERING ->
                if (hasBeenReady && player.playWhenReady) "stalled" else "loading"
            player.playbackState == Player.STATE_READY && player.playWhenReady -> "playing"
            player.playbackState == Player.STATE_READY -> "idle"
            player.playbackState == Player.STATE_IDLE -> if (player.playWhenReady) "loading" else "idle"
            else -> "idle"
        }
        PlaybackBus.publish(state, if (state == "error") error?.let(::streamErrorFor) else null, mediaId)
        /* A stopped or failed player must not leave the last frame frozen, nor
           the last song on the row. */
        if (state == "idle" || state == "error") {
            TrackBus.clear()
            clearSpectrum()
        } else {
            spectrumMuted = false
        }
    }

    /**
     * Moves to the next/previous station in the cached catalog. The player and
     * the media notification do the work; a page that is still attached learns
     * the new station from the published state (and never asks the player for
     * it again). No cached catalog yet — the page has not connected — leaves
     * the command to Media3, whose seek is a no-op on a single item.
     */
    private fun skipStation(step: Int): Boolean {
        val current = StationCatalog.stationId(player.currentMediaItem?.mediaId)
        val station = StationCatalog.neighbour(this, current, step) ?: return false
        player.setMediaItem(station.mediaItem())
        player.prepare()
        player.play()
        return true
    }

    private fun clearSpectrum() {
        spectrumMuted = true
        SpectrumBus.clear()
    }

    private fun streamErrorFor(error: PlaybackException): String = when (error.errorCode) {
        PlaybackException.ERROR_CODE_IO_CLEARTEXT_NOT_PERMITTED -> "mixed-content"
        PlaybackException.ERROR_CODE_PARSING_CONTAINER_UNSUPPORTED,
        PlaybackException.ERROR_CODE_PARSING_CONTAINER_MALFORMED,
        PlaybackException.ERROR_CODE_DECODING_FORMAT_UNSUPPORTED,
        PlaybackException.ERROR_CODE_DECODING_FORMAT_EXCEEDS_CAPABILITIES,
        PlaybackException.ERROR_CODE_DECODING_FAILED -> "format"
        else -> "playback"
    }

    private companion object {
        val AUDIO_ATTRIBUTES: AudioAttributes = AudioAttributes.Builder()
            .setUsage(C.USAGE_MEDIA)
            .setContentType(C.AUDIO_CONTENT_TYPE_MUSIC)
            .build()
    }
}
