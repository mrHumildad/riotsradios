# Upstream EPG change — Catalan and Basque languages

Draft for `riotsradios-epg`. The player already understands both halves of this:
a guide's `language` and an optional `language` column in `catalog/stations.csv`
(ISO 639-1). Neither is published yet, so the LANG toggle in the channel list
currently counts every `ES` station as Spanish.

Catalan (`ca`) and Basque (`eu`) stations all use country code `ES`, so the
country cannot tell them apart — one of these two pieces of data has to.

## 1. Guides

Add the top-level field next to `station_id`. `public/EPGs/epg-schema.json` in
the player already allows it (`^[a-z]{2}$`), and `additionalProperties` on the
guide means no other change is needed:

```json
{
  "version": "2.0",
  "station": "Eguzki Irratia",
  "station_id": 4,
  "language": "eu",
  "timezone": "Europe/Madrid"
}
```

Rows in the published guides that need it now:

| Guide | id | `language` |
|---|---|---|
| `eguzki-irratia.json` | 4 | `eu` |
| `radio-contrabanda.json` | 1 | `ca` |
| `radio-pica.json` | 10 | `ca` |

The player's bundled fallback copies of these three already carry the field, so
a local run of the app shows the toggle.

## 2. Catalog column

Append a `language` column to `catalog/stations.csv`. It is optional and may be
blank: a blank value falls back to `countrycode`, so only `ca` and `eu` rows need
a value. This repository's snapshot already carries the column, and
`lib/catalogLanguage.js` re-appends it to every catalog adopted here — so until
the published file has its own column, the sync keeps these values:

| id | Station | Country code | `language` |
|---|---|---|---|
| 4 | Eguzki Irratia | ES | `eu` |
| 52 | Zintzilik Irratia | ES | `eu` |
| 1 | Radio Contrabanda | ES | `ca` |
| 10 | Radio Pica | ES | `ca` |
| 16 | Ràdio Klara | ES | `ca` |
| 25 | Radio RSK | ES | `ca` |
| 137 | RTVC Ràdio Televisió Cardedeu | ES | `ca` |

Still to confirm before adding: id 14 (Radio Malva, Valencia) — the station is
not in the snapshot yet because its main broadcast language was not verified.

A guide's `language` wins over the column, so the three guides above are already
covered even if the column stays blank. Once the published catalog has the
column, the overlay stops applying and the published values are authoritative.

## Publish

1. `catalog/stations.csv` and the guides change → `npm test && npm run validate:catalog`
2. `npm run catalog` — recompute `public/catalog/manifest.json` (its `version` is
   the SHA-256 of the CSV bytes).
3. Deploy; the player resyncs on its next start and the LANG toggle picks up the
   new languages.

## Verify here

```bash
npm run catalog:sync     # adopts the published CSV + health snapshot
npm run catalog:check    # expect the new hash
npm run validate:stations
npm run validate:epg     # bundled fallback copies, including `language`
```
