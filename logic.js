import { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import { stations } from './stations.js'

const DAY_MAP = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday']

function normalizeProgram(prog, shows = {}) {
  const getMinutes = (t) => {
    const [h, m] = t.split(':').map(Number)
    return h * 60 + m
  }
  let normalized = { ...prog }
  if (prog.end) {
    normalized.startMin = getMinutes(prog.start)
    normalized.endMin = prog.crosses_midnight ? 24 * 60 : getMinutes(prog.end)
    normalized.durationMin = normalized.endMin - normalized.startMin
  } else {
    const [ph, pm] = prog.start.split(':').map(Number)
    normalized.startMin = ph * 60 + pm
    const blockUnit = 30
    normalized.endMin = normalized.startMin + (prog.duration_blocks || 1) * blockUnit
    normalized.durationMin = normalized.endMin - normalized.startMin
  }
  if (prog.show_id && shows[prog.show_id]) {
    const show = shows[prog.show_id]
    normalized.title = normalized.title || show.title
    normalized.category = normalized.category || show.category
    normalized.url = normalized.url || show.url
    normalized.description = normalized.description || show.description
    normalized.hosts = normalized.hosts || show.hosts
    normalized.recurrence_note = normalized.recurrence_note || show.recurrence_note
  }
  return normalized
}

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

  const shows = epg.shows || {}
  for (const prog of dayEntry.programs) {
    const p = normalizeProgram(prog, shows)
    if (nowMinutes >= p.startMin && nowMinutes < p.endMin) {
      return { title: p.title, category: p.category, live: !!p.live }
    }
  }

  const gapsTitle = epg.metadata?.default_filler?.title || epg.gaps
  const gapsCategory = epg.metadata?.default_filler?.category || 'musica'
  if (gapsTitle) {
    const sorted = [...dayEntry.programs].map(p => normalizeProgram(p, shows)).sort((a, b) => a.startMin - b.startMin)
    const firstStart = sorted[0].startMin
    const lastEnd = sorted[sorted.length - 1].endMin
    if (nowMinutes >= firstStart && nowMinutes < lastEnd) {
      return { title: gapsTitle, category: gapsCategory, live: false, isGap: true }
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

    const nowMinutes = (() => {
      const timeStr = new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false }).format(now)
      const [h, m] = timeStr.split(':').map(Number)
      return h * 60 + m
    })()
    const isToday = dayOffset === 0 && currentEpgIdx >= 0
    const shows = epg.shows || {}
    const gapsTitle = epg.metadata?.default_filler?.title || epg.gaps
    const gapsCategory = epg.metadata?.default_filler?.category || 'musica'

    const sorted = [...dayEntry.programs].map(p => normalizeProgram(p, shows)).sort((a, b) => a.startMin - b.startMin)
    const programs = []
    for (let i = 0; i < sorted.length; i++) {
      const p = sorted[i]
      if (gapsTitle && programs.length > 0) {
        const prevEnd = programs[programs.length - 1].endMin
        if (p.startMin > prevEnd) {
          programs.push({
            start: String(Math.floor(prevEnd / 60)).padStart(2, '0') + ':' + String(prevEnd % 60).padStart(2, '0'),
            title: gapsTitle,
            category: gapsCategory,
            live: false,
            durationMin: p.startMin - prevEnd,
            startMin: prevEnd,
            endMin: p.startMin,
            isGap: true,
            isCurrent: isToday && nowMinutes >= prevEnd && nowMinutes < p.startMin,
            isPast: isToday && nowMinutes >= p.startMin
          })
        }
      }
      programs.push({
        ...p,
        isCurrent: isToday && nowMinutes >= p.startMin && nowMinutes < p.endMin,
        isPast: isToday && nowMinutes >= p.endMin
      })
    }
    return {
      label: dayEntry.label || dayEntry.day,
      programs,
      isToday
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