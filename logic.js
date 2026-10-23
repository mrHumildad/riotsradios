import { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import { stations } from './stations.js'
import { createPlaybackController } from './lib/playbackController.js'
import { createSpectrumAnalyzer } from './lib/spectrumAnalyzer.js'
import { getCurrentShow as computeCurrentShow, getDaySchedule as computeDaySchedule } from './lib/epg.js'

/** Web Audio can only read audio from stations whose health snapshot reports CORS. */
function supportsAnalyzer(health) {
  return Boolean(health && (health.cors === 'any' || health.cors === 'origin'))
}

export function useRadioLogic() {
  const audioRef = useRef(null)
  const controllerRef = useRef(null)
  const spectrumRef = useRef(null)
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

  useEffect(() => {
    const id = setInterval(() => setTimeTick(t => t + 1), 60000)
    return () => clearInterval(id)
  }, [])

  /* One audio element per app instance, created after mount (never during
     render) and driven by the playback state machine. */
  useEffect(() => {
    const audio = new Audio()
    audio.preload = 'none'
    audio.volume = volumeRef.current
    audioRef.current = audio

    const controller = createPlaybackController({
      audio,
      isMixedContent: (url) =>
        typeof window !== 'undefined' &&
        window.location.protocol === 'https:' &&
        typeof url === 'string' &&
        url.startsWith('http://'),
      onState: applyState,
      onStreamError: setStreamError,
    })
    controllerRef.current = controller

    return () => {
      controller.destroy()
      controllerRef.current = null
      spectrumRef.current?.close()
      spectrumRef.current = null
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
      if (station) controller.play(station.url, { isRetry: true })
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

  const selectStation = useCallback((index) => {
    if (!Number.isInteger(index) || index < 0 || index >= stations.length) return

    const controller = controllerRef.current
    if (!controller) return
    if (index === currentIndexRef.current && controller.getState() === 'playing') return

    if (currentIndexRef.current !== index) {
      const prevEl = document.getElementById(`station-${currentIndexRef.current}`)
      if (prevEl) prevEl.classList.remove('playing')
    }

    currentIndexRef.current = index
    setCurrentStationIndex(index)

    const station = stations[index]
    const cors = supportsAnalyzer(station.health)
    setCanAnalyze(cors ? ensureSpectrum() : false)
    controller.play(station.url, { cors })
  }, [ensureSpectrum])

  const togglePlay = useCallback(() => {
    const controller = controllerRef.current
    const station = stations[currentIndexRef.current]
    if (!controller || !station) return

    const state = controller.getState()
    /* While tuning or reconnecting the button cancels the attempt. */
    if (state === 'playing' || state === 'loading' || state === 'stalled') {
      controller.stop()
    } else {
      const cors = supportsAnalyzer(station.health)
      setCanAnalyze(cors ? ensureSpectrum() : false)
      controller.play(station.url, { cors })
    }
  }, [ensureSpectrum])

  const changeVolume = useCallback((val) => {
    const vol = parseFloat(val)
    volumeRef.current = vol
    setVolume(vol)
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