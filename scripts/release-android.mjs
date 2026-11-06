// Full Android release: sync → versionCode +1 → bundle + assemble → export.
// Run: npm run release:android
//
// versionName is owned by changesets/package.json (android/app/build.gradle reads
// it), so this only ever moves versionCode. Every upload needs a fresh one,
// including a re-upload after a rejected review.

import { execFileSync } from 'node:child_process'
import { readFile, writeFile } from 'node:fs/promises'

const GRADLE = 'android/app/build.gradle'

function run(command, cwd = process.cwd()) {
  console.log(`\n$ ${command}`)
  execFileSync('bash', ['-lc', command], { stdio: 'inherit', cwd })
}

async function bumpVersionCode() {
  const gradle = await readFile(GRADLE, 'utf8')
  const match = /versionCode\s+(\d+)/.exec(gradle)
  if (!match) throw new Error(`cannot read versionCode from ${GRADLE}`)
  const next = Number(match[1]) + 1
  await writeFile(GRADLE, gradle.replace(match[0], `versionCode ${next}`), 'utf8')
  console.log(`versionCode ${match[1]} → ${next}`)
}

async function main() {
  const guard = process.argv.includes('--no-bump')
  run('npm run android:sync')
  if (!guard) await bumpVersionCode()
  run('./gradlew bundleRelease assembleRelease', 'android')
  run('node scripts/export-android.mjs')
}

main().catch((e) => {
  console.error(`release:android failed: ${e.message ?? e}`)
  process.exit(1)
})
