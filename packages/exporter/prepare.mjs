import {prepareDevice} from '../graphics/device.mjs'
import { build } from 'esbuild'
import {writeScriptAPI} from './script-api.mjs'
import { copyFile, mkdir, readdir } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = fileURLToPath(new URL('../../', import.meta.url))
const publicDir = path.join(root, 'apps/editor/public')
const out = path.join(publicDir, 'engine')
await mkdir(out, { recursive: true })

async function findWasmInDir(dir, depth = 0) {
  if (depth > 2) return null
  let entries
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch {
    return null
  }
  const exact = entries.find((e) => e.isFile() && e.name === 'assimpjs.wasm')
  if (exact) return path.join(dir, exact.name)
  const anyWasm = entries.find((e) => e.isFile() && e.name.endsWith('.wasm'))
  if (anyWasm) return path.join(dir, anyWasm.name)
  for (const e of entries) {
    if (e.isDirectory() && e.name !== 'node_modules') {
      const found = await findWasmInDir(path.join(dir, e.name), depth + 1)
      if (found) return found
    }
  }
  return null
}

async function copyAssimpWasm() {
  const require = createRequire(import.meta.url)
  let entry
  try {
    entry = require.resolve('assimpjs')
  } catch {
    console.warn('[prepare] assimpjs not installed yet — skipping assimpjs.wasm copy')
    return
  }
  const entryDir = path.dirname(entry)
  const wasmSrc =
    (await findWasmInDir(entryDir, 0)) ||
    (await findWasmInDir(path.resolve(entryDir, '..'), 0))
  if (!wasmSrc) {
    throw new Error(`[prepare] Could not locate assimpjs.wasm near ${entry}`)
  }
  await copyFile(wasmSrc, path.join(publicDir, 'assimpjs.wasm'))
}

await copyAssimpWasm()
await prepareDevice()
await writeScriptAPI(root,out)
const base = {
  absWorkingDir: root,
  bundle: true,
  minify: true,
  target: 'es2022',
  format: 'esm',
  legalComments: 'eof',
}
await build({
  ...base,
  entryPoints: ['packages/runtime/src/physics.ts'],
  outfile: path.join(out, 'physics.js'),
})
for (const profile of ['web', 'yandex', 'poki']) {
  const source = `import {startGame} from './packages/runtime/src/index.ts'
import {createPlatform} from './packages/platform-sdk/src/${profile}.ts'
import {createPlatform as mock} from './packages/platform-sdk/src/web.ts'
import {boot} from './packages/exporter/src/boot.ts'
void boot(startGame,new URLSearchParams(location.search).get('mock')==='1'?mock:createPlatform)`
  const result = await build({
    ...base,
    stdin: { contents: source, resolveDir: root },
    outfile: path.join(out, profile + '.js'),
    metafile: true,
  })
  const forbidden = Object.keys(result.metafile.inputs).filter(
    (name) =>
      /node_modules\/(react(-dom)?|monaco-editor|typescript|assimpjs)\//.test(name) ||
      name.includes('apps/editor/') ||
      /node_modules\/three\//.test(name),
  )
  if (forbidden.length) throw new Error('Editor dependency in runtime: ' + forbidden.join(', '))
}
