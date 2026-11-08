/**
 * ICY (Shoutcast/Icecast) in-stream metadata.
 *
 * A station that supports it interleaves a metadata block every `icy-metaint`
 * bytes of audio: one length byte (counted in 16-byte units) followed by a
 * payload like `StreamTitle='Artist - Track';`.
 *
 * A browser may only read that when the server answers the CORS preflight for
 * the `Icy-MetaData` request header — a handful of our stations do, most do not.
 * So every helper here fails soft: it returns null instead of throwing, and the
 * caller shows nothing rather than a guess.
 */

const TITLE_PATTERN = /StreamTitle='([^']*)'/
const DEFAULT_TIMEOUT_MS = 12000
const DEFAULT_MAX_AGE_MS = 6 * 60 * 1000

/** Pull the title out of a metadata payload; null when it is empty or absent. */
export function parseStreamTitle(payload) {
  if (typeof payload !== 'string') return null
  const match = TITLE_PATTERN.exec(payload)
  if (!match) return null
  const title = match[1].replace(/\0/g, '').trim()
  return title || null
}

/** A title still worth showing: recent enough to be the track playing now. */
export function isFreshTitle(entry, now = Date.now(), maxAgeMs = DEFAULT_MAX_AGE_MS) {
  if (!entry || typeof entry.title !== 'string' || !entry.title) return false
  const at = Number(entry.at)
  if (!Number.isFinite(at)) return false
  return now - at <= maxAgeMs
}

/**
 * Read one metadata block and return its StreamTitle.
 *
 * Reads `metaint` audio bytes, the length byte and the payload, then drops the
 * connection — a live stream never ends, so the body is never drained.
 *
 * @param {string} url
 * @param {object} [options]
 * @param {typeof fetch} [options.fetchImpl]
 * @param {number} [options.timeoutMs]
 * @returns {Promise<string|null>}
 */
export async function readIcyTitle(url, { fetchImpl = globalThis.fetch, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  if (typeof url !== 'string' || !url || typeof fetchImpl !== 'function') return null
  if (typeof AbortController !== 'function') return null

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  let reader = null

  /* Pulls exactly n bytes out of a stream reader, keeping the remainder for the
     next call — the metadata block does not respect chunk boundaries. */
  const makeTaker = (streamReader) => {
    let pending = new Uint8Array(0)
    return async (n) => {
      while (pending.length < n) {
        const { value, done } = await streamReader.read()
        if (done) break
        const chunk = value instanceof Uint8Array ? value : new Uint8Array(value)
        const merged = new Uint8Array(pending.length + chunk.length)
        merged.set(pending)
        merged.set(chunk, pending.length)
        pending = merged
      }
      const slice = pending.subarray(0, n)
      pending = pending.subarray(n)
      return slice
    }
  }

  try {
    const response = await fetchImpl(url, {
      headers: { 'Icy-MetaData': '1' },
      cache: 'no-store',
      signal: controller.signal,
    })
    if (!response || !response.ok || !response.body) return null

    const metaint = Number(response.headers?.get?.('icy-metaint'))
    if (!Number.isFinite(metaint) || metaint <= 0) return null

    reader = response.body.getReader()
    const take = makeTaker(reader)

    const audio = await take(metaint)
    if (audio.length < metaint) return null

    const lengthByte = await take(1)
    if (lengthByte.length < 1) return null

    const metaLength = lengthByte[0] * 16
    if (!metaLength) return null

    const payload = await take(metaLength)
    if (!payload.length) return null

    return parseStreamTitle(new TextDecoder().decode(payload))
  } catch {
    /* Aborted, refused, CORS-less, or a server that closed early: no title. */
    return null
  } finally {
    clearTimeout(timer)
    try {
      await reader?.cancel?.()
    } catch {
      /* already closed */
    }
  }
}
