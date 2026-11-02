# Does shipping an app solve CORS? — investigation, 2026-11-02

Short answer: **no, and CORS was never what stopped those stations.** The app does
solve the two *other* browser rules — **mixed content** and Android's
**cleartext policy** — which are the real blockers. That is still enough to
reintegrate the `http://` rows, but only in the app, and only station by station.

Measured against `stations.csv` + `data/health.json` as of 2026-11-02.

---

## 1. Three rules that get called "CORS"

| Rule | Where it lives | What it blocks | Fixed by an app? |
|---|---|---|---|
| **CORS** (`Access-Control-Allow-Origin`) | Browser, per *request* made by JS/Web Audio | Reading audio samples for the spectrum analyzer. **Never** plain `<audio>` playback — our controller only sets `crossOrigin` when the snapshot says CORS is available | **No.** Same rule inside any WebView |
| **Mixed content** | Browser/webview, per *page origin* | An `http://` subresource on an `https://` page. On GitHub Pages the page is https, so every `http://` stream dies | **Yes**, by choosing the page origin |
| **Cleartext policy** | Android, per *app* (`network_security_config`) | `http://` sockets for an app whose `targetSdk >= 28` | **Yes**, per host, in our own manifest |

So "the station does not work on GitHub" and "the station needs CORS" are two
different groups. Only the first is fixed by packaging.

## 2. What the catalog actually contains

| Bucket | Count | Plays on GitHub Pages? | Plays in the app? |
|---|---|---|---|
| Playable rows | 38 | — | — |
| …`health.status = ok` (audio + CORS) | 26 | yes, with real spectrum | yes, wildcard ones keep the spectrum |
| …`cors_missing` (audio, no ACAO) | 11 | **yes**, playback never needed CORS; spectrum shows `SIM` | yes, same `SIM` |
| Rows with `http://` stream URL | 7 | **no** — mixed content | **4 are active app-only**, cleartext allowed for their hosts |
| Broken for other reasons (`http_4xx`, `http_5xx`, `timeout`, `unreachable`, `not_audio`, `auth_required`) | 16 | no | **no** — the app cannot fix a dead URL |

Those 7 rows: 14 Radio Malva, 15 Ké Huelga, 17 Radio Libertaire, 20 Radio
Utopía, 42 Radio Encuentro, 60 fmsierrascomechingones, 73 Espika FM. Four of
them serve audio and are active **in the app only** now
(`data/cleartext-hosts.json`). The other three stay `stream_broken` for stream
reasons, not policy reasons: 42 no response, 60 answers 404, and 73 answers
`301 → https://stream.codigosur.org/espikafm.mp3`, a mirror that is itself
**404** — the Icecast server behind that name (`stream.radios.red`, 2.4.4) lists
ten mounts and Espika is not one of them, so the row stays hidden.

Re-checked 2026-11-02 — all 19 hidden rows, redirects followed, https and an
audio content-type required: **three recovered and were reactivated.** 3 Radio
Ciroma (`cors_missing`; `s.streampunk.cc` redirects to a streaming node), 24
Radio Pirineo (`ok`, ACAO echoes the caller), 46 Radio Kvrruf (`ok`, ACAO `*`).
The other 16 stay hidden: 13 fails TLS chain verification
(`UNABLE_TO_VERIFY_LEAF_SIGNATURE`), 22/73/78 answer 404, 25 answers 502, 89
answers 401, 56 returns `application/octet-stream`, 60 is http-only, 79 lands on
a Podbean login page, and 33/34/35/42/49/82/84 are dead hosts or invalid URLs.

Conclusion: **the reintegration target is those `http://` rows, not the
`cors_missing` ones.** Clearing `stream_broken` on a `cors_missing` station
changes nothing on either channel — it already plays on the site.

## 3. What the app does differently (implemented in this commit)

