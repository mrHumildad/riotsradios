import test from 'node:test'
import assert from 'node:assert/strict'
import {
  DAY_NAMES,
  formatMinutes,
  getCurrentShow,
  getDaySchedule,
  normalizeProgram,
  parseClock,
} from '../lib/epg.js'

const FILLER = { default_filler: { title: 'Music', category: 'musica' } }

/** Tuesday 2026-10-20, 00:30 UTC (Monday's cross-midnight tail is live). */
const TUE_0030 = new Date('2026-10-20T00:30:00Z')
/** Tuesday 2026-10-20, 12:00 UTC. */
const TUE_NOON = new Date('2026-10-20T12:00:00Z')

test('parseClock: accepts HH:MM, 24:00 and rejects junk', () => {
  assert.equal(parseClock('09:30'), 570)
  assert.equal(parseClock('00:00'), 0)
  assert.equal(parseClock('24:00'), 1440)
  assert.equal(parseClock('9:05'), 545)
  assert.equal(parseClock('24:30'), null)
  assert.equal(parseClock('12:75'), null)
  assert.equal(parseClock('noon'), null)
})

test('formatMinutes: wraps past midnight', () => {
  assert.equal(formatMinutes(0), '00:00')
  assert.equal(formatMinutes(570), '09:30')
  assert.equal(formatMinutes(1440), '00:00')
  assert.equal(formatMinutes(1500), '01:00')
})

test('normalizeProgram: resolves show fields and crosses midnight', () => {
  const show = { title: 'Show', category: 'punk', url: 'https://x.example' }
  const program = normalizeProgram(
    { start: '23:00', end: '01:00', crosses_midnight: true, show_id: 's1' },
    { s1: show }
  )
  assert.equal(program.title, 'Show')
  assert.equal(program.category, 'punk')
  assert.equal(program.startMin, 1380)
  assert.equal(program.endMin, 1500)
  assert.equal(program.durationMin, 120)
  assert.equal(program.end, '01:00')
})

test('normalizeProgram: rejects invalid durations and missing titles', () => {
  assert.equal(normalizeProgram({ start: '10:00', end: '09:00' }), null)
  assert.equal(normalizeProgram({ start: '10:00', end: '10:00' }), null)
  assert.equal(normalizeProgram({ start: 'bad', end: '11:00' }), null)
  assert.equal(normalizeProgram({ start: '10:00', end: '11:00' }), null)
})

test('getCurrentShow: shows yesterday cross-midnight tail at 00:30', () => {
  const epg = {
    timezone: 'UTC',
    metadata: FILLER,
    days: [
      { day: 'monday', programs: [{ start: '23:00', end: '01:00', crosses_midnight: true, title: 'Night Show' }] },
      { day: 'tuesday', programs: [{ start: '09:00', end: '10:00', title: 'Morning' }] },
    ],
  }
  assert.equal(getCurrentShow(epg, TUE_0030)?.title, 'Night Show')
})

test('getCurrentShow: picks the right program from an unsorted day', () => {
  const epg = {
    timezone: 'UTC',
    metadata: FILLER,
    days: [
      {
        day: 'tuesday',
        programs: [
          { start: '10:00', end: '12:00', title: 'Later' },
          { start: '08:00', end: '09:00', title: 'Earlier' },
        ],
      },
    ],
  }
  assert.equal(getCurrentShow(epg, new Date('2026-10-20T08:30:00Z'))?.title, 'Earlier')
  assert.equal(getCurrentShow(epg, new Date('2026-10-20T11:00:00Z'))?.title, 'Later')
})

test('getCurrentShow: falls back to the station filler', () => {
  const epg = {
    timezone: 'UTC',
    metadata: FILLER,
    days: [{ day: 'tuesday', programs: [{ start: '09:00', end: '10:00', title: 'Morning' }] }],
  }
  const show = getCurrentShow(epg, TUE_NOON)
  assert.equal(show?.title, 'Music')
  assert.equal(show?.isGap, true)
})

test('getDaySchedule: navigates by calendar date, not array order', () => {
  const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'].map((day) => ({
    day,
    programs: [{ start: '09:00', end: '10:00', title: `Show ${day}` }],
  }))
  days.reverse()   /* shuffled files must still work */
  const epg = { timezone: 'UTC', metadata: FILLER, days }

  const today = getDaySchedule(epg, 0, new Date('2026-10-21T12:00:00Z'))   /* Wednesday */
  assert.equal(today.day, 'wednesday')
  assert.equal(today.isToday, true)

  const tomorrow = getDaySchedule(epg, 1, new Date('2026-10-21T12:00:00Z'))
  assert.equal(tomorrow.day, 'thursday')
  assert.equal(tomorrow.isToday, false)

  const yesterday = getDaySchedule(epg, -1, new Date('2026-10-21T12:00:00Z'))
  assert.equal(yesterday.day, 'tuesday')
})

test('getDaySchedule: returns null for a missing day', () => {
  const epg = {
    timezone: 'UTC',
    days: [{ day: 'monday', programs: [{ start: '09:00', end: '10:00', title: 'Only Monday' }] }],
  }
  assert.equal(getDaySchedule(epg, 0, new Date('2026-10-21T12:00:00Z')), null)   /* Wednesday */
})

test('getDaySchedule: fills gaps before, between and after programs', () => {
  const epg = {
    timezone: 'UTC',
    metadata: FILLER,
    days: [
      {
        day: 'tuesday',
        programs: [
          { start: '09:00', end: '10:00', title: 'A' },
          { start: '11:00', end: '12:00', title: 'B' },
        ],
      },
    ],
  }
  const schedule = getDaySchedule(epg, 0, TUE_NOON)
  const titles = schedule.programs.map((p) => p.title)
  assert.deepEqual(titles, ['Music', 'A', 'Music', 'B', 'Music'])
  assert.equal(schedule.programs[0].startMin, 0)
  assert.equal(schedule.programs[0].endMin, 540)
  assert.equal(schedule.programs.at(-1).endMin, 1440)
})

test('getDaySchedule: marks the current program with h23 minutes', () => {
  const epg = {
    timezone: 'UTC',
    metadata: FILLER,
    days: [{ day: 'tuesday', programs: [{ start: '12:00', end: '13:00', title: 'Noon' }] }],
  }
  const schedule = getDaySchedule(epg, 0, TUE_NOON)
  const noon = schedule.programs.find((p) => p.title === 'Noon')
  assert.equal(noon.isCurrent, true)
  assert.equal(noon.isPast, false)
})

test('day names cover a full week', () => {
  assert.equal(DAY_NAMES.length, 7)
  assert.equal(DAY_NAMES[0], 'sunday')
})
