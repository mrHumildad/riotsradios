# RIOTSRADIOS Radio (RadIOT)

Free Community Radio Player — a web-based radio tuner for independent and non commercial riot stations worldwide.

## Features

- Stream 30+ community radio stations from around the world
- Retro-futuristic "post-punk" interface with amber CRT aesthetics
- Station list with live playback controls
- Real audio spectrum where the station allows CORS, with a clearly labelled `SIM` fallback otherwise
- Large-screen / Android TV layout (safe areas, two columns, D-pad focus)

## Keyboard & Remote Controls (Android TV / TV browsers)

- ← → : previous / next station
- ↑ ↓ : volume ±5%
- Enter / OK / DPAD center : play / stop (stream)
- Esc / Back : close EPG modal
- E / Option / Menu / Info button : open EPG for current station
- MediaPlayPause / MediaStop keys also supported (toggle start/stop of the live stream)
- Stopping the stream fully terminates the connection to prevent background data usage
Works in any browser; designed for D-pad remotes on Android TV, Fire TV, etc.

## TODO
- Expand EPG coverage across the remaining stations
- Add more stations

## Contributing EPG Schedules

EPG schedules are maintained in the separate [riotsradios-epg](https://github.com/mrHumildad/riotsradios-epg) repository. The files bundled under `public/EPGs/` are the offline fallback for the player.

See `docs/EPG-FORMAT.md` for the v2 schema specification.

Quick summary:
- Each program has `start` and `end` wall-clock times (`"HH:MM"`) — no blocks or math required
- Define unique shows once in the `shows` catalog and reference them by `show_id` in daily grids
- Copy the template from `riotsradios-epg`, add the guide under its `public/EPGs/`, and point `catalog/stations.csv` at it
- Validate it there and rebuild the manifest; open a PR against `riotsradios-epg`
- Keep the same file in this repository's `public/EPGs/` as the offline fallback and run `npm run validate:epg`

## EPG feed

The player loads the published manifest from:

```text
https://mrhumildad.github.io/riotsradios-epg/EPGs/manifest.json
```

It loads each advertised guide from the same base URL. If the manifest or an individual guide cannot be loaded, that station falls back to its bundled `public/EPGs/<epg_file>` copy. Set `VITE_EPG_BASE_URL` to point at a staging EPG deployment without rebuilding the URLs by hand.

## Stations

Available stations include:

- **Radio Contrabanda** (Barcelona, Spain)
- **Radio Arrebato** (Guadalajara, Spain)
- **Radio Caroline** (United Kingdom)
- **Eguzki Irratia** (Pamplona, Basque Country)
- **FM La Boca** (Buenos Aires, Argentina)
- **Radio Bip** (Besançon, France)
- **FM La Tribu** (Buenos Aires, Argentina)
- **Radiofabrik** (Salzburg, Austria)
- **Radio QK** (Asturias, Spain)
- **Radio Pica** (Barcelona, Spain)
- **Radio Enlace** (Madrid, Spain)
- **Radio la Granja** (Zaragoza, Spain)
- **Irola Irratia** (Bilbao, Spain)
- **Radio Malva** (Valencia, Spain)
- **Ké Huelga Radio** (México)
- **Ràdio Klara** (Valencia, Spain)
- **Radio Libertaire** (Paris, France)
- **Radio Topo** (Zaragoza, Spain)
- **Radio Vallekas** (Madrid, Spain)
- **Radio Utopía** (Spain)
- **Radio Carcoma** (Madrid, Spain)
- **Radio Mistelera** (Marina Alta, Spain)
- **Radio Almaina** (Granada, Spain)
- **Radio Pirineo** (Huesca, Spain)
- **Radio RSK** (Barcelona, Spain)
- **Radio Pimienta** (Tenerife, Spain)
- **Radio Onda Rossa** (Roma, Italy)
- **Radio Onda d'Urto** (Brescia, Italy)
- **Radio Blackout** (Torino, Italy)
- **Radio Città Fujiko** (Bologna, Italy)
- **Radio Ciroma** (Cosenza, Italy)

## Station Catalog

`stations.csv` is owned by the separate [riotsradios-epg](https://github.com/mrHumildad/riotsradios-epg) repository, which publishes it as `catalog/stations.csv` next to the guides. The copy committed here is a **validated snapshot**: what a fresh install and a cold Android start render, and what the offline build ships. Add or fix stations in the EPG repository — see `docs/EPG-REPO-CATALOG.md` for the publish contract.

Validate the snapshot before sending a PR:

```bash
npm run validate:stations
```

It rejects malformed rows (invalid/blank IDs, duplicate IDs or stream URLs, non-`http(s)` URLs, broken `epg_file` references) and runs automatically before every build, so a bad row cannot ship. An **active** station must use `https://`: browsers block `http://` audio on the HTTPS deployment, so add an HTTPS mirror or route the stream through the relay before enabling it. Broken (`stream_broken`) rows are only warned about, since they are already hidden.

### Editing a station inside the app (development only)

```bash
npm run dev
```

In development every row in the channel list carries an **EDIT** button. It opens a modal with that station's catalog fields — name, place and country, hidden flag, stream URL and mirrors, codec metadata, links, contact and guide file — and writes the change straight back to `stations.csv`. The catalog validator runs on every save and reports inside the modal, and the list refreshes on the spot so the edited stream can be played without restarting the app.

The **+ NEW** button above the list opens the same modal blank and appends a row with the next free id (a name and stream URL are required). A station's modal also has **DELETE**, which removes its row after a confirmation that spells out the cost: its id and health history go with it, and the rows below shift up a line. For a station that may return, tick **Hidden** instead. Neither the buttons nor the write endpoint (`scripts/catalog-plugin.mjs`, a dev-server middleware) exists in the production build.

A station with no HTTPS mirror at all can still be carried **in the Android app only**: add its host and id to `data/cleartext-hosts.json`, run `npm run cleartext:config` (regenerates the app's network security config from that list), then clear `stream_broken`. The validator accepts it as app-only and the GitHub Pages build keeps hiding it — see `docs/CORS-IN-APP.md`. The allowlist is a device policy and stays in this repository, so it still needs an entry here after the station is published by the EPG repo.

### Syncing the catalog

The player loads the published catalog in the background on launch and adopts it when its version changed, so a station added to the EPG repository reaches listeners without a new release. The snapshot keeps the app honest meanwhile:

```bash
npm run catalog:sync    # adopt the published catalog into stations.csv
npm run catalog:check   # exit 2 when this snapshot has drifted (runs on prebuild + CI)
```

A network failure only warns, so an offline build still works. `VITE_CATALOG_BASE_URL` points the feed at a staging deployment; `VITE_CATALOG_SYNC=0` disables the runtime sync, and `=1` forces it on in development (where it is off by default because the dev editor writes `stations.csv`).

## Development

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

## Stream Health

The probe lives in [riotsradios-epg](https://github.com/mrHumildad/riotsradios-epg), which owns `catalog/health.json` and refreshes it daily. `data/health.json` here is a snapshot of that file, synced together with the catalog:

```bash
npm run catalog:sync    # adopts stations.csv and data/health.json
```

- `data/health.json` holds status, HTTP code, content type, CORS capability, latency and consecutive failures.
- The app shows `UNSTABLE` after a failed check, `OFFLINE` after three in a row, and `HTTP ONLY` for streams browsers block on HTTPS. `LIVE` is implicit.
- `.github/workflows/catalog-sync.yml` refreshes both snapshots daily and opens a PR; `.github/workflows/ci.yml` runs tests, catalog/EPG validation and the build on every push and PR.
- `cors` in the snapshot is what the audio analyzer needs: `any`/`origin` can be analyzed, `null` cannot.

## Tests

```bash
npm test
```

Covers the playback state machine (start timeout, stall detection, retry/backoff, clean stop, error mapping) with a fake audio element. Catalog rules are checked by `npm run validate:stations`, which also runs before every build.

## Deploy

```bash
npm run deploy
```

## Release

Publishing on Google Play goes through [`docs/PLAY-STORE-LAUNCH.md`](docs/PLAY-STORE-LAUNCH.md) — the ordered checklist for signing, the AAB, the Console declarations and the test tracks. The web release below is unchanged and keeps shipping alongside it.

For versioned releases with changelogs:

```bash
# 1. Document changes
npx changeset

# 2. Commit changeset file
git add .changeset/ && git commit -m "docs: add changeset"

# 3. Release (bumps version, updates CHANGELOG, deploys, pushes tags)
npm run release
```

## Tech Stack

- React 19
- Vite
- CSS with custom CRT/chassis styling

## License

MIUC(Me Invitarás Una Cerveza)