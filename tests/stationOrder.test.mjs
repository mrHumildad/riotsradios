import { test } from 'node:test'
import assert from 'node:assert/strict'

import { orderStations } from '../lib/stationOrder.js'

const STATIONS = [
  { id: 10, name: 'Ten' },
  { id: 11, name: 'Eleven' },
  { id: 12, name: 'Twelve' },
  { id: 13, name: 'Thirteen' },
]

test('orderStations: no favourites leaves the catalog order intact', () => {
  const ordered = orderStations(STATIONS, [])
  assert.deepEqual(ordered.map(entry => entry.station.id), [10, 11, 12, 13])
  assert.deepEqual(ordered.map(entry => entry.index), [0, 1, 2, 3])
})

test('orderStations: last favourite first, then earlier favourites, then the rest', () => {
  /* 12 was favourited before 11, so 11 (the newest) leads. */
  const ordered = orderStations(STATIONS, [12, 11])
  assert.deepEqual(ordered.map(entry => entry.station.id), [11, 12, 10, 13])
})

test('orderStations: entries carry the original catalog index', () => {
  const ordered = orderStations(STATIONS, [12])
  assert.deepEqual(
    ordered.map(entry => [entry.station.id, entry.index]),
    [[12, 2], [10, 0], [11, 1], [13, 3]]
  )
})

test('orderStations: ids missing from the catalog are ignored', () => {
  const ordered = orderStations(STATIONS, [999, 13])
  assert.deepEqual(ordered.map(entry => entry.station.id), [13, 10, 11, 12])
})

test('orderStations: an empty catalog and a missing favourites list are safe', () => {
  assert.deepEqual(orderStations([], [1, 2]), [])
  assert.deepEqual(orderStations(STATIONS).map(entry => entry.station.id), [10, 11, 12, 13])
})

test('orderStations: the catalog array is not mutated', () => {
  const before = STATIONS.map(station => station.id)
  orderStations(STATIONS, [13, 10])
  assert.deepEqual(STATIONS.map(station => station.id), before)
})
