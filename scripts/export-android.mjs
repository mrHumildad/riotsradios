// Copies the release artifacts into android-builds/ under a versioned name.
// Run: node scripts/export-android.mjs
//
// Refuses a stale APK: `./gradlew bundleRelease` alone leaves yesterday's
// app-release.apk on disk, and copying it would ship the old binary under the
// new version's name (the RSD v1.0.3–v1.0.13 incident). Building both tasks in
// one run is not enough either — this checks what the files actually say.

import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { copyFile, mkdir, readFile, stat } from 'node:fs/promises'
import path from 'node:path'

const AAB = 'android/app/build/outputs/bundle/release/app-release.aab'
const APK = 'android/app/build/outputs/apk/release/app-release.apk'
const APK_META = 'android/app/build/outputs/apk/release/output-metadata.json'
const OUT_DIR = 'android-builds'

// Gradle signing is only visible as a META-INF signature inside the AAB, and an
// unsigned bundle is rejected by the Console, not by Gradle's exit code.
function verifySigned(aab) {
  if (which('jarsigner')) {
    const out = execFileSync('jarsigner', ['-verify', aab], { encoding: 'utf8' })
    if (!/jar verified/.test(out)) fail(`AAB is not signed:\n${out.trim()}`)
    return
  }
  // Some JRE-only installs ship keytool but not jarsigner.
  const out = execFileSync('keytool', ['-printcert', '-jarfile', aab], { encoding: 'utf8' })
  if (!/Owner:/.test(out)) fail('AAB carries no signing certificate')
}

function which(bin) {
  for (const dir of (process.env.PATH ?? '').split(path.delimiter)) {
    const candidate = path.join(dir, bin)
    try {
      if (existsSync(candidate)) return candidate
    } catch {
      // unreadable PATH entry, keep looking
    }
  }
  return null
}

function fail(message) {
  console.error(`export-android: ${message}`)
  process.exit(1)
}

async function sizeOf(p) {
  const s = await stat(p).catch(() => null)
  return s
}

async function main() {
  const { version } = JSON.parse(await readFile('package.json', 'utf8'))
  const gradle = await readFile('android/app/build.gradle', 'utf8')
  const versionCode = Number(/versionCode\s+(\d+)/.exec(gradle)?.[1])
  if (!versionCode) fail('cannot read versionCode from android/app/build.gradle')

  const aabStat = await sizeOf(AAB)
  if (!aabStat) fail(`no AAB at ${AAB} — run \`npm run android:bundle\` first`)
  const apkStat = await sizeOf(APK)
  if (!apkStat) fail(`no APK at ${APK} — run \`npm run android:bundle\` first`)

  const meta = JSON.parse(await readFile(APK_META, 'utf8'))
  const element = meta.elements?.[0]
  if (!element) fail(`${APK_META} has no elements[]; cannot verify the APK`)

  if (Number(element.versionCode) !== versionCode) {
    fail(
      `stale APK: it was built as versionCode ${element.versionCode} but Gradle now says ${versionCode}. ` +
        'Run bundleRelease and assembleRelease in one Gradle run.',
    )
  }
  if (element.versionName !== version) {
    fail(`APK versionName ${element.versionName} != package.json ${version} — rebuild after the version change`)
  }
  // Same-run artifacts are written seconds apart; a stale APK predates the AAB.
  if (apkStat.mtimeMs < aabStat.mtimeMs - 2000) {
    fail('stale APK: it is older than the AAB. Run bundleRelease and assembleRelease together.')
  }

  verifySigned(AAB)

  await mkdir(OUT_DIR, { recursive: true })
  const base = path.join(OUT_DIR, `riotsradios-v${version}`)
  const aab = `${base}.aab`
  const apk = `${base}.apk`
  await copyFile(AAB, aab)
  await copyFile(APK, apk)

  const mb = (bytes) => `${(bytes / 1024 / 1024).toFixed(1)} MB`
  console.log(`versionCode ${versionCode}, versionName ${version}`)
  console.log(`${aab}  ${mb(aabStat.size)}`)
  console.log(`${apk}  ${mb(apkStat.size)}`)
}

main().catch((e) => fail(e.message ?? String(e)))
