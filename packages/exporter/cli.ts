import { mkdir, writeFile, readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { gzipSync } from 'node:zlib'
import { buildGame, exportProject, importProject, type Profile } from './src'
import { createTemplate } from '../../templates'

const root = fileURLToPath(new URL('../../', import.meta.url))
const [input = '', profile = 'all', directory = 'dist/games'] = process.argv.slice(2)
const destination = path.resolve(directory)
const readRuntime = (name: string) => readFile(path.join(root, 'apps/editor/public/engine', name), 'utf8')
const project = input
  ? await importProject(new Blob([Uint8Array.from(await readFile(input))]))
  : createTemplate('coin-rush')
const profiles: Profile[] = profile === 'all' ? ['web', 'yandex', 'poki'] : [profile as Profile]
await mkdir(destination, { recursive: true })
for (const selected of profiles) {
  const { blob, report, files } = await buildGame(project, selected, readRuntime)
  for (const [name, contents] of Object.entries(files)) {
    const target = path.join(destination, selected, name)
    await mkdir(path.dirname(target), { recursive: true })
    await writeFile(target, contents)
  }
  const zip = path.join(destination, selected + '.zip')
  await writeFile(zip, new Uint8Array(await blob.arrayBuffer()))
  const jsGzipBytes = Object.entries(files)
    .filter(([k]) => k.endsWith('.js'))
    .reduce((sum, [, bytes]) => sum + gzipSync(bytes).length, 0)
  await writeFile(
    path.join(destination, selected + '-report.json'),
    JSON.stringify({ ...report, path: zip, jsGzipBytes }, null, 2),
  )
  console.info(
    selected,
    report.total + ' B, ZIP ' + report.compressed + ' B, gzip JS ' + jsGzipBytes + ' B',
    zip,
  )
}
if (!input)
  await writeFile(
    path.join(destination, 'coin-rush.miniforge'),
    new Uint8Array(await exportProject(project).arrayBuffer()),
  )
