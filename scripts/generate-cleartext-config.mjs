// Writes the Android network security config from data/cleartext-hosts.json.
// Run: node scripts/generate-cleartext-config.mjs [--check]
//
// --check writes nothing and exits 1 when the committed XML is stale; the
// catalog validator runs the same comparison, so CI catches drift without an
// extra workflow step.

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { parseAllowlist, renderNetworkSecurityConfig } from '../lib/cleartext.js'

const ALLOWLIST_PATH = 'data/cleartext-hosts.json'
const OUTPUT_PATH = 'android/app/src/main/res/xml/network_security_config.xml'

async function main() {
  const check = process.argv.includes('--check')

  let allowlist
  try {
    allowlist = parseAllowlist(JSON.parse(await readFile(ALLOWLIST_PATH, 'utf8')))
  } catch (e) {
    console.error(`Cannot read ${ALLOWLIST_PATH}: ${e.message}`)
    process.exit(1)
  }

  const xml = renderNetworkSecurityConfig(allowlist.entries)

  let current = null
  try {
    current = await readFile(OUTPUT_PATH, 'utf8')
  } catch {
    current = null
  }

  if (current === xml) {
    console.log(`${OUTPUT_PATH} is up to date (${allowlist.entries.length} host(s))`)
    return
  }

  if (check) {
    console.error(`${OUTPUT_PATH} is stale — run \`npm run cleartext:config\``)
    process.exit(1)
  }

  if (current === null) {
    console.log(`${OUTPUT_PATH} does not exist yet; nothing to generate into (android/ not added?)`)
    return
  }

  await mkdir(dirname(OUTPUT_PATH), { recursive: true })
  await writeFile(OUTPUT_PATH, xml, 'utf8')
  console.log(`Wrote ${OUTPUT_PATH} (${allowlist.entries.length} host(s))`)
}

main().catch((e) => {
  console.error('Generate failed:', e)
  process.exit(1)
})
