# RIOTSRADIOS Radio (RadIOT)

Free Community Radio Player — a web-based radio tuner for independent and non commercial riot stations worldwide.

## Features

- Stream 30+ community radio stations from around the world
- Retro-futuristic "post-punk" interface with amber CRT aesthetics
- Station list with live playback controls

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

## Development

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

## Deploy

```bash
npm run deploy
```

## Tech Stack

- React 19
- Vite
- CSS with custom CRT/chassis styling

## License

MIUC(Me Invitarás Una Cerveza)