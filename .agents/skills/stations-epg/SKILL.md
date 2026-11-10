---
name: stations-epg
description: The RIOTSRADIOS catalog and guide data — stations.csv columns and rules, the validator gates, data/health.json stream probing and badges, CORS/spectrum behaviour, and the EPG v2 format. Use when adding or fixing a station, touching stations.csv, data/health.json, lib/stations.js, lib/health.js, lib/epg.js, EPG files or the validators.
---

# Stations, health and EPG — RIOTSRADIOS

`stations.csv` is the catalog the player renders. Everything else — the player's
list, the health badges, the EPG map — is derived from it. Never hardcode a
station, a stream URL or a station name in a component.

**Ownership:** the file is owned by `riotsradios-epg`, which publishes it as
`catalog/stations.csv`. The copy in this repository is a validated snapshot: it
renders before the network answers, works offline and ships in the Android app.
Signed-off rules and the publish contract: `docs/EPG-REPO-CATALOG.md`. Add or fix
a station there, then `npm run catalog:sync` here.

## stations.csv

| Column | Meaning |
|---|---|
| `id` | Positive integer, unique. Player identity AND the key into `data/health.json` |
| `name` | Display name (required for an active station) |
| `stream_broken` | `""` (empty) or `true`. `true` = hidden from the player, kept for the record |
| `has_ads` | Free-form marker already in the data; it does not change playback |
| `country` | Country name as radio-browser reports it — e.g. `Spain` |
| `countrycode` | Two-letter ISO 3166-1 code — e.g. `ES` |
| `state` | The human place shown in the list, e.g. `9Barris, Barcelona` (radio-browser's field name for it) |
| `url` | The stream the player loads. Required for an active row, `http(s)://`, no whitespace |
| `url_http` | The station's plain-HTTP mirror, if known. `http://` only; stored, never played by the web build |
| `url_https` | The station's HTTPS mirror, if known. `https://` only; stored |
| `homepage` | Station site, must be `http(s)://` |
| `favicon` | Station image URL, must be `http(s)://` |
| `tags` | Comma-separated keywords, as radio-browser stores them (quoted CSV field) |
| `codec` | Stream codec — `MP3`, `AAC`, `OGG`… blank when unknown |
| `bitrate` | Stream bitrate in kbps — blank when unknown |
| `hls` | `1` when the station publishes HLS, `0` otherwise |
| `lastcheckok` | radio-browser's own last check, `1`/`0` — not our probe |
| `epg_file` | Bundled fallback file inside `public/EPGs/` (e.g. `radio-topo.json`); the published manifest is loaded first |
| `mailto` | Contact address, free-form |

`url_http` / `url_https` record both mirrors of one stream. **Nothing switches
between them automatically**: `url` stays the only URL the player loads, so keep
it equal to the mirror listeners should hear. A mirror with the wrong scheme or
whitespace is a warning, not an error — mirrors are never rendered. The health
probe checks `url` and every stored mirror and files the mirrors under
`mirrors.http` / `mirrors.https` in `data/health.json`.

Column names follow the radio-browser station object (`homepage`, `favicon`,
`country`, `countrycode`, `state`, `tags`, `codec`, `bitrate`, `hls`,
`lastcheckok`), so an API record maps onto a row field-for-field. The columns the
API has no concept of keep local names: `id` (the player identity and the
`data/health.json` key), `stream_broken`, the two mirrors, `epg_file` and `mailto`.
`lastcheckok` is radio-browser's own verdict at enrichment time — the badges a
listener sees still come from `data/health.json`.

Required columns (build fails without them): `id`, `name`, `stream_broken`, `url`.

**The renderable rule** (`isPlayableStation` in `lib/stations.js`) is exactly:
a positive integer `id`, no `stream_broken` mark, and an `http(s)` URL with no
whitespace. Rows that fail it are dropped from the player — in dev, `stations.js`
warns with the dropped rows and line numbers; the hard gate is the validator.

### Rules the validator enforces (`scripts/validate-stations.js`)

Errors block the build (`prebuild` runs it, so `npm run build` fails):

- malformed row: field count ≠ header count (usually an unterminated quote),
- non-integer, zero/negative or duplicate `id`,
- active row with no `name`, or no `url`,
- `url` with whitespace/newline inside (legal in CSV, never valid in a URL),
- `url` not starting with `http://` or `https://`,
- **an active `http://` stream** — browsers block mixed content on the HTTPS site,
  and Capacitor serves over https too; use an `https://` mirror or the relay,
- duplicate stream URL between active rows,
- `homepage` / `favicon` not starting with `http(s)://` (they are rendered
  into the page),
- `epg_file` that does not exist in `public/EPGs/`.

Warnings (build still passes): non-`true` `stream_broken` values, and defects on
rows that are already hidden — a broken row is not rendered, so its bad URL is a
warning, not an error.

### Adding a station

Add the row in `riotsradios-epg` (`catalog/stations.csv`), not here: its publish
workflow validates the catalog, deploys it, and the running app picks it up.

1. Append the row at the end of `catalog/stations.csv` with the next free `id`.
2. Use an **https** stream URL. Verify it responds with audio and not a `.m3u8`
   playlist (the player expects an ICY/HTTP audio stream). A station with no
   https mirror may be carried **app-only**: add its host + id to this repo's
   `data/cleartext-hosts.json`, run `npm run cleartext:config` (the Android
   network security config is generated from that file), then clear
   `stream_broken`. The Pages build keeps hiding the row, the app renders it.
   Never a blanket cleartext rule — hosts are listed one by one. The allowlist is
   device policy and stays in this repo even though the catalog does not.
3. `npm run catalog:sync` here, then `npm run validate:stations` — no errors.
4. `npm run dev` and play it: it must reach the LIVE state, not stall (see
   [Playback](#playback-contract-why-the-catalog-rules-exist)).
5. Wait for the daily probe in `riotsradios-epg` (or run
   `npm run probe -- --only <id>` there), then `npm run catalog:sync` here to pick
   up the catalog and health snapshots together.
6. Add a line to `RELEASE.md` — new stations are listener-visible.

A station added only to the EPG repo reaches listeners at the next launch of the
player (runtime sync). Steps 3–6 are what keep the bundled snapshot, the badges
and the release notes honest, and the daily `.github/workflows/catalog-sync.yml`
job opens a PR if they are skipped.

### Retiring or fixing a station- Dead forever: set `stream_broken` to `true` and leave the row in place. Deleting
the row loses its history and its id can be reused by mistake — the dev editor's
DELETE does remove the row (and shift later lines), so prefer the hidden flag.
- Moved: change `url` only; keep the `id` so the health history stays attached.
- **Never hand-edit `data/health.json`.** It is generated by the probe in
  `riotsradios-epg`; hand edits are erased on the next catalog sync and
  misrepresent a station to listeners.

## Stream health — `data/health.json`

The probe lives in `riotsradios-epg` (`scripts/probe-catalog.mjs`, `npm run probe`):
it requests each station's headers only — `Range: bytes=0-1`, 10 s timeout, 6 in
parallel — and cancels the body immediately because a live stream never ends. That
repository owns `catalog/health.json`, keyed by station id; its
`.github/workflows/health.yml` refreshes it daily at 04:17 UTC and republishes the
catalog.

`data/health.json` here is a **synced snapshot** of that file (it arrives with
`stations.csv`), and the app imports it so badges render with no network request —
which also means the snapshot is **stale by design**: always show the `checked_at`
time.

`lib/health.js` classifies one response:

| Status | Meaning |
|---|---|
| `ok` | Audio content-type **and** a usable CORS header |
| `cors_missing` | Audio, but no `Access-Control-Allow-Origin` — plays, spectrum cannot |
| `playlist` | A `.m3u8`/HLS content type: not supported by the player |
| `not_audio` | Something answered, but it is not audio |
| `http_only` | The stream is `http://` |
| `auth_required` | 401/403 |
| `http_4xx` / `http_5xx` | Server errors |
| `timeout` / `tls_error` / `unreachable` | Transport failures |

`mergeHealth` folds a probe into the previous snapshot: `consecutive_failures`
accumulates and resets to 0 on success, `last_ok_at` only moves on success.

Badges (`healthBadge`) — the only user-facing health vocabulary:

- **LIVE** (`ok`, `cors_missing`) — responding with audio.
- **HTTP ONLY** (`http_only`) — the browser blocks it on the HTTPS site.
- **UNSTABLE** — a failing status with fewer than `OFFLINE_AFTER_FAILURES` (3)
  consecutive failures.
- **OFFLINE** — 3 or more consecutive failures.

No snapshot entry → no badge at all (null). Never invent a badge for an unprobed
station.

## CORS and the spectrum

`cors` in the snapshot is `any` (`*`), `origin` (a specific origin), or `null`.
`lib/spectrumAnalyzer.js` builds `<audio> → MediaElementSource → AnalyserNode →
GainNode → destination`, and `createMediaElementSource` may be called **once** per
element — so the element's `crossOrigin` must be decided *before* its `src` is
assigned (`lib/playbackController.js` `play()` does exactly that, from the health
snapshot). Setting `crossOrigin` on a CORS-less stream makes the element fail to
load; omitting it on a CORS-enabled one taints the audio and every FFT bin reads
`-Infinity`, which `read()` reports honestly as silence → the UI shows its `SIM`
fallback rather than a fake spectrum.

**The snapshot's CORS answers were measured from `https://mrhumildad.github.io`**
(`PAGE_ORIGIN` in the probe script). `any` survives a different origin; `origin`
(a single pinned origin) may not — re-verify on the device/WebView origin before
trusting a spectrum there. See the [`play-release` skill](../play-release/SKILL.md).

## Playback contract (why the catalog rules exist)

`lib/playbackController.js` is the state machine: `idle → loading → playing →
stalled → error`, with a 12 s start timeout, an 8 s stall window, a 2 s watchdog on
a frozen `currentTime`, and 3 retries at 1/2/4 s. It owns the single
`HTMLAudioElement` and every listener; nothing else may call
`audio.play()` or assign `audio.src`.

- Retrying re-assigns `src` on purpose — a fresh connection is what recovers a
  silently stalled TLS/TCP handshake.
- `stop()` pauses, removes `src` and calls `load()`: the connection must actually
  die (the README promises no background data use). Never set an empty `src` — that
  fires `MEDIA_ELEMENT_ERROR`.
- `NotAllowedError` → `blocked` (autoplay policy), `SecurityError` → mixed content,
  `NotSupportedError`/`MEDIA_ERR_SRC_NOT_SUPPORTED` → format. These are terminal, not
  retried.
- A station that keeps landing in `stalled`/`error` is a catalog problem: fix the
  URL or mark it `stream_broken`. Do not paper over it by loosening the retries.

## EPG v2 — published feed and `public/EPGs/`

The guides are owned by the separate `riotsradios-epg` repository, which runs the
fetch/convert pipeline, publishes `manifest.json` and serves the JSON on GitHub
Pages. The app fetches the manifest first and uses `public/EPGs/` only as the
per-station fallback. Do not add fetch/convert scripts here.

Public format guide: `docs/EPG-FORMAT.md`. Schema:
`public/EPGs/epg-schema.json` (also used for the online validator); starting point:
`public/EPGs/template.json`.

```json
{
  "version": "2.0",
  "station": "Radio Topo",
  "station_id": 23,
  "timezone": "Europe/Madrid",
  "last_updated": "2026-01-15",
  "source": "https://…",
  "contact": "…",
  "metadata": { "categories": { "musica": "Música", "directo": "Directo" } },
  "shows": { "morning": { "title": "…", "category": "directo", "url": "…" } },
  "days": [
    { "day": "monday", "label": "Lunes", "programs": [
      { "start": "08:00", "end": "10:00", "show_id": "morning", "live": true },
      { "start": "10:00", "end": "10:30", "title": "Música", "category": "musica" }
    ] }
  ]
}
```

Rules — errors block CI (`npm run validate:epg`):

- `version` must be `"2.0"` (anything else downgrades every check to a warning).
- `station_id` must match the station that owns the bundled file in `stations.csv`
  (the validator derives ownership from `epg_file`); a mismatch is an error.
- `timezone` must be a valid IANA zone — a missing one falls back to UTC with a
  warning, which silently shifts a Spanish schedule by an hour or two.
- `days[].day` must be one of `sunday … saturday`; times are `HH:MM` 24 h (`24:00`
  is accepted as midnight, `24:30` is not).
- `end` must be after `start`, **unless** `crosses_midnight: true` — and that flag
  with an end that is already later than the start is an error.
- No duplicate `start` in a day, and no overlaps between consecutive programs.
- A program uses **either** `show_id` (which must exist in `shows`) **or**
  `title` + `category`; the former wins when both are present.
- Cover the whole broadcast day, including filler — an empty gap is a blank slot in
  the modal.

Warnings: empty `programs` for a day, an unknown `category` key, a missing
`station_id`.

File name: descriptive, e.g. `radio-topo.json`; set the station's `epg_file` in
`stations.csv` to the bundled copy. The app loads the remote guide first and falls
back to that file when the manifest or guide is unavailable.

## Gates and tests

| Command | Covers |
|---|---|
| `npm run dev` | the player; in dev each row has EDIT, which writes `stations.csv` and runs the validator |
| `npm run validate:stations` | catalog (also runs on `prebuild`) |
| `npm run catalog:check` | the snapshot vs the published catalog (also on `prebuild`); exit 2 on drift, warns when offline |
| `npm run catalog:sync` | adopt the published `catalog/stations.csv` |
| `npm run validate:epg` | every bundled `public/EPGs/*.json` |
| `npm test` | `tests/*.test.mjs`: `audioBands`, `epg`, `health`, `playbackController`, `spectrumAnalyzer` |
| `npm run probe` (in `riotsradios-epg`) | rewrites `catalog/health.json` (network) |

CI (`.github/workflows/ci.yml`) runs all four except the probe, then a production
build. A change that touches `lib/stations.js`, `lib/health.js` or `lib/epg.js`
needs its unit test updated in the same commit — those modules are pure on purpose
(no DOM, no React) so they stay testable.

## Guard rails

- No station, URL or name hardcoded in a component: it comes from `stations.csv`.
- The catalog itself belongs to `riotsradios-epg`: this repo's `stations.csv` is a
  synced snapshot, not a second source. Never hand-edit it into a divergent list;
  ids are never reused and rows are retired with `stream_broken`, never deleted.
- Runtime sync is enabled in production and off in development; a remote catalog
  that fails `assessCatalogCsv` is refused, and the last good copy stays in charge.
- No `http://` stream on an active row; no whitespace in a URL.
- `stream_broken` is `""` or `true` — nothing else.
- Health is generated, never authored; badges come from `healthBadge`.
- The spectrum may be real or `SIM`, never a fabricated animation presented as real.
- Station content and EPG schedules belong to the stations: keep `source`,
  `contact` and attribution intact when editing a guide file.
- The fetch/convert pipeline belongs to `riotsradios-epg`; this repository ships
  only the fallback JSON and its validator.
