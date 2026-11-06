# RIOTSRADIOS on Google Play — one file, start to finish

Everything needed to publish this app: the commands, the exact values to paste
into every Console form, the listing text, the two-phase upload order, and what
to do on the release after this one. Nothing here is optional reading — work
top to bottom.

**State right now:** the signed AAB exists, the privacy policy is live and the
store graphics exist. Two things are still missing before you can upload:
**phone screenshots** and a **contact email**. Everything else is done.

If `com.mrhumildad.riotsradios` already appears in the Console, skip step 3 —
the rest of the order does not change.

**Definition of done:** the app is live in production at 100 %.

---

## 0. What is already done (do not redo)

| Thing | Where it lives |
|---|---|
| Upload key | `~/keystores/riotsradios-upload.jks`, alias `riots-upload`, RSA 4096, valid until 2054 |
| Key passwords | `~/keystores/riotsradios-upload-credentials.txt` (back it up twice) |
| Gradle credentials | `RIOTS_UPLOAD_*` in `~/.gradle/gradle.properties` (never in the repo) |
| Signed artifacts | `android-builds/riotsradios-v1.2.0.aab` (7.1 MB) and `.apk` (7.4 MB) |
| Privacy policy | live at `https://mrhumildad.github.io/riotsradios/privacy.html` |
| Store icon | `store/icon-512.png` — 512×512, 32-bit PNG |
| Feature graphic | `store/feature-graphic-1024x500.png` — 1024×500, RGB, no alpha |
| Android TV | leanback features + `LEANBACK_LAUNCHER` + banner, all inside the same AAB |
| Fonts | self-hosted woff2; the app makes no request except the stream |

Verify the key still opens before trusting any of it:

```bash
keytool -list -keystore ~/keystores/riotsradios-upload.jks -alias riots-upload
```

---

## 1. The two things left before uploading

### 1a. Contact email

Play requires one on the store listing; it becomes public. Put the address you
are willing to receive user mail at into the *Store listing → Contact details*
form. The policy page points at the issue tracker instead — that is fine for the
policy, but the Console field will not accept it.

### 1b. Phone screenshots (at least 2)

Play's rule that trips everyone: **maximum aspect ratio 2:1**. A raw 390×844
phone capture is 2.16:1 and gets rejected. Use 1260×2520, or crop.

Take three, in this order of usefulness:

1. Player with a station playing — amber CRT display, spectrum live.
2. Station list, several stations visible.
3. The guide (EPG) modal open.

```bash
# If you capture on a phone and need 1260x2520, resize without distorting:
# (any tool works — this is the ratio Play enforces, not the pixel count)
```

Screenshots have to come off a device running this build. There is no emulator
wired up in this repo.

---

## 2. Build the uploadable bundle

The artifact already sitting in `android-builds/` is current. Rebuild only if
the source changed since `versionCode 1` was cut.

```bash
npm run validate:stations     # catalog gates; a bad row cannot ship
npm test                      # unit tests

# First upload: keep versionCode 1, nothing has been uploaded yet.
node scripts/release-android.mjs --no-bump

ls -la android-builds
# android-builds/riotsradios-v1.2.0.aab
# android-builds/riotsradios-v1.2.0.apk
```

What the script does, in order: `android:sync` (cleartext config, spectrum
bands, Vite build into `dist-android/`, `cap sync`) → `bundleRelease` **and**
`assembleRelease` in one Gradle run → export, which checks that the APK's
`output-metadata.json` matches `package.json` and the Gradle `versionCode`, that
the APK is not older than the AAB, and that the AAB carries a signature.

`bundleRelease` alone is the classic way to ship yesterday's APK renamed as
today's version. Never call it by itself.

Expected values in the bundle:

```
package name   com.mrhumildad.riotsradios
versionCode    1
versionName    1.2.0
minSdk         24
targetSdk      36
signer         CN=RIOTSRADIOS, OU=Upload
```

---

## 3. Console → Create app

If the Console already shows `com.mrhumildad.riotsradios`, skip to step 4.

| Field | Paste |
|---|---|
| App name | `RIOTSRADIOS - Community Radio` *(29/30)* |
| Package name | `com.mrhumildad.riotsradios` *(permanent — paste, never type)* |
| Default language | `English (United States) – en-US` |
| App or game | **App** |
| Free or paid | **Free** *(cannot become paid later)* |

Declarations: tick **both** boxes (Developer Program Policies, US export laws).

The package name can never be changed or reused, and must be byte-identical to
`applicationId` in `android/app/build.gradle`, or the upload fails with
"package name does not match".

---

## 4. Console → Store listing

### App name

```
RIOTSRADIOS - Community Radio
```

### Short description (66 / 80 characters)

```
43 independent community radio stations. Free, no ads, no account.
```

### Full description (1,225 / 4,000 characters)

