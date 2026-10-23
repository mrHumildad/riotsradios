/**
 * Minimal RFC 4180-style CSV parser.
 *
 * Supports quoted fields, commas inside quotes, escaped quotes ("") and
 * newlines inside quoted fields, plus CRLF line endings and a UTF-8 BOM.
 *
 * Dependency-free on purpose: it runs both in the Vite bundle (stations.js)
 * and in plain Node (scripts/validate-stations.js), so it must not import
 * anything or rely on bundler features.
 *
 * @param {string} text raw CSV contents
 * @returns {string[][]} rows of raw field values; no trimming is applied
 */
export function parseCsv(text) {
  const input = String(text ?? '').replace(/^\uFEFF/, '')
  const rows = []
  let row = []
  let field = ''
  let inQuotes = false

  const endField = () => { row.push(field); field = '' }
  const endRow = () => { endField(); rows.push(row); row = [] }

  for (let i = 0; i < input.length; i++) {
    const char = input[i]

    if (inQuotes) {
      if (char === '"') {
        if (input[i + 1] === '"') { field += '"'; i++ }   /* escaped quote */
        else inQuotes = false                              /* closing quote */
      } else {
        field += char
      }
      continue
    }

    if (char === '"') { inQuotes = true; continue }
    if (char === ',') { endField(); continue }
    if (char === '\r') {
      if (input[i + 1] === '\n') continue                  /* CRLF: let \n end the row */
      endRow(); continue
    }
    if (char === '\n') { endRow(); continue }
    field += char
  }

  /* last row without a trailing newline */
  if (field !== '' || row.length > 0) endRow()

  return rows
}
