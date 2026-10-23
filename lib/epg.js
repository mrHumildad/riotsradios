/**
 * EPG normalization and lookup.
 *
 * Pure module (no React, no fetch). Everything is expressed in absolute minutes
 * from local midnight in the EPG's own timezone, so cross-midnight shows and
 * shuffled day arrays behave predictably.
 */

export const DAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
export const MINUTES_PER_DAY = 1440

/** "HH:MM" -> minutes; null when malformed. 24:00 is accepted as midnight. */
export function parseClock(value) {
  if (typeof value !== 'string') return null
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim())
  if (!match) return null
  const hours = Number(match[1])
  const minutes = Number(match[2])
  if (minutes > 59) return null
  if (hours > 24 || (hours === 24 && minutes !== 0)) return null
  return hours * 60 + minutes
}

/** Minutes -> "HH:MM", wrapping past midnight. */
export function formatMinutes(value) {
  const wrapped = ((Math.round(value) % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY
  return `${String(Math.floor(wrapped / 60)).padStart(2, '0')}:${String(wrapped % 60).padStart(2, '0')}`
}

function resolve(prog, show, key) {
  const own = prog[key]
  if (own !== undefined && own !== '' && own !== null) return own
  return show ? show[key] : undefined
}

/**
 * Normalize one program: absolute minutes, resolved show fields, display times.
 * Returns null for unusable entries (bad clock, zero/negative duration, no title).
 */
export function normalizeProgram(prog, shows = {}) {
  if (!prog || typeof prog !== 'object') return null

  const startMin = parseClock(prog.start)
  if (startMin === null) return null

  let endMin = prog.end ? parseClock(prog.end) : null
  if (endMin === null) {
    const blocks = Number(prog.duration_blocks)
    endMin = startMin + (Number.isFinite(blocks) && blocks > 0 ? blocks * 30 : 30)
  }

  if (endMin < startMin) {
    if (!prog.crosses_midnight) return null   /* invalid: end before start */
    endMin += MINUTES_PER_DAY
  }
  if (endMin === startMin) return null

  const show = prog.show_id ? shows[prog.show_id] || null : null
  const title = resolve(prog, show, 'title')
  if (!title) return null

  return {
    ...prog,
    startMin,
    endMin,
    durationMin: endMin - startMin,
    start: formatMinutes(startMin),
    end: formatMinutes(endMin),
    title,
    category: resolve(prog, show, 'category') || '',
    url: resolve(prog, show, 'url'),
    description: resolve(prog, show, 'description'),
    hosts: resolve(prog, show, 'hosts'),
    recurrence_note: resolve(prog, show, 'recurrence_note'),
    live: Boolean(prog.live ?? show?.live),
  }
}

function weekdayOf(year, month, day) {
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay()
}

function localParts(now, timeZone) {
  let formatter
  try {
    formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: timeZone || 'UTC',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
  } catch {
    formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'UTC',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
  }

  const parts = {}
  for (const part of formatter.formatToParts(now)) {
    if (part.type !== 'literal') parts[part.type] = part.value
  }

  const year = Number(parts.year)
  const month = Number(parts.month)
  const day = Number(parts.day)
  const minutes = (Number(parts.hour) % 24) * 60 + Number(parts.minute)

  return { year, month, day, minutes, weekday: weekdayOf(year, month, day) }
}

function programsForDay(epg, dayName) {
  const entry = (epg.days || []).find((d) => d.day === dayName)
  if (!entry || !Array.isArray(entry.programs)) return { entry: null, programs: [] }

  const shows = epg.shows || {}
  const programs = entry.programs
    .map((p) => normalizeProgram(p, shows))
    .filter(Boolean)
    .sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin)

  return { entry, programs }
}

/**
 * Show airing at `now`, including the tail of yesterday's cross-midnight
 * programs and the station's default filler in uncovered time.
 *
 * @returns {{ title: string, category: string, live: boolean, isGap?: boolean }|null}
 */
export function getCurrentShow(epg, now = new Date()) {
  if (!epg || !Array.isArray(epg.days)) return null

  const { minutes, weekday } = localParts(now, epg.timezone)
  const todayName = DAY_NAMES[weekday]
  const { programs: today } = programsForDay(epg, todayName)

  const current = today.find((p) => minutes >= p.startMin && minutes < Math.min(p.endMin, MINUTES_PER_DAY))
  if (current) return { title: current.title, category: current.category, live: current.live }

  const yesterdayName = DAY_NAMES[(weekday + 6) % 7]
  const { programs: yesterday } = programsForDay(epg, yesterdayName)
  const carry = yesterday.find(
    (p) => p.endMin > MINUTES_PER_DAY && minutes < p.endMin - MINUTES_PER_DAY
  )
  if (carry) return { title: carry.title, category: carry.category, live: carry.live }

  const fillerTitle = epg.metadata?.default_filler?.title || epg.gaps
  if (fillerTitle) {
    return {
      title: fillerTitle,
      category: epg.metadata?.default_filler?.category || 'musica',
      live: false,
      isGap: true,
    }
  }

  return null
}

/**
 * Schedule for the calendar day `today + dayOffset` mapped onto the EPG's own
 * day names, with gaps before the first, between and after the last program.
 *
 * @param {object} epg
 * @param {number} dayOffset 0 = today, may be negative
 * @param {Date} [now]
 */
export function getDaySchedule(epg, dayOffset = 0, now = new Date()) {
  if (!epg || !Array.isArray(epg.days)) return null

  const { year, month, day, minutes } = localParts(now, epg.timezone)

  const target = new Date(Date.UTC(year, month - 1, day + dayOffset))
  const dayName = DAY_NAMES[target.getUTCDay()]
  const { entry, programs: normalized } = programsForDay(epg, dayName)
  if (!entry) return null

  const isToday = dayOffset === 0
  const fillerTitle = epg.metadata?.default_filler?.title || epg.gaps
  const fillerCategory = epg.metadata?.default_filler?.category || 'musica'

  const gap = (from, to) => ({
    start: formatMinutes(from),
    startMin: from,
    endMin: to,
    durationMin: to - from,
    title: fillerTitle,
    category: fillerCategory,
    live: false,
    isGap: true,
    isCurrent: isToday && minutes >= from && minutes < to,
    isPast: isToday && minutes >= to,
  })

  const programs = []
  let cursor = 0

  for (const program of normalized) {
    if (fillerTitle && program.startMin > cursor) programs.push(gap(cursor, program.startMin))
    programs.push({
      ...program,
      isGap: false,
      isCurrent: isToday && minutes >= program.startMin && minutes < program.endMin,
      isPast: isToday && minutes >= program.endMin,
    })
    cursor = Math.max(cursor, program.endMin)
  }

  if (fillerTitle && cursor < MINUTES_PER_DAY) programs.push(gap(cursor, MINUTES_PER_DAY))

  return {
    label: entry.label || dayName.charAt(0).toUpperCase() + dayName.slice(1),
    day: dayName,
    programs,
    isToday,
  }
}
