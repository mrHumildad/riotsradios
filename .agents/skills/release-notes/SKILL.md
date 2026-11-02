---
name: release-notes
description: Player-facing release copy for RIOTSRADIOS kept in RELEASE.md — the paste-ready Play Console "What's new" block and the site/GitHub note for each version. Use whenever a release, version bump or changeset ship happens, and when writing or editing release notes.
---

# Release notes — RELEASE.md

Three files, three audiences:

| File | Audience | Owner |
|---|---|---|
| `CHANGELOG.md` | Internal, semver sections written from changesets | `npx changeset version` |
| `RELEASE.md` (repo root) | Listeners — the exact text pasted into Play Console → *What's new*, and reused on the site/GitHub release | You, on every release |
| `VERSIONS.md` | Only if an Android release script is added and wants a build log | the release script |

**A release is not done until `RELEASE.md` has an entry for it.** `CHANGELOG.md`
says what changed in the code; `RELEASE.md` says what a listener should notice, in
the words the app itself uses.

## Procedure

1. Bump with changesets first (`npm run changeset`, then `npx changeset version`) and
   cut the Android AAB from that version — the procedure lives in the
   [`play-release` skill](../play-release/SKILL.md). Do the notes **after**, so the
   version and date are final.
2. Collect what a listener can see or hear:
   - the new changeset entries and `git log --oneline` since the last release,
   - new or removed stations in `stations.csv`,
   - new EPG files in `public/EPGs/`,
   - playback/health fixes (`lib/playbackController.js`, `lib/health.js`, `comp/`),
   - anything about the spectrum, the TV/D-pad controls or the shell's visuals.
3. Drop build plumbing: versionCode, signing, Play upload mechanics, dependency
   bumps, validators, refactors, CI.
4. Write the block and prepend the entry to `RELEASE.md`, newest first, directly
   under the header.
5. Check every block is **≤ 500 characters** (Play's per-language limit):
   `node -e 'console.log([...process.argv[1]].length)' -- "- Fixed the thing"`.
   Over the limit, cut detail — never dump a wall of text.
6. Read it back against `package.json` and `CHANGELOG.md`: same version, same date,
   nothing listed that is not in this build.

Editing notes after a release (typo, better wording) means editing that version's
existing block — never adding a second entry for the same version.

## RELEASE.md format

````md
# Release notes — RIOTSRADIOS

Copy-paste "What's new" text, newest first. CHANGELOG.md is the technical log;
this file is only what listeners read.

## v1.3.0 — 2026-11-01

**en-US**

```
- New: three Madrid stations and a Zaragoza schedule guide
- Fixed: streams that stall now reconnect instead of showing silence
- The spectrum now says SIM when a station blocks it, instead of freezing
```
````

- Heading `## v<version> — YYYY-MM-DD` must match `package.json` exactly.
- One fenced block per language the Play listing publishes. `en-US` is mandatory;
  add `es-ES` only if the Console listing has it, and take terms from the app's own
  labels rather than machine-translating station names.
- The block is plain text — Play renders no markdown. `- ` bullets are fine; no
  headings, no bold, no links inside it.
- No version numbers, build codes or dates inside the block.
- Both channels ship from the same version, so write the note **channel-neutral**:
  it must read correctly on the site, in a GitHub release and in Play.

## Copy rules

- **Use the app's own vocabulary:** station, channel, stream, guide (EPG), LIVE /
  UNSTABLE / OFFLINE / HTTP ONLY (the health badges), SIM (spectrum fallback),
  volume, next/previous station. Never internal ids (`epg_file`, `stream_broken`,
  `consecutive_failures`, `playbackState`) and never invented feature names.
- 3–6 short lines, one change each, lead with the verb: "Added…", "Fixed…",
  "New: …". Say what the listener gains, not how it was implemented.
- Be specific enough to be checkable: "Fixed: a stalled stream reconnects instead of
  sitting on silence" beats "playback improvements".
- Never mention prices, promotions, "download/update now", other stores or
  platforms, review/test instructions, or anything about testers — Play treats that
  as promotional or meta copy.
- No incident postmortems ("upload was rejected", "fixed the crash from 1.2.0") and
  nothing about versions that never shipped.
- Do not promise dates, stations or EPGs that are not in this build. A station
  marked `stream_broken` is not in this build.
- If a release genuinely has nothing listener-visible, say so plainly: "Bug fixes
  and stability improvements." Do not invent features.

## Checklist

- [ ] Entry exists for the version just released, newest first.
- [ ] Version and date match `package.json` and `CHANGELOG.md`.
- [ ] Each language block is under 500 characters and paste-ready.
- [ ] Only listener-visible changes; technical detail stays in `CHANGELOG.md`.
- [ ] App vocabulary only; wording matches the labels on screen.
- [ ] Reads correctly for both channels — no platform-specific copy.
