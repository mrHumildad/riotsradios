# Google car support — Android Auto & Android Automotive OS

Plan for running RIOTSRADIOS on car screens. Written 2026-11-02, before the
Capacitor/`android/` work exists (see the
[`play-release` skill](../.agents/skills/play-release/SKILL.md)); it says what
must be decided **before** the first Play upload and what can wait for a later
release.

**Status 2026-11-02: M1 is implemented.** `RiotMediaService` (Media3
`MediaLibraryService`) owns playback, the media notification and the PCM tap;
`RiotsPlaybackPlugin` is the only bridge the WebView has; `logic.js` picks the
native engine per platform and the web build still uses `lib/playbackController.js`.
`PlaybackSupervisor` ports the JS 12 s start timeout, the 8 s stall watchdog and
the 1 s/2 s/4 s retry ladder (with a fresh media item per retry), and
`POST_NOTIFICATIONS` is requested at runtime before the first playback. The
browse tree, catalog asset, artwork cache, voice and car form factors below are
still M2+.

---

## 1. What "Google car" means for this app

Three different surfaces hide behind the phrase, and they have different rules:

| Surface | What it is | What it needs from us |
|---|---|---|
| **Android Auto** | The phone projects its UI to the head unit over USB/Wi-Fi. Most users. | A `MediaSession` + `MediaBrowserService`/`MediaLibraryService` in the **phone** APK. Car UI is drawn by the car host, not by us. |
| **Android Automotive OS (AAOS)** — "Google built-in" | Android runs *in* the car; the Play Store is on the car itself (Volvo, Polestar, Renault, GM, Honda…). | The same service, published on a dedicated **AAOS track** in Play Console. |
| **Google Assistant voice** | Works on both surfaces. | Voice action handling (`onSetMediaItems` / `onSearch`). Required for the VC-1 quality guideline. |

Out of scope, deliberately:

- **Apple CarPlay** — there is no iOS app; a second native client is a different project.
- **AAOS cars without Play services** — OEM-only, no install path.
- **In-car video / parked apps** — this is a radio player.

## 2. The hard constraint that shapes everything

**The car cannot run the web app.** There is no browser on a head unit, the
Android Auto host only accepts templated surfaces or a media session, and a
WebView is never distraction-optimised. So car support is *native Android code
inside the same package* — not a web feature.

Consequences to accept now:

1. The AAB from `play-release` becomes the delivery vehicle for both phone and
   car. Same package name `com.mrhumildad.riotsradios`, one catalog, one version.
2. `stations.csv` stays the single source of truth, but it has to reach native
   code as a **bundled asset**, not a `fetch()`.
