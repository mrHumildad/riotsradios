---
name: play-release
description: Build, version and publish RIOTSRADIOS on Google Play with Capacitor 8 while keeping the GitHub Pages web build — release scripts, android/, signing, two-phase upload, the Android TV channel, and the Play declarations for a free no-ads app. Use when touching android/, capacitor config, release scripts, package.json version, or discussing Play Store steps.
---

# Play release — RIOTSRADIOS

**Where this app is today:** a web app (React 19 + Vite 8, `base: '/riotsradios/'`,
deployed to GitHub Pages by `.github/workflows/deploy.yml`, versioned with
changesets at `1.2.0`). Capacitor 8 and `android/` are in the repo: M0 (shell
APK) and M1 (Media3 playback, see
[`docs/ANDROID-AUTO.md`](../../../docs/ANDROID-AUTO.md)) are done, `android:sync`
and `android:build` exist, and **signing, `android:bundle`/`export` and
`release:android` are still missing** — this skill is the procedure to finish
them, built from what Retro Soccer Dealer (RSD) already paid for in Play Console
rejections.

**Product decisions (confirmed 2026-11-01):**

- **Both channels stay.** The GitHub Pages build keeps shipping; Play is added
  next to it. Nothing in the web path is retired, and no release note may imply
  one channel replaced the other.
- **Free app: no ads, no in-app purchases, no accounts.** That is a *permanent*
  simplification of the RSD pipeline: no AdMob, no consent form, no Play Billing,
  no `.env` secrets in the AAB, and Data safety is genuinely "nothing collected".
