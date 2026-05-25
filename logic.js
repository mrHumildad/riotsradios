import { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import { stations } from './stations.js'

const DAY_MAP = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday']

function getCurrentShow(epg) {
  if (!epg || !epg.days) return null
  const tz = epg.timezone || 'UTC'
  const now = new Date()

  const dayStr = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'long' }).format(now).toLowerCase()
  const resolvedDay = DAY_MAP.includes(dayStr) ? dayStr : null

  const dayEntry = epg.days.find(d => d.day === resolvedDay)
  if (!dayEntry) return null

  const timeStr = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).format(now)
  const [h, m] = timeStr.split(':').map(Number)
  const nowMinutes = h * 60 + m

  const blockUnit = epg.block_unit_minutes || epg.metadata?.block_unit_minutes || 30

  for (const prog of dayEntry.programs) {
    const [ph, pm] = prog.start.split(':').map(Number)
    const startMinutes = ph * 60 + pm
    const endMinutes = startMinutes + prog.duration_blocks * blockUnit
    if (nowMinutes >= startMinutes && nowMinutes < endMinutes) {
      return { title: prog.title, category: prog.category, live: !!prog.live }
    }
  }

  if (epg.gaps) {
    const sorted = [...dayEntry.programs].sort((a, b) => {
      const [ah, am] = a.start.split(':').map(Number)
      const [bh, bm] = b.start.split(':').map(Number)
      return (ah * 60 + am) - (bh * 60 + bm)
    })
    const firstStart = (() => {
      const [sh, sm] = sorted[0].start.split(':').map(Number)
      return sh * 60 + sm
    })()
    const lastEnd = (() => {
      const last = sorted[sorted.length - 1]
      const [lh, lm] = last.start.split(':').map(Number)
      return lh * 60 + lm + last.duration_blocks * blockUnit
    })()
    if (nowMinutes >= firstStart && nowMinutes < lastEnd) {
      return { title: epg.gaps, category: 'musica', live: false, isGap: true }
    }
  }

  return null
}

