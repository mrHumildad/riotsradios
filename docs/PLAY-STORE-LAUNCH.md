# Play Store launch — working checklist

Publishing RIOTSRADIOS on Google Play **next to** the GitHub Pages build (both
channels ship; neither replaces the other). Free app, no ads, no purchases, no
accounts. Phone track first, Android TV track decided separately.

Source of truth for the procedure: [`.agents/skills/play-release/SKILL.md`](../.agents/skills/play-release/SKILL.md).
This file is the executable order of that procedure, with what the repo already
does ticked off.

**Definition of done:** a signed AAB uploaded to the Play Console from a
`release:android` build, every declaration answered, closed test completed, and
the app live in production at 100 %.

## If your developer account already has a live app

An existing published app settles the account side — and almost nothing about
*this* app:

- **Already done, skip:** the $25 registration, identity and phone verification,
  the developer profile, and payments/tax (irrelevant here anyway — free, no ads,
  no IAP). The Console itself is familiar ground, so the declarations go fast.
- **Still per-app, cannot be inherited:** the upload key (**one key per app** —
  never reuse the other app's `.jks`), the listing and its graphics, the Data
  safety form, the content-rating questionnaire, the target-audience and ads
  declarations, and — on a personal account — the closed test and production
  access review for this app.
- **Free template:** copy the wording you already got approved for the other app,
  but re-answer Data safety and content rating from what *this* app does (audio
  only, no ads, no accounts, no user interaction).
- **Skip the account line in Phase 0 and the "Create app" line in Phase 3** if
  `com.mrhumildad.riotsradios` already exists in the Console.

If RIOTSRADIOS itself is already live (shipped from another machine or repo),
then Phases 1–3 are history: go straight to Phase 6 for the next update.

## Where the repo stands today

| Thing | State |
|---|---|
| Capacitor 8, `android/`, `appId com.mrhumildad.riotsradios` | ✅ done |
| M0 shell APK, M1 Media3 playback + foreground service | ✅ done (`docs/ANDROID-AUTO.md`) |
| `npm run android:sync` / `android:build` (debug) | ✅ done |
| `versionName` read from `package.json`, `targetSdk 36`, `minSdk 24` | ✅ done |
| Android launcher icons generated (`scripts/generate-android-assets.py`) | ✅ done |
| Signing config + upload keystore | ✅ done — `~/keystores/riotsradios-upload.jks`, credentials in `~/.gradle/gradle.properties`, fail-fast guard in `build.gradle` |
| `android:bundle`, `android:export`, `release:android` | ✅ done — `scripts/export-android.mjs`, `scripts/release-android.mjs` |
| `versionCode` policy | ✅ `release:android` bumps it by one; the first AAB is `versionCode 1` |
| TV manifest bits (leanback, banner, TV intent-filter) | ✅ done — banner from `assets:android` |
| Privacy policy URL | ✅ `public/privacy.html` → `https://mrhumildad.github.io/riotsradios/privacy.html` (live after the next Pages deploy) |
| Store listing copy + graphics | ❌ missing |

## Phase 0 — accounts and machine (do first, longest lead time)

- [x] Play Console developer account — already have one with a live app, so the
      $25 payment, identity verification and D-U-N-S number do not apply again.
- [x] Android SDK installed and `./gradlew` works in `android/`
      (`sdk.dir` in `android/local.properties`, SDK 36 + build-tools 36.1.0).
- [ ] Decide: **TV track now or later?** It changes the asset list (banner + TV
      screenshots) and the Console forms. Phone-only first is the cheaper launch.
- [ ] Decide: **who owns the release version.** changesets already owns
      `package.json` (`npm run release` for the web); the AAB must be cut after
      that version is final and must not bump it again.
- [ ] Commit or stash the current working tree so the first release build is
      reproducible (`git status` is dirty today).

## Phase 1 — finish the Android build pipeline (all code work, no Console)

### Signing (one-time, permanent)

- [x] Create the upload keystore **outside the repo**, e.g.
      `~/keystores/riotsradios-upload.jks`, alias `riots-upload`:
      `keytool -genkeypair -v -keystore ~/keystores/riotsradios-upload.jks -alias riots-upload -keyalg RSA -keysize 4096 -validity 10000` —
      done, RSA 4096, valid until 2054, password in
      `~/keystores/riotsradios-upload-credentials.txt`.
- [ ] Back it up twice (password manager + offline media) and verify a copy
      opens: `keytool -list -v -keystore … -alias riots-upload`.
- [x] Put `RIOTS_UPLOAD_STORE_FILE`, `RIOTS_UPLOAD_KEY_ALIAS`,
      `RIOTS_UPLOAD_STORE_PASSWORD`, `RIOTS_UPLOAD_KEY_PASSWORD` in **user-level**
      `~/.gradle/gradle.properties` — never in the repo.
- [x] Add `*.jks`, `*.keystore`, `android-builds/`, `android/local.properties` to
      `.gitignore` as a backstop.
- [x] `android/app/build.gradle`: add `signingConfigs.release` reading those four
      properties, wire it into `buildTypes.release`, and add the **fail-fast
      guard** (`doFirst` on `bundleRelease`/`assembleRelease` that throws when a
      property is missing — Gradle otherwise emits an unsigned AAB silently).
- [ ] Optional: `applicationIdSuffix ".debug"` + `versionNameSuffix "-debug"` on
      the debug build so adb builds install next to the Play copy.

### Release scripts

- [x] `android:bundle` → `android:sync && cd android && ./gradlew bundleRelease assembleRelease`
      (both tasks in **one** Gradle run; `bundleRelease` alone leaves a stale APK
      behind).
- [x] `android:export` → copy to `android-builds/riotsradios-v<version>.{aab,apk}`
      after checking `output-metadata.json` versionName/versionCode match
      `package.json` and the Gradle file, plus a signature check
      (`jarsigner`, falling back to `keytool -printcert -jarfile`).
- [x] `release:android` → sync → `versionCode` +1 → bundle+assemble → export →
      print the AAB path. No `versionName` bump (changesets owns it).
      `--no-bump` rebuilds the current versionCode for a first upload.
- [x] `android:icons` → regenerate `mipmap-*` + `res/drawable-xhdpi/tv_banner.png`
      from one source image (alias of `assets:android`).

### Web → Android traps (check in `dist-android/index.html`, not the source)

- [ ] `--base=./` into `dist-android/` — already how `build:android` runs; confirm
      the built HTML has **no** `/riotsradios/` absolute paths.
- [ ] `<link rel="icon">` / `rel="manifest"` in `index.html`: rebase with
      `%BASE_URL%…` or drop them from the Android build (public paths are not
      rebased and 404 behind the WebView).
- [ ] `App.jsx` logo import: `import logoPng from '/logob_transp_ffc107.png'` is
      the same bug — import it relatively or via `import.meta.env.BASE_URL`.
- [x] Self-host the two Google Fonts (`Abril Fatface`, `Space Mono`) as woff2 —
      done: `assets/fonts/*-latin.woff2` + `@font-face` in `styles.css`, no CDN
      link left in `index.html`, so first launch with no network keeps its
      letterforms.
- [ ] Confirm the `androidScheme: "http"` choice in `capacitor.config.json`: it is
      what `data/cleartext-hosts.json` + `cleartext:config` rely on for app-only
      http stations. Do not flip it without re-probing (see `docs/CORS-IN-APP.md`).
- [ ] Re-probe CORS from the app's own origin (`data/health.json` was measured
      from `https://mrhumildad.github.io`), and confirm `cors: "origin"` stations
      still show a real spectrum in the app.

