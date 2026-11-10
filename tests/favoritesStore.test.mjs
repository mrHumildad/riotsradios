import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  FAVORITES_KEY,
  FAVORITES_VERSION,
  MAX_FAVORITES,
  createFavoritesStore,
  parseFavorites,
  serializeFavorites,
} from '../lib/favoritesStore.js'

/* A Storage-shaped stub, so the store is tested without a browser. */
function memoryStorage(initial = {}) {
  const map = new Map(Object.entries(initial))
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => { map.set(key, String(value)) },
    removeItem: (key) => { map.delete(key) },
    dump: () => Object.fromEntries(map),
  }
}

test('parseFavorites: reads a valid envelope', () => {
  assert.deepEqual(parseFavorites(JSON.stringify({ v: 1, ids: [18, 55] })), [18, 55])
})

test('parseFavorites: malformed values read as no favourites', () => {
  assert.deepEqual(parseFavorites(null), [])
  assert.deepEqual(parseFavorites(''), [])
  assert.deepEqual(parseFavorites(':not json:'), [])
  assert.deepEqual(parseFavorites('null'), [])
  assert.deepEqual(parseFavorites('[]'), [])
  assert.deepEqual(parseFavorites(JSON.stringify({ v: 1 })), [])
  assert.deepEqual(parseFavorites(JSON.stringify({ v: 1, ids: 'nope' })), [])
})

test('parseFavorites: another version is ignored rather than guessed at', () => {
  assert.deepEqual(parseFavorites(JSON.stringify({ v: 2, ids: [1] })), [])
  assert.deepEqual(parseFavorites(JSON.stringify({ v: '1', ids: [1] })), [])
})

test('parseFavorites: junk entries dropped, duplicates collapsed, order kept', () => {
  const raw = JSON.stringify({ v: 1, ids: [5, '7', 5, 0, -2, 1.5, null, 9, 1] })
  assert.deepEqual(parseFavorites(raw), [5, 9, 1])
})

test('parseFavorites: the list is capped', () => {
  const ids = Array.from({ length: MAX_FAVORITES + 50 }, (_, i) => i + 1)
  const parsed = parseFavorites(JSON.stringify({ v: 1, ids }))
  assert.equal(parsed.length, MAX_FAVORITES)
  assert.equal(parsed[0], 1)
})

test('serializeFavorites: writes the current version and cleans the ids', () => {
  assert.deepEqual(
    JSON.parse(serializeFavorites([3, 3, -1, 'x', 8])),
    { v: FAVORITES_VERSION, ids: [3, 8] }
  )
  assert.deepEqual(parseFavorites(serializeFavorites([4, 2])), [4, 2])
})

test('createFavoritesStore: reads what is already stored', () => {
  const storage = memoryStorage({ [FAVORITES_KEY]: JSON.stringify({ v: 1, ids: [12] }) })
  const store = createFavoritesStore({ storage })
  assert.deepEqual(store.read(), [12])
})

test('createFavoritesStore: toggle adds and removes, writing each time', () => {
  const storage = memoryStorage()
  const store = createFavoritesStore({ storage })

  assert.deepEqual(store.toggle(18), [18])
  assert.deepEqual(parseFavorites(storage.dump()[FAVORITES_KEY]), [18])

  assert.deepEqual(store.toggle(55, [18]), [18, 55])
  assert.deepEqual(store.toggle(18, [18, 55]), [55])
  assert.deepEqual(parseFavorites(storage.dump()[FAVORITES_KEY]), [55])
})

test('createFavoritesStore: toggle ignores an unusable id', () => {
  const storage = memoryStorage()
  const store = createFavoritesStore({ storage })
  assert.deepEqual(store.toggle(0, [4]), [4])
  assert.deepEqual(store.toggle('4', [4]), [4])
  assert.equal(storage.dump()[FAVORITES_KEY], undefined)
})

test('createFavoritesStore: save cleans the list it persists', () => {
  const storage = memoryStorage()
  const store = createFavoritesStore({ storage })
  assert.deepEqual(store.save([7, 7, 0, 'x', 3]), [7, 3])
  assert.deepEqual(parseFavorites(storage.dump()[FAVORITES_KEY]), [7, 3])
})

test('createFavoritesStore: a throwing storage degrades instead of failing', () => {
  const denied = {
    getItem() { throw new Error('denied') },
    setItem() { throw new Error('denied') },
  }
  const store = createFavoritesStore({ storage: denied })
  assert.deepEqual(store.read(), [])
  assert.deepEqual(store.save([2]), [2])
  assert.deepEqual(store.toggle(2, []), [2])
})

test('createFavoritesStore: no backend at all still returns usable ids', () => {
  const store = createFavoritesStore({ storage: null })
  assert.deepEqual(store.read(), [])
  assert.deepEqual(store.toggle(6, []), [6])
})

test('createFavoritesStore: a custom key is honoured', () => {
  const storage = memoryStorage()
  const store = createFavoritesStore({ storage, key: 'test.key' })
  store.save([1])
  assert.deepEqual(parseFavorites(storage.dump()['test.key']), [1])
  assert.equal(storage.dump()[FAVORITES_KEY], undefined)
})
