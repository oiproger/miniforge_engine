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
