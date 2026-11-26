import { afterEach, expect, test, vi } from 'vitest'
import { makeEntity, makeProject } from '../../project-schema/src'
import { makeVaultDoor } from '../../../templates/vault-door'
import { createWorld } from './index'
import { createDevice } from './device.generated'

vi.mock('./device.generated', async (original) => {
  const real = await original<typeof import('./device.generated')>()
  return {
    createDevice: () => ({
      ...real.createDevice(null),
      canvas: { style: {}, dataset: {} },
      setWhiteSprite: () => {},
      whiteTexture: () => null,
    }),
  }
})
afterEach(() => vi.unstubAllGlobals())
const host = {} as HTMLElement
test('native glTF loader applies both hinge poses to the authored vault door', async () => {
  const d = createDevice(null),
    model = await d.loadGLTF(makeVaultDoor().data)
  try {
    const obj = model.createObject()
    obj.play('Open', false)
    obj.setAnimationTime(0.45)
    const angles = obj.parts.map((p) => p.rotation3D.y)
    expect(Math.min(...angles)).toBeLessThan(-0.1)
    expect(Math.max(...angles)).toBeGreaterThan(0.1)
    obj.destroy()
  } finally {
    model.dispose()
    d.dispose()
  }
})
test('inactive models pause and a non-looping clip emits completion once', async () => {
  vi.stubGlobal('window', { devicePixelRatio: 1 })
  const p = makeProject(),
    gate = makeEntity('Gate'),
    asset = makeVaultDoor()
  p.assets.push(asset)
  gate.components = [
    { type: 'mesh', shape: 'model', asset: asset.id },
    { type: 'animation', autoplay: false },
  ]
  p.scenes[0].entities.push(gate)
  const finish = vi.fn(),
    w = createWorld(host, p, undefined, { onAnimationFinished: finish })
  try {
    await w.ready()
    expect(w.animationClips(gate.id)).toEqual(['Open'])
    expect(w.playAnimation(gate.id, 'Missing')).toBe(false)
    expect(w.playAnimation(gate.id, 'Open', false)).toBe(true)
    w.setEntityActive(gate.id, false)
    w.updateAnimations(2)
    expect(finish).not.toHaveBeenCalled()
    w.setEntityActive(gate.id, true)
    w.updateAnimations(0.45)
    expect(finish).not.toHaveBeenCalled()
    w.updateAnimations(0.46)
    w.updateAnimations(1)
    expect(finish).toHaveBeenCalledExactlyOnceWith(gate.id, 'Open')
  } finally {
    w.dispose()
  }
})
test('scene hierarchy propagates visibility and removes spawned subtrees', () => {
  vi.stubGlobal('window', { devicePixelRatio: 1 })
  const project = makeProject(),
    parent = makeEntity('Parent'),
    child = makeEntity('Box', 'box')
  child.parent = parent.id
  const w = createWorld(host, project)
  try {
    w.addEntities([parent, child])
    w.setEntityActive(parent.id, false)
    expect(w.objects.get(child.id)?.active).toBe(false)
    w.setEntityActive(parent.id, true)
    expect(w.objects.get(child.id)?.active).toBe(true)
    w.removeEntities([parent.id])
    expect(w.objects.size).toBe(0)
  } finally {
    w.dispose()
  }
})

test('static batching keeps originals intact and releases individual mutations', async () => {
  vi.stubGlobal('window', { devicePixelRatio: 1 })
  const p=makeProject()
  p.settings.performance={ ...(p.settings.performance || {}), staticBatching: true }
  const a=makeEntity('Static A','box'),b=makeEntity('Static B','box')
  a.properties.staticBatch=b.properties.staticBatch=true
  a.transform.position=[1,0,1]
  b.transform.position=[3,0,1]
  p.scenes[0].entities.push(a,b)
  const w=createWorld(host,p)
  try {
    await w.ready()
    expect(w.getBatchStats().mergedEntities).toBe(2)
    w.setEntityColor(a.id,'#ff8800')
    expect(w.getBatchStats().mergedEntities).toBe(0)
    expect(w.objects.has(a.id)).toBe(true)
    w.setEntityActive(b.id,false)
    expect(w.objects.get(b.id)?.active).toBe(false)
    w.setEntityActive(b.id,true)
    expect(w.objects.get(b.id)?.active).toBe(true)
  } finally {w.dispose()}
})

