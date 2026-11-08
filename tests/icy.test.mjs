import test from 'node:test'
import assert from 'node:assert/strict'
import { parseStreamTitle, readIcyTitle, isFreshTitle } from '../lib/icy.js'

/* One ICY frame: `metaint` audio bytes, the length byte, then the padded payload.
   The payload is UTF-8 on the wire, so the padding is counted in bytes, not
   characters — an accented or curly-quoted title must still fit in 16-byte units. */
function icyBody(title, metaint = 32) {
  const payload = new TextEncoder().encode(`StreamTitle='${title}';`)
  const padded = Math.ceil(payload.length / 16) * 16
  const bytes = new Uint8Array(metaint + 1 + padded)
  bytes.set(payload, metaint + 1)
  bytes[metaint] = padded / 16
  return bytes
}

function icyResponse(bytes, headers = { 'icy-metaint': '32' }) {
  return new Response(bytes, { status: 200, headers })
}

test('parseStreamTitle reads the title and strips padding', () => {
  assert.equal(parseStreamTitle("StreamTitle='Los Fabulosos Cadillacs - Siguiendo La Luna';"), 'Los Fabulosos Cadillacs - Siguiendo La Luna')
  assert.equal(parseStreamTitle("StreamTitle='';"), null)
  assert.equal(parseStreamTitle('StreamUrl="http://x";'), null)
  assert.equal(parseStreamTitle(undefined), null)
})

test('readIcyTitle returns the title from one metadata block', async () => {
  const calls = []
  const fetchImpl = async (url, init) => {
    calls.push({ url, headers: init.headers })
    return icyResponse(icyBody('Aina - Trance'))
  }
  assert.equal(await readIcyTitle('https://example.test/stream', { fetchImpl }), 'Aina - Trance')
  assert.equal(calls[0].headers['Icy-MetaData'], '1')
})

test('readIcyTitle tolerates a title split across chunks', async () => {
  const bytes = icyBody('Radio Onda d’Urto')
  const stream = new ReadableStream({
    start(controller) {
      /* Deliberately cut inside the audio, the length byte and the payload. */
      for (let i = 0; i < bytes.length; i += 7) controller.enqueue(bytes.subarray(i, i + 7))
      controller.close()
    },
  })
  const fetchImpl = async () => new Response(stream, { status: 200, headers: { 'icy-metaint': '32' } })
  assert.equal(await readIcyTitle('https://example.test/stream', { fetchImpl }), 'Radio Onda d’Urto')
})

test('readIcyTitle gives up quietly when the station sends no ICY metadata', async () => {
  const fetchImpl = async () => icyResponse(new Uint8Array(64), { 'content-type': 'audio/mpeg' })
  assert.equal(await readIcyTitle('https://example.test/stream', { fetchImpl }), null)
})

test('readIcyTitle never throws: refused preflight, failure and abort all return null', async () => {
  const refusing = async () => {
    throw new TypeError('Failed to fetch')
  }
  assert.equal(await readIcyTitle('https://example.test/stream', { fetchImpl: refusing }), null)

  const notOk = async () => new Response('', { status: 502 })
  assert.equal(await readIcyTitle('https://example.test/stream', { fetchImpl: notOk }), null)

  const emptyBlock = async () => icyResponse(icyBody('x').subarray(0, 33))
  assert.equal(await readIcyTitle('https://example.test/stream', { fetchImpl: emptyBlock }), null)

  const hanging = async (url, init) => new Promise((resolve, reject) => {
    init.signal.addEventListener('abort', () => reject(new Error('aborted')))
  })
  assert.equal(await readIcyTitle('https://example.test/stream', { fetchImpl: hanging, timeoutMs: 20 }), null)
})

test('isFreshTitle drops a title that stopped refreshing', () => {
  const now = 10_000_000
  assert.equal(isFreshTitle({ title: 'Aina', at: now - 1000 }, now), true)
  assert.equal(isFreshTitle({ title: 'Aina', at: now - 7 * 60 * 1000 }, now), false)
  assert.equal(isFreshTitle({ title: '', at: now }, now), false)
  assert.equal(isFreshTitle(null, now), false)
})