3. The GitHub Pages web build keeps working with **zero** native code — the
   guard rail from the release skill ("never import a plugin at module top
   level") applies to the playback bridge as much as to any other plugin.

## 3. The decision that must be made before the first APK: one playback engine

Until M1 the sound came from an `HTMLAudioElement` owned by
`lib/playbackController.js` inside `logic.js`; on Android it now comes from
`RiotMediaService`, and the web build keeps the element. A car media session
cannot be a puppet for that element: when the phone screen locks the WebView is
throttled or killed, the car keeps showing "playing" while the audio dies, error
reporting and voice both need a real `PlaybackException`, and the car expects a
browse tree it can page through while the app has no activity at all.

Two ways forward:

| | A. Native engine owns playback (recommended) | B. WebView keeps `<audio>`, native mirrors it |
|---|---|---|
| Screen-off / car playback | Works (foreground media session) | Dies with the WebView |
| Car ↔ phone state | One source of truth | Constant desync, bogus "playing" |
| Voice actions | Native resolve + native error copy | Needs a fake bridge, unreliable |
| Retry/stall policy | One owner: `PlaybackSupervisor` (Media3 retries set to 0) | Two policies to keep in sync |
| Web build | Untouched, keeps the JS controller | Untouched |
| Cost | Kotlin audio layer + Capacitor plugin | Looks cheap, becomes a rewrite later |

**Decision: A.** A Media3 `MediaLibraryService` in Kotlin is the only thing that
plays audio on Android; the WebView becomes a *remote control* over a Capacitor
plugin. The existing pure-JS controller (`lib/playbackController.js`, 3 retries,
12 s start timeout, 8 s stall watchdog, hard `stop()`) stays exactly as it is and
keeps serving the web build — its semantics become the **specification** the
Kotlin side must match.

This also closes the release skill's open question "background playback": a
foreground media session is exactly the missing piece, so the phone app gets
screen-off listening as a side effect of car work. Do this in the same milestone
as adding Capacitor, not after shipping a WebView-audio APK.

### Engine selection at runtime

```
web build                 → lib/playbackController.js          (unchanged)
Android (Capacitor)       → RiotsPlayback Capacitor plugin      (native session)
```

Both expose the same contract, so `logic.js` and every component stay ignorant:

```js
// lib/nativePlayback.js  (new)
export function createNativePlaybackController({ bridge }) { /* play, stop, getState, subscribe */ }
export const nativePlaybackAvailable = () => Boolean(window.Capacitor?.isNativePlatform?.())
```

`logic.js` picks one in its mount effect. Keep the current state names
(`idle | loading | playing | stalled | error`) so `PlayerDashboard` and the
existing tests do not change.

## 4. Data path: catalog → native asset

```
stations.csv ─┐
data/health.json ─┼─▶ scripts/export-car-catalog.mjs ─▶ android/app/src/main/assets/catalog.json
public/EPGs/*.json ─┘
```

- New script, Node-only, no deps: reuse `lib/stations.js` (`parseStationRows`,
  `isPlayableStation`) so the native catalog can never contain a row the web app
  would have dropped.
- Runs as `prebuild` for the Android target (add `export:car-catalog` to
  `package.json`, call it from `android:sync`) and in `.github/workflows/ci.yml`
  so a bad row fails CI, not the car.
- Per station: `id, name, location, country, streamUrl, webpage, iconUrl,
  epgFile, health{status, consecutive_failures}`. `country` is derived from
  `location` (last segment after the comma, mapped to a short code) — the column
  does not exist yet; derive it in the script rather than touching the CSV.
- Bundled EPG JSON is copied to `assets/epg/<file>` so the native side can show
  "on air now" with the phone app closed.
- The icon URLs in `stations.csv` point at Twitter/WordPress/Facebook/ivoox and
  several are 32 px or dead. The car needs local artwork (see §6).

Rules kept intact:

- `stream_broken` rows and invalid URLs are already filtered by
  `isPlayableStation`; the car tree simply contains the playable catalog.
- **Do not** add `usesCleartextTraffic` for `http://` stations. The validator
  rejects active HTTP rows for a reason; native playback does not get an
  exemption.
- A nice consequence of going native: **CORS stops mattering** for playback.
  `cors_missing` stations (Radio Bip, Radio QK, Radio Enlace…) play in the car.
  The analyzer still needs CORS, which affects the web build only.

## 5. What the driver actually sees and does

Android Auto / AAOS render the browse tree; we ship no car UI in Phase A. So the
tree *is* the product.

```
RIOTSRADIOS
├── All stations        (playable catalog, alphabetical, paged 20 at a time)
├── By country          (ES, IT, FR, AR, MX, UY, CL, EC, BO, VE, AT, BR…)
├── On air now          (stations with EPG, subtitle = current show)
└── Recently played     (last 5 station ids, local store)
```

Station item: **browsable + playable**. Playing it starts the live stream;
browsing it lists one child, `Live now` (current EPG show, not playable), so a
driver who taps a station in "On air now" can still get to the stream.

Rejected for v1: **Favorites** (needs a phone-side UI to manage, so it is a
cross-surface feature, not a car feature), and **hiding OFFLINE stations**
(the baked health snapshot goes stale between app releases, and a hidden station
is worse than an honest "stream unavailable" message — see §8).

Title/subtitle budget matters: the host truncates aggressively.

| Field | Value | Rule |
|---|---|---|
| `title` | station name | ≤ 40 chars, no badge text ("LIVE" is implied) |
| `artist` | `current show` when EPG exists, else `location` | ≤ 40 chars |
| `albumTitle` | `RIOTSRADIOS · location` | stable, gives context in the browsing card |
| `artworkUri` | local cached file (§6) or bundled placeholder | never a remote URL |
| `isLive` | `true` | the host hides the seek bar |
| `mediaId` | `station:12` | stable; voice and phone both address items by it |

Player commands: **play/pause (stop), next, previous**. Mapped
"next station" / "previous station" cycle the *All stations* list, matching the
web D-pad behaviour in `App.jsx`. No queue, no shuffle, no repeat for a live
single stream — expose only what the app really does, or the car shows controls
that lie.

Keep-playing behaviour: unplugging the car must not kill audio (the session lives
on the phone); pressing stop must release the connection, exactly like the stop
rule in `lib/playbackController.js` — `player.stop()` + `clearMediaItems()`, the
foreground service ends, the notification disappears.

## 6. Artwork

Car hosts resolve `artworkUri` themselves and mostly refuse `http(s)` icons
(some are `http://`, several are 32 px). Plan:

1. On first launch / catalog sync on the phone, download each `icon` into
   `filesDir/artwork/<id>.<ext>` with a 7-day retry window, capped at 512×512,
   ~<200 KB each (31 stations ≈ 5 MB worst case, fine).
2. Serve it to the session as a `FileProvider` `content://` URI.
3. Cache miss, download failure or an unusable image → bundled fallback: the
   RIOTSRADIOS mark (`res/drawable-nodpi/ic_station_placeholder.png`, 512²), per
   station letter drawn once. A car tile is never blank.
4. Keep the remote `icon` column as-is for the web app; do not migrate icons
   into the repo.

## 7. Playback behaviour to match (native side)

Port the values, not the code. From `lib/playbackController.js`:

| Behaviour | JS today | Kotlin |
|---|---|---|
| start timeout | 12 s | `PlaybackSupervisor` start timer; expiry rearms a fresh media item |
| stall detection | `currentTime` frozen + `readyState < 3` for 8 s | 2 s watchdog on `currentPosition` at rest, plus an 8 s timer while buffering after playback |
| retries | 3, delays 1 s / 2 s / 4 s | `PlaybackSupervisor` ladder (1 s / 2 s / 4 s), then a hard `playback` error |
| Media3's own retries | n/a | **Off** — `DefaultLoadErrorHandlingPolicy(0)` via `DefaultMediaSourceFactory`, so only one ladder is running |
| retry source swap | re-assign `src` to force a fresh socket | `player.setMediaItem(current, 0)` + `prepare()` |
| stop | `removeAttribute('src')` + `load()` | `stop()` + `clearMediaItems()` |
| errors | `mixed-content` / `blocked` / `format` / `playback` | `PlaybackException` mapped in §8 |

A give-up keeps its terminal `playback` error visible, with the station still
loaded, until another station is picked or the user stops — `stop()` releases the
item and returns to `idle`. Clearing the item on give-up would run the user-stop
path and flip the error to `idle` a frame later.

Extras that only exist natively:

- `AudioAttributes` = `USAGE_MEDIA` / `CONTENT_TYPE_MUSIC`, `handleAudioFocus = true`
  → car volume keys, ducking for navigation prompts, "pause on disconnect".
- `setHandleAudioBecomingNoisy(true)`.
- `ExoPlayer` + `DefaultExtractorsFactory` covers the catalog's mp3, ogg and AAC
  streams; verify id 5 (ogg), 43 (ogg), 57/77 (`audio/aac`), 21 (HLS-less
  `live.radiocarcoma.com/main`).
- `FOREGROUND_SERVICE` + `FOREGROUND_SERVICE_MEDIA_PLAYBACK` +
  `POST_NOTIFICATIONS` (runtime, API 33+), notification via Media3's
  `DefaultMediaNotificationProvider`.
- Wi-Fi-sensitive data use: use `setWakeMode(WAKE_MODE_NETWORK)` **only** when
  the phone is on Wi-Fi and playback started on Wi-Fi; otherwise a driver gets a
  mobile-data bill they did not choose. Show the connection type in the phone
  UI, never in the car.

## 8. Errors the driver must be able to read

Car app quality review rejects silent failures. Map Media3 to one short sentence
each, shown via `PlaybackException.errorCode` + message:

| Native error | Car copy |
|---|---|
| `IO_NETWORK_CONNECTION_FAILED`, `IO_NETWORK_CONNECTION_TIMEOUT` | "No connection — this station needs mobile data." |
| `IO_BAD_HTTP_STATUS` (404/410/5xx) | "This station is off air right now." |
| `IO_BAD_HTTP_STATUS` (401/403) | "This station asked for a login. Try another." |
| `PARSING_CONTAINER_UNSUPPORTED`, `DECODING_FORMAT_UNSUPPORTED` | "This stream's format isn't supported." |
| retries exhausted | "The stream keeps dropping. Try another station." |

Because the health snapshot is baked at build time, `data/health.json` is **not**
used to hide stations in the car; it only sorts the "By country" lists. The
listing stays honest and the error copy handles reality.

## 9. Voice (VC-1 — required)

Targets, in order of how people actually talk:

- "Hey Google, play Radio Topo on RIOTSRADIOS"
- "Hey Google, play RIOTSRADIOS" → resume the last station
- "Hey Google, play radio" → last station again (Assistant fallback)
- "Hey Google, search Radio Onda on RIOTSRADIOS" → `onSearch` returns matching
  stations

Implementation notes:

- Resolve in `MediaLibrarySession.Callback.onSetMediaItems` (mediaId present) and
  `onSearch` (free text). Matching: case-fold, strip diacritics
  ("Città" → "citta", "Ràdio" → "radio"), token containment on station name,
  then on `location`; ambiguous query → return the list, do not guess.
- Never require network for matching — everything comes from `assets/catalog.json`.
- The Kotlin matcher needs unit tests with the same fixtures used for the JS
  tests, plus the accent cases above.

## 10. State sync between car and phone

The service is authoritative. The WebView observes a `MediaController` bound to
the session and mirrors `onMediaItemTransition`, `onPlaybackStateChanged` and
`onMediaMetadataChanged` into the same React state the web build uses.

| Action | Result |
|---|---|
| Car: pick station | phone list highlights it; `currentStationIndex` updates |
| Phone: pick station | car "now playing" changes on the next metadata push |
| Car: pause/stop | phone shows `idle`, connection released |
| Car: volume keys | car media stream; the in-app slider stays a per-app gain (`ExoPlayer.setVolume`) |
| Phone app killed | car keeps playing; reopening the app re-syncs from the session |

The song title comes from the player, not from the page: `RiotMediaService` reads
the `IcyInfo` entry ExoPlayer decodes and publishes it on `TrackBus`, so every
station reports a track on Android — including the ones a WebView fetch cannot
reach, because the server refuses the `Icy-MetaData` CORS preflight
(`lib/icy.js`). `lib/nativePlayback.js` attributes the title to the station the
player tagged and `logic.js` skips the web poller for that station.

Capacitor plugin surface (small on purpose — the phone never sends URLs):

```
RiotsPlayback.playStation({ id })      → resolves the URL from assets/catalog.json
RiotsPlayback.stop()
RiotsPlayback.setStateListener()       → { state, error, id }, `id` = station on air
RiotsPlayback.getState()               → same object
RiotsPlayback.addListener('track')     → { id, title }, on each new ICY title
RiotsPlayback.getTrack()               → same object, for a page that attaches late
RiotsPlayback.setCatalog({ stations })  → station order for headset skips with no WebView
```

## 11. Manifest and Gradle checklist

```xml
<!-- AndroidManifest.xml -->
<uses-permission android:name="android.permission.INTERNET" />
<uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
<uses-permission android:name="android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK" />
<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />

<application>
  <!-- tells Android Auto the app is a media app -->
  <meta-data android:name="com.google.android.gms.car.application"
             android:resource="@xml/automotive_app_desc" />

  <service android:name=".media.RiotMediaService"
           android:exported="true"
           android:foregroundServiceType="mediaPlayback">
    <intent-filter>
      <action android:name="androidx.media3.session.MediaSessionService" />
      <!-- legacy browsers on older head units still bind this one -->
      <action android:name="android.media.browse.MediaBrowserService" />
    </intent-filter>
  </service>
</application>
```

```xml
<!-- res/xml/automotive_app_desc.xml -->
<automotiveApp xmlns:android="http://schemas.android.com/apk/res/android">
  <uses name="media" />
</automotiveApp>
```

- **No** `android.software.leanback` / TV metadata needed for cars (that is the
  TV channel from the release skill, a separate form factor).
- **Do not** declare `android.hardware.type.automotive`. For media apps on the
  AAOS track it must be `true` *or unset*, and unset keeps the phone listing
  intact — one AAB serves both.
- Never lock orientation in the manifest (the TV rule already says this).
- Media3: `media3-exoplayer`, `media3-session`, `media3-common` (pin the latest
  1.x stable at build time; 1.10 was stable in March 2026). **No** `media3-ui`:
  the car host draws the UI.

## 12. Distribution: what has to happen in Play Console

| Form factor | Opt-in | Artifact | Review |
|---|---|---|---|
| Android Auto | Form factors → Add → Android Auto; needs a bundle on a testing track | same AAB, mobile track | Non-blocking in closed testing, **blocking** in open/production |
| AAOS | Form factors → Add → Android Automotive OS; AAOS screenshots (2 portrait 800×1280 + 2 landscape 1024×786); agree to review policy | **dedicated AAOS track** (required for media apps) | blocking from open tracks on |

Order that avoids burning a review cycle: phone-only production release first →
internal track with the same AAB to sanity-check the car → closed testing with
real testers in real cars (the ≥12-tester, 14-day gate already exists) → enable
the AAOS track → production.

The car review adds days to a submission. Do not bundle a car-form-factor switch
with a critical phone hotfix.

**Phase B (optional, later): Car App Library templates.** `MediaPlaybackTemplate`
+ `SectionedItemTemplate` would let us brand the browse UI (amber CRT, station
grid, "now playing" cover). Constraints as of Nov 2026: templated media apps are
**beta — publishable only to internal and closed testing tracks**, they need
`androidx.car.app.MEDIA_TEMPLATES`, `minCarApiLevel 8`, the `androidx.car.app.category.MEDIA`
category, a `MediaPlaybackManager.registerMediaPlaybackToken` call, a trampoline
activity disabled in the manifest, and handling of
`androidx.car.app.media.action.SHOW_MEDIA_PLAYBACK`. It also adds a second UI to
maintain. Revisit once it is allowed on production tracks; the §3–§10 work is
prerequisite for it anyway.

## 13. File-by-file inventory

Native (created with `npx cap add android`, then filled in):

| Path | Purpose |
|---|---|
| `android/app/src/main/java/…/media/RiotMediaService.kt` | `MediaLibraryService`, session, player, notification |
| `…/media/Catalog.kt` | reads `assets/catalog.json`, station model, country grouping |
| `…/media/BrowseTree.kt` | library root, `onGetChildren` paging, `onGetItem`, `notifyChildrenChanged` |
| `…/media/PlaybackPolicy.kt` | retry/stall/timings from §7 |
| `…/media/ErrorMessage.kt` | §8 mapping |
| `…/media/VoiceMatcher.kt` | §9 normalisation + matching |
| `…/media/EpgNow.kt` | Kotlin port of `lib/epg.js#getCurrentShow` (v2 schema) |
| `…/media/Artwork.kt` | download/cache/FileProvider + placeholder |
| `…/RiotsPlaybackPlugin.kt` | Capacitor bridge (§10) |
| `android/app/src/main/res/xml/automotive_app_desc.xml` | AA declaration |
| `android/app/src/main/AndroidManifest.xml` | §11 |
| `android/app/src/test/java/…/` | JVM unit tests (§14) |

Web side (kept working, no regressions):

| Path | Change |
|---|---|
| `scripts/export-car-catalog.mjs` | new; CSV + health + EPG → `assets/catalog.json` |
| `package.json` | `export:car-catalog`, called from `android:sync`; `prebuild` unchanged |
| `lib/nativePlayback.js` | new thin adapter, same contract as the JS controller |
| `logic.js` | choose engine at mount; subscribe to native state |
| `comp/PlayerDashboard.jsx` | spectrum shows `SIM` on Android (see §15) |
| `tests/nativePlayback.test.mjs` | contract tests with a fake bridge |
| `tests/catalogExport.test.mjs` | golden catalog JSON from a fixture CSV |
| `.github/workflows/ci.yml` | run the export + JVM tests on PRs |

## 14. Testing without a car

1. **JVM unit tests** (`./gradlew :app:testDebugUnitTest`): catalog parsing,
   country grouping, browse tree paging, voice matching (accents, ambiguity),
   EPG "now" parity against the same fixtures as `tests/epg`-style JS cases,
   error mapping.
2. **DHU (Desktop Head Unit)** for Android Auto: phone/emulator in developer
   mode, `adb forward tcp:5277 tcp:5277`, launch `desktop-head-unit`. Drive the
   whole tree, then test: play → screen off → 10 minutes of playback; stop →
   notification gone; airplane mode → error copy; unplug/replug → state resync.
3. **AAOS emulator** (Automotive 1024p landscape + Automotive Portrait) for the
   same flows and for the required screenshots (§12).
4. Real hardware only for what an emulator cannot answer: audio focus against a
   real head unit, mobile-network stalls, OEM skin quirks.

## 15. Known trade-offs, stated plainly

- **Spectrum analyzer on Android stays real, by tapping PCM.** Web Audio cannot
  tap a native `ExoPlayer`, but an `AudioProcessor` in front of the audio sink
  sees the decoded samples, so the 24 bands are computed in Kotlin and pushed to
  the WebView (no `RECORD_AUDIO`, no CORS gate — every station gets real bars).
  See [`SPECTRUM-ANDROID.md`](SPECTRUM-ANDROID.md); `SIM` remains only the
  silence/error fallback. The framework `Visualizer` is the rejected option
  there because it requires the microphone permission.
- **One AAB, one catalogue, two UI layers** (WebView on phone, host-drawn on
  car). That is the cheapest honest architecture; it also means car bugs are
  testable only through the session and DHU.
- **Baked health snapshot** never hides stations in the car; errors carry the
  message instead (§8).
- **No seek, no queue, no downloads.** A live radio tuner should not offer
  controls that cannot work in a car.
- **Two release tracks must stay in step**: `changesets` owns `versionName`,
  `versionCode` increments per upload, and the AAOS track must receive every
  version we want visible on Google built-in cars.

## 16. Milestones

Estimates are for a single developer, working opportunistically:

| # | Milestone | Outcome | Est. |
|---|---|---|---|
| M0 | Capacitor + `android/` + signing (already planned in the release skill) | empty shell APK installs | 1–2 d |
| M1 | Media3 service + player + notification + Capacitor bridge; phone UI on the native engine | screen-off playback, no WebView audio | 3–5 d |
| M2 | Catalog export, browse tree, artwork cache, EPG-now, error copy | DHU shows a usable app | 3–4 d |
| M3 | Voice matching + search + `Recently played` | VC-1 covered | 1–2 d |
| M4 | DHU + AAOS emulator test pass, screenshots | review-ready AAB | 1–2 d |
| M5 | Play Console: form factors, AAOS track, closed testing in real cars | car support live | 1–2 d + review time |
| M6 | (deferred) Car App Library templated UI | branded car UI | 5–8 d, blocked by beta |

## 17. Open decisions before starting

1. **Does the first production release include the car form factor, or ship
   phone-only first?** Recommendation: phone-only production, car in the next
   minor (`1.3.0`), because the car review is blocking and 14-day closed testing
   is already the long pole.
2. **"Recently played" store** — `SharedPreferences` on the phone (cheap, no
   sync) vs. nothing at all in v1.
3. **Do we cache artwork in the app at all**, or ship one placeholder and keep
   the tile text-only until someone wants logos? Logos make the car list
   usable; the cache is ~5 MB.
4. **Templated UI (M6):** only worth it if the beta opens to production before
   we finish M5; otherwise the host-drawn UI is the right answer for a radio
   tuner.

## 18. References

- Media apps for cars (overview, `MediaBrowserService`/`MediaLibraryService`):
  https://developer.android.com/training/cars/media
- Add AAOS support to a media app:
  https://developer.android.com/training/cars/media/automotive-os
- Templated media apps (beta):
  https://developer.android.com/training/cars/apps/media
- Distribute to cars (form factors, tracks, screenshots, review):
  https://developer.android.com/training/cars/distribute
- Media3 release notes: https://developer.android.com/jetpack/androidx/releases/media3
- Repo context: [`stations-epg` skill](../.agents/skills/stations-epg/SKILL.md),
  [`play-release` skill](../.agents/skills/play-release/SKILL.md),
  [`docs/EPG-FORMAT.md`](EPG-FORMAT.md)