export function useRadioLogic() {
  const audioRef = useRef(new Audio())
  const currentStreamUrlRef = useRef('')
  const [currentStationIndex, setCurrentStationIndex] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [volume, setVolume] = useState(0.8)
  const [stationHasError, setStationHasError] = useState(false)
  const [epgData, setEpgData] = useState(new Map())
  const [timeTick, setTimeTick] = useState(0)

  useEffect(() => {
    const id = setInterval(() => setTimeTick(t => t + 1), 60000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    const audio = audioRef.current
    return () => {
      audio.pause()
      audio.src = ''
      currentStreamUrlRef.current = ''
    }
  }, [])

  useEffect(() => {
    stations.forEach(s => {
      if (!s.id) return
      fetch(`${import.meta.env.BASE_URL}EPGs/${s.id}.json`)
        .then(r => r.ok ? r.json() : Promise.reject())
        .then(json => setEpgData(prev => new Map(prev).set(s.id, json)))
        .catch(() => {})
    })
  }, [])

  const currentShows = useMemo(() => {
    const shows = new Map()
    epgData.forEach((epg, stationId) => {
      const show = getCurrentShow(epg)
      shows.set(stationId, show)
    })
    return shows
  }, [epgData, timeTick])

  const getDaySchedule = useCallback((stationId, dayOffset) => {
    const epg = epgData.get(stationId)
    if (!epg || !epg.days) return null
    const tz = epg.timezone || 'UTC'
    const now = new Date()
    const dayStr = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'long' }).format(now).toLowerCase()
    const epgDayNames = epg.days.map(d => d.day)
    const currentEpgIdx = epgDayNames.indexOf(dayStr)
    const baseIdx = currentEpgIdx >= 0 ? currentEpgIdx : 0
    const targetEpgIdx = baseIdx + dayOffset
    if (targetEpgIdx < 0 || targetEpgIdx >= epgDayNames.length) return null
    const targetDay = epgDayNames[targetEpgIdx]
    const dayEntry = epg.days.find(d => d.day === targetDay)
    if (!dayEntry) return null
  const blockUnit = epg.block_unit_minutes || epg.metadata?.block_unit_minutes || 30
    const nowMinutes = (() => {
      const timeStr = new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false }).format(now)
      const [h, m] = timeStr.split(':').map(Number)
      return h * 60 + m
    })()
    const isToday = dayOffset === 0 && currentEpgIdx >= 0
    const sorted = [...dayEntry.programs].sort((a, b) => {
      const [ah, am] = a.start.split(':').map(Number)
      const [bh, bm] = b.start.split(':').map(Number)
      return (ah * 60 + am) - (bh * 60 + bm)
    })
    const programs = []
    for (let i = 0; i < sorted.length; i++) {
      const p = sorted[i]
      const [ph, pm] = p.start.split(':').map(Number)
      const startMin = ph * 60 + pm
      const endMin = startMin + p.duration_blocks * blockUnit
      if (epg.gaps && programs.length > 0) {
        const prevEnd = programs[programs.length - 1].endMin
        if (startMin > prevEnd) {
          programs.push({
            start: String(Math.floor(prevEnd / 60)).padStart(2, '0') + ':' + String(prevEnd % 60).padStart(2, '0'),
            title: epg.gaps,
            category: 'musica',
            live: false,
            duration_blocks: (startMin - prevEnd) / blockUnit,
            startMin: prevEnd,
            endMin: startMin,
            isGap: true,
            isCurrent: isToday && nowMinutes >= prevEnd && nowMinutes < startMin,
            isPast: isToday && nowMinutes >= startMin
          })
        }
      }
      programs.push({
        ...p,
        startMin,
        endMin,
        isCurrent: isToday && nowMinutes >= startMin && nowMinutes < endMin,
        isPast: isToday && nowMinutes >= endMin
      })
    }
    return {
      label: dayEntry.label || dayEntry.day,
      programs,
      isToday,
      blockUnit
    }
  }, [epgData])

  const selectStation = useCallback((index) => {
    const audio = audioRef.current

    if (currentStationIndex === index && isPlaying) return

    if (currentStationIndex !== null && currentStationIndex !== index) {
      const prevId = `station-${currentStationIndex}`
      const prevEl = document.getElementById(prevId)
      if (prevEl) prevEl.classList.remove('playing')
    }

    const station = stations[index]
    setStationHasError(false)
    setCurrentStationIndex(index)

    audio.src = station.url
    currentStreamUrlRef.current = station.url
    audio.volume = volume
    audio.play()
      .then(() => {
        setIsPlaying(true)
        setStationHasError(false)
      })
      .catch((err) => {
        setStationHasError(true)
        console.error('Playback error:', err)
      })
  }, [currentStationIndex, isPlaying, volume])

  const togglePlay = useCallback(() => {
    if (currentStationIndex === null) return

    const audio = audioRef.current
    const station = stations[currentStationIndex]

    if (isPlaying) {
      // STOP the stream fetch / API call (prevents drain)
      audio.pause()
      audio.src = ''
      currentStreamUrlRef.current = ''
      setIsPlaying(false)
    } else {
      // (re)start fetching the live stream
      if (stationHasError || currentStreamUrlRef.current !== station.url) {
        audio.src = station.url
        currentStreamUrlRef.current = station.url
        audio.volume = volume
        setStationHasError(false)
      }
      audio.play()
        .then(() => setIsPlaying(true))
        .catch((err) => {
          console.error('Play rejected:', err.name, err.message)
          setStationHasError(true)
        })
    }
  }, [currentStationIndex, isPlaying, stationHasError, volume, stations])

  const changeVolume = useCallback((val) => {
    const vol = parseFloat(val)
    setVolume(vol)
    audioRef.current.volume = vol
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
    currentStationIndex,
    isPlaying,
    volume,
    stationHasError,
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