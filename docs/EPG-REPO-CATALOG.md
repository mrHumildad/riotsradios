# Catalog ownership: riotsradios-epg → RIOTSRADIOS

The catalog has one owner: **`riotsradios-epg`**. It publishes `stations.csv`
next to the guides, and the player keeps a validated copy — bundled at build time
and refreshed at runtime when the published version moves.

This document is the contract for the EPG repository and the migration checklist
for this one. The client half already ships: `lib/catalogFeed.js`,
`lib/catalog.js`, `lib/catalogCache.js`, `stations.js`, `scripts/sync-catalog.mjs`.

## Who owns what

| Thing | Owner | Why |
|---|---|---|
| `stations.csv` (ids, names, stream URLs, `epg_file`) | `riotsradios-epg` | It already needs the catalog to know which stations to fetch and which guide belongs to which id |
| `catalog/manifest.json`, `catalog/health.json` | `riotsradios-epg` | Published together with the CSV, versioned by its hash |
| `EPGs/*.json` | `riotsradios-epg` | Unchanged |
| This repo's `stations.csv` | generated snapshot | Rendered before the network answers, offline, and inside the Android bundle |
| `catalog/health.json` | `riotsradios-epg` (the probe) | Badges and spectrum support; `data/health.json` here is a synced copy shipped in the bundle |
| `data/cleartext-hosts.json`, Android network config | this repo | Device policy, not catalog content |

`station_id` in a guide and `id` in the catalog are the same number, so a single
file on the publish side removes the drift this repository used to catch late in
`validate:epgs.js`.

## Published layout

```
/catalog/manifest.json     { "schema": 1, "version": "<sha256>", "file": "stations.csv", "rows": 61, "generated_at": "…", "health": "health.json" }
/catalog/stations.csv      the authoritative file, same columns as today
/catalog/health.json       optional; the probe's snapshot, keyed by station id
/EPGs/manifest.json        unchanged
/EPGs/*.json               unchanged
```

`version` is the **SHA-256 of the CSV bytes**. It is content-addressed, so:

- an unchanged catalog costs one conditional manifest request on the client,
- the client fetches `/catalog/stations.csv?v=<sha256>`, so a Pages CDN edge can
  never answer a new publish with the old bytes,
- a re-deploy that does not touch the catalog does not trigger a resync.

Keep the catalog manifest separate from `EPGs/manifest.json`: a broken guide
pipeline must not be able to take the station list down with it.

## Publish workflow (in `riotsradios-epg`)

The EPG repository implements this with two workflows that share one concurrency
group (`epg-refresh`), because both publish the `gh-pages` branch:

- **`catalog.yml`** — on a push touching `catalog/**`, `lib/catalog-rules.js` or
  the catalog scripts: `npm test`, `npm run validate:catalog`, build, then deploy
  `public/` (the catalog alone). A catalog edit is live minutes later.
