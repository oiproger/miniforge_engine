import { afterEach, expect, test, vi } from 'vitest'
import { SceneNode as Group, SceneNode as Scene } from '../../graphics/src/scene'
import { makeEntity, makePrefab, makeProject } from '../../project-schema/src'
import type { Entity, Project } from '../../project-schema/src'
import type { GameAPI } from './types'
import { startGame } from './index'

vi.mock('../../graphics/src', () => ({
  createWorld(_host: unknown, p: Project) {
    const scene = new Scene(),
      objects = new Map<string, Group>()
    function addEntities(entities: Entity[]) {
      for (const e of entities) {
        const group = new Group()
        group.visible = e.active
        group.position.fromArray(e.transform.position)
        objects.set(e.id, group)
      }
      for (const e of entities) (e.parent ? objects.get(e.parent)! : scene).add(objects.get(e.id)!)
    }
    addEntities(p.scenes[0].entities)
    return {
      scene,
      objects,
      addEntities,
      renderer: { domElement: new EventTarget() },
      render() {},
      ready() {},
      dispose() {},
      updateAnimations() {},
      removeEntities(ids: string[]) {
        for (const id of ids) {
          objects.get(id)?.detach()
          objects.delete(id)
        }
      },
      setEntityActive(id: string, on: boolean) {
        objects.get(id)!.visible = on
      },
    }
  },
}))
vi.mock('./overlay', () => ({
  Overlay: class {
    host = {}
    get() {}
    render() {}
    dispose() {}
    close() {}
  },
  translate: () => '',
}))

afterEach(() => vi.unstubAllGlobals())
test('a live prefab subtree owns scripts, event subscriptions, visibility and collision bodies', async () => {
  vi.stubGlobal('window', new EventTarget())
  vi.stubGlobal('document', new EventTarget())
  vi.stubGlobal('requestAnimationFrame', () => 1)
  vi.stubGlobal('cancelAnimationFrame', () => {})
  vi.stubGlobal('getComputedStyle', () => ({ position: 'relative' }))
  const p = makeProject(),
    scene = p.scenes[0],
    root = makeEntity('Root'),
    child = makeEntity('Child'),
    factory = makeEntity('Factory')
  child.parent = root.id
  child.properties.tags = ['spawned']
  child.components = [{ type: 'script', asset: 'child' }]
  root.components = [{ type: 'body', kind: 'dynamic' }]
  scene.entities = [root, child]
  const prefab = makePrefab(scene, root.id)
  p.assets.push(prefab)
  factory.components = [{ type: 'script', asset: 'factory' }]
  scene.entities = [factory]
  let game!: GameAPI,
    listener = 0
  const called: string[] = []
  const platform = {
    initialize: async () => {},
    loadingReady() {},
    gameplayStart() {},
    gameplayStop() {},
    loadData: async () => null,
    saveData: async () => {},
    getLanguage: () => 'en',
    isAvailable: () => true,
    showRewarded: async () => false,
    showInterstitial: async () => false,
  }
  const body = {
    add: vi.fn(),
    remove: vi.fn(),
    setActive: vi.fn(),
    raycast: () => undefined,
    step() {},
    dispose() {},
  }
  const session = await startGame({ append() {} } as unknown as HTMLElement, p, {
    platform,
    physics: async () => body,
    scripts: {
      factory: {
        default: (api: GameAPI) => {
          game = api
          return {}
        },
      },
      child: {
        default: (api: GameAPI) => ({
          onCreate() {
            called.push('create')
            api.events.on('pulse', () => listener++)
          },
          onStart() {
            called.push('start')
          },
          onDestroy() {
            called.push('destroy')
          },
        }),
      },
    },
  })
  try {
    const id = game.spawnPrefab(prefab.id, [4, 5, 6])
    const [kid] = game.findByTag('spawned')
    expect(game.find(kid)?.parent).toBe(game.find(id))
    expect(game.find(id)?.position.toArray()).toEqual([4, 5, 6])
    expect(called).toEqual(['create', 'start'])
    expect(body.add.mock.calls.map((c) => c[0].id)).toEqual([id, kid])
    game.events.emit('pulse')
    game.setActive(id, false)
    game.events.emit('pulse')
    expect(listener).toBe(1)
    expect(body.setActive).toHaveBeenCalledWith(kid, false)
    game.setActive(id, true)
    game.events.emit('pulse')
    expect(listener).toBe(2)
    game.destroy(id)
    game.destroy(id)
    game.events.emit('pulse')
    expect(listener).toBe(2)
    expect(called).toEqual(['create', 'start', 'destroy'])
    expect(game.find(id)).toBeUndefined()
    expect(game.find(kid)).toBeUndefined()
    expect(game.findByTag('spawned')).toEqual([])
    expect(body.remove).toHaveBeenCalledTimes(2)
    expect(scene.entities).toEqual([factory])
  } finally {
    session.dispose()
  }
})