```
RIOTSRADIOS is a free tuner for independent, community and non-commercial radio — the stations that still sound like something.

No account. No ads. No trackers. Open it, pick a station, listen.

WHAT YOU GET
• 40+ hand-picked stations from around the world
• Retro amber-CRT interface that stays out of the way of the music
• A real audio spectrum where a station allows it, clearly labelled SIM where it does not
• Now-playing guide for the stations that publish a schedule
• Background playback with a proper media notification: lock the screen, the stream keeps going
• Android TV ready — D-pad focus, remote media keys, a large-screen layout
• No sign-in, no feed, no recommendations to tune

YOUR LISTENING STAYS YOURS
Streams load straight from the broadcasters' own servers. The app has no analytics, no crash reporting, no advertising ID and no account, and your listening is never sent anywhere. Full policy: mrhumildad.github.io/riotsradios/privacy.html

REMOTE AND KEYBOARD
← → previous / next station · ↑ ↓ volume · Enter play or stop · E opens the guide · Back closes it. Media keys work too.

RIOTSRADIOS is an independent, non-commercial project. The station catalog is public and grows through contributions.
```

The "43" is real: `stations.csv` has 85 rows, 42 flagged `stream_broken`
(hidden at runtime), leaving 43 playable. Re-check that before changing the copy.

### Graphics

| Console slot | Upload this | Play's rule |
|---|---|---|
| App icon | `store/icon-512.png` | 512×512, 32-bit PNG, ≤ 1 MB |
| Feature graphic | `store/feature-graphic-1024x500.png` | 1024×500, JPEG or 24-bit PNG, **no alpha** |
| Phone screenshots | step 1b | ≥ 2, max aspect 2:1 |
| TV screenshots | only if submitting the TV track | 16:9, 1280×720 or 1920×1080 |

Both graphics are generated, never hand-edited:

```bash
npm run assets:store          # rewrite store/icon-512.png + feature graphic
npm run assets:store:check    # fail if either drifted from the brand art
```

---

## 5. Console → Declarations

Answer these exactly; they are true for this build.

| Form | Answer |
|---|---|
| Privacy policy | `https://mrhumildad.github.io/riotsradios/privacy.html` |
| App access (sign-in details) | **No** — no login, nothing restricted |
| Ads | **No** |
| In-app purchases | **No** |
| Advertising ID | **No** — no ads SDK, permission absent |
| Data safety | **No data collected, no data shared** — no analytics, no crash SDK, no accounts; `data/health.json` is a build-time snapshot |
| Content rating (IARC) | No UGC, no chat, no user interaction → **Users Interact = No**; declare the third-party audio honestly |
| Category | **Music & Audio** |
| Target audience | 13+ / 18+, **not** Designed for Families |
| News / COVID / government / financial / health app | No / No / No / None / No |
| Permissions declared | `INTERNET`, `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_MEDIA_PLAYBACK`, `POST_NOTIFICATIONS` |

Privacy URL must load in a private window. It does — verified 200, no Google
Fonts mention, self-hosted fonts served.

---

## 6. Upload — internal testing, two phases

Attaching a bundle inside the create-release wizard races the upload. Click
through too early and Play saves an **empty release**, which deactivates the
previous bundle and leaves testers with nothing. Always:

1. **Testing → Internal testing → App bundles → Upload.** Drop
   `android-builds/riotsradios-v1.2.0.aab`. Stay on the page until the row
   reads **Processed** and shows `versionCode 1`, minSdk 24, targetSdk 36.
2. **Track → Create new release → Add app bundle →** pick the processed artifact
   from the library. It attaches instantly because it is already stored.
3. **Check the green lights** before saving:
   - "New app bundles" lists the bundle (not "will be shown here").
   - Size and time-to-download are populated.
   - The device-diff table shows no mass **−100 %** (that means an empty release).
4. Release name + release notes → **Save** → re-read the summary and confirm the
   bundle is still listed.
5. **Testers** tab → add your testers list → copy the opt-in URL.
6. Install **from Play**, on a device that has never had the app. Not adb.

Release notes for this first upload — `RELEASE.md` does not exist yet, so write
them inline; keep it to what a listener notices:

```
First Play release of RIOTSRADIOS: 40+ independent stations, now-playing guide,
background playback with a media notification, and a full Android TV layout.
No ads, no account, nothing tracked.
```

Then check on a real phone, not just the Console: cold start, play, **screen off
for 10 minutes** (audio continues, notification stays), stop (notification gone),
rotate, airplane mode (error copy, no hang), and on a TV/D-pad device: focus ring
visible, remote media keys work, tile present on the home screen.

---

## 7. Closed testing

- Personal developer accounts: **12 testers × 14 continuous days**. Recruit
  15–18; one opt-out can reset the clock.
- This gate is **per app** — the other app on the account does not cover it. If
  the Console shows no such requirement for this package, take the screen at its
  word and continue.
