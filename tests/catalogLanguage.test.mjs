import { test } from 'node:test'
import assert from 'node:assert/strict'

import { applyLanguageOverlay } from '../lib/catalogLanguage.js'

const PUBLISHED = [
  'id,name,countrycode,mailto',
  '1,Radio Contrabanda,ES,contrabanda@contrabanda.org',
  '2,Radio Arrebato,ES,',
  '3,Radio Ciroma,IT,"ciao, ciroma"',
].join('\n') + '\n'

const SNAPSHOT = [
  'id,name,countrycode,mailto,language',
  '1,Radio Contrabanda,ES,contrabanda@contrabanda.org,ca',
  '2,Radio Arrebato,ES,,',
  '3,Radio Ciroma,IT,"ciao, ciroma",',
].join('\n') + '\n'

test('applyLanguageOverlay: appends the snapshot language column', () => {
  const adopted = applyLanguageOverlay(PUBLISHED, SNAPSHOT)
  assert.deepEqual(adopted.trimEnd().split('\n'), [
    'id,name,countrycode,mailto,language',
    '1,Radio Contrabanda,ES,contrabanda@contrabanda.org,ca',
    '2,Radio Arrebato,ES,,',
    '3,Radio Ciroma,IT,"ciao, ciroma",',
  ])
  assert.ok(adopted.endsWith('\n'))
})

test('applyLanguageOverlay: the published file wins once it has the column', () => {
  const published = 'id,name,language\n1,One,eu\n'
  const snapshot = 'id,name,language\n1,One,ca\n'
  assert.equal(applyLanguageOverlay(published, snapshot), published)
})

test('applyLanguageOverlay: rows unknown to the snapshot get a blank language', () => {
  const published = 'id,name\n9,New Station\n'
  const snapshot = 'id,name,language\n1,Old,ca\n'
  assert.equal(applyLanguageOverlay(published, snapshot), 'id,name,language\n9,New Station,\n')
})

test('applyLanguageOverlay: no language column in the snapshot leaves the file alone', () => {
  const snapshot = 'id,name,countrycode\n1,One,ES\n'
  assert.equal(applyLanguageOverlay(PUBLISHED, snapshot), PUBLISHED)
})

test('applyLanguageOverlay: a missing trailing newline is preserved', () => {
  const published = 'id,name\n1,One'
  const snapshot = 'id,name,language\n1,One,ca'
  assert.equal(applyLanguageOverlay(published, snapshot), 'id,name,language\n1,One,ca')
})

test('applyLanguageOverlay: a short row does not shift the new value', () => {
  const published = 'id,name,countrycode\n1,One\n'
  const snapshot = 'id,name,countrycode,language\n1,One,ES,ca\n'
  assert.equal(
    applyLanguageOverlay(published, snapshot),
    'id,name,countrycode,language\n1,One,,ca\n'
  )
})
