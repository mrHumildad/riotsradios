// Launches the MetalliCSS interactive material lab from the checkout in
// node_modules. Run: npm run metallicss:lab [-- --port 4174]
//
// The published package ships only the built library, so index.html and demo/
// come from the repository's main branch. The checkout is created on first run
// and replaced by `npm ci`, which is why this re-clones when it is missing.
// --engine-strict=false: the lab's eslint tooling wants Node >= 22.13 and the
// lab server itself only uses Node built-ins.

import { execFileSync, spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

const REPO = 'https://github.com/MikaeI/metallicss'
const LAB_DIR = resolve('node_modules/.metallicss-lab')
const SERVER = resolve(LAB_DIR, 'scripts/serve.mjs')
const DEFAULT_PORT = 4173

function ensureLab() {
  if (existsSync(SERVER)) return
  console.log(`MetalliCSS lab not found — cloning ${REPO}`)
  execFileSync('git', ['clone', '--depth', '1', REPO, LAB_DIR], { stdio: 'inherit' })
  execFileSync('npm', ['ci', '--no-audit', '--no-fund', '--engine-strict=false'], {
    stdio: 'inherit',
    cwd: LAB_DIR,
  })
}

function requestedPort() {
  const flag = process.argv.indexOf('--port')
  const raw = flag === -1 ? (process.env.PORT ?? DEFAULT_PORT) : process.argv[flag + 1]
  const port = Number.parseInt(raw, 10)
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error(`invalid port: ${raw}`)
  return port
}

function main() {
  ensureLab()
  const port = requestedPort()
  const child = spawn(process.execPath, [SERVER, '--port', String(port)], { stdio: 'inherit' })
  child.on('exit', (code, signal) => {
    if (signal) process.kill(process.pid, signal)
    else process.exit(code ?? 0)
  })
}

try {
  main()
} catch (e) {
  console.error(`metallicss:lab failed: ${e.message ?? e}`)
  process.exit(1)
}
