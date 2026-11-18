// Project v1 is plain JSON. A component's type and an asset's ID are stable routing keys.
export type Vec3 = [number, number, number]
export type Transform = { position: Vec3; rotation: Vec3; scale: Vec3 }
export interface Component {
  type: string
  enabled?: boolean
  [key: string]: any
}
export interface Entity {
  id: string
  name: string
  parent: string | null
  active: boolean
  transform: Transform
  components: Component[]
  properties: Record<string, any>
}
export interface Environment {
  background: string
  ambient: number
  [key: string]: any
}
export interface Scene {
  id: string
  name: string
  environment: Environment
  entities: Entity[]
}
export type AssetType = 'material' | 'model' | 'texture' | 'audio' | 'script' | 'prefab' | 'shader' | 'json'
export interface Asset {
  id: string
  name: string
  type: AssetType
  data: string
  properties: Record<string, any>
}
export interface UIElement {
  id: string
  type: string
  text: string
  x: number
  y: number
  [key: string]: any
}
export interface Project {
  version: 1
  id: string
  name: string
  activeScene: string
  scenes: Scene[]
  assets: Asset[]
  ui: UIElement[]
  locales: Record<string, Record<string, string>>
  settings: { duration: number; language: string; [key: string]: any }
}
export const uid = (prefix = 'id'): string => {
  const uuid = globalThis.crypto?.randomUUID?.()
  return prefix + '-' + (uuid ?? Date.now().toString(36) + '-' + Math.random().toString(36).slice(2))
}
export function makeEntity(name: string, shape?: string): Entity {
  return {
    id: uid('node'),
    name,
    parent: null,
    active: true,
    transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
    components: shape && shape !== 'empty' ? [{ type: 'mesh', shape, material: 'default-material' }] : [],
    properties: {},
  }
}
export function makeMaterial(name: string, color: string, id = uid('mat')): Asset {
  return {
    id,
    name,
    type: 'material',
    data: '',
    properties: { color, roughness: 0.85, metalness: 0, flatShading: true },
  }
}
export function makeScene(name = 'Scene'): Scene {
  return { id: uid('scene'), name, environment: { background: '#202731', ambient: 1.5 }, entities: [] }
}
export function makeProject(name = 'Untitled project'): Project {
  const scene = makeScene()
  return {
    version: 1,
    id: uid('project'),
    name,
    activeScene: scene.id,
    scenes: [scene],
    assets: [makeMaterial('Porcelain', '#d9dfdf', 'default-material')],
    ui: [],
    locales: { en: {}, ru: {} },
    settings: { duration: 60, language: 'en', mode: 'scene' },
  }
}
export function getScene(project: Project): Scene {
  const scene = project.scenes.find((scene) => scene.id === project.activeScene)
  if (!scene) throw new Error('Active scene does not exist')
  return scene
}
function record(value: unknown): value is Record<string, any> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}
function need(value: unknown, message: string): asserts value {
  if (!value) throw new Error('Invalid project: ' + message)
}
function table(rows: unknown, label: string): Set<string> {
  need(Array.isArray(rows), label + ' must be an array')
  const ids = new Set<string>()
  for (const row of rows) {
    need(record(row) && typeof row.id === 'string' && row.id.length, 'missing ' + label + ' ID')
    need(!ids.has(row.id), 'duplicate ' + label + ' ID ' + row.id)
    ids.add(row.id)
  }
  return ids
}
function validateEntities(entities: Entity[]): void {
  const ids = table(entities, 'entity')
  const checked = new Set<string>()
  const parentIds = new Map<string, string | null>()
  for (const e of entities) {
    need(typeof e.name === 'string' && typeof e.active === 'boolean', 'invalid entity ' + e.id)
    need(e.parent === null || ids.has(e.parent), 'missing parent of ' + e.name)
    parentIds.set(e.id, e.parent)
    need(record(e.transform), 'missing transform')
    for (const axis of ['position', 'rotation', 'scale'] as const) {
      const v = e.transform[axis]
      need(
        Array.isArray(v) && v.length === 3 && v.every(Number.isFinite),
        'invalid ' + axis + ' of ' + e.name,
      )
    }
    need(
      Array.isArray(e.components) && e.components.every((c) => record(c) && typeof c.type === 'string'),
      'invalid components of ' + e.name,
    )
    need(record(e.properties), 'invalid entity properties')
  }
  for (const id of ids) {
    const path = new Set<string>()
    let current: string | null = id
    while (current !== null && !checked.has(current)) {
      need(!path.has(current), 'cycle in entity hierarchy')
      path.add(current)
      current = parentIds.get(current) ?? null
    }
    path.forEach((id) => checked.add(id))
  }
}
export function validateProject(input: unknown): Project {
  need(record(input) && input.version === 1, 'unsupported schema version')
  need(typeof input.name === 'string' && typeof input.id === 'string', 'missing project identity')
  const scenes = table(input.scenes, 'scene')
  need(scenes.has(input.activeScene), 'missing active scene')
  for (const scene of input.scenes) {
    need(
      typeof scene.name === 'string' &&
        record(scene.environment) &&
        typeof scene.environment.background === 'string',
      'invalid scene metadata',
    )
    validateEntities(scene.entities)
  }
  table(input.assets, 'asset')
  for (const asset of input.assets) {
    need(
      typeof asset.name === 'string' &&
        typeof asset.type === 'string' &&
        typeof asset.data === 'string' &&
        record(asset.properties),
      'invalid asset ' + asset.id,
    )
    if (asset.type === 'json') JSON.parse(asset.data)
    if (asset.type === 'prefab') {
      const nodes = JSON.parse(asset.data)
      validateEntities(nodes)
      need(
        nodes.length && nodes[0].parent === null && nodes.slice(1).every((e: Entity) => e.parent),
        'invalid prefab root',
      )
    }
  }
  table(input.ui, 'UI')
  for (const element of input.ui)
    need(
      typeof element.type === 'string' && Number.isFinite(element.x) && Number.isFinite(element.y),
      'invalid UI element',
    )
  need(
    record(input.locales) &&
      Object.values(input.locales).every(
        (lang) => record(lang) && Object.values(lang).every((s) => typeof s === 'string'),
      ),
    'invalid translations',
  )
  need(
    record(input.settings) &&
      Number.isFinite(input.settings.duration) &&
      typeof input.settings.language === 'string',
    'invalid settings',
  )
  return input as Project
}
export const serializeProject = (project: Project): string =>
  JSON.stringify(validateProject(project), null, 2)
