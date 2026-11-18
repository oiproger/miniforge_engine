import { test, expect } from 'vitest'
import { strFromU8, unzipSync } from 'fflate'
import { makeProject, makeEntity } from '../../project-schema/src'
import { buildGame, exportProject, importProject } from './index'
test('project archive round trip includes assets, script and hierarchy', async () => {
  const project = makeProject('Archive')
  project.assets.push({
    id: 'code',
    type: 'script',
    name: 'test.ts',
    data: 'export const n:number=1',
    properties: {},
  })
  project.scenes[0].entities.push(makeEntity('Floor', 'box'))
  expect(await importProject(exportProject(project))).toEqual(project)
})
test('export links JS modules, strips unused assets and contains HTML at ZIP root', async () => {
  const project = makeProject('Example')
  const e = makeEntity('Rotator', 'box')
  e.components.push({ type: 'script', asset: 'code' })
  project.scenes[0].entities.push(e)
  project.assets.push({
    id: 'code',
    type: 'script',
    name: 'update.ts',
    data: 'export const turns: number = 3',
    properties: {},
  })
  const build = await buildGame(project, 'yandex', async (file) => '// fixture: ' + file)
  const archive = unzipSync(new Uint8Array(await build.blob.arrayBuffer()))
  expect(strFromU8(archive['index.html'])).toContain('./game.js')
  const config = JSON.parse(strFromU8(archive['project.json']))
  expect(strFromU8(archive[config.modules.code.slice(2)])).toMatch(/export const turns = 3/)
  expect(strFromU8(archive['game.js'])).toContain('yandex.js')
})
test('rejects corrupt archives and TypeScript syntax errors', async () => {
  await expect(importProject(new Blob(['{}']))).rejects.toThrow()
  const p = makeProject()
  p.assets.push({ id: 'bad', type: 'script', name: 'bad.ts', data: 'export const x: =', properties: {} })
  const e = makeEntity('Bad script')
  e.components.push({ type: 'script', asset: 'bad' })
  p.scenes[0].entities.push(e)
  await expect(buildGame(p, 'web', async () => '')).rejects.toThrow(/bad.ts/)
})
