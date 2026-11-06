# Play Store listing — copy and graphics

Paste-ready text for the Play Console listing, and the two graphics Play requires
before a release can be saved to any track. Screenshots are the one thing that
needs a device; they are listed at the bottom with the format Play accepts.

## Text

**App name** (29 / 30 characters)

```
RIOTSRADIOS - Community Radio
```

**Short description** (66 / 80 characters)

```
43 independent community radio stations. Free, no ads, no account.
```

**Full description** (1,225 / 4,000 characters)

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

Claims above are grounded in the repo: the catalog has 85 rows, 42 of them
flagged `stream_broken` (hidden at runtime), hence "43" in the short description
and "40+" in the long one. Re-check that count before every listing edit
(`npm run validate:stations` prints it, and `stations.csv` is the source).

## Graphics

| File | Play requirement | Source |
|---|---|---|
| `store/icon-512.png` | 512×512, 32-bit PNG, ≤ 1 MB | mark from `public/logob_transp_ffc107.png`, on the app's black ground |
| `store/feature-graphic-1024x500.png` | 1024×500, JPEG or 24-bit PNG, **no alpha** | wordmark from `assets/brand-originals/logo_text.png` |

Both are generated, never hand-edited:

```bash
npm run assets:store          # write store/icon-512.png + the feature graphic
npm run assets:store:check    # fail if either drifted from the brand art
```

## Still missing

- **Phone screenshots**, at least 2: 16:9 or 9:16, **max aspect ratio 2:1**
  (1260×2520 is the safe format; a 390×844 capture at 2.16:1 is rejected).
  Must be real captures of this build — the player, the station list and the
  guide are the three worth showing.
- **TV screenshots**, 16:9 (1280×720 or 1920×1080) plus the TV banner in the
  Console, if the TV track is submitted with the phone track.
- **Contact email** for the listing (the policy page points at the repository's
  issue tracker instead, which is not what the Console field accepts).
- **Release notes** for the first upload, from `RELEASE.md` — see the
  [`release-notes` skill](../.agents/skills/release-notes/SKILL.md).
