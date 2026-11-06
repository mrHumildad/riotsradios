/**
 * Catalog field metadata, shared by the player UI and the dev catalog API.
 *
 * One list so the edit modal and the server-side column checks always agree on
 * labels, hints and which fields are writable. Pure data: no React, no Node.
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
  { key: 'location', label: 'Location', hint: 'e.g. Barri Gotic, Barcelona' },
  { key: 'webpage', label: 'Web page', hint: 'Station site, http:// or https://' },
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
  { key: 'icon', label: 'Icon URL', hint: 'Station logo image, http:// or https://' },
  { key: 'epg_url', label: 'Guide URL', hint: 'Optional external schedule link, http:// or https://' },
  {
    key: 'epg_file',
    label: 'Guide file',
    hint: 'File name inside public/EPGs/ — e.g. topo.json. Blank when the station has no guide.',
  },
  { key: 'mailto', label: 'Contact email', hint: 'Free-form contact address.' },
]

/** How the form groups the columns; order here is the order on screen. */
export const STATION_FIELD_SECTIONS = [
  { title: 'Station', keys: ['id', 'name', 'location', 'stream_broken', 'has_ads'] },
  { title: 'Stream URLs', keys: ['url', 'url_http', 'url_https'] },
  { title: 'Links and contact', keys: ['webpage', 'icon', 'mailto'] },
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