export const parseProject = (json: string): Project => validateProject(JSON.parse(json))

export function subtree(scene: Scene, id: string): Entity[] {
  const children = new Map<string, Entity[]>()
  const root = scene.entities.find((e) => e.id === id)
  if (!root) return []
  for (const e of scene.entities) {
    if (!e.parent) continue
    if (!children.has(e.parent)) children.set(e.parent, [])
    children.get(e.parent)!.push(e)
  }
  const result = [root]
  for (let i = 0; i < result.length; i++) result.push(...(children.get(result[i].id) ?? []))
  return result
}
export function reparentEntity(scene: Scene, id: string, parent: string | null): boolean {
  const nodes = subtree(scene, id)
  if (
    !nodes.length ||
    nodes.some((e) => e.id === parent) ||
    (parent && !scene.entities.some((e) => e.id === parent))
  )
    return false
  nodes[0].parent = parent
  return true
}
export function removeEntity(scene: Scene, id: string): void {
  const ids = new Set(subtree(scene, id).map((e) => e.id))
  scene.entities = scene.entities.filter((e) => !ids.has(e.id))
}
export function makePrefab(scene: Scene, id: string, name?: string): Asset {
  const nodes = structuredClone(subtree(scene, id))
  if (!nodes.length) throw new Error('Unknown prefab root')
  nodes[0].parent = null
  return {
    id: uid('prefab'),
    type: 'prefab',
    name: name ?? nodes[0].name,
    data: JSON.stringify(nodes),
    properties: {},
  }
}
export function instantiatePrefab(scene: Scene, asset: Asset, parent: string | null = null): Entity {
  if (asset.type !== 'prefab') throw new Error('Expected prefab asset')
  const nodes: Entity[] = JSON.parse(asset.data)
  validateEntities(nodes)
  if (!nodes.length || nodes[0].parent !== null || nodes.slice(1).some((e) => !e.parent))
    throw new Error('Invalid prefab root')
  if (parent && !scene.entities.some((e) => e.id === parent)) throw new Error('Missing parent')
  const ids = new Map(nodes.map((e) => [e.id, uid('node')]))
  function remap(value: any): any {
    if (typeof value === 'string') return ids.get(value) ?? value
    if (Array.isArray(value)) return value.map(remap)
    if (record(value)) return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, remap(v)]))
    return value
  }
  for (const e of nodes) {
    e.parent = e.parent ? ids.get(e.parent)! : parent
    e.id = ids.get(e.id)!
    e.components = remap(e.components)
    e.properties = remap(e.properties)
  }
  scene.entities.push(...nodes)
  return nodes[0]
}
export function duplicateEntity(scene: Scene, id: string): Entity {
  const original = scene.entities.find((e) => e.id === id)
  if (!original) throw new Error('Unknown entity')
  const copy = instantiatePrefab(scene, makePrefab(scene, id), original.parent)
  copy.name += ' Copy'
  return copy
}
