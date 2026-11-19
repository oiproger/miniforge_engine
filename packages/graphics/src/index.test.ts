import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as T from 'three'
import { createWorld } from './index'
import { makeVaultDoor } from '../../../templates/vault-door'
import { makeEntity, makeProject } from '../../project-schema/src'

// Substitute the GPU boundary only. Geometry, glTF parsing, instancing and animation use Three.js.
vi.mock('three', async (importOriginal) => ({
  ...(await importOriginal<typeof import('three')>()),
  WebGLRenderer: class {
    shadowMap = {}
    domElement = { style: {}, remove() {} }
    setPixelRatio() {}
    setSize() {}
    dispose() {}
    forceContextLoss() {}
  },
}))

function modelData() {
  const frames = new Float32Array([0, 1, 0, 0, 0, 2, 0, 0])
  const uri = 'data:application/octet-stream;base64,' + Buffer.from(frames.buffer).toString('base64')
  const gltf = {
    asset: { version: '2.0' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ name: 'Door' }],
    buffers: [{ byteLength: frames.byteLength, uri }],
    bufferViews: [
      { buffer: 0, byteLength: 8 },
      { buffer: 0, byteOffset: 8, byteLength: 24 },
    ],
    accessors: [
      { bufferView: 0, componentType: 5126, count: 2, type: 'SCALAR', min: [0], max: [1] },
      { bufferView: 1, componentType: 5126, count: 2, type: 'VEC3' },
    ],
    animations: [
      {
        name: 'Open',
        channels: [{ sampler: 0, target: { node: 0, path: 'translation' } }],
        samplers: [{ input: 0, output: 1, interpolation: 'LINEAR' }],
      },
    ],
  }
  return 'data:model/gltf+json;base64,' + Buffer.from(JSON.stringify(gltf)).toString('base64')
}

const host = { clientWidth: 640, clientHeight: 360, appendChild() {} } as unknown as HTMLElement
beforeEach(() => {
  vi.stubGlobal('window', { devicePixelRatio: 1 })
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    },
  )
  if (!globalThis.ProgressEvent) vi.stubGlobal('ProgressEvent', class {})
})
afterEach(() => vi.unstubAllGlobals())

describe('render world', () => {
  it('resolves embedded glTF clips and advances only playing, active instances', async () => {
    const project = makeProject(),
      e = makeEntity('Gate')
    project.assets.push({ id: 'model', name: 'Gate.gltf', type: 'model', data: modelData(), properties: {} })
    e.components = [
      { type: 'mesh', shape: 'model', asset: 'model' },
      { type: 'animation', clip: 'Open', loop: false, autoplay: false },
    ]
    const world = createWorld(host, project)
    world.addEntities([e])
    await world.ready()
    const door = world.objects.get(e.id)!.getObjectByName('Door')!
    expect(world.animationClips(e.id)).toEqual(['Open'])
    world.updateAnimations(0.25)
    expect(door.position.x).toBe(0)
    expect(world.playAnimation(e.id, 'Missing')).toBe(false)
    expect(world.playAnimation(e.id, 'Open', false, 2)).toBe(true)
    world.updateAnimations(0.25)
    expect(door.position.x).toBeCloseTo(1)
    world.setEntityActive(e.id, false)
    world.updateAnimations(0.25)
    expect(door.position.x).toBeCloseTo(1)
    world.setEntityActive(e.id, true)
    world.updateAnimations(0.25)
    expect(door.position.x).toBeCloseTo(2)
    world.stopAnimation(e.id)
    expect(door.position.x).toBe(0)
    world.removeEntities([e.id])
    expect(world.animationClips(e.id)).toEqual([])
    world.dispose()
  })
  it('plays the authored vault gate and delivers a single completion event for both hinges', async () => {
    const project = makeProject(),
      gate = makeEntity('Vault Gate')
    const asset = makeVaultDoor()
    project.assets.push(asset)
    gate.components = [
      { type: 'mesh', shape: 'model', asset: asset.id },
      { type: 'animation', clip: 'Open', loop: false, autoplay: false, speed: 1 },
    ]
    project.scenes[0].entities.push(gate)
    const finished = vi.fn()
    const world = createWorld(host, project, undefined, { onAnimationFinished: finished })
    await world.ready()
    const hinges = ['West_hinge', 'East_hinge'].map(
      (name) => world.objects.get(gate.id)!.getObjectByName(name)!,
    )
    expect(world.playAnimation(gate.id, 'Open')).toBe(true)
    world.updateAnimations(0.45)
    expect(hinges[0].quaternion.y).toBeLessThan(-0.1)
    expect(hinges[1].quaternion.y).toBeGreaterThan(0.1)
    expect(finished).not.toHaveBeenCalled()
    world.updateAnimations(0.46)
    await Promise.resolve()
    expect(finished).toHaveBeenCalledExactlyOnceWith(gate.id, 'Open')
    world.dispose()
  })
  it('restores batched subtrees when deactivated and removes nested spawned objects', () => {
    const project = makeProject(),
      parent = makeEntity('Parent'),
      children = Array.from({ length: 4 }, () => makeEntity('Block', 'box'))
    for (const child of children) child.parent = parent.id
    project.scenes[0].entities.push(parent, ...children)
    const world = createWorld(host, project)
    expect(world.scene.getObjectsByProperty('type', 'Mesh').some((m) => m instanceof T.InstancedMesh)).toBe(
      true,
    )
    world.setEntityActive(parent.id, false)
    expect(world.objects.get(parent.id)?.visible).toBe(false)
    expect(world.objects.get(children[0].id)?.children[0]).toBeInstanceOf(T.Mesh)
    const marker = makeEntity('Marker')
    marker.parent = parent.id
    marker.components = [{ type: 'sprite', color: '#fad738', width: 2, height: 0.5, opacity: 0.4 }]
    world.addEntities([marker])
    const sprite = world.objects.get(marker.id)!.children[0] as T.Sprite
    expect(sprite).toBeInstanceOf(T.Sprite)
    expect(sprite.material.opacity).toBe(0.4)
    expect(sprite.scale.toArray()).toEqual([2, 0.5, 1])
    world.removeEntities([parent.id])
    expect(world.objects.size).toBe(0)
    world.dispose()
  })
})
