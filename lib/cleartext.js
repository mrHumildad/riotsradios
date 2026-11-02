/**
 * Plain-HTTP host allowlist.
 *
 * One list, two consumers: the catalog validator exempts an active `http://`
 * station whose host is here, and `scripts/generate-cleartext-config.mjs` turns
 * the same entries into the Android network security config. Adding a station
 * to one and not the other is therefore impossible to do silently.
 *
 * Pure module: no filesystem, no fetch, no XML library.
 */

/** Host part of a URL or of a bare host: lowercase, no scheme/port/path. */
export function normalizeHost(value) {
  const raw = typeof value === 'string' ? value.trim() : ''
  if (!raw) return ''
  try {
    return new URL(raw.includes('://') ? raw : `http://${raw}`).hostname.toLowerCase()
  } catch {
    return ''
  }
}

/**
 * Normalize `data/cleartext-hosts.json`.
 *
 * @param {unknown} source parsed JSON
 * @returns {{ entries: Array<{host: string, station_ids: number[], note: string}>, hostSet: Set<string> }}
 */
export function parseAllowlist(source) {
  const hosts = Array.isArray(source?.hosts) ? source.hosts : []
  const entries = []

  for (const item of hosts) {
    const host = normalizeHost(item?.host)
    if (!host) continue
    const ids = (Array.isArray(item.station_ids) ? item.station_ids : [])
      .map(Number)
      .filter(Number.isInteger)
    entries.push({ host, station_ids: ids, note: typeof item?.note === 'string' ? item.note : '' })
  }

  return { entries, hostSet: new Set(entries.map((entry) => entry.host)) }
}

/** True when `url` points at a host the app is allowed to reach over cleartext. */
export function isCleartextHostAllowed(url, hostSet) {
  if (!(hostSet instanceof Set) || hostSet.size === 0) return false
  const host = normalizeHost(url)
  return host !== '' && hostSet.has(host)
}

/**
 * Render the Android network security config for these entries.
 *
 * The app's own shell is served from http://localhost (capacitor.config.json
 * `server.androidScheme`), so localhost is always included. Station hosts are
 * listed one by one — never a blanket `cleartextTrafficPermitted` on the base
 * config — so the app cannot silently reach a new plain-HTTP server.
 */
export function renderNetworkSecurityConfig(entries) {
  const sorted = [...entries].sort((a, b) => a.host.localeCompare(b.host))

  const stationDomains = sorted
    .map(({ host, note }) => {
      const comment = note ? `        <!-- ${note.replace(/--+/g, '-')} -->\n` : ''
      return `${comment}        <domain includeSubdomains="false">${host}</domain>`
    })
    .join('\n')

  return `<?xml version="1.0" encoding="utf-8"?>
<!--
  GENERATED FILE — do not edit by hand.
  Source: data/cleartext-hosts.json (npm run cleartext:config).

  Cleartext policy for the RIOTSRADIOS app. targetSdk 28+ refuses plain HTTP by
  default; these are the only exemptions.

  1. localhost — Capacitor serves the bundle from http://localhost because
     capacitor.config.json sets \`server.androidScheme: "http"\`. That origin is
     what keeps an http:// stream from being blocked as mixed content.

  2. Station hosts that have no https:// mirror. These are exactly the rows the
     website cannot play (browsers block them on the https Pages site) and the
     app can. Remove a host here when the station gains an https mirror, and the
     validator will ask for an https:// URL.
-->
<network-security-config>
    <domain-config cleartextTrafficPermitted="true">
        <domain includeSubdomains="true">localhost</domain>
    </domain-config>

    <domain-config cleartextTrafficPermitted="true">
${stationDomains}
    </domain-config>
</network-security-config>
`
}
