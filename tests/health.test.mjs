import test from 'node:test'
import assert from 'node:assert/strict'
import {
  classifyProbe,
  mergeHealth,
  healthBadge,
  isFailingStatus,
  OFFLINE_AFTER_FAILURES,
} from '../lib/health.js'

const AUDIO = 'https://stream.example/s.mp3'

test('classifyProbe: audio with wildcard CORS is ok/any', () => {
  assert.deepEqual(
    classifyProbe({ url: AUDIO, status: 206, content_type: 'audio/mpeg', acao: '*' }),
    { status: 'ok', cors: 'any' }
  )
})

test('classifyProbe: audio echoing the page origin is ok/origin', () => {
  assert.deepEqual(
    classifyProbe({ url: AUDIO, status: 200, content_type: 'audio/mpeg', acao: 'https://mrhumildad.github.io' }),
    { status: 'ok', cors: 'origin' }
  )
})

test('classifyProbe: playable audio without CORS is cors_missing', () => {
  assert.equal(
    classifyProbe({ url: AUDIO, status: 200, content_type: 'audio/aac' }).status,
    'cors_missing'
  )
})

test('classifyProbe: ogg is audio', () => {
  assert.equal(
    classifyProbe({ url: AUDIO, status: 200, content_type: 'application/ogg', acao: '*' }).status,
    'ok'
  )
})

test('classifyProbe: html pages and finite clips are not audio', () => {
  assert.equal(
    classifyProbe({ url: AUDIO, status: 200, content_type: 'text/html' }).status,
    'not_audio'
  )
  assert.equal(
    classifyProbe({ url: AUDIO, status: 200, content_type: 'application/octet-stream' }).status,
    'not_audio'
  )
})

test('classifyProbe: HTTP status families map to their own statuses', () => {
  assert.equal(classifyProbe({ url: AUDIO, status: 404 }).status, 'http_4xx')
  assert.equal(classifyProbe({ url: AUDIO, status: 502 }).status, 'http_5xx')
  assert.equal(classifyProbe({ url: AUDIO, status: 401 }).status, 'auth_required')
  assert.equal(classifyProbe({ url: AUDIO, status: 403 }).status, 'auth_required')
})

test('classifyProbe: transport errors win over any status', () => {
  assert.equal(classifyProbe({ url: AUDIO, error: 'timeout' }).status, 'timeout')
  assert.equal(classifyProbe({ url: AUDIO, error: 'tls' }).status, 'tls_error')
  assert.equal(classifyProbe({ url: AUDIO, error: 'network' }).status, 'unreachable')
})

test('classifyProbe: playlists and http-only URLs are flagged', () => {
  assert.equal(
    classifyProbe({ url: 'https://x.example/list.m3u8', status: 200, content_type: 'application/vnd.apple.mpegurl' }).status,
    'playlist'
  )
  assert.equal(
    classifyProbe({ url: 'http://x.example/s.mp3', status: 200, content_type: 'audio/mpeg' }).status,
    'http_only'
  )
})

test('isFailingStatus: ok/cors_missing/http_only are not failures', () => {
  for (const status of ['ok', 'cors_missing', 'http_only']) {
    assert.equal(isFailingStatus(status), false, status)
  }
  for (const status of ['timeout', 'tls_error', 'http_5xx', 'not_audio']) {
    assert.equal(isFailingStatus(status), true, status)
  }
})

test('mergeHealth: failures accumulate and reset on success', () => {
  const now = new Date('2026-10-22T10:00:00.000Z')

  const first = mergeHealth(undefined, { status: 'timeout' }, now)
  assert.equal(first.consecutive_failures, 1)

  const second = mergeHealth(first, { status: 'timeout' }, now)
  assert.equal(second.consecutive_failures, 2)

  const recovered = mergeHealth(second, { status: 'ok' }, now)
  assert.equal(recovered.consecutive_failures, 0)
  assert.equal(recovered.last_ok_at, now.toISOString())
})

test('healthBadge: LIVE, UNSTABLE, OFFLINE and HTTP ONLY', () => {
  assert.deepEqual(healthBadge({ status: 'ok' })?.label, 'LIVE')
  assert.equal(healthBadge({ status: 'cors_missing' })?.label, 'LIVE')
  assert.equal(healthBadge({ status: 'http_only' })?.label, 'HTTP ONLY')

  const unstable = healthBadge({ status: 'timeout', consecutive_failures: 1 })
  assert.equal(unstable?.label, 'UNSTABLE')
  assert.equal(unstable?.tone, 'warn')

  const offline = healthBadge({ status: 'timeout', consecutive_failures: OFFLINE_AFTER_FAILURES })
  assert.equal(offline?.label, 'OFFLINE')
  assert.equal(offline?.tone, 'bad')
})

test('healthBadge: no data means no badge', () => {
  assert.equal(healthBadge(null), null)
  assert.equal(healthBadge({}), null)
})