- **`refresh.yml`** — the daily guide pipeline, unchanged except that it now
  validates and rebuilds the catalog before it deploys, and reads
  `catalog/stations.csv` (instead of the app repo's copy) when it appends a
  disabled config row for a new station. Discovery, fetch and convert then run
  for the new ids only.

```yaml
# catalog.yml, the essential steps
- run: npm test
- run: npm run validate:catalog              # THE GATE
- run: npm run catalog                        # public/catalog/{csv,manifest,health}
- uses: peaceiris/actions-gh-pages@v4
  with:
    publish_branch: gh-pages
    publish_dir: ./public
    force_orphan: true
```

Deployment is atomic per Pages deployment: listeners either get the whole new
catalog or the old one, never a half-written CSV. `public/catalog/` is a build
artifact — only `catalog/stations.csv` is committed.

## The three scripts, sketched

`tools/validate-catalog.mjs` — the same rules this repository enforces, so a row
that would fail `npm run validate:stations` cannot be published:

```js
import { readFile } from 'node:fs/promises'
import { parseStationRows } from './stations.js'
import { assessCatalogCsv } from './catalog.js'

const csv = await readFile('catalog/stations.csv', 'utf8')
const verdict = assessCatalogCsv(csv, { current: parseStationRows(await previousCommitCsv()) })
if (!verdict.ok) {
  for (const error of verdict.errors) console.error(`❌ ${error}`)
  process.exit(1)
}
```

`scripts/discover.mjs --changed-only` — the trigger you asked for:

```js
import { execFileSync } from 'node:child_process'
const previous = execFileSync('git', ['show', 'HEAD^:catalog/stations.csv'], { encoding: 'utf8' })
const before = new Set(parseStationRows(previous).map(s => s.id))
const added = parseStationRows(await readFile('catalog/stations.csv', 'utf8'))
  .filter(s => !before.has(s.id) && !s.stream_broken)

for (const station of added) await fetchAndConvert(station)   // your existing pipeline
```

A first push with the whole file therefore converts everything (no previous
commit); every push after it converts only the new rows.

`scripts/build-manifest.mjs` — hash first, then write:

```js
import { createHash } from 'node:crypto'
const csv = await readFile('catalog/stations.csv', 'utf8')
const version = createHash('sha256').update(csv, 'utf8').digest('hex')
await writeFile('public/catalog/manifest.json', JSON.stringify({
  schema: 1,
  version,
  file: 'stations.csv',
  rows: parseStationRows(csv).length,
  generated_at: new Date().toISOString(),
  health: existsSync('public/catalog/health.json') ? 'health.json' : null,
}, null, 2))
```

## Rules the publish side must hold

1. **Never delete a row.** `stream_broken: true` is the tombstone; the id stays
   reserved forever. The client's trust guard drops a catalog that lost more than
   40% of its playable rows, so a mass deletion is refused rather than shipped.
2. **Never reuse an id.** The id keys `data/health.json`, the EPG `station_id`,
   and the listener's favourites in local storage.
3. **Validate before deploy.** Once the player adopts the file at runtime, the
   client's `prebuild` gate no longer protects listeners — this workflow is the
   only gate that does.
4. **Probe with the catalog.** A station that arrives at runtime without a health
   entry plays, but shows no badge and no spectrum (the analyzer needs
   `health.cors`). `npm run probe` writes `catalog/health.json`, which is committed
   and published next to the CSV; the app copies it at every sync.
5. **Keep the columns identical** to this repository's `stations.csv`; a renamed
   column is a rejected catalog, not a warning.
6. **State the language where the country cannot.** `catalog/stations.csv` takes an
   optional `language` column (ISO 639-1), and a guide's own `language` beats it.
   Rows in Catalan (`ca`) and Basque (`eu`) are all `ES`, so one of the two must
   carry the code or the app's LANG toggle counts them as Spanish. Leaving the
   column blank falls back to the country code.

   This repository's snapshot already carries the column and
   `lib/catalogLanguage.js` re-appends it to every adopted catalog until the
   published file has one of its own — after that, the published values win and
   the overlay is a passthrough.

## Client side (already in place)

- Source order: bundled `stations.csv` → last synced copy in localStorage → the
  published catalog, fetched in the background. Startup never waits on the feed.
- `stations.js#syncCatalog()` refuses a file that fails `assessCatalogCsv`
  (missing required columns, duplicate ids, no playable row, a suspicious drop)
  and leaves the previous catalog in place.
- The playing station is tracked by id across the swap, so `prev`/`next` and the
  EPG/title effects follow the new list (`logic.js`).
- Sync is on in production, off in development (the editor writes the local file),
  `VITE_CATALOG_SYNC=1` forces it on, `=0` is the kill switch.
- `npm run catalog:check` runs on `prebuild` and in CI: exit 2 when the committed
  snapshot differs from the published catalog, exit 0 with a warning when the
  feed is unreachable. `npm run catalog:sync` adopts the published file.
- `.github/workflows/catalog-sync.yml` adopts the catalog daily and opens a PR.

## Migration checklist

Done in `riotsradios-epg`:

1. `catalog/stations.csv` seeded from this repository's catalog and published by
   `catalog.yml` / `refresh.yml`; the gate (`scripts/validate-catalog.mjs`, rules
   in `lib/catalog-rules.js`) runs on every PR, push and publish.
2. `catalog/stations.csv` synced into this repository once — both files are
   byte-identical (`cmp`), and `npm run catalog:check` passes against the built
   feed.
3. The EPG repo's config import now reads `catalog/stations.csv`, so the ids, the
   guides and the app cannot drift apart.

Still to do:

4. Push both repositories; the first deploy publishes `/catalog/manifest.json`.
   Until then this repo's `catalog:check` step only warns.
5. Confirm `https://mrhumildad.github.io/riotsradios-epg/catalog/manifest.json`
   is readable from the Pages origin (CORS is `*` there).
6. The probe is owned by the EPG repo now: `scripts/probe-catalog.mjs` writes
   `catalog/health.json`, `.github/workflows/health.yml` refreshes it daily and
   republishes the catalog, and this repo's `data/health.json` arrives through
   `npm run catalog:sync` — there is no probe here any more.

`config/stations.csv` in the EPG repo **stays**: it is the guide pipeline's own
config (`timezone`, `epg_url`, `enabled`), not a second catalog. It is the one
thing that legitimately cannot live in the app-facing CSV.
