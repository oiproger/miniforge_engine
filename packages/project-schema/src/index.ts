import {validTerrain} from './terrain'
export * from './terrain'
export * from './nav'
import {validateScreens, type UIScreen, type Anchor, type ButtonAction} from './screens'
export * from './screens'
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
export type AssetType = 'material' | 'model' | 'texture' | 'audio' | 'script' | 'prefab' | 'shader' | 'json' | 'skybox' | 'text' | 'particle' | 'html'
export interface ModelAnimationClip {
  id: string
  name: string
  sourceClip: string
  startTime: number
  endTime: number
  loop?: boolean
  speed?: number
}
export interface ModelPartMaterialOverride {
  color?: string
  roughness?: number
  metalness?: number
  opacity?: number
  unlit?: boolean
  pixelated?: boolean
  doubleSided?: boolean
  emissive?: string
  emissiveIntensity?: number
}
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
  screen?: string
  anchor?: Anchor
  action?: ButtonAction
  target?: string
  [key: string]: any
}
export interface Project {
  version: 1
  id: string
  name: string
  activeScene: string
  scenes: Scene[]
  assets: Asset[]
  screens?: UIScreen[]
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

export interface ParticleConfig {
  rate: number
  maxParticles: number
  lifeMin: number
  lifeMax: number
  speedMin: number
  speedMax: number
  spread: number
  direction: Vec3
  gravity: Vec3
  startSize: number
  endSize: number
  startColor: string
  endColor: string
  startAlpha: number
  endAlpha: number
  additive: boolean
  shape: 'point' | 'box' | 'sphere'
  shapeSize: Vec3
  texture?: string
  loop: boolean
  playing: boolean
  burstCount: number
  worldSpace: boolean
}

export const PARTICLE_PRESETS: Record<string, Partial<ParticleConfig>> = {
  steam: {
    rate: 18, maxParticles: 90, lifeMin: 1.4, lifeMax: 2.6, speedMin: 0.7, speedMax: 1.4,
    spread: 18, direction: [0, 1, 0], gravity: [0.15, 0.25, 0],
    startSize: 0.28, endSize: 1.15, startColor: '#d8e0e6', endColor: '#8d99a3',
    startAlpha: 0.45, endAlpha: 0, additive: false, shape: 'sphere', shapeSize: [0.25, 0.1, 0.25],
  },
  smoke: {
    rate: 14, maxParticles: 80, lifeMin: 2.0, lifeMax: 3.6, speedMin: 0.5, speedMax: 1.1,
    spread: 24, direction: [0, 1, 0], gravity: [0.2, 0.12, 0.05],
    startSize: 0.35, endSize: 1.6, startColor: '#565c63', endColor: '#25282c',
    startAlpha: 0.6, endAlpha: 0, additive: false, shape: 'sphere', shapeSize: [0.3, 0.1, 0.3],
  },
  sparks: {
    rate: 45, maxParticles: 120, lifeMin: 0.35, lifeMax: 0.9, speedMin: 2.2, speedMax: 5.0,
    spread: 55, direction: [0, 1, 0], gravity: [0, -9.2, 0],
    startSize: 0.11, endSize: 0.02, startColor: '#fff2a6', endColor: '#ff5511',
    startAlpha: 1, endAlpha: 0, additive: true, shape: 'point', shapeSize: [0.1, 0.1, 0.1],
  },
  fire: {
    rate: 32, maxParticles: 100, lifeMin: 0.45, lifeMax: 1.0, speedMin: 0.9, speedMax: 2.0,
    spread: 22, direction: [0, 1, 0], gravity: [0, 0.6, 0],
    startSize: 0.38, endSize: 0.08, startColor: '#ffd466', endColor: '#e83a14',
    startAlpha: 0.9, endAlpha: 0, additive: true, shape: 'sphere', shapeSize: [0.25, 0.1, 0.25],
  },
  snow: {
    rate: 40, maxParticles: 180, lifeMin: 3.0, lifeMax: 5.5, speedMin: 0.4, speedMax: 1.0,
    spread: 20, direction: [0, -1, 0], gravity: [0.25, -0.45, 0.1],
    startSize: 0.09, endSize: 0.07, startColor: '#f2f7ff', endColor: '#d9e6f5',
    startAlpha: 0.85, endAlpha: 0.1, additive: false, shape: 'box', shapeSize: [14, 0.5, 14],
  },
  rain: {
    rate: 85, maxParticles: 220, lifeMin: 0.6, lifeMax: 1.2, speedMin: 8.5, speedMax: 12.0,
    spread: 5, direction: [0, -1, 0], gravity: [0.3, -9.8, 0],
    startSize: 0.06, endSize: 0.05, startColor: '#b7d4ea', endColor: '#86a9c4',
    startAlpha: 0.65, endAlpha: 0.15, additive: false, shape: 'box', shapeSize: [14, 0.5, 14],
  },
  dust: {
    rate: 12, maxParticles: 70, lifeMin: 3.5, lifeMax: 6.5, speedMin: 0.08, speedMax: 0.25,
    spread: 180, direction: [0, 1, 0], gravity: [0.03, 0.01, -0.02],
    startSize: 0.07, endSize: 0.04, startColor: '#e8dcc2', endColor: '#c4b89d',
    startAlpha: 0.35, endAlpha: 0, additive: true, shape: 'box', shapeSize: [6, 3, 6],
  },
}

export function defaultParticleConfig(preset?: string): ParticleConfig {
  const base: ParticleConfig = {
    rate: 20,
    maxParticles: 100,
    lifeMin: 1.0,
    lifeMax: 2.2,
    speedMin: 0.8,
    speedMax: 1.8,
    spread: 25,
    direction: [0, 1, 0],
    gravity: [0, -0.5, 0],
    startSize: 0.25,
    endSize: 0.8,
    startColor: '#ffffff',
    endColor: '#8899aa',
    startAlpha: 0.7,
    endAlpha: 0,
    additive: false,
    shape: 'point',
    shapeSize: [0.2, 0.2, 0.2],
    loop: true,
    playing: true,
    burstCount: 0,
    worldSpace: true,
  }
  return { ...base, ...(preset && PARTICLE_PRESETS[preset] ? PARTICLE_PRESETS[preset] : {}) }
}

export function makeParticleAsset(name = 'Steam', preset = 'steam', id = uid('ptc')): Asset {
  return {
    id,
    name,
    type: 'particle',
    data: '',
    properties: defaultParticleConfig(preset),
  }
}

export interface TouchControlConfig {
  id: string
  kind: 'joystick' | 'button' | 'lookpad'
  label?: string
  action?: string
  x: number
  y: number
  size: number
  deadzone?: number
  color?: string
}

export interface TouchSettings {
  mode: 'auto' | 'always' | 'never'
  emulateTouchFromMouse: boolean
  emulateMouseFromTouch: boolean
  lookSensitivity: number
  opacity: number
  controls?: TouchControlConfig[]
}


export const HTML_WIDGET_TEMPLATES: Record<string, { html: string; css: string; js: string }> = {
  phone: {
    html: `<div class="phone">
  <div class="bar"><span>12:40</span><span>4G 🔋84%</span></div>
  <div class="title">ПГТ · Мессенджер</div>
  <div class="msg" id="msg">ЖЭК: Проверь трубу у 3-го подъезда</div>
  <div class="btns">
    <button data-event="phone.accept_job" data-payload='{"job":"pipe_fix"}'>Принять заказ</button>
    <button class="sec" id="pingBtn">Открыть карту</button>
  </div>
</div>`,
    css: `body{margin:0;font-family:system-ui,sans-serif;background:transparent;color:#eef3f8;overflow:hidden}
.phone{background:rgba(15,22,30,.92);border:1px solid rgba(255,255,255,.15);border-radius:16px;padding:12px;backdrop-filter:blur(10px);box-shadow:0 10px 28px rgba(0,0,0,.45)}
.bar{display:flex;justify-content:space-between;font-size:11px;color:#8fa3b8;margin-bottom:8px}
.title{font-weight:700;font-size:14px;color:#ffb84d;margin-bottom:6px}
.msg{font-size:12px;background:rgba(255,255,255,.06);padding:8px;border-radius:8px;margin-bottom:10px;line-height:1.35}
.btns{display:flex;gap:6px}
button{flex:1;border:none;border-radius:8px;padding:7px 10px;background:#ff8c32;color:#111;font-weight:700;font-size:12px;cursor:pointer}
button.sec{background:rgba(88,216,255,.18);color:#8ee6ff;border:1px solid rgba(88,216,255,.35)}`,
    js: `document.getElementById('pingBtn')?.addEventListener('click', () => {
  miniforge.emit('phone.open_map', { tab: 'tasks' });
  console.log('Map requested from Phone UI');
});
miniforge.on('phone.notify', (data) => {
  const el = document.getElementById('msg');
  if (el) el.textContent = String(data?.text || data || 'Новое сообщение');
});`,
  },
  dialogue: {
    html: `<div class="dlg">
  <div class="speaker" id="speaker">Дворник Михалыч</div>
  <div class="text" id="text">Опять на контуре давление скачет. Поможешь перекрыть вентиль?</div>
  <div class="choices">
    <button data-event="dialogue.choice" data-payload='{"id":"yes"}'>1. Да, показывай где</button>
    <button data-event="dialogue.choice" data-payload='{"id":"later"}'>2. Позже зайду</button>
  </div>
</div>`,
    css: `body{margin:0;font-family:system-ui,sans-serif;background:transparent;color:#f0f4f8}
.dlg{background:rgba(12,17,24,.92);border:1px solid rgba(255,184,77,.35);border-radius:12px;padding:14px}
.speaker{font-weight:700;font-size:13px;color:#ffb84d;margin-bottom:4px}
.text{font-size:13px;line-height:1.4;margin-bottom:10px;color:#dce5ef}
.choices{display:flex;gap:8px}
button{border:1px solid rgba(255,255,255,.15);background:rgba(255,255,255,.07);color:#fff;padding:7px 12px;border-radius:8px;font-size:12px;cursor:pointer}
button:hover{background:rgba(255,140,50,.28);border-color:#ff8c32}`,
    js: `miniforge.on('dialogue.show', (p) => {
  if (p?.speaker) document.getElementById('speaker').textContent = p.speaker;
  if (p?.text) document.getElementById('text').textContent = p.text;
});`,
  },
  inventory: {
    html: `<div class="inv">
  <div class="hdr"><span>Инвентарь</span><button data-action="close">✕</button></div>
  <div class="grid" id="grid">
    <button class="slot" data-event="inventory.use" data-payload='{"item":"wrench"}'>🔧 Ключ</button>
    <button class="slot" data-event="inventory.use" data-payload='{"item":"flashlight"}'>🔦 Фонарь</button>
    <button class="slot" data-event="inventory.use" data-payload='{"item":"tea"}'>☕ Термос</button>
    <button class="slot" data-event="inventory.use" data-payload='{"item":"pass"}'>🪪 Пропуск</button>
  </div>
</div>`,
    css: `body{margin:0;font-family:system-ui,sans-serif;background:transparent;color:#eef3f8}
.inv{background:rgba(15,21,29,.94);border:1px solid rgba(255,255,255,.14);border-radius:12px;padding:12px}
.hdr{display:flex;justify-content:space-between;align-items:center;font-weight:700;font-size:13px;margin-bottom:8px}
.hdr button{background:none;border:none;color:#9ab;cursor:pointer;font-size:14px}
.grid{display:grid;grid-template-columns:repeat(2,1fr);gap:6px}
.slot{padding:10px;border-radius:8px;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.05);color:#fff;font-size:12px;cursor:pointer}
.slot:hover{border-color:#58d8ff;background:rgba(88,216,255,.15)}`,
    js: `console.log('Inventory HTML widget ready');`,
  },
  blank: {
    html: `<div class="card">
  <h3>HTML Frame Widget</h3>
  <button data-event="ui.custom_click" data-payload='{"ok":true}'>Отправить событие</button>
</div>`,
    css: `body{margin:0;font-family:system-ui,sans-serif;background:transparent;color:#fff}
.card{background:rgba(16,23,32,.9);border:1px solid rgba(255,255,255,.15);border-radius:10px;padding:12px}
h3{margin:0 0 8px;font-size:14px}
button{padding:6px 12px;border-radius:6px;border:none;background:#58d8ff;color:#0a0f14;font-weight:700;cursor:pointer}`,
    js: `// Используйте miniforge.emit('event.name', data) и miniforge.on('event.name', cb)`,
  },
}

export function makeHtmlAsset(name = 'HUD Widget.html', template = 'phone', id = uid('html')): Asset {
  const tpl = HTML_WIDGET_TEMPLATES[template] || HTML_WIDGET_TEMPLATES.blank
  return {
    id,
    name,
    type: 'html',
    data: tpl.html,
    properties: { css: tpl.css, js: tpl.js },
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
    for (const c of e.components) if (c.type === 'terrain') need(validTerrain(c), 'invalid terrain of ' + e.name)
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
  const elements = new Map((input as Project).ui.map(el=>[el.id,el]))
  for (const el of elements.values()) if(el.parentId) {
    const parent=elements.get(el.parentId)
    need(el.type!=='container' && parent?.type==='container' && parent.screen===el.screen, 'invalid HUD container for '+el.id)
  }
  validateScreens(input as Project)
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
  nodes[0].properties = { ...nodes[0].properties, prefabId: asset.id }
  scene.entities.push(...nodes)
  return nodes[0]
}

export function syncPrefabInstances(project: Project, prefabId: string): number {
  const asset = project.assets.find((a) => a.id === prefabId && a.type === 'prefab')
  if (!asset) return 0
  const template: Entity[] = JSON.parse(asset.data)
  if (!template.length) return 0
  let updated = 0
  for (const scene of project.scenes) {
    const roots = scene.entities.filter((e) => e.properties?.prefabId === prefabId)
    for (const inst of roots) {
      const savedId = inst.id
      const savedParent = inst.parent
      const savedTransform = structuredClone(inst.transform)
      // Remove existing children of this instance
      const oldSub = subtree(scene, savedId).slice(1)
      const oldChildIds = new Set(oldSub.map((c) => c.id))
      if (oldChildIds.size) {
        scene.entities = scene.entities.filter((e) => !oldChildIds.has(e.id))
      }
      // Clone template nodes and remap IDs (keeping root ID = savedId)
      const nodes: Entity[] = structuredClone(template)
      const ids = new Map<string, string>()
      ids.set(nodes[0].id, savedId)
      for (let i = 1; i < nodes.length; i++) ids.set(nodes[i].id, uid('node'))
      const remap = (val: any): any => {
        if (typeof val === 'string') return ids.get(val) ?? val
        if (Array.isArray(val)) return val.map(remap)
        if (record(val)) return Object.fromEntries(Object.entries(val).map(([k, v]) => [k, remap(v)]))
        return val
      }
      inst.name = nodes[0].name
      inst.active = nodes[0].active
      inst.parent = savedParent
      inst.transform = savedTransform
      inst.components = remap(nodes[0].components)
      inst.properties = { ...remap(nodes[0].properties), prefabId }
      for (let i = 1; i < nodes.length; i++) {
        const ch = nodes[i]
        ch.id = ids.get(ch.id)!
        ch.parent = ch.parent ? ids.get(ch.parent)! : savedId
        ch.components = remap(ch.components)
        ch.properties = remap(ch.properties)
        scene.entities.push(ch)
      }
      updated++
    }
  }
  return updated
}

export function updatePrefabFromEntity(project: Project, entityId: string): number {
  const scene = getScene(project)
  const entity = scene.entities.find((e) => e.id === entityId)
  const prefabId = entity?.properties?.prefabId
  if (!entity || !prefabId) return 0
  const asset = project.assets.find((a) => a.id === prefabId && a.type === 'prefab')
  if (!asset) return 0
  const nodes = structuredClone(subtree(scene, entityId))
  nodes[0].parent = null
  delete nodes[0].properties.prefabId
  asset.data = JSON.stringify(nodes)
  return syncPrefabInstances(project, prefabId)
}
export function duplicateEntity(scene: Scene, id: string): Entity {
  const original = scene.entities.find((e) => e.id === id)
  if (!original) throw new Error('Unknown entity')
  const copy = instantiatePrefab(scene, makePrefab(scene, id), original.parent)
  copy.name += ' Copy'
  return copy
}

export function needsPhysics(entities: Entity[]) {
  return entities.some((e) =>
    e.components.some(
      (c) =>
        c.enabled !== false &&
        (c.type === 'body' ||
          c.type === 'terrain' ||
          c.type === 'water' ||
          (c.type === 'collider' &&
            !c.trigger &&
            !e.components.some(
              (b) =>
                b.enabled !== false && b.type === 'behavior' && ['player', 'first-person'].includes(b.kind),
            ))),
    ),
  )
}


export function isEligibleForStaticBatch(e: Entity): boolean {
  const hasPrimMesh = e.components.some(
    (c) => c.enabled !== false && c.type === 'mesh' && c.shape !== 'model',
  )
  if (!hasPrimMesh) return false
  const hasDynamic = e.components.some(
    (c) =>
      c.enabled !== false &&
      (['script', 'behavior', 'animation', 'navAgent', 'particle', 'billboard', 'water', 'terrain'].includes(c.type) ||
        (c.type === 'body' && (c.kind === 'dynamic' || c.kind === 'kinematic')) ||
        (c.type === 'collider' && c.trigger)),
  )
  return !hasDynamic
}

export function applyAutoStaticBatching(scene: Scene, overwrite = false): number {
  let count = 0
  for (const e of scene.entities) {
    if (overwrite || e.properties.staticBatch === undefined) {
      const ok = isEligibleForStaticBatch(e)
      e.properties.staticBatch = ok
      if (ok) count++
    } else if (e.properties.staticBatch) {
      count++
    }
  }
  return count
}