- **Android TV matters.** The README already advertises a D-pad/TV layout, so
  the TV channel is a real target and its Play rules are binding (see
  [The TV channel](#the-tv-channel)).

## Prerequisites before the first AAB

1. Capacitor 8 into this repo — `@capacitor/core`, `@capacitor/cli`,
   `@capacitor/android`, and `capacitor.config.json` with
   `"webDir": "dist-android"`, an `appId` of `com.mrhumildad.riotsradios`, and a
   `backgroundColor` matching the amber-CRT shell. `npx cap add android` writes
   `android/`; never hand-create it.
2. A Vite build that works from `file://`-style relative URLs (see
   [Web → Android traps](#web--android-traps-in-this-repo)).
3. A keystore, created and backed up **before** the first upload
   ([Signing](#signing-one-time-permanent-consequences)).
4. A public privacy-policy URL ([Declarations](#play-console-declarations-this-build)).
5. A versionCode policy ([Versioning](#versioning-rules)).

## Commands

Web channel (exists today — do not change its meaning):

| Command | Does |
|---|---|
| `npm run dev` / `build` / `preview` | Vite dev / production build into `dist/` / local preview |
| `npm test` | `node --test tests/*.test.mjs` |
| `npm run validate:stations` / `validate:epg` | Catalog + EPG gates; `prebuild` runs the stations one automatically |
| `npm run deploy` | `gh-pages -d dist` — the web channel |
| `npm run release` | changesets bump → deploy → push tags and `main` |

Android channel (**to add**, modelled line for line on RSD's
`scripts/releaseAndroid.mjs`):

| Command | Does |
|---|---|
| `android:sync` | `vite build --base=./ --outDir dist-android && npx cap sync android` |
| `android:bundle` | `android:sync && cd android && ./gradlew bundleRelease assembleRelease` |
| `android:export` | Copy the artifacts to `android-builds/riotsradios-v<version>.{aab,apk}`, refusing a stale APK |
| `release:android` | sync → bump `versionCode` → bundle+assemble → export → print the AAB path |
| `android:icons` | Regenerate every `mipmap-*` launcher icon plus `drawable-xhdpi/tv_banner.png` from one source image |

Write `release:android` as one script, in this order, and fail loudly at each step
(`execSync`, non-zero status aborts):

1. `android:sync` → `dist-android/` + `cap sync`.
2. Bump `versionCode` in `android/app/build.gradle` by one.
3. `cd android && ./gradlew bundleRelease assembleRelease` — **both** in one Gradle
   run. `bundleRelease` alone leaves yesterday's `app-release.apk` on disk, and
   the export then renames that stale binary as the new version (RSD shipped
   twelve identical APKs this way, v1.0.3–v1.0.13).
4. Export, and verify the APK's own `output-metadata.json` `versionName`/
   `versionCode` match `package.json` and the Gradle file before naming anything.

## Versioning rules

- **`package.json` is the single source of `versionName`.** `android/app/build.gradle`
  must read it (`new groovy.json.JsonSlurper().parseText(file('../../package.json').text).version`)
  and never hold its own copy — the AAB, the exported filename and the web
  build then cannot drift.
- **changesets owns the version here** (`npm run changeset`, `npx changeset version`),
  unlike RSD where the release script auto-bumps the patch digit. Do **not** add an
  auto-bump to the Android script or the two mechanisms will double-increment.
  Cut the AAB *after* the version is final.
- **`versionCode` never repeats.** Every upload needs a fresh one, including a
  re-upload after a rejected review — an upload that merely *registers* burns the
  number. Take the next number; never fight for an old one.
- Optional but useful (RSD does it): give the debug build
  `applicationIdSuffix ".debug"` + `versionNameSuffix "-debug"` so an adb build
  installs side by side with the Play copy instead of replacing it.

## Web → Android traps in this repo

Check every one of these **in `dist-android/index.html` after the first build**, not
in the source:

- **Base path.** `vite.config.js` hardcodes `base: '/riotsradios/'`, which is right
  for GitHub Pages and wrong for Capacitor: an absolute `/…` base 404s under the
  WebView's local server. The Android build must pass `--base=./` and go to its own
  output dir (`dist-android/`), never reuse `dist/`.
- **Public-asset URLs in `index.html`.** Vite copies `public/` verbatim and does not
  rebase public paths, so `<link rel="icon" href="/icons/favicon.ico">` and
  `<link rel="manifest" href="/icons/site.webmanifest">` still point at the server
  root. Behind Capacitor that root is the app bundle, so they 404 quietly (no icon,
  no manifest). Use `%BASE_URL%…` or drop them from the Android build.
- **`import logoPng from '/logob_transp_ffc107.png'`** in `App.jsx` — the same
  absolute-public-URL class of bug; import it relatively (`./public/…` is not the
  way; move it into `src/assets/` or use `import.meta.env.BASE_URL`).
- **Google Fonts CDN** (`Abril Fatface`, `Space Mono`) in `index.html`. On a phone
  with no network at first launch the type falls back and the whole amber-CRT
  identity collapses to Helvetica. Ship the woff2 files in the app (RSD's
  `scripts/fetchFonts.mjs` is the pattern) and self-host the CSS.
- **`public/site.webmanifest`** (`name`/`short_name` empty, icons at root paths) is
  web-only. It does nothing for Play: the Android launcher icon comes from
  `res/mipmap-*`, and the TV tile from `res/drawable-xhdpi/tv_banner.png`.
  `cap sync` never touches either, so a stale icon set ships the stock Capacitor
  icon — regenerate explicitly (`android:icons`), then rebuild.
- **Verified on device only.** Anything about CORS, audio focus or playback under
  the WebView cannot be validated in `npm run dev`.

## Audio in the WebView (the make-or-break part)

RSD's audio lesson is the mirror image of this app's: the game *yields* when the
player has other music on (its `AudioFocusPlugin` probes
`AudioManager.isMusicActive()`), because the Android WebView takes **permanent**
audio focus the moment it plays anything. RIOTSRADIOS *is* the music, so:

- **Screen-off / background playback is not free.** A foreground service plus a
  media session (`MediaSessionCompat`/Media3) with a media-style notification is
  what Android requires for playback that outlives the activity; a bare WebView
  `<audio>` gets paused or starved. **M1 implements this**: `RiotMediaService`
  (`MediaLibraryService`) owns the player and the notification, the WebView only
  sends commands, and `PlaybackSupervisor` holds the start-timeout/stall/retry
  rules. `POST_NOTIFICATIONS` is requested at runtime before the first playback;
  playback never depends on the answer.
- **The STOP rule stays absolute.** `lib/playbackController.js` stops by removing
  `src` and calling `load()` so the connection actually dies (never an empty `src`
  — that fires `MEDIA_ELEMENT_ERROR`). Whatever service is added must release with
  the same intent: no notification left behind, no socket held open.
- **`crossOrigin` order.** `play()` sets `crossOrigin` *before* `src`, and only when
  `data/health.json` says the station allows CORS; setting it on a CORS-less stream
  makes the element fail to load. Keep that order.
- **CORS measurements in `data/health.json` were taken from
  `https://mrhumildad.github.io`** (`PAGE_ORIGIN` in `scripts/probe-stations.js`).
  Inside the app the origin is Capacitor's local server, so `cors: "any"` still
  holds but `cors: "origin"` may not. Re-probe from the app's own origin before
  trusting the spectrum on device.
- **https only.** `scripts/validate-stations.js` already fails an active `http://`
  row; Capacitor serves over https too, so the same rejection applies in the app —
  do not "fix" a station by allowing cleartext traffic.

## Insets and chrome

Port RSD's `capacitor.config.json` `SystemBars` block (`style: DARK`,
`insetsHandling: css`, `initialViewportFitValueHint: cover`), and keep the two
halves that only work together:

- `WindowCompat.setDecorFitsSystemWindows(getWindow(), false)` in
  `MainActivity.onCreate` — Android 15+ enforces edge-to-edge for targetSdk 35+,
  but older versions still fit the window unless the app opts in, and then
  SystemBars' `--safe-area-inset-*` values describe an inset the OS already
  applied, padding the layout twice (a status bar's worth of dead space).
- Capacitor's SystemBars plugin owns the decor's insets listener. Never add a
  second `setOnApplyWindowInsetsListener`.

## Signing (one-time, permanent consequences)

- Keystore **outside the repo**, e.g. `~/keystores/riotsradios-upload.jks`; you
  need it to be a *different key* from RSD's — one key per app. Back it up twice
  (password manager + offline media) and verify the copy opens:
  `keytool -list -v -keystore … -alias riots-upload`.
- Credentials in **user-level** `~/.gradle/gradle.properties`
  (`RIOTS_UPLOAD_STORE_FILE`, `RIOTS_UPLOAD_KEY_ALIAS`, `RIOTS_UPLOAD_STORE_PASSWORD`,
  `RIOTS_UPLOAD_KEY_PASSWORD`). Never in the repo. Keep `*.jks`/`*.keystore` in
  `.gitignore` as a backstop.
- `android/app/build.gradle` needs a `signingConfigs.release` block wired into
  `buildTypes.release`, **plus a fail-fast task guard**: Gradle happily emits an
  unsigned AAB and the mistake only surfaces as a Console rejection later. RSD's
  guard throws from `doFirst` on `bundleRelease`/`assembleRelease` when the four
  properties are missing — copy it. (Use `providers.gradleProperty(...).orNull`,
  never the raw provider: a Provider is always truthy in Groovy.)
- Play App Signing holds the real signing key; the local `.jks` is only the upload
  key. Verify a finished AAB with `jarsigner -verify`.

## Play Console upload — two-phase, always

Attaching a bundle inside the create-release wizard races the upload: click through
too early and Play saves an **empty release**, which deactivates the previous bundle
and leaves testers with nothing (RSD shipped exactly that on 2026-09-30, and again
in v1.0.2/v1.0.3).

1. **Library first.** Track → *App bundles* → upload the `.aab` → stay until the row
   shows the right versionCode and **Processed** (min/target SDK filled).
2. **Attach from the library.** *Edit release* → *Add app bundle* → pick the
   processed artifact. Instant, nothing left to fail.
3. **Green lights before saving.** "New app bundles" lists the new code (not "will
   be shown here"), size/time-to-download populated, and the device-diff table shows
   no mass −100 % (−100 % everywhere = an empty release).
4. **Then** release name + notes → Save → re-verify the summary still shows the
   bundle. Test tracks publish on save.

**Wrong-file guard.** Filenames differ by one character and the file picker serves
yesterday's download. Move rejected artifacts to `android-builds/rejected/`, clear
stale copies from `~/Downloads`, read the filename before dropping. To check what a
file really is: `aapt dump badging x.apk`; for an AAB the versionCode is inside the
manifest protobuf (`unzip -p x.aab base/manifest/AndroidManifest.xml | xxd`).

Expected, ignorable: "no deobfuscation file" (true with `minifyEnabled false`).

## The TV channel

If the TV track is submitted, Play's TV quality bar applies to the *same* AAB —
these are RSD's proven requirements:

- `<uses-feature android:name="android.software.leanback" android:required="false" />`
  **and** `android.hardware.touchscreen` `required="false"`. Both `false` means "also
  runs on a TV", not "needs a TV"; required would drop every phone from the listing.
- A `LEANBACK_LAUNCHER` intent-filter on `MainActivity` — without it the app is
  absent from the TV home screen and the TV Play Store no matter how good the D-pad
  layer is.
- A 320×180 banner at `res/drawable-xhdpi/tv_banner.png`, declared as
  `android:banner`, plus TV screenshots (16:9) in the Console.
- **Never lock orientation in the manifest.** A portrait lock disqualifies the TV
  submission; RSD decides orientation in `MainActivity` (portrait on phone-width,
  free on TV/tablets). RIOTSRADIOS' TV layout is landscape, so it needs no lock at
  all.
- D-pad focus must be visible and the remote's media keys must work — that is
  already implemented in `App.jsx`; keep it working while adding native chrome.

## Play Console declarations (this build)

No ads, no purchases, no accounts — so most of RSD's hard answers collapse to "No".
Answer what the app actually does.

| Form | Answer |
|---|---|
| Privacy policy | **Required even though nothing is collected.** Serve one from a public repo's Pages site (RSD's pattern) and never change the URL, only the text |
| Sign-in details (was App access) | **No** — no account, no login, nothing restricted |
| Ads | **No** |
| In-app purchases | **No** |
| Advertising ID | **No** — no ads SDK, so the permission is absent too |
| Data safety | **No data collected, no data shared.** The app has no analytics, no crash SDK, no accounts; `data/health.json` is a build-time snapshot shipped in the bundle |
| Content rating (IARC) | No UGC between users, no chat, no interaction: the station catalog and EPG files are curated in this repo via PRs, not in-app. Declare the third-party audio honestly, and answer **Users Interact = No** |
| Category | **Music & Audio** (never Casino, never News) |
| Target audience | 13+/18+, **not** "Designed for Families" |
| News app / COVID / government / financial / health | No / No / No / None / No |
| Sensitive permissions | `INTERNET` only |

Two honest caveats to put in the policy text so a reviewer cross-checking it is not
surprised: the streams are **third-party servers** that see the listener's IP like
any web request, and the web build loads fonts from Google Fonts (self-hosting them
before launch removes even that).

## First-upload critical path

1. Play Console account ($25, identity verification) + Android SDK on the machine.
2. Keystore + signing config + fail-fast guard → first signed AAB.
3. Privacy policy page live and loadable in a private window.
4. Store listing: icon 512×512 with alpha, feature graphic 1024×500 (JPEG/24-bit
   PNG, no alpha), phone screenshots ≥2 at **max 2:1** (1260×2520 is the safe
   format — RSD's 390×844 shots were rejected at 2.16:1), plus TV shots if the TV
   track is submitted.
5. Internal track: install **from Play**, not adb.
6. **Closed test: ≥12 testers × 14 continuous days** for personal accounts —
   over-recruit 15–18, one opt-out resets the clock.
7. Production access review → staged rollout 20 % → 50 % → 100 %.

## Guard rails

- `--base=./` + `dist-android/` for Android; `dist/` stays the Pages artifact.
- `targetSdk 36` (mandatory since 31 Aug 2026); Capacitor 8 defaults to it.
- Web builds must keep working with no native code: never import a plugin at module
  top level — gate on `window.Capacitor?.isNativePlatform()` and lazy-import.
- Commit or deliberately stash unrelated work before a release build, so the shipped
  version is reproducible.
- Two changelogs, two audiences: `CHANGELOG.md` is changesets' technical log,
  `RELEASE.md` is the player copy — see the [`release-notes` skill](../release-notes/SKILL.md).
- Catalog, health and EPG rules are the [`stations-epg` skill](../stations-epg/SKILL.md).

## Open decisions before the first upload

- **Car support (Android Auto / AAOS)**: the full plan is
  [`docs/ANDROID-AUTO.md`](../../../docs/ANDROID-AUTO.md). It decides that a
  Media3 `MediaLibraryService` — not the WebView `<audio>` element — must own
  playback from the first APK onward, which also settles background playback.

- **Background playback**: foreground service + media session (see above). Nothing
  else gives screen-off listening, and Android requires the notification.
- **Whether the TV track is submitted with the phone track or later.** It changes the
  asset list (banner + TV screenshots) and the Console forms.
- **Whether the web build keeps its own release cadence.** changesets currently
  releases the site; the same version number must reach the AAB, so one release
  order has to win.
