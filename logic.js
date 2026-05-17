import { useState, useRef, useCallback } from 'react'
import { stations } from './stations.js'

export function useRadioLogic() {
  const audioRef = useRef(new Audio())
  const [currentStationIndex, setCurrentStationIndex] = useState(null)
  const [currentStationName, setCurrentStationName] = useState('-')
  const [isPlaying, setIsPlaying] = useState(false)
  const [volume, setVolume] = useState(0.8)

  const selectStation = useCallback((index) => {
    const audio = audioRef.current

    if (currentStationIndex !== null) {
      const prevId = `station-${currentStationIndex}`
      const prevEl = document.getElementById(prevId)
      if (prevEl) prevEl.classList.remove('playing')
    }

    const station = stations[index]
    setCurrentStationIndex(index)
    setCurrentStationName(`Playing: ${station.name}`)
    audio.src = station.url
    audio.volume = volume
    audio.play()
      .then(() => setIsPlaying(true))
      .catch((err) => {
        setCurrentStationName('Stream unavailable')
        console.error('Playback error:', err)
      })
  }, [currentStationIndex, volume])

  const togglePlay = useCallback(() => {
    const audio = audioRef.current
    if (currentStationIndex === null) return
    if (audio.paused) {
      audio.play().then(() => setIsPlaying(true))
    } else {
      audio.pause()
      setIsPlaying(false)
    }
  }, [currentStationIndex])

  const stopRadio = useCallback(() => {
    const audio = audioRef.current
    audio.pause()
    audio.src = ''
    setIsPlaying(false)
    if (currentStationIndex !== null) {
      const prevId = `station-${currentStationIndex}`
      const prevEl = document.getElementById(prevId)
      if (prevEl) prevEl.classList.remove('playing')
    }
    setCurrentStationIndex(null)
    setCurrentStationName('-')
  }, [currentStationIndex])

  const changeVolume = useCallback((val) => {
    const vol = parseFloat(val)
    setVolume(vol)
    audioRef.current.volume = vol
  }, [])

  return {
    audioRef,
    currentStationIndex,
    setCurrentStationIndex,
    currentStationName,
    setCurrentStationName,
    isPlaying,
    setIsPlaying,
    volume,
    setVolume,
    selectStation,
    togglePlay,
    stopRadio,
    changeVolume
  }
}