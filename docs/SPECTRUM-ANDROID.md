# A real spectrum analyzer on Android — options, 2026-11-02

Short answer: **yes, there is a way, and it does not need a microphone.** Tap the
decoded PCM inside the Media3 player with an `AudioProcessor`, run a 1024-point
FFT in Kotlin, and push 24 band levels to the WebView at 30 fps. That keeps the
existing amber-CRT canvas (`comp/useSpectrum.js`), needs no new permission, and
works for **every** station — including the ones that show `SIM` today because
their server sends no `Access-Control-Allow-Origin`.

**Status 2026-11-02 (M1 landed):** `SpectrumTap` is installed on
`RiotMediaService`'s audio sink, `RiotsPlaybackPlugin.isNativePlaybackAvailable()`
answers `true`, and `logic.js` switches to `lib/nativeSpectrum.js` whenever the
native engine is in use — so the bars come from the decoder, for every station.
The web build keeps Web Audio untouched. Not yet verified on hardware: cadence,
underruns and screen-off behaviour still need a device pass.

Everything below is written against the playback architecture already decided in
[`ANDROID-AUTO.md`](ANDROID-AUTO.md) §3 (Media3 `MediaLibraryService` owns the
audio; the WebView is a remote control). It corrects that document's §15, which
assumed a native player means no real spectrum.

---

## 1. What "real spectrum" means in this repo today

```
<audio> → MediaElementSource → AnalyserNode → GainNode → destination
```

| Setting | Value | Where |
|---|---|---|
| Bands | 24, log-spaced **40 Hz – 16 kHz** | `lib/audioBands.js` |
| FFT size | 1024 (512 bins) | `lib/spectrumAnalyzer.js` |
| Analyser smoothing | 0.8 | `lib/spectrumAnalyzer.js` |
| dB window | −90 … −10 | `lib/audioBands.js` |
| JS smoothing / peaks | 0.35 decay, 0.01 peak fall | `comp/useSpectrum.js` |
| Draw rate | 30 fps, canvas 2D | `comp/useSpectrum.js` |
| Silence → `SIM` | after 1500 ms of `null` reads | `comp/useSpectrum.js` |
| Gate in the app | `canAnalyze` = health says `cors: "any"` | `logic.js` |

Two properties matter for the port: the **band maths is pure JS**
(`bandEdges`, `frequencyToBands`, `dbToUnit`) and the **UI only needs 24 floats
at 30 fps**. Nothing about the visual depends on Web Audio itself.

## 2. The hard constraint

