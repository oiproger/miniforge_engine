import { spawnSync } from 'node:child_process'
import { chmodSync, copyFileSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const target = process.argv[2] ?? 'steam-depot'
const out = resolve(target)
const cargo = spawnSync('cargo', [
  'build', '--release', '--features', 'custom-protocol,steamworks',
  '--manifest-path', 'src-tauri/Cargo.toml', '--message-format=json-render-diagnostics',
], { encoding: 'utf8', stdio: ['inherit', 'pipe', 'inherit'], maxBuffer: 32 * 1024 * 1024 })
if (cargo.error) throw cargo.error
let binary
let sdk
for (const line of cargo.stdout.split('\n')) {
  if (!line.startsWith('{')) continue
  const event = JSON.parse(line)
  if (event.reason === 'compiler-message' && event.message.rendered) process.stderr.write(event.message.rendered)
  if (event.reason === 'compiler-artifact' && event.executable && event.target.name === 'miniforge') binary = event.executable
  if (event.reason === 'build-script-executed' && event.package_id.includes('steamworks-sys')) sdk = event.out_dir
}
if (cargo.status !== 0 || !binary || !sdk) throw new Error('Steam-enabled native build failed')
const api = { linux: 'libsteam_api.so', darwin: 'libsteam_api.dylib', win32: process.arch === 'ia32' ? 'steam_api.dll' : 'steam_api64.dll' }[process.platform]
if (!api) throw new Error('Unsupported Steam platform')
mkdirSync(out, { recursive: true })
const exe = process.platform === 'win32' ? 'miniforge.exe' : 'miniforge'
copyFileSync(binary, join(out, exe))
copyFileSync(join(sdk, api), join(out, api))
if (process.platform !== 'win32') chmodSync(join(out, exe), 0o755)
const localAppId = process.env.MINIFORGE_STEAM_TEST_APP_ID?.trim()
if (localAppId && !/^[1-9]\d{0,9}$/.test(localAppId)) throw new Error('Invalid Steam test AppID')
const appIdPath = join(out, 'steam_appid.txt')
if (localAppId) writeFileSync(appIdPath, localAppId + '\n')
else rmSync(appIdPath, { force: true })
console.log('Steam depot files:', out, '(Steam client and configured AppID required)')