- `capacitor.config.json` → `server.androidScheme: "http"`. The page origin
  becomes `http://localhost`, so an `http://` stream is same-scheme content and
  mixed-content blocking has nothing to block. Default Capacitor is
  `https`/`https://localhost`, which would have kept every one of those stations
  broken — the app alone is not the fix, the scheme choice is.
- `data/cleartext-hosts.json` is the one list both sides read. Cleartext is
  refused by default for `targetSdk 36`; the hosts here are the only exemptions,
  **by host, never globally** — no `usesCleartextTraffic="true"`.
- `android/app/src/main/res/xml/network_security_config.xml` is **generated**
  from that list by `npm run cleartext:config` (which `android:sync` runs), plus
  `localhost` because the shell itself is served from there. It is referenced
  from `AndroidManifest.xml`.
- The catalog filter is per build: `APP_BUILD=1` (only `npm run build:android`)
  passes the allowlist to `isPlayableStation`, so the app renders those rows and
  the Pages build keeps hiding them. One `stations.csv`, two audiences.
- `npm run validate:stations` accepts an active `http://` row only when the host
  *and* station id are in the allowlist, fails a stale entry, and fails when the
  committed XML no longer matches the list.

## 4. The `crossOrigin` trap — measured on the device

`data/health.json` was probed from `https://mrhumildad.github.io` (see
`PAGE_ORIGIN` in `scripts/probe-stations.js`), but the app's origin is
`http://localhost`. So the snapshot has to be re-checked, not trusted. Measured
in the app's WebView on the OPPO (Android 15), loading each stream as a media
element with `crossOrigin = "anonymous"` — exactly what the app does for
analyzable stations:

| `health.cors` | playable | tested | loaded with `crossOrigin` |
|---|---|---|---|
| `any` (`*`) | 17 | 4 | **4/4** |
| `origin` | 7 | 7 | **6/7** — Eguzki Irratia fails, `MEDIA_ERR_SRC_NOT_SUPPORTED` (code 4) |
| `null` | 13 | 2 | 0/2, as expected |

An `origin` entry is **not** a pin to the Pages origin: all seven echo whatever
`Origin` they receive, and `curl -H 'Origin: http://localhost'` gets
`Access-Control-Allow-Origin: http://localhost` back from every one. The single
failure is a redirect chain — Eguzki sits on `radioslibres.net`, the other six on
`radiobot.*` hosts, and a media CORS check must pass on every hop.

Why this decides the code: setting `crossOrigin` on a stream that fails the check
stops **playback**, not just the analyzer (a code-4 media error). So `logic.js`
keeps the conservative rule for the app — only `cors: "any"` is analyzable when
`window.Capacitor.isNativePlatform()` is true. Cost, stated plainly: six stations
show `SIM` in the app although a real spectrum would work. The website is
unchanged.

The clean fix is data, not guesswork: have `scripts/probe-stations.js` record a
second field (`cors_app`, probed with `Origin: http://localhost`) and gate on
that. The website keeps its own origin's answer. Do not simply re-probe the
existing field from the app — that would invert the same mistake for the site.

## 5. What still will not work in the app

- Dead endpoints: 404/502/5xx/timeout rows stay dead. The app changes no server.
- `not_audio` rows (JSON/HTML answers) and `auth_required` (401/403) stay broken.
- HLS (`.m3u8`) is still refused by `classifyProbe`, so it never reaches the
  player.
- The real spectrum analyzer over Web Audio: unchanged. A WebView `<audio>` on
  the native page origin gets no new CORS rights, so the app gives **no**
  analyzer gains *while it plays through the WebView*. Native playback (the
  Media3 plan in `docs/ANDROID-AUTO.md`) replaces Web Audio with a PCM tap, which
  makes CORS irrelevant to the bars — see [`SPECTRUM-ANDROID.md`](SPECTRUM-ANDROID.md).
- Android's WebView is still a browser for everything else: a station whose
  server requires a `Referer`/`User-Agent` a WebView will not send stays broken.