### TV channel (skip only if the TV track is not submitted)

- [x] `<uses-feature android:name="android.software.leanback" android:required="false" />`
      **and** `android.hardware.touchscreen` `required="false"` in the manifest.
- [x] `LEANBACK_LAUNCHER` intent-filter on `MainActivity`.
- [x] 320×180 `res/drawable-xhdpi/tv_banner.png` + `android:banner` on
      `<application>` — generated by `npm run android:icons` from
      `public/splash-logo.png`, so it cannot drift from the launcher icons.
- [x] No orientation lock anywhere in the manifest (a portrait lock disqualifies
      the TV submission); `MainActivity` decides orientation instead.
- [ ] D-pad focus ring visible and remote media keys working on a real device /
      emulator with a D-pad.

### Policy page

- [x] Write the privacy policy (nothing collected; third-party streams see the
      listener's IP; no analytics, no crash SDK, no accounts) and host it at a
      **stable public URL** that loads in a private window. Never change the URL
      later, only the text. — `public/privacy.html`, deployed by the existing
      Pages workflow. Every asset it lists as bundled really is bundled, so the
      only network request the page now discloses is the stream itself.

## Phase 2 — first signed artifacts

- [ ] `npm run validate:stations && npm test` green.
- [x] First signed artifacts built by `npm run android:bundle && npm run android:export`:
      `android-builds/riotsradios-v1.2.0.aab` (7.1 MB) and `.apk` (7.3 MB),
      `versionCode 1`.
- [x] Signature checked — certificate `CN=RIOTSRADIOS, OU=Upload` in the AAB, and
      `aapt2 dump badging` reports `com.mrhumildad.riotsradios` / `versionCode 1` /
      `targetSdk 36`.
- [ ] Install the APK on a real phone (not just an emulator): cold start, play,
      **screen off for 10 min** (audio keeps going, notification shows), stop
      (notification gone, socket closed), rotate, airplane mode → error copy.
- [ ] Install the debug APK side by side (if the suffix is set) and confirm both
      coexist.

## Phase 3 — Play Console setup

- [ ] **Create app** (skip if `com.mrhumildad.riotsradios` is already in the
      Console). Values for the form:

  | Field | Value |
  |---|---|
  | App name | `RIOTSRADIOS - Community Radio` — 29/30 chars; `RIOTSRADIOS` (11) is the safe fallback |
  | Package name | `com.mrhumildad.riotsradios` — permanent, must match the AAB's `applicationId` exactly |
  | Default language | `English (United States) – en-US` |
  | App or game | **App** |
  | Free or paid | **Free** — irreversible once published |
  | Declarations | tick both: Developer Program Policies + US export laws |

      The package name cannot be changed or reused after creation: it is what the
      Console matches against `applicationId` in `android/app/build.gradle`, so a
      bundle built with any other id fails the upload with "package name does not
      match". The store title, by contrast, can be edited later; it does not have
      to equal the launcher label (`strings.xml` → `app_name`), though keeping them
      close avoids confusing existing users.
- [ ] **Store listing**
  - [ ] App name ≤ 30 chars, short description ≤ 80, full description ≤ 4000.
  - [ ] Icon 512×512 PNG with alpha (≤ 1 MB).
  - [ ] Feature graphic 1024×500 JPEG or 24-bit PNG, **no alpha**.
  - [ ] Phone screenshots ≥ 2, 16:9 or 9:16, **max aspect 2:1** (1260×2520 is
        the safe format; 390×844 shots are rejected at 2.16:1).
  - [ ] TV screenshots 16:9 (1280×720 / 1920×1080) + banner, if the TV track is in.
  - [ ] Release note copy in `RELEASE.md` (see the [`release-notes` skill](../.agents/skills/release-notes/SKILL.md)).
- [ ] **Declarations** (all "No" except where noted)
  - [ ] Privacy policy URL (required even though nothing is collected).
  - [ ] App access: no login, nothing restricted.
  - [ ] Ads: No. In-app purchases: No. Advertising ID: No.
  - [ ] Data safety: **no data collected, no data shared** (justify: no analytics,
        no crash SDK, no accounts; `data/health.json` is a build-time snapshot).
  - [ ] Content rating (IARC): no UGC, no chat, no user interaction → Users
        Interact = No; declare third-party audio honestly.
  - [ ] Category **Music & Audio**; target audience 13+/18+, not
        "Designed for Families"; not a news / COVID / government / financial /
        health app.
  - [ ] Permissions: `INTERNET` (+ `FOREGROUND_SERVICE*`, `POST_NOTIFICATIONS` for
        background playback — these need no special declaration but must match the
        Data safety form).
- [ ] **App signing**: accept Play App Signing for this app — a **new** upload
      key, not the one behind your existing listing (the local `.jks` is only the
      upload key; Play holds the app-signing key).

## Phase 4 — test tracks

- [ ] **Internal testing** upload — two-phase, always:
      library first (upload `.aab`, wait for **Processed** with the right
      versionCode) → *Edit release* → *Add app bundle* → check the device-diff
      table shows no mass −100 % → release notes → Save.
- [ ] Install **from Play**, not adb, on a device that has never had the app.
- [ ] Fix whatever the internal build catches; **`versionCode` must increase** on
      every re-upload (a merely registered upload burns the number).
- [ ] **Closed testing**: recruit **15–18 testers** (12 minimum), run **14
      continuous days** (personal accounts; one opt-out can reset the clock). This
      gate is **per app**, not per account — the other app's closed test does not
      cover this one. If the Console shows no such requirement for this app, take
      the screen at its word and skip ahead.
- [ ] Keep testers actually opening the app during the 14 days — Play checks
      engagement, not just enrollment.

## Phase 5 — production

- [ ] Apply for **production access** (describe the testing, the feedback, the
      fixes).
- [ ] Upload the production AAB (same two-phase rule) and review the summary shows
      the bundle before saving.
- [ ] Staged rollout **20 % → 50 % → 100 %**, watching crash-free rate and the
      "background playback dies" reports.
- [ ] Tag the released commit and note the shipped `versionCode` so the next
      upload never reuses it.

## Phase 6 — after launch

- [ ] Keep the daily health probe (`.github/workflows/health.yml`) shipping with
      each new AAB, or stream badges drift from what the app shows.
- [ ] Second changelog discipline: `CHANGELOG.md` = changesets, `RELEASE.md` =
      player-facing notes.
- [ ] Every future release: bump via changesets → `npm run release:android` →
      `versionCode` +1 → two-phase upload. Never re-use a `versionCode`, never
      hand-edit the AAB filename.
- [ ] Move rejected artifacts to `android-builds/rejected/`, clear
      `~/Downloads` of stale copies, and read the filename before dropping it in
      the Console.

## Known-good references

- Procedure and trap list: [`.agents/skills/play-release/SKILL.md`](../.agents/skills/play-release/SKILL.md)
- Playback/service architecture: [`docs/ANDROID-AUTO.md`](ANDROID-AUTO.md)
- Real spectrum in the app: [`docs/SPECTRUM-ANDROID.md`](SPECTRUM-ANDROID.md)
- Cleartext/app-only stations: [`docs/CORS-IN-APP.md`](CORS-IN-APP.md)
- Catalog + EPG rules: [`.agents/skills/stations-epg/SKILL.md`](../.agents/skills/stations-epg/SKILL.md)
