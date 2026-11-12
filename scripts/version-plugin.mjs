// Emit the published app version next to the built site.
//
// A running copy compares the version it was built with against this file; the
// version itself stays owned by package.json (changesets bump it, Gradle reads
// the same field for versionName). Writing it at build time means the deployed
// file can never drift from the bundle it sits next to.
//
// Both `npm run build` (dist/) and `npm run build:android` (dist-android/) get
// the file; the Android copy is inert, since the app reads the published URL.

import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'

export function appVersionPlugin() {
  return {
    name: 'riotsradios-app-version',
    apply: 'build',

    async writeBundle(options) {
      const { version } = JSON.parse(await readFile('package.json', 'utf8'))
      const dir = options.dir || 'dist'
      await mkdir(dir, { recursive: true })
      await writeFile(join(dir, 'version.json'), `${JSON.stringify({ version }, null, 2)}\n`, 'utf8')
    },
  }
}
