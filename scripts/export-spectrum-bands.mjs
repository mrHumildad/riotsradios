// Writes SpectrumBandTable.kt from lib/audioBands.js.
// Run: node scripts/export-spectrum-bands.mjs [--check]
//
// --check writes nothing and exits 1 when the committed table is stale. The
// same comparison runs in tests/spectrumBandTable.test.mjs, so CI catches drift
// without an extra workflow step.

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { BANDS_KOTLIN_PATH, renderSpectrumBandTable } from '../lib/spectrumBandsCodegen.js'

async function main() {
  const check = process.argv.includes('--check')
  const kotlin = renderSpectrumBandTable()

  let current = null
  try {
    current = await readFile(BANDS_KOTLIN_PATH, 'utf8')
  } catch {
    current = null
  }

  if (current === kotlin) {
    console.log(`${BANDS_KOTLIN_PATH} is up to date`)
    return
  }

  if (check) {
    console.error(`${BANDS_KOTLIN_PATH} is stale — run \`npm run export:bands\``)
    process.exit(1)
  }

  await mkdir(dirname(BANDS_KOTLIN_PATH), { recursive: true })
  await writeFile(BANDS_KOTLIN_PATH, kotlin, 'utf8')
  console.log(`Wrote ${BANDS_KOTLIN_PATH}`)
}

main().catch((e) => {
  console.error('Export failed:', e)
  process.exit(1)
})