test('repeated static GLBs use instancing and recover individual animation', async () => {
  vi.stubGlobal('window', { devicePixelRatio: 1 })
  const p=makeProject(), asset=makeVaultDoor()
  p.assets.push(asset)
  p.settings.performance={ ...(p.settings.performance || {}), staticBatching:true }
  const a=makeEntity('Door 1'),b=makeEntity('Door 2')
  a.components=[{type:'mesh',shape:'model',asset:asset.id}]
  b.components=[{type:'mesh',shape:'model',asset:asset.id}]
  // Auto Static Batching marks models false: should not disable GLB instancing.
  a.properties.staticBatch=b.properties.staticBatch=false
  a.transform.position=[1,0,1]
  b.transform.position=[4,0,1]
  p.scenes[0].entities.push(a,b)
  const w=createWorld(host,p)
  try {
    await w.ready()
    expect(w.getBatchStats().instancedModels).toBe(2)
    expect(w.getBatchStats().instanceDraws).toBeGreaterThan(0)
    expect(w.playAnimation(a.id,'Open',false)).toBe(true)
    expect(w.getBatchStats().instancedModels).toBe(0)
    expect(w.objects.get(b.id)?.active).toBe(true)
  } finally {w.dispose()}
})


test('surface decals finish projection against static geometry during scene readiness', async () => {
  vi.stubGlobal('window', { devicePixelRatio: 1 })
  const p = makeProject()
  const surface = makeEntity('Receiver', 'box')
  const decal = makeEntity('Projected decal')
  decal.components = [{
    type: 'decal', projection: 'surface', width: 1, height: 1,
    projectionDepth: 1, projectionFacing: 0.2, normalOffset: 0.008,
  }]
  decal.transform.position = [0, 0, 0.25]
  p.scenes[0].entities.push(surface, decal)
  const world = createWorld(host, p)
  try {
    // Previously this reached an undefined refreshProjectedDecals() callback.
    await world.ready()
    expect(world.objects.has(surface.id)).toBe(true)
    expect(world.objects.has(decal.id)).toBe(true)
    world.removeEntities([decal.id]) // also releases generated GPU geometry
    expect(world.objects.has(decal.id)).toBe(false)
  } finally {
    world.dispose()
  }
})

test('surface and plane decals accept material assets with lighting parameters', async () => {
  vi.stubGlobal('window', { devicePixelRatio: 1 })
  const p = makeProject()
  p.assets.push({
    id: 'paint-material', name: 'Wet paint', type: 'material', data: '',
    properties: { color: '#ad5522', opacity: 0.6, metalness: 0.35,
      roughness: 0.3, emissive: '#222211', emissiveIntensity: 0.2,
      tiling: [2, 2], offset: [0.1, 0.1] },
  })
  const receiver = makeEntity('Wall', 'box')
  const decal = makeEntity('Decal')
  decal.components = [{ type: 'decal', projection: 'surface', material: 'paint-material',
    width: 1, height: 1, projectionDepth: 1, opacity: 0.75 }]
  decal.transform.position = [0, 0, 0.25]
  const flat = makeEntity('Flat decal')
  flat.components = [{ type: 'decal', projection: 'plane', material: 'paint-material', opacity: 0.8 }]
  p.scenes[0].entities.push(receiver, decal, flat)
  const world = createWorld(host, p)
  try {
    await world.ready()
    expect(world.objects.has(decal.id)).toBe(true)
    expect(world.objects.has(flat.id)).toBe(true)
    expect(() => world.setDecalOpacity(decal.id, 0.5)).not.toThrow()
  } finally { world.dispose() }
})
