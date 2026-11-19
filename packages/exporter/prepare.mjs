import { build } from 'esbuild'
import {writeScriptAPI} from './script-api.mjs'
import { mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = fileURLToPath(new URL('../../', import.meta.url))
const out = path.join(root, 'apps/editor/public/engine')
await mkdir(out, { recursive: true })
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
      /node_modules\/(react(-dom)?|monaco-editor|typescript)\//.test(name) || name.includes('apps/editor/'),
  )
  if (forbidden.length) throw new Error('Editor dependency in runtime: ' + forbidden.join(', '))
}
