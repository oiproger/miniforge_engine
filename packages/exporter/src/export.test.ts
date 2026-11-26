import { transformSync } from 'esbuild'
import type { GameAPI } from '../../runtime/src/types'
import { createEventGraphLifecycle } from '../../runtime/src/eventGraph'
import { compileEventGraphToScript } from './nativizeEventGraph'
import type { EventGraphData } from '../../project-schema/src/eventGraph'
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

test('export retains a material referenced only by a 3D decal', async () => {
  const project = makeProject('Decal Materials')
  const material = { id: 'decal-material', name: 'Puddle', type: 'material' as const, data: '',
    properties: { color: '#556677', roughness: 0.2, metalness: 0.8 } }
  project.assets.push(material)
  const decal = makeEntity('Puddle decal')
  decal.components = [{ type: 'decal', material: material.id, projection: 'surface', projectionDepth: 0.6 }]
  project.scenes[0].entities.push(decal)
  const result = await buildGame(project, 'web', async file => '// fixture: ' + file)
  const zip = unzipSync(new Uint8Array(await result.blob.arrayBuffer()))
  const config = JSON.parse(strFromU8(zip['project.json']))
  expect(config.project.assets.map((a: { id: string }) => a.id)).toContain(material.id)
})

test('nativized export retains graphs that require the interpreter and reports why', async () => {
  const project = makeProject('Graph compatibility')
  project.settings.export = { nativizeEventGraphs: true }
  const entity = makeEntity('Graph actor')
  const base = { version: 1, variables: [], functions: [], edges: [] }
  for (const [id, type] of [['compiled', 'event.start'], ['interpreted', 'func.call']]) {
    project.assets.push({ id, name: id, type: 'graph', data: JSON.stringify({
      ...base, nodes: [{ id: 'node', type, x: 0, y: 0 }],
    }), properties: {} })
    entity.components.push({ type: 'eventGraph', asset: id })
  }
  project.scenes[0].entities.push(entity)
  const build = await buildGame(project, 'web', async () => '// runtime')
  const exported = JSON.parse(strFromU8(build.files['project.json']))
  expect(build.report.nativizedGraphs).toBe(1)
  expect(build.report.graphFallbacks).toEqual(['interpreted: func.call'])
  expect(exported.project.scenes[0].entities.at(-1).components.slice(-2).map((component: {type: string}) => component.type))
    .toEqual(['script', 'eventGraph'])
  expect(exported.project.assets.find((asset: {id: string}) => asset.id === 'interpreted').type).toBe('graph')
})

test('compiled graph matches the interpreter for raycast, prefab, rotation and emitted payload', () => {
  const nodes = [
    { id: 'start', type: 'event.start' },
    { id: 'spawn', type: 'entity.spawnPrefab', inputs: { assetId: 'npc', position: [1, 2, 3] } },
    { id: 'rotate', type: 'entity.setRot', inputs: { rotation: [0, Math.PI / 2, 0] } },
    { id: 'emit', type: 'flow.emitEvent', inputs: { eventName: 'marker.target' } },
    { id: 'ray', type: 'physics.raycast', inputs: { direction: [0, -1, 0], length: 4, exclude: ['helper'] } },
  ].map((node) => ({ ...node, x: 0, y: 0 }))
  const graph: EventGraphData = {
    version: 1, nodes, functions: [], variables: [],
    edges: [
      { id: 'e1', fromNode: 'start', fromPin: 'exec', toNode: 'spawn', toPin: 'exec' },
      { id: 'e2', fromNode: 'spawn', fromPin: 'exec', toNode: 'rotate', toPin: 'exec' },
      { id: 'e3', fromNode: 'spawn', fromPin: 'spawnedId', toNode: 'rotate', toPin: 'id' },
      { id: 'e4', fromNode: 'rotate', fromPin: 'exec', toNode: 'emit', toPin: 'exec' },
      { id: 'e5', fromNode: 'ray', fromPin: 'id', toNode: 'emit', toPin: 'payload' },
    ],
  }
  const compiled = transformSync(compileEventGraphToScript(graph, 'Parity')
    .replace('export default function', 'const create = function'), { loader: 'ts' }).code
  const load = new Function(compiled + '\nreturn create')() as (api: GameAPI) => ReturnType<typeof createEventGraphLifecycle>
  const run = (create: (api: GameAPI) => { onStart?(): void }) => {
    const calls: unknown[][] = []
    const mock = {
      entity: { id: 'player' },
      spawnPrefab: (asset: string, position: unknown) => {
        calls.push(['spawn', asset, position])
        return 'npc-1'
      },
      find: (id: string) => ({ rotation: { set: (...angles: number[]) => calls.push(['rotation', id, ...angles]) } }),
      events: { emit: (...args: unknown[]) => calls.push(['event', ...args]) },
      physics: {
        raycastHit: (...args: unknown[]) => {
          calls.push(['raycast', ...args])
          return { id: 'wall' }
        },
      },
    } as unknown as GameAPI
    create(mock).onStart?.()
    return calls
  }
  const expected = [
    ['spawn', 'npc', [1, 2, 3]],
    ['rotation', 'npc-1', 0, Math.PI / 2, 0],
    ['raycast', [0, 1, 0], [0, -1, 0], 4, ['player', 'helper']],
    ['event', 'marker.target', 'wall'],
  ]
  expect(run((api) => createEventGraphLifecycle(graph, api))).toEqual(expected)
  expect(run(load)).toEqual(expected)
})
