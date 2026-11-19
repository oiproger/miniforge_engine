import { describe, expect, it } from 'vitest'
import { createTemplate, templates } from '../../../templates'
import {
  duplicateEntity,
  getScene,
  instantiatePrefab,
  makeEntity,
  makePrefab,
  makeProject,
  parseProject,
  removeEntity,
  reparentEntity,
  serializeProject,
  validateProject,
} from './index'
import { readFileSync } from 'node:fs'

describe('versioned scene format', () => {
  it('round trips scripts, transforms, user metadata and localization losslessly', () => {
    const p = makeProject('A bilingual level')
    const actor = makeEntity('Ship', 'capsule')
    actor.properties = { health: 80, buffs: ['fast'] }
    actor.transform.position = [1, 2, -3]
    actor.components.push({ type: 'script', asset: 'orbit', params: { speed: 2 } })
    getScene(p).entities.push(actor)
    p.locales.ru.greet = 'Привет, {name}!'
    p.assets.push({
      id: 'orbit',
      type: 'script',
      name: 'orbit.ts',
      data: 'export default {}',
      properties: {},
    })
    expect(parseProject(serializeProject(p))).toEqual(p)
  })
  it.each(templates.map((t) => t.id))('builds a valid %s project', (key) => {
    const p = createTemplate(key)
    expect(validateProject(p)).toBe(p)
    expect(getScene(p).entities.some((e) => e.components.some((c) => c.type === 'camera'))).toBe(true)
    expect(getScene(p).entities.some((e) => e.components.some((c) => c.type === 'light'))).toBe(true)
    for (const e of getScene(p).entities)
      for (const c of e.components.filter((c) => c.type === 'mesh')) {
        const assetId = c.shape === 'model' ? c.asset : c.material
        const assetType = c.shape === 'model' ? 'model' : 'material'
        expect(p.assets.some((a) => a.id === assetId && a.type === assetType)).toBe(true)
      }
  })
  it('opens the shipped Coin Rush project from disk', () => {
    const p = parseProject(
      readFileSync(new URL('../../../examples/Coin Rush 3D.json', import.meta.url), 'utf8'),
    )
    const entities = getScene(p).entities
    expect(entities.filter((e) => e.components.some((c) => c.kind === 'collectible'))).toHaveLength(10)
    expect(entities.filter((e) => e.components.some((c) => c.kind === 'player'))).toHaveLength(1)
    expect(p.assets.filter((a) => a.type === 'prefab')).toHaveLength(6)
  })
  it('rejects corrupt transforms and missing or cyclic parents', () => {
    const p = makeProject()
    const a = makeEntity('Root'),
      b = makeEntity('Child')
    const entities = getScene(p).entities
    entities.push(a, b)
    b.parent = a.id
    a.parent = b.id
    expect(() => validateProject(p)).toThrow(/cycle/)
    a.parent = 'unknown'
    expect(() => validateProject(p)).toThrow(/parent/)
    a.parent = null
    b.transform.position[2] = Infinity
    expect(() => validateProject(p)).toThrow(/position/)
    b.transform.position[2] = 0
    b.id = a.id
    expect(() => validateProject(p)).toThrow(/duplicate/)
  })
  it('validates schema version before attempting to use the scene', () => {
    expect(() => parseProject('{"version":9}')).toThrow(/version/)
  })
  it('clones entire subtrees, rebinds internal links, preserves outside references, removes descendants', () => {
    const scene = getScene(makeProject())
    const a = makeEntity('Root'),
      b = makeEntity('Child'),
      c = makeEntity('Outside')
    b.parent = a.id
    b.components = [{ type: 'behavior', kind: 'follow', params: { target: a.id, other: c.id } }]
    scene.entities = [a, b, c]
    const copy = duplicateEntity(scene, a.id)
    const childCopy = scene.entities.find((e) => e.parent === copy.id)!
    expect(copy.name).toBe('Root Copy')
    expect(childCopy.components[0].params).toEqual({ target: copy.id, other: c.id })
    expect(childCopy.id).not.toBe(b.id)
    expect(reparentEntity(scene, a.id, b.id)).toBe(false)
    expect(reparentEntity(scene, copy.id, c.id)).toBe(true)
    removeEntity(scene, c.id)
    expect(scene.entities).toEqual([a, b])
  })
  it('instantiates shared prefab assets without mutating their data', () => {
    const p = createTemplate('coin-rush'),
      scene = getScene(p)
    const prefab = makePrefab(scene, 'pine-0'),
      saved = prefab.data
    const first = instantiatePrefab(scene, prefab)
    const second = instantiatePrefab(scene, prefab, first.id)
    expect(second.parent).toBe(first.id)
    expect(first.id).not.toBe(second.id)
    expect(prefab.data).toBe(saved)
    expect(validateProject(p)).toBe(p)
  })
})
