// LittleJS keeps its renderer and object registry at module scope. Compile a fresh scope per
// viewport so closing a preview or rendering a thumbnail cannot mutate another scene.
import { build } from 'esbuild'
import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
export async function prepareDevice() {
  const engine = await readFile(
    fileURLToPath(import.meta.resolve('littlejsengine/dist/littlejs.release.js')),
    'utf8',
  )
  const license = await readFile(
    new URL('../LICENSE', import.meta.resolve('littlejsengine/dist/littlejs.release.js')),
    'utf8',
  )
  const multiShadow = await readFile(new URL('./multi-shadow.js', import.meta.url), 'utf8')
  const adapter = await readFile(new URL('./device-entry.js', import.meta.url), 'utf8')
  const { outputFiles } = await build({
    stdin: { contents: engine + '\n' + multiShadow + '\n' + adapter },
    format: 'iife',
    globalName: 'device',
    minify: true,
    write: false,
    target: 'es2022',
  })
  await writeFile(
    new URL('./src/device.generated.js', import.meta.url),
    '/*! LittleJS Engine\n' +
      license +
      ' */\nexport function createDevice(host){' +
      outputFiles[0].text +
      '\nreturn device.mount(host)}',
  )
}
if (process.argv[1] === fileURLToPath(import.meta.url)) await prepareDevice()
