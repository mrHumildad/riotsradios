# Upstream catalog change — station 162 (Epic Factory Underground)

Draft for `riotsradios-epg`, applied to `catalog/stations.csv`. One row changes.
Nothing else in the file may be reformatted: `catalog/manifest.json` carries the
SHA-256 of the CSV bytes and this repository's `catalog:check` compares that hash
against its committed snapshot, so any incidental whitespace edit becomes drift.

`station-162.patch` in this folder is the diff, generated from the RIOTSRADIOS
working tree; it applies at the EPG repository root with `git apply`.

## Why

- The old stream `https://cheetah.streemlion.com:5235/stream` is refused
  (`curl: (7) Connection refused`; health snapshot `unreachable`,
  `consecutive_failures: 5`, `last_ok_at: null`).
- The station's Live365 feed answers on HTTPS:
  `https://streaming.live365.com/a26107` → `302` →
  `https://das-edge93-live365-dal05.cdnstream.com/a26107`, `HTTP/1.0 200`,
  `Content-Type: audio/mpeg`, `Access-Control-Allow-Origin: *`,
  `icy-name: Factory Underground Radio`, `icy-br: 128`, first frame bytes
  `ff fb 92 64` (valid MPEG-1 Layer III sync).
- The row had no place data, so the player could not label its clock; it now has
  `The United States Of America` / `US` / `Norwalk, CT`.
- `stream_broken` is cleared, so the station is rendered again.

## Resulting row

```csv
162,Epic Factory Underground,,,https://streaming.live365.com/a26107,,https://streaming.live365.com/a26107,https://epicfactory.net/underground.htm,,The United States Of America,US,"Norwalk, CT","alternative,punk,underground",MP3,128,0,0,,
```

`bitrate` drops 320 → 128 because the stream reports `icy-br: 128`; the player's
soundbar label reads `MP3 128k`.

## Publish

1. `npm test && npm run validate:catalog` — the publish gate.
2. `npm run catalog` — writes `public/catalog/{stations.csv,manifest.json,health.json}`.
3. `npm run probe -- --only 162` — refreshes `catalog/health.json`. Without it the
   app keeps the stale `unreachable` entry and shows the OFFLINE badge even though
   the stream now plays.
4. Commit `catalog/stations.csv` and `catalog/health.json`, push; `catalog.yml`
   deploys `public/`.

## Verify the re-sync here

```bash
npm run catalog:sync     # adopts the published CSV + health snapshot
npm run catalog:check    # expect: ✅ stations.csv matches the published catalog (63e82eede22b)
npm run validate:stations
```

Expected `manifest.version` after the publish:
`63e82eede22bde4b8f812eacfa29ffc86a97fe0f30b1512c5ef4db9bfda4715a`
(trailing newline included).

## Not in this patch

The catalog name is `Epic Factory Underground` while the stream announces
`icy-name: Factory Underground Radio`. Renaming is a product decision and would
need its own row change plus another sync; favourites and health entries are keyed
by id, so a rename would not break them.