- Testers must actually open the app across the 14 days; Play looks at
  engagement, not enrolment alone.
- The track reads **Inactive** until a release is rolled out on it. That is the
  normal state, not an error — it turns active at the end of step 6.

### 7a. Testers and feedback — the two fields that bite

Use the **Email lists** tab. It needs no setup and takes up to 100 addresses,
comma-separated. Twelve distinct Google accounts is all the gate wants.

- Do **not** pad the list with plus-addresses (`you+1@gmail.com`): Play counts
  accounts, not addresses, and aliases do not count towards the twelve.
- The **Google Groups** tab only works for a group that already exists and that
  the Play account can see. The field wants the group's *address*,
  `name@googlegroups.com` — not the `groups.google.com/g/name` web URL. A URL
  pasted there is the usual cause of "This Google Group doesn't exist or you
  don't have access to it".
- **Feedback URL or email address** is where testers send you bug reports. Put
  the contact email from step 1a. It is not a second home for the group link.

---

## 8. Production

1. Apply for **production access**: what you tested, what feedback came back,
   what you fixed.
2. Upload the production bundle with the same two-phase rule from step 6, and
   confirm the summary shows it before saving.
3. Staged rollout **20 % → 50 % → 100 %**, watching crash-free rate and
   "background playback stops" reports.
4. Note the shipped `versionCode` (tag the commit if you like) so the next upload
   never reuses it.

---

## 9. The release after this one

`versionName` is owned by changesets via `package.json`; `versionCode` is owned
by the release script. They never fight.

```bash
npx changeset                 # describe the change
npx changeset version         # bumps package.json → new versionName
npm run release:android       # sync → versionCode +1 → bundle+assemble → export
```

Then repeat step 6 with the new `.aab` from `android-builds/`.

Rules that do not bend:

- **`versionCode` never repeats.** Every upload needs a fresh one, including a
  re-upload after a rejected review — an upload that merely registers burns the
  number.
- **Never call `bundleRelease` alone.** `npm run android:bundle` runs it with
  `assembleRelease` in one Gradle run, which is what keeps the APK from being
  yesterday's.
- **Read the filename before dropping the file.** One character apart, and the
  file picker happily serves an old download. Move rejected artifacts to
  `android-builds/rejected/` and clear `~/Downloads`.
- **Keep `android-builds/` and `*.jks` out of git.** Both are in `.gitignore`.

---

## 10. Troubleshooting

| Message | Cause | Fix |
|---|---|---|
| "The package name... does not match" | AAB built with another `applicationId` | rebuild from this repo; it must be `com.mrhumildad.riotsradios` |
| "Version code N has already been used" | reused a `versionCode` | `npm run release:android` bumps it; never hand-edit backwards |
| Release saved with no bundle / testers lost access | bundle attached inside the wizard | delete the release, redo step 6 in two phases |
| "No deobfuscation file" | `minifyEnabled false` | expected, ignore |
| Screenshot rejected: aspect ratio | 390×844 = 2.16:1 | export at 1260×2520 |
| Feature graphic rejected | alpha channel | use the generated RGB file |
| AAB rejected as unsigned | `RIOTS_UPLOAD_*` missing | check `~/.gradle/gradle.properties`; the Gradle guard should have blocked the build |
| Privacy URL 404s | Pages deploy is lagging (minutes), or the workflow failed | check the `gh-pages` branch has `privacy.html`; redeploy with `npm run deploy` |
| Icon looks like the stock Capacitor logo | icons not regenerated | `npm run assets:android` then rebuild |
| "This Google Group doesn't exist or you don't have access to it" | a `groups.google.com/g/...` URL pasted where the group *address* belongs, or the group was never created / is not visible to this Play account | cleanest: use an **email list** and skip groups; otherwise create the group at groups.google.com/create and enter `name@googlegroups.com`, with your Play account as owner |
| Feedback field holds a group link | that field expects somewhere testers can reach you | put the contact email from step 1a |

---

## 11. File map

```
android-builds/                     release artifacts (git-ignored)
store/icon-512.png                  Play icon
store/feature-graphic-1024x500.png  Play feature graphic
public/privacy.html                 live policy page
docs/PLAY-STORE-LAUNCH.md           this file
docs/ANDROID-AUTO.md                Media3 playback + service architecture
docs/CORS-IN-APP.md                 app-only http stations / cleartext config
docs/SPECTRUM-ANDROID.md            real spectrum inside the app
.agents/skills/play-release/SKILL.md  the procedure this file follows
.agents/skills/stations-epg/SKILL.md  catalog + EPG rules
.agents/skills/release-notes/SKILL.md player-facing release notes
scripts/release-android.mjs          sync → versionCode+1 → build → export
scripts/export-android.mjs           version/signature checks + copy
scripts/generate-store-assets.py     Play graphics from brand art
scripts/generate-android-assets.py   launcher icons, splash, TV banner
```
