/**
 * Catalog field metadata, shared by the player UI and the dev catalog API.
 *
 * One list so the edit modal and the server-side column checks always agree on
 * labels, hints and which fields are writable. Pure data: no React, no Node.
 *
 * Column names follow the radio-browser station object — `homepage`, `favicon`,
 * `country`, `countrycode`, `state`, `tags`, `codec`, `bitrate`, `hls`,
 * `lastcheckok` — so an API record lands on a row without a rename table. The
 * columns the API has no concept of keep their own names: `id` (the player
 * identity and the `data/health.json` key), `stream_broken`, the two stored
 * mirrors, the guide fields and `mailto`.
 */

/** Columns of stations.csv, in file order, with the label the editor shows. */
export const STATION_FIELDS = [
  {
    key: 'id',
    label: 'ID',
    hint: 'Permanent player identity and the key into data/health.json — not editable.',
    readonly: true,
  },
  { key: 'name', label: 'Name', hint: 'Shown in the player. Required unless the station is hidden.' },
  {
    key: 'stream_broken',
    label: 'Hidden (stream broken)',
    hint: 'Keeps the row for the record but hides the station from listeners.',
    type: 'checkbox',
  },
  { key: 'has_ads', label: 'Has ads', hint: 'Marker only — blank or "true". Does not change playback.' },
  { key: 'country', label: 'Country', hint: 'Country name as radio-browser reports it — e.g. Spain, Italy.' },
  { key: 'countrycode', label: 'Country code', hint: 'Two-letter ISO 3166-1 code — e.g. ES, IT.' },
  {
    key: 'state',
    label: 'Place',
    hint: 'Region or city, shown in the list — e.g. "9Barris, Barcelona". radio-browser calls this field state.',
  },
  { key: 'url', label: 'Stream URL', hint: 'The stream the player loads. Use https:// with no spaces.' },
  {
    key: 'url_http',
    label: 'HTTP mirror',
    hint: 'Optional plain-http mirror (http:// only). Stored, never played by the site.',
  },
  {
    key: 'url_https',
    label: 'HTTPS mirror',
    hint: 'Optional https mirror. Stored, never played automatically.',
  },
  { key: 'homepage', label: 'Home page', hint: 'Station site, http:// or https://' },
  { key: 'favicon', label: 'Favicon URL', hint: 'Station logo image, http:// or https://' },
  { key: 'tags', label: 'Tags', hint: 'Comma-separated keywords, as radio-browser stores them.' },
  { key: 'codec', label: 'Codec', hint: 'Stream codec — MP3, AAC, OGG… Blank when unknown.' },
  { key: 'bitrate', label: 'Bitrate', hint: 'Stream bitrate in kbps, e.g. 128. Blank when unknown.' },
  { key: 'hls', label: 'HLS', hint: '"1" when the station publishes an HLS stream, "0" otherwise.' },
  {
    key: 'lastcheckok',
    label: 'Radio-browser check',
    hint: '"1" when radio-browser last reached the stream, "0" otherwise. Not our probe: LIVE and OFFLINE come from data/health.json.',
  },
  { key: 'epg_url', label: 'Guide URL', hint: 'Optional external schedule link, http:// or https://' },
  {
    key: 'epg_file',
    label: 'Guide file',
    hint: 'File name inside public/EPGs/ — e.g. radio-topo.json. Blank when the station has no guide.',
  },
  { key: 'mailto', label: 'Contact email', hint: 'Free-form contact address.' },
]

/** How the form groups the columns; order here is the order on screen. */
export const STATION_FIELD_SECTIONS = [
  { title: 'Station', keys: ['id', 'name', 'stream_broken', 'has_ads', 'country', 'countrycode', 'state'] },
  { title: 'Stream', keys: ['url', 'url_http', 'url_https', 'codec', 'bitrate', 'hls', 'lastcheckok'] },
  { title: 'Links and contact', keys: ['homepage', 'favicon', 'tags', 'mailto'] },
  { title: 'Guide', keys: ['epg_file', 'epg_url'] },
]

/** Metadata for a column, falling back to its raw CSV name. */
export function stationField(key) {
  return (
    STATION_FIELDS.find((field) => field.key === key) || {
      key,
      label: key,
      hint: '',
      type: 'text',
      readonly: false,
    }
  )
}