## 6. Reinforcing a station

Per row, never in bulk — `stream_broken` also covers genuinely dead URLs:

1. Probe the row (`npm run probe:health`) and confirm it answers audio.
2. Add `{ "host", "station_ids": [id], "note" }` to `data/cleartext-hosts.json`.
3. `npm run cleartext:config` — regenerates the Android network security config
   from that list. `android:sync` runs it; the validator fails if the XML is
   stale, so a hand edit cannot drift.
4. Clear `stream_broken` in `stations.csv`.
5. `npm run validate:stations` now reports it as "carried by the app only"; the
   Pages build stays at 35 stations, the Android build shows 39.

Still open: `healthBadge()` says "browsers block on HTTPS" for `http_only`, which
is wrong inside the app — it needs a native variant of that copy.

## 7. What was verified, and where

Build side:

- `vite build --base=./ --outDir dist-android` succeeds; the emitted
  `index.html` has no absolute `href="/…"` left (icons now go through
  `%BASE_URL%`), and the logo import is rewritten to a relative
  `new URL(…, import.meta.url)`.
- `npx cap add android` generated `android/`; `cap sync` copies `dist-android`
  into `android/app/src/main/assets/public`.
- `./gradlew assembleDebug` → `app-debug.apk` (4.8 MB), `adb install` OK.

On the device — OPPO A6x (CPH2819), Android 15 / SDK 35, `adb` + WebView DevTools:

- `location.origin` is **`http://localhost`** and
  `window.Capacitor.isNativePlatform()` is `true`: the `androidScheme: "http"`
  choice is what removes mixed content, and it took effect.
- The app renders **42 station rows** (38 that the Pages build shows + the four
  allowlisted ones), the dashboard works, and the platform audio service logs an
  active session for the app's pid, so audio really played.
- The allowlist path works end to end from the **station list**, not just from a
  probe: D-padding to row 12 · Radio Malva starts it, the soundbar reads
  `RADIO MALVA` / `LIVE` with a **real spectrum** (its ACAO is `*`), and logcat
  shows no cleartext, mixed-content or `net::ERR` complaint.
- The Pages bundle is untouched by all of it: `grep` for an allowlist-only string
  finds 0 hits in `dist/` and 1 in `dist-android/`, and the rendered count stays
  38 there versus 42 in the app.
- Cleartext: `fetch(url, {mode:'no-cors'})` succeeds for
  `http://radiomalva.ddns.net:8000/rmbc.ogg` and
  `http://streaming.radioutopia.es:8000/radio-utopia.mp3` — the network security
  config works. Both reach `loadedmetadata` as media elements, including the one
  that sends no ACAO at all (playback never needed CORS).
- Same-origin CORS: `radiomalva` (`*`) answers `200`; the no-ACAO and the
  `cors: null` control both fail with `TypeError: Failed to fetch`, confirming
  the analyzer boundary is unchanged by packaging.

Caveats, so the claim is not overstated:

- Only Radio Malva was played start to finish from the list. Ké Huelga, Radio
  Libertaire and Radio Utopía load (Utopía sends no ACAO, so it streams with
  `SIM`), but each was exercised for seconds, not minutes.
- Each row was exercised for a few seconds only. Nothing stayed playing for
  minutes, nothing was tested with the screen off, and there is no background
  service yet (Android will pause the WebView `<audio>` there — `docs/ANDROID-AUTO.md`
  §3).
- `http://stream.codigosur.org/espikafm.mp3` (id 73) answers **301 → `https://…`**,
  but that mirror is 404 and the station is absent from the stream host's mount
  list, so Espika FM is **off air**, not merely HTTP-bound. There is no https URL
  to point the row at, so it stays `stream_broken`. (An earlier revision of this
  note read the 301 as a working mirror: the mount is what matters, not the
  redirect. The station's own site embeds the same dead URL.)