Once `ExoPlayer` owns playback there is no `<audio>` element left to hand to
`createMediaElementSource`, and Web Audio cannot reach another engine's output.
The Media3 maintainer answered exactly this in
[androidx/media#3028](https://github.com/androidx/media/issues/3028) (Jan 2026):

> the raw decoded audio (or video) data does not flow directly from the session
> to the controller … If you control the session side … you can try writing an
> `AudioProcessor` for your needs — but this cannot be attached via
> `MediaController`, only directly to the `ExoPlayer` instance.

The framework's own `android.media.audiofx.Visualizer` is the only other
sanctioned path, and its documentation says plainly:

> to protect privacy of certain audio data (e.g voice mail) the use of the
> visualizer requires the permission `android.permission.RECORD_AUDIO`.

So the real choice is: **tap PCM in-process (no permission)** or **ask the user
for the microphone to draw bars**. There is no third party to ask.

## 3. The options, side by side

| # | How it gets samples | Permission | Stations it fixes | Bars when screen off | Effort | Verdict |
|---|---|---|---|---|---|---|
| **S1** | Media3 `AudioProcessor` tap → FFT in Kotlin | **none** | **all 42** | yes (service keeps decoding) | 2–3 d | **do this** |
| S2 | `android.media.audiofx.Visualizer` on the player's audio session | `RECORD_AUDIO` (runtime, dangerous) | all, where the device supports it | sometimes | 1–2 d + Play review | last resort |
| S3 | `AudioPlaybackCapture` + `MediaProjection` | `RECORD_AUDIO` + consent dialog per session | n/a (it captures *other* apps) | n/a | 2 d | never |
| S4 | Second, muted `<audio>` in the WebView, analysed and discarded | none | only CORS-friendly ones | no | 0.5 d | no |
| S5 | Ship PCM from Kotlin to JS, run the FFT in the WebView | none | all | no | 2 d | no |
| S6 | Web Audio while foreground, native engine in background | none | only CORS-friendly ones | yes (but restarts) | 3–4 d | only if M1 slips |
| S7 | Native canvas overlay fed by the S1 tap | none | all | yes | +1 d on S1 | optional variant |

## 4. S1 — PCM tap inside ExoPlayer (recommended)

### Where the samples come from

An `AudioProcessor` sits between the decoder and the audio sink, so it sees the
decoded, pre-volume PCM for as long as playback runs:

```kotlin
class SpectrumTap : BaseAudioProcessor() {
  override fun onConfigure(inputFormat: AudioProcessor.AudioFormat): AudioProcessor.AudioFormat =
    inputFormat                       // pass-through: never alter the samples

  override fun queueInput(inputBuffer: ByteBuffer) {
    copyToRingBuffer(inputBuffer)     // must not block: this is the playback thread
    super.queueInput(inputBuffer)     // forward untouched
  }
}
```

Install it wherever the Media3 version exposes the chain —
`DefaultRenderersFactory.buildAudioProcessors()` (append to the superclass
array) or `DefaultAudioSink.Builder.setAudioProcessorChain(...)` /
`.setAudioProcessors(...)` when the sink is built by hand. Either is a
one-line change to the player construction in `RiotMediaService`.

### Processing

1. **Downmix to mono** (average channels) and convert to float.
2. **Hann window**, then a **radix-2 1024-point FFT** — ~60 lines of Kotlin, or
   a tiny dependency; no need for anything heavier.
3. **Magnitude → dBFS**: `20 * log10(mag / (fftSize / 2))`, clamped to the
   existing −90 … −10 window. The absolute floor need not match
   `AnalyserNode` exactly; the shape is what the canvas shows, and a fixture
   test pins band-to-band relative levels.
4. **Fold to 24 log bands** using the same edges as `bandEdges(40, 16000)`.
   Generate the edge table at build time from `lib/audioBands.js` (e.g.
   `scripts/export-bands.mjs` → `res/raw/spectrum_bands.json`) so the two
   implementations cannot drift; a JVM test asserts the Kotlin table equals the
   JS output.
5. **Throttle to 30 fps**, FFT on a worker coroutine/Handler thread, and publish
   the last 24 floats.

### Getting it into the UI

The bridge surface stays as small as the playback one:

```kotlin
RiotsPlayback.addListener(...)      // already planned
// new event, ~30/s, 24 floats:
{ type: 'spectrum', levels: [0.12, 0.34, …] }
```

On the web side a new `lib/nativeSpectrum.js` implements the *same contract* as
`createSpectrumAnalyzer` (`read()`, `isConnected()`, `close()`, `ensure()`), so
`comp/useSpectrum.js` and `comp/PlayerDashboard.jsx` do not change at all:

```js
export function createNativeSpectrum({ bridge }) {
  let latest = null
  const off = bridge.addListener('spectrum', ({ levels }) => { latest = levels })
  return {
    ensure: () => true,
    read: () => latest,             // null while nothing has been decoded yet
    isConnected: () => Boolean(latest),
    setVolume() {},                 // volume is ExoPlayer.setVolume now
    close: off,
  }
}
```

`logic.js` picks the analyzer at mount next to the playback controller, and
**`canAnalyze` must stop being a CORS question on Android**: with native
playback every station is analyzable. That single change is also the visible
win — the 11 `cors_missing` rows and the four `http://` rows that only play in
the app (Radio Malva, Ké Huelga, Radio Libertaire, Radio Utopía) go from `SIM`
to real bars, which no amount of CORS probing could ever deliver.

### Traps

- **Never block in `queueInput`.** It runs on the playback thread; a 1024 FFT
  inline will underrun. Copy out, compute elsewhere.
- **Audio offload bypasses the processor chain.** Offload is off by default in
  Media3; do not enable it while the tap is attached, or the tap silently sees
  nothing and the UI drops to `SIM`.
- **Keep `SIM` as the honest fallback.** Silence, a stopped player, an error or
  a stream that decodes nothing must still show the pattern after the existing
  1500 ms — that is the same rule that covers a genuinely silent moment today.
- **Do not reuse the tap's buffer as a second output.** Pass `inputBuffer`
  straight through; any copied/modified output path is how audio glitches and
  drain mismatches get introduced.
- **Stop must clear the levels**, so the dashboard drops to zero instead of
  freezing at the last frame (`playbackController.js` §stop semantics).

### Tests

- JVM: 1 kHz sine lands in the band containing 1 kHz; silence → all zeros;
  white noise spreads across bands; band table equals `lib/audioBands.js`.
- JVM: `SpectrumTap` is transparent — output bytes equal input bytes.
- JS: `tests/nativeSpectrum.test.mjs` contract test with a fake bridge, same
  style as `tests/playbackController.test.mjs`.
- Device: 30 fps in WebView DevTools, no `AudioTrack` underruns in `logcat`,
  bars still move with the screen off, `stop` → bars to zero, airplane mode →
  `SIM` after the fallback window.

## 5. S2 — `android.media.audiofx.Visualizer` on the session

Attach to `player.audioSessionId`, set a capture size, receive `getFft(byte[])`.
It works on your own session, and it is the fastest path to *something* real.
The costs are the reason it is not the plan:

- **`RECORD_AUDIO`** — a dangerous, runtime-requested permission. Every user
  gets a microphone prompt to see bars, and the Play Console story changes from
  "no data collected" to explaining a sensitive permission in a radio player.
- **It measures the output mix**, not the stream: system volume, equaliser and
  OEM post-processing all shape the bars.
- **8-bit magnitudes**, one update per capture window (the platform clamps the
  requested capture rate to a few tens of hertz), 1024 max capture size — the
  40 Hz–100 Hz bands have almost no resolution.
- **It fails on real devices.** `initCheck() → ERROR_NO_INIT (-3)` on missing
  permission, some emulators and a long tail of OEM audio stacks — so the `SIM`
  fallback has to ship anyway.

Worth keeping in the back pocket as a **per-device fallback behind a toggle**
("enable microphone-based visualiser"), never as the default.

## 6. S3 — `AudioPlaybackCapture` + `MediaProjection`

Android 10's playback-capture API is built for copying *another* app's audio:
`RECORD_AUDIO`, an approved `createScreenCaptureIntent()` token, same user
profile, and a `mediaProjection` foreground service. Capturing your own
playback while projecting is not a supported contract, the token can be revoked
mid-session, and the user gets a system consent dialog — per session — to see
bars. Disqualified on UX alone; no prototype needed.

## 7. S4 — a second, muted `<audio>` in the WebView

The obvious zero-Kotlin trick: play the same URL in a hidden element, tap it
with Web Audio, throw the sound away. It inherits exactly the problem it is
meant to solve:

- **CORS still applies.** `createMediaElementSource` needs a CORS-clean stream,
  so the 11 `cors_missing` stations — the main reason to want this — stay
  `SIM`. It also cannot help when `crossOrigin` itself breaks playback (Eguzki
  Irratia, code 4).
- **A second connection per listener.** Icecast/Shoutcast mounts count listeners
  and often per-IP connections; the user's data doubles for pixels.
- **Drift.** The hidden element buffers independently of the native player, so
  the bars lag or lead the audio by seconds.
- **It dies when backgrounded**, while the native player keeps going.

On the website this is simply "the player". In the app it is a liability.

## 8. S5 — ship PCM to JS and FFT in the WebView

Tempting because `lib/audioBands.js` already exists. At 48 kHz, 16-bit mono that
is ~96 kB/s crossing the Capacitor bridge as base64 or a `WebMessagePort`, i.e.
constant JSON/GC churn on the UI thread for a result you could compute in place
for a fraction of the cost. It also freezes whenever the WebView is throttled —
and the player keeps playing. Same work, worse place.

## 9. S6 — hybrid: WebView audio while visible, native when not

Gets real bars today with no new Kotlin, because foreground playback is the
existing `<audio>` path. The handoff is the killer: stopping the web element and
starting the native one restarts the live stream (audible gap, the server may
count a new listener), the two retry/stall policies diverge, and
`docs/ANDROID-AUTO.md` §3 exists precisely to avoid two engines. Consider only
as a schedule fallback if M1 slips — and then it costs more later, not less.

## 10. S7 — render the bars natively

If the 30 fps bridge event ever shows up in a profile, draw the same 24 bands in
a native `View`/`Canvas` overlaid on the WebView. Same tap, same numbers, no
bridge. Not a data-source decision; keep it in reserve.

## 11. Recommendation

1. **S1, inside milestone M1** (the Media3 service + bridge), not in a later
   milestone: the tap is a few lines at player construction and the FFT is
   self-contained, but the state, lifecycle and stop-cleanup all live in the
   service.
2. Make `canAnalyze` engine-aware in `logic.js`: true for native playback
   regardless of `health.cors`; unchanged for the web build.
3. Leave `SIM` for silence and failures only, and rename its label from
   "simulated" to "no signal" in `PlayerDashboard.jsx` so it stops implying the
   platform cannot do better.
4. Do **not** request `RECORD_AUDIO`. If a specific device class later proves
   the tap unusable, add S2 behind an explicit opt-in.

Estimated cost: 2–3 days (tap + FFT + band table + bridge event + JS adapter +
tests + one device pass), which is within M1's 3–5 day estimate rather than an
extra milestone.

## 12. Files this touches

| Path | Change |
|---|---|
| `android/app/src/main/java/…/media/SpectrumTap.kt` | pass-through `AudioProcessor`, ring buffer |
| `…/media/SpectrumFft.kt` | window + radix-2 FFT + dBFS |
| `…/media/SpectrumBands.kt` | 24 log bands from the generated edge table |
| `…/media/RiotMediaService.kt` | install the tap, 30 fps emitter, clear on stop |
| `…/RiotsPlaybackPlugin.kt` | `notifyListeners('spectrum', …)` |
| `scripts/export-bands.mjs` | edge table from `lib/audioBands.js` → `res/raw/` |
| `lib/nativeSpectrum.js` | adapter with the `createSpectrumAnalyzer` contract |
| `logic.js` | choose analyzer by engine; `canAnalyze` no longer CORS on Android |
| `comp/PlayerDashboard.jsx` | `SIM` copy → "no signal" (optional) |
| `tests/nativeSpectrum.test.mjs` | fake-bridge contract test |
| `android/app/src/test/java/…/SpectrumTest.kt` | FFT + band-parity tests |

## 13. Sources

- Media3: PCM is only reachable in-process — [androidx/media#3028](https://github.com/androidx/media/issues/3028)
- `Visualizer` requires `RECORD_AUDIO` — [framework source](https://android.googlesource.com/platform/frameworks/base/+/master/media/java/android/media/audiofx/Visualizer.java)
- Playback capture limits — [Capture video and audio playback](https://developer.android.com/media/platform/av-capture)
- `AudioProcessor` visualiser walk-through — [dawn.tech](https://dawn.tech/en/publication/an-alternative-android-visualizer)
- Repo context: [`ANDROID-AUTO.md`](ANDROID-AUTO.md) §3/§15, [`CORS-IN-APP.md`](CORS-IN-APP.md) §4/§5,
  [`play-release` skill](../.agents/skills/play-release/SKILL.md)
