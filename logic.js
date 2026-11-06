import { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import { stations, logStationClick } from './stations.js'
import { createPlaybackController } from './lib/playbackController.js'
import { createSpectrumAnalyzer } from './lib/spectrumAnalyzer.js'
import { createNativeSpectrum, nativePlaybackAvailable } from './lib/nativeSpectrum.js'
import { createNativePlaybackController } from './lib/nativePlayback.js'
import { getCurrentShow as computeCurrentShow, getDaySchedule as computeDaySchedule } from './lib/epg.js'

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

  const [currentStationIndex, setCurrentStationIndex] = useState(0)
  const [playbackState, setPlaybackState] = useState('idle')   /* idle | loading | playing | stalled | error */
  const [canAnalyze, setCanAnalyze] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const [volume, setVolume] = useState(0.8)
  const [stationHasError, setStationHasError] = useState(false)
  const [streamError, setStreamError] = useState(null)
  const [epgData, setEpgData] = useState(new Map())
  const [timeTick, setTimeTick] = useState(0)

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
        controller = createNativePlaybackController({ onState: applyState, onStreamError: setStreamError })
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

  useEffect(() => {
    stations.forEach(s => {
      if (!s.id || !s.epg_file) return
      fetch(`${import.meta.env.BASE_URL}EPGs/${s.epg_file}`)
        .then(r => r.ok ? r.json() : Promise.reject())
        .then(json => setEpgData(prev => new Map(prev).set(s.id, json)))
        .catch(() => {})
    })
  }, [])

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
    currentShows,
    getDaySchedule,
    selectStation,
    togglePlay,
    changeVolume,
    nextStation,
    prevStation
  }
}