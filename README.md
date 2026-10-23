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
- Weekly EPG (Electronic Program Guide) support — now with contributor-friendly v2 format using show IDs and wall-clock times
- Add more stations

## Contributing EPG Schedules

RIOTSRADIOS accepts EPG schedule files for community radio stations. See `docs/EPG-FORMAT.md` for the v2 schema specification.

Quick summary:
- Each program has `start` and `end` wall-clock times (`"HH:MM"`) — no blocks or math required
- Define unique shows once in the `shows` catalog and reference them by `show_id` in daily grids
- Copy `public/EPGs/template.json` and fill in your schedule
- Name the file descriptively (e.g. `radio-topo.json`) and point the station's `epg_file` column in `stations.csv` at it
- Validate at [jsonschemavalidator.net](https://www.jsonschemavalidator.net/) with schema `public/EPGs/epg-schema.json`
- Send the completed file or open a PR

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

`stations.csv` is the single source of truth for stations. Validate it before sending a PR:

```bash
npm run validate:stations
```

It rejects malformed rows (invalid/blank IDs, duplicate IDs or stream URLs, non-`http(s)` URLs, broken `epg_file` references) and runs automatically before every build, so a bad row cannot ship. An **active** station must use `https://`: browsers block `http://` audio on the HTTPS deployment, so add an HTTPS mirror or route the stream through the relay before enabling it. Broken (`stream_broken`) rows are only warned about, since they are already hidden.

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

Every station is probed on a schedule; the result is bundled so the list can label what is actually working:

```bash
npm run probe:health
```

- Writes `data/health.json` (status, HTTP code, content type, CORS capability, latency, consecutive failures).
- The app shows `UNSTABLE` after a failed check, `OFFLINE` after three in a row, and `HTTP ONLY` for streams browsers block on HTTPS. `LIVE` is implicit.
- `.github/workflows/health.yml` refreshes the snapshot daily and commits it; `.github/workflows/ci.yml` runs tests, catalog/EPG validation and the build on every push and PR.
- `cors` in the snapshot is what a future real audio analyzer needs: `any`/`origin` can be analyzed, `null` cannot.

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