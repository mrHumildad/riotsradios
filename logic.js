import { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import {
  stations,
  logStationClick,
  syncCatalog,
  catalogSyncEnabled,
  getCatalogVersion,
} from './stations.js'
import { createPlaybackController } from './lib/playbackController.js'
import { createSpectrumAnalyzer } from './lib/spectrumAnalyzer.js'
import { createNativeSpectrum, nativePlaybackAvailable } from './lib/nativeSpectrum.js'
import { createNativePlaybackController } from './lib/nativePlayback.js'
import { getCurrentShow as computeCurrentShow, getDaySchedule as computeDaySchedule } from './lib/epg.js'
import { loadEpgData } from './lib/epgFeed.js'
import { readIcyTitle } from './lib/icy.js'

/* ICY titles cost one connection per station, so they are polled in small
   batches. The selected station refreshes fastest; a station that refuses the
   Icy-MetaData preflight a couple of times is left alone until reload. */
const TRACK_REFRESH_MS = 90_000
const TRACK_REFRESH_ACTIVE_MS = 30_000
const TRACK_BATCH = 3
const TRACK_GIVE_UP_AFTER = 2

/* Inside the Capacitor app the page origin is the local server (http://localhost),
   so the probe's `cors: "origin"` entries — pinned to the GitHub Pages origin — no
   longer match and setting crossOrigin would stop the stream from loading at all.
   Only the wildcard survives the change of origin. */
const isNativeApp =
  typeof window !== 'undefined' && window.Capacitor?.isNativePlatform?.() === true

/* Web Audio can only read audio from stations whose health snapshot reports CORS.
   The native tap reads the decoder instead, so every station is analyzable there. */
function supportsAnalyzer(health, nativeEngine = false) {
  if (nativeEngine) return true
  if (!health) return false
  if (isNativeApp) return health.cors === 'any'
  return health.cors === 'any' || health.cors === 'origin'
}

export function useRadioLogic() {
  const audioRef = useRef(null)
  const controllerRef = useRef(null)
  const spectrumRef = useRef(null)
  const spectrumSourceRef = useRef('web')   /* 'web' | 'native' */
  const controllerReadyRef = useRef(null)   /* Promise<controller|null> */
  const currentIndexRef = useRef(0)
  const volumeRef = useRef(0.8)
  /* The station whose title the native player currently owns: Media3 hears the
     stream directly, so the web poller must not overwrite it with a blank. */
  const nativeTrackIdRef = useRef(null)

  const [currentStationIndex, setCurrentStationIndex] = useState(0)
  const [playbackState, setPlaybackState] = useState('idle')   /* idle | loading | playing | stalled | error */
  const [canAnalyze, setCanAnalyze] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const [volume, setVolume] = useState(0.8)
  const [stationHasError, setStationHasError] = useState(false)
  const [streamError, setStreamError] = useState(null)
  const [epgData, setEpgData] = useState(new Map())
  const [nowPlaying, setNowPlaying] = useState(new Map())
  const [timeTick, setTimeTick] = useState(0)
  /* Bumped when a newer published catalog replaces the bundled one; every
     station-derived effect below depends on it. */
  const [catalogVersion, setCatalogVersion] = useState(getCatalogVersion)

  const applyState = useCallback((next) => {
    setPlaybackState(next)
    setIsPlaying(next === 'playing')
    setStationHasError(next === 'error')
  }, [])

  /* Must run inside a user gesture: creating an AudioContext elsewhere leaves
     it suspended. Once connected, volume moves to the GainNode. */
  const ensureSpectrum = useCallback(() => {
    /* Native playback hands us the decoder's samples, not the <audio> element. */
    if (spectrumSourceRef.current === 'native') return spectrumRef.current?.ensure() ?? false

    const audio = audioRef.current
    if (!audio) return false
    if (!spectrumRef.current) spectrumRef.current = createSpectrumAnalyzer({ audio })
    const connected = spectrumRef.current.ensure()
    if (connected) {
      audio.volume = 1
      spectrumRef.current.setVolume(volumeRef.current)
    }
    return connected
  }, [])

  /* The engine resolves asynchronously, so a tap that lands before the plugin
     answers waits for the right controller instead of being dropped. */
  const readyController = useCallback(async () => {
    const pending = controllerReadyRef.current
    if (pending) {
      const controller = await pending
      if (controller) return controller
    }
    return controllerRef.current
  }, [])

  useEffect(() => {
    const id = setInterval(() => setTimeTick(t => t + 1), 60000)
    return () => clearInterval(id)
  }, [])

  /* One audio element per app instance, created after mount (never during
     render) and driven by the playback state machine. */
  /* One engine per app instance, chosen after mount (never during render):
     Media3 on Android, the WebView's <audio> element everywhere else. */
  useEffect(() => {
    let disposed = false
    let audio = null
    let controller = null

    const engineReady = (async () => {
      const native = await nativePlaybackAvailable()
      if (disposed) return null

      if (native) {
        controller = createNativePlaybackController({
          onState: applyState,
          onStreamError: setStreamError,
          /* Every station reaches its title here, CORS or not, because the
             player owns the socket. `id` is the station the player tagged. */
          onTrack: (title, id) => {
            const key = Number(id)
            if (!Number.isInteger(key)) return
            nativeTrackIdRef.current = title
              ? key
              : nativeTrackIdRef.current === key ? null : nativeTrackIdRef.current
            setNowPlaying((prev) => {
              const next = new Map(prev)
              if (title) next.set(key, { title, at: Date.now() })
              else next.delete(key)
              return next
            })
          },
        })
        spectrumSourceRef.current = 'native'
        spectrumRef.current?.close()
        spectrumRef.current = createNativeSpectrum()
      } else {
        audio = new Audio()
        audio.preload = 'none'
        audio.volume = volumeRef.current
        audioRef.current = audio
        controller = createPlaybackController({
          audio,
          isMixedContent: (url) =>
            typeof window !== 'undefined' &&
            window.location.protocol === 'https:' &&
            typeof url === 'string' &&
            url.startsWith('http://'),
          onState: applyState,
          onStreamError: setStreamError,
        })
      }

      controllerRef.current = controller
      return controller
    })()
    controllerReadyRef.current = engineReady

    return () => {
      disposed = true
      controller?.destroy()
      controllerRef.current = null
      controllerReadyRef.current = null
      spectrumRef.current?.close()
      spectrumRef.current = null
      spectrumSourceRef.current = 'web'
      nativeTrackIdRef.current = null
      audioRef.current = null
    }
  }, [applyState])

  /* When connectivity returns, retry a stream that gave up. */
  useEffect(() => {
    const onOnline = () => {
      const controller = controllerRef.current
      if (!controller) return
      const state = controller.getState()
      if (state !== 'error' && state !== 'stalled') return
      const station = stations[currentIndexRef.current]
      const cors = station ? supportsAnalyzer(station.health, spectrumSourceRef.current === 'native') : false
      if (station) controller.play(station.url, { isRetry: true, cors, station })
    }
    window.addEventListener('online', onOnline)
    return () => window.removeEventListener('online', onOnline)
  }, [])

  /* The catalog is re-read in the background: the list renders from the copy on
     the device first, and a newer published catalog is adopted when it arrives.
     Indices move with the swap, so the playing station is tracked by id. */
  useEffect(() => {
    if (!catalogSyncEnabled()) return
    let disposed = false
    syncCatalog()
      .then((result) => {
        if (disposed || !result?.changed) return
        const playingId = stations[currentIndexRef.current]?.id
        const nextIndex = Math.max(0, stations.findIndex((station) => station.id === playingId))
        currentIndexRef.current = nextIndex
        setCurrentStationIndex(nextIndex)
        setCatalogVersion(getCatalogVersion())
      })
      .catch(() => {})
    return () => { disposed = true }
  }, [])

  useEffect(() => {
    let disposed = false
    loadEpgData({ stations })
      .then((data) => {
        if (!disposed) setEpgData(data)
      })
      .catch(() => {})
    return () => { disposed = true }
  }, [catalogVersion])

  /* ICY titles for the stations whose server allows the Icy-MetaData preflight.
     Nothing is invented: a station that cannot be read simply has no entry. */
  useEffect(() => {
    let disposed = false
    const titles = new Map()    /* id -> { title, at } */
    const attempts = new Map()  /* id -> last try (ms) */
    const failures = new Map()  /* id -> consecutive unreadable reads */
    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
    const publish = () => {
      if (!disposed) setNowPlaying(new Map(titles))
    }
    const activeId = () => stations[currentIndexRef.current]?.id
    const eligible = stations.filter(
      (station) => typeof station.url === 'string' && station.url.startsWith('https://')
    )
    const due = (station) => {
      const ttl = station.id === activeId() ? TRACK_REFRESH_ACTIVE_MS : TRACK_REFRESH_MS
      return Date.now() - (attempts.get(station.id) || 0) >= ttl
    }

    const pump = async () => {
      while (!disposed) {
        /* A background tab neither needs titles nor should spend the bandwidth. */
        if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
          await sleep(5000)
          continue
        }
        const pending = eligible
          .filter((station) =>
            (failures.get(station.id) || 0) < TRACK_GIVE_UP_AFTER &&
            station.id !== nativeTrackIdRef.current &&
            due(station)
          )
          .sort((a, b) => (a.id === activeId() ? -1 : b.id === activeId() ? 1 : 0))
        if (pending.length === 0) {
          await sleep(1500)
          continue
        }
        await Promise.all(
          pending.slice(0, TRACK_BATCH).map(async (station) => {
            attempts.set(station.id, Date.now())
            const title = await readIcyTitle(station.url)
            if (disposed) return
            if (title) {
              failures.delete(station.id)
              const previous = titles.get(station.id)
              if (previous?.title !== title) {
                titles.set(station.id, { title, at: Date.now() })
                publish()
              } else {
                titles.set(station.id, { title, at: Date.now() })
              }
            } else {
              failures.set(station.id, (failures.get(station.id) || 0) + 1)
            }
          })
        )
        await sleep(250)
      }
    }

    pump()
    return () => {
      disposed = true
    }
    /* A synced catalog brings stations this pump has never seen. */
  }, [catalogVersion])

  const currentShows = useMemo(() => {
    const now = new Date()
    const shows = new Map()
    epgData.forEach((epg, stationId) => {
      shows.set(stationId, computeCurrentShow(epg, now))
    })
    return shows
  }, [epgData, timeTick])

  const getDaySchedule = useCallback((stationId, dayOffset) => {
    const epg = epgData.get(stationId)
    if (!epg) return null
    return computeDaySchedule(epg, dayOffset)
  }, [epgData])

  const selectStation = useCallback(async (index) => {
    if (!Number.isInteger(index) || index < 0 || index >= stations.length) return
    logStationClick(stations[index])
    if (index === currentIndexRef.current && controllerRef.current?.getState() === 'playing') return

    if (currentIndexRef.current !== index) {
      const prevEl = document.getElementById(`station-${currentIndexRef.current}`)
      if (prevEl) prevEl.classList.remove('playing')
    }

    currentIndexRef.current = index
    setCurrentStationIndex(index)

    const controller = await readyController()
    if (!controller) return

    const station = stations[index]
    const cors = supportsAnalyzer(station.health, spectrumSourceRef.current === 'native')
    setCanAnalyze(cors ? ensureSpectrum() : false)
    controller.play(station.url, { cors, station })
  }, [ensureSpectrum, readyController])

  const togglePlay = useCallback(async () => {
    const controller = await readyController()
    const station = stations[currentIndexRef.current]
    if (!controller || !station) return

    const state = controller.getState()
    /* While tuning or reconnecting the button cancels the attempt. */
    if (state === 'playing' || state === 'loading' || state === 'stalled') {
      controller.stop()
    } else {
      const cors = supportsAnalyzer(station.health, spectrumSourceRef.current === 'native')
      setCanAnalyze(cors ? ensureSpectrum() : false)
      controller.play(station.url, { cors, station })
    }
  }, [ensureSpectrum, readyController])

  const changeVolume = useCallback((val) => {
    const vol = parseFloat(val)
    volumeRef.current = vol
    setVolume(vol)
    if (spectrumSourceRef.current === 'native') {
      /* Per-app gain inside ExoPlayer, mirroring the web GainNode. */
      controllerRef.current?.setVolume?.(vol)
      return
    }
    if (spectrumRef.current?.isConnected()) spectrumRef.current.setVolume(vol)
    else if (audioRef.current) audioRef.current.volume = vol
  }, [])

  const nextStation = useCallback(() => {
    const len = stations.length
    if (len === 0 || currentStationIndex === null) return
    const nextIndex = (currentStationIndex + 1) % len
    selectStation(nextIndex)
  }, [currentStationIndex, selectStation])

  const prevStation = useCallback(() => {
    const len = stations.length
    if (len === 0 || currentStationIndex === null) return
    const prevIndex = (currentStationIndex - 1 + len) % len
    selectStation(prevIndex)
  }, [currentStationIndex, selectStation])

  return {
    audioRef,
    spectrumRef,
    canAnalyze,
    currentStationIndex,
    playbackState,
    isPlaying,
    volume,
    stationHasError,
    streamError,
    epgData,
    nowPlaying,
    currentShows,
    getDaySchedule,
    selectStation,
    togglePlay,
    changeVolume,
    nextStation,
    prevStation
  }
}