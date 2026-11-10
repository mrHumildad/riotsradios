import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  catalogLanguages,
  epgLanguage,
  languageName,
  preferredLanguage,
  stationLanguage,
} from '../lib/stationLanguage.js'

test('stationLanguage: known country codes map to their language', () => {
  assert.equal(stationLanguage({ countrycode: 'ES' }), 'es')
  assert.equal(stationLanguage({ countrycode: ' it ' }), 'it')
  assert.equal(stationLanguage({ countrycode: 'BR' }), 'pt')
})

test('stationLanguage: unknown or missing country codes yield an empty language', () => {
  assert.equal(stationLanguage({ countrycode: 'ZZ' }), '')
  assert.equal(stationLanguage({}), '')
  assert.equal(stationLanguage(null), '')
})

test('stationLanguage: the catalog language column overrides the country', () => {
  assert.equal(stationLanguage({ countrycode: 'ES', language: 'ca' }), 'ca')
  assert.equal(stationLanguage({ countrycode: 'ES', language: 'eu-ES' }), 'eu')
  assert.equal(stationLanguage({ countrycode: 'ES', language: '' }), 'es')
})

test('stationLanguage: a guide language overrides column and country', () => {
  const station = { countrycode: 'ES', language: 'es', id: 4 }
  assert.equal(stationLanguage(station, { language: 'eu' }), 'eu')
  assert.equal(stationLanguage(station, { metadata: { language: 'eu' } }), 'eu')
})

test('epgLanguage: reads the top-level field, else metadata', () => {
  assert.equal(epgLanguage({ language: 'CA' }), 'ca')
  assert.equal(epgLanguage({ metadata: { language: 'eu' } }), 'eu')
  assert.equal(epgLanguage({}), '')
  assert.equal(epgLanguage(null), '')
})

test('preferredLanguage: the first browser language the catalog carries wins', () => {
  const stations = [{ countrycode: 'IT' }, { countrycode: 'ES' }, { countrycode: 'ES' }]
  assert.equal(preferredLanguage(stations, ['it-IT', 'es']), 'it')
  assert.equal(preferredLanguage(stations, ['en-US', 'es-ES']), 'es')
})

test('preferredLanguage: falls back to the most common catalog language', () => {
  const stations = [{ countrycode: 'IT' }, { countrycode: 'ES' }, { countrycode: 'ES' }]
  assert.equal(preferredLanguage(stations, ['en-US']), 'es')
})

test('catalogLanguages: browser match first, then every other language by size', () => {
  const stations = [
    { countrycode: 'IT' },
    { countrycode: 'ES' },
    { countrycode: 'ES' },
    { countrycode: 'NL' },
    { countrycode: 'IT' },
    { countrycode: 'ZZ' },
  ]
  assert.deepEqual(catalogLanguages(stations, ['en-US', 'nl']), ['nl', 'es', 'it'])
  assert.deepEqual(catalogLanguages(stations, ['en-US']), ['es', 'it', 'nl'])
})

test('catalogLanguages: Catalan and Basque get their own stop from guides', () => {
  const stations = [
    { id: 1, countrycode: 'ES' },
    { id: 4, countrycode: 'ES' },
    { id: 52, countrycode: 'ES', language: 'eu' },
    { id: 16, countrycode: 'ES' },
  ]
  const guides = new Map([
    [1, { language: 'ca' }],
    [4, { language: 'eu' }],
  ])
  /* eu has two rows, ca and es tie at one and sort alphabetically. */
  assert.deepEqual(catalogLanguages(stations, [], guides), ['eu', 'ca', 'es'])
  assert.deepEqual(catalogLanguages(stations, ['ca'], guides), ['ca', 'eu', 'es'])
})

test('catalogLanguages: no language data offers nothing to cycle', () => {
  assert.deepEqual(catalogLanguages([{ countrycode: 'ZZ' }], ['es']), [])
})

test('languageName: readable names with a code fallback', () => {
  assert.equal(languageName('es'), 'Spanish')
  assert.equal(languageName('ca'), 'Catalan')
  assert.equal(languageName('eu'), 'Basque')
  assert.equal(languageName(''), 'all languages')
  assert.equal(languageName('zz'), 'zz'.toUpperCase())
})
