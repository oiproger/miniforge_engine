import { AnimStateMachineEditor } from './AnimStateMachineEditor'
import { MaterialPreview } from './MaterialPreview'
import { useEffect, useRef, useState } from 'react'
import {
  SlidersHorizontal,
  Box,
  Move,
  CircleDot,
  Sun,
  Video,
  Code2,
  Zap,
  Plus,
  AudioLines,
  Cuboid,
  ChevronDown,
  ChevronRight,
  MousePointer2,
  Shapes,
  PackagePlus,
  Check,
  Waves,
  Sparkles,
  Flame,
  Image,
  Stamp,
  Layers,
  Mountain,
  Film,
  GitBranch,
  Search,
  Square,
  Sliders,
  Compass,
  Route,
  Wifi,
  Trash2,
} from 'lucide-react'
import {
  getScene,
  uid,
  makePrefab,
  updatePrefabFromEntity,
  makeParticleAsset,
  PARTICLE_PRESETS,
  makeNavZone,
  makeDefaultEventGraph,
  parseEventGraph,
  bakeNavZone,
  type NavZone,
  type Project,
  type Asset,
  type Component,
  type Vec3,
} from '../../../packages/project-schema/src'
import ScriptParams from './ScriptParams'
import { TerrainEditor } from './TerrainEditor'
import type { TerrainBrushConfig } from '../../../packages/editor-tools/src'
import { makeTerrain, type Terrain } from '../../../packages/project-schema/src/terrain'
import { VisualFields } from './VisualFields'
import { Section, Field, Numeric, Color } from './Fields'
import './authoring.css'

import { behaviorDefaults, eventNames } from '../../../packages/behaviors/src/catalog'
import { RuleFields } from './RuleFields'
import { SceneEntityPickerButton } from './SceneEntityPicker'
export { behaviorDefaults }
interface ComponentMeta {
  type: string
  name: string
  category: string
  desc: string
  icon: typeof Box
  keywords: string
}
const COMPONENT_CATALOG: ComponentMeta[] = [
  { type: 'mesh', name: 'Mesh Renderer', category: 'Rendering', desc: '3D primitive or imported glTF model', icon: Box, keywords: 'geometry model shape box sphere' },
  { type: 'particle', name: '3D Particle Emitter', category: 'Effects', desc: 'Steam, smoke, snow, rain, fire & sparks', icon: Flame, keywords: 'vfx emitter smoke fire snow rain sparks steam' },
  { type: 'billboard', name: '3D Billboard', category: 'Effects', desc: 'Camera-facing 3D sprite with atlas animation', icon: Image, keywords: 'sprite halo foliage sheet' },
  { type: 'decal', name: '3D Decal', category: 'Effects', desc: 'Surface poster, stain, puddle or footprint', icon: Stamp, keywords: 'sticker poster puddle stain graffiti' },
  { type: 'light', name: 'Light', category: 'Lighting', desc: 'Point, spot, directional or ambient light', icon: Sun, keywords: 'sun spot point glow flare shadow gobo' },
  { type: 'volumetric', name: 'Volumetric Light', category: 'Lighting', desc: 'Soft additive light cone / god-rays', icon: Sparkles, keywords: 'fog beam cone godray dust' },
  { type: 'bakeZone', name: 'Bake & Reflection Zone', category: 'Lighting', desc: 'Local static lightmap & cubemap probe', icon: Layers, keywords: 'probe cubemap reflection lightmap' },
  { type: 'water', name: 'Water Surface', category: 'Environment', desc: 'Animated GLSL water with waves & foam', icon: Waves, keywords: 'river lake ocean puddle shader' },
  { type: 'terrain', name: 'Terrain', category: 'Environment', desc: 'Sculptable heightmap & multi-layer ground', icon: Mountain, keywords: 'ground landscape heightmap noise' },
  { type: 'camera', name: 'Camera', category: 'Camera', desc: 'Perspective or orthographic scene camera', icon: Video, keywords: 'fov view viewport' },
  { type: 'collider', name: 'Collider', category: 'Physics', desc: 'Collision volume or trigger zone', icon: Cuboid, keywords: 'hitbox trigger collision rapier' },
  { type: 'body', name: 'Physics Body', category: 'Physics', desc: 'Dynamic, kinematic or static rigid body', icon: CircleDot, keywords: 'rigidbody mass gravity velocity' },
  { type: 'script', name: 'Script', category: 'Logic', desc: 'TypeScript GameAPI lifecycle behavior', icon: Code2, keywords: 'code ts logic controller' },
  { type: 'behavior', name: 'Behavior', category: 'Logic', desc: 'Built-in player, NPC, save & gameplay module', icon: Zap, keywords: 'player npc coin hazard save' },
  { type: 'eventGraph', name: 'Event Graph', category: 'Logic', desc: 'Blueprint node graph (events, variables, functions)', icon: GitBranch, keywords: 'blueprint event graph logic rule trigger' },
  { type: 'audio', name: 'Audio Source', category: 'Audio', desc: '3D spatial or ambient sound emitter', icon: AudioLines, keywords: 'sound music sfx hrtf' },
  { type: 'animation', name: 'Animation Player', category: 'Animation', desc: 'Play glTF skeletal / transform clips', icon: Film, keywords: 'clip gltf keyframe' },
  { type: 'navZone', name: 'NavGrid Zone', category: 'Navigation', desc: 'Bakeable A* pathfinding grid + Off-Mesh Links', icon: Compass, keywords: 'navmesh pathfinding astar npc walk' },
  { type: 'networkSync', name: 'Network Sync', category: 'Logic', desc: 'Replicate transforms, visibility, lifecycle and selected component/property fields', icon: Wifi, keywords: 'multiplayer network sync rpc webrtc websocket' },
  { type: 'navAgent', name: 'Nav Agent (NPC)', category: 'Navigation', desc: 'Autonomous A* steering + walk/idle crossfade', icon: Route, keywords: 'npc ai pathfinding follow move' },
  { type: 'sprite', name: 'Legacy Sprite', category: 'Effects', desc: 'Simple 3D sprite quad', icon: Square, keywords: '2d quad' },
]
const names: Record<string, string> = Object.fromEntries(COMPONENT_CATALOG.map((c) => [c.type, c.name]))
const icons: Record<string, typeof Box> = Object.fromEntries(COMPONENT_CATALOG.map((c) => [c.type, c.icon]))
const titleCase = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
const networkFieldOptions = (entity?: { properties: Record<string, any>; components: Component[] }): string[] => {
  if (!entity) return []
  const result: string[] = []
  const omit = new Set(['__proto__', 'prototype', 'constructor', 'type', 'id', 'enabled', 'asset', 'code', 'data', 'script', 'shader'])
  const valid = (key: string) => /^[a-zA-Z_][a-zA-Z0-9_-]{0,63}$/.test(key) && !omit.has(key)
  const visit = (value: unknown, prefix: string, depth: number) => {
    if (result.length >= 100) return
    if (depth > 0) result.push(prefix)
    if (depth >= 3 || !value || Array.isArray(value) || typeof value !== 'object') return
    for (const [key, child] of Object.entries(value)) {
      if (valid(key)) visit(child, prefix + '.' + key, depth + 1)
    }
  }
  visit(entity.properties || {}, 'properties', 0)
  const seen = new Map<string, number>()
  for (const c of entity.components) {
    if (['networkSync', 'script', 'eventGraph', 'rule'].includes(c.type)) continue
    const idx = seen.get(c.type) || 0
    seen.set(c.type, idx + 1)
    for (const [key, value] of Object.entries(c)) {
      if (!valid(key)) continue
      const prefix = `components.${c.type}${idx ? `[${idx}]` : ''}.${key}`
      visit(value, prefix, 1)
    }
  }
  return result
}
export function AssetSelect({
  assets,
  type,
  value,
  change,
  label,
}: {
  assets: Asset[]
  type: Asset['type']
  value: string
  change: (id: string) => void
  label: string
}) {
  return (
    <select aria-label={label} value={value || ''} onChange={(e) => change(e.target.value)}>
      <option value="">None</option>
      {assets
        .filter((a) => a.type === type)
        .map((a) => (
          <option key={a.id} value={a.id}>
            {a.name}
          </option>
        ))}
    </select>
  )
}

function computePopoverBox(anchor: HTMLElement | null, preferredHeight = 320, minWidth = 240) {
  if (!anchor || typeof window === 'undefined') {
    return { top: 80, left: 16, width: minWidth, listMaxHeight: 240 }
  }
  const rect = anchor.getBoundingClientRect()
  const vw = window.innerWidth
  const vh = window.innerHeight
  const topPad = 48
  const bottomPad = 34
  const width = Math.min(vw - 16, Math.max(minWidth, Math.round(rect.width)))
  const left = Math.max(8, Math.min(vw - width - 8, Math.round(rect.left)))
  const spaceBelow = vh - rect.bottom - bottomPad
  const spaceAbove = rect.top - topPad
  const openUp = spaceBelow < Math.min(preferredHeight, 260) && spaceAbove > spaceBelow
  const avail = Math.max(150, openUp ? spaceAbove - 6 : spaceBelow - 6)
  const boxHeight = Math.min(preferredHeight, avail)
  const top = openUp
    ? Math.max(topPad, Math.round(rect.top - boxHeight - 4))
    : Math.min(vh - bottomPad - boxHeight, Math.round(rect.bottom + 4))
  return {
    top,
    left,
    width,
    listMaxHeight: Math.max(100, Math.round(boxHeight - 50)),
  }
}

function BehaviorPicker({
  value,
  onSelect,
}: {
  value: string
  onSelect: (kind: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [box, setBox] = useState({ top: 80, left: 16, width: 240, listMaxHeight: 240 })
  const btnRef = useRef<HTMLButtonElement | null>(null)
  const popRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) return
    const updatePos = () => setBox(computePopoverBox(btnRef.current, 320, 230))
    updatePos()
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node
      if (btnRef.current?.contains(t) || popRef.current?.contains(t)) return
      setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    window.addEventListener('resize', updatePos)
    window.addEventListener('scroll', updatePos, true)
    return () => {
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('resize', updatePos)
      window.removeEventListener('scroll', updatePos, true)
    }
  }, [open])

  const entries = Object.entries(behaviorDefaults)
  const currentLabel = behaviorDefaults[value]?.[0] ?? value ?? 'Select behavior'
  const filtered = entries.filter(([k, [label]]) => {
    const q = query.trim().toLowerCase()
    if (!q) return true
    return label.toLowerCase().includes(q) || k.toLowerCase().includes(q)
  })

  return (
    <div className="mf-behavior-select-wrap">
      <button
        ref={btnRef}
        type="button"
        className="mf-behavior-trigger"
        aria-label="Behavior"
        aria-expanded={open}
        onClick={() => {
          setQuery('')
          setOpen((v) => !v)
        }}
      >
        <span className="mf-behavior-trigger-label">{currentLabel}</span>
        <ChevronDown size={13} />
      </button>
      {open && (
        <div
          ref={popRef}
          className="mf-component-picker mf-floating-picker"
          style={{ top: box.top, left: box.left, width: box.width }}
        >
          <div className="mf-comp-search">
            <Search size={13} />
            <input
              autoFocus
              placeholder="Search behaviors…"
              aria-label="Search behaviors"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <div className="mf-comp-list" style={{ maxHeight: box.listMaxHeight }}>
            {filtered.map(([k, [label]]) => (
              <button
                key={k}
                type="button"
                className={'mf-behavior-option' + (k === value ? ' active' : '')}
                onClick={() => {
                  onSelect(k)
                  setOpen(false)
                }}
              >
                <span>{label}</span>
                {k === value && <Check size={12} />}
              </button>
            ))}
            {filtered.length === 0 && <div className="mf-picker-empty">No matching behaviors</div>}
          </div>
        </div>
      )}
    </div>
  )
}

export function Inspector({
  project,
  entityId,
  onChange,
  onEditAsset,
  terrainBrush,
  onTerrainBrushChange,
}: {
  project: Project
  entityId: string | null
  onChange: (p: Project) => void
  onEditAsset?: (id: string) => void
  terrainBrush?: TerrainBrushConfig
  onTerrainBrushChange?: (patch: Partial<TerrainBrushConfig>) => void
}) {
  const [editingAnimSM, setEditingAnimSM] = useState<number | null>(null)
  const [adding, showAdd] = useState(false)
  const [compBox, setCompBox] = useState({ top: 80, left: 16, width: 260, listMaxHeight: 260 })
  const addBtnRef = useRef<HTMLButtonElement | null>(null)
  const compPopRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!adding) return
    const updatePos = () => setCompBox(computePopoverBox(addBtnRef.current, 360, 260))
    updatePos()
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node
      if (addBtnRef.current?.contains(t) || compPopRef.current?.contains(t)) return
      showAdd(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') showAdd(false)
    }
    window.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    window.addEventListener('resize', updatePos)
    window.addEventListener('scroll', updatePos, true)
    return () => {
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('resize', updatePos)
      window.removeEventListener('scroll', updatePos, true)
    }
  }, [adding])
  const [compSearch, setCompSearch] = useState('')
  const [feedback, setFeedback] = useState('')
  const scene = getScene(project),
    entity = scene.entities.find((e) => e.id === entityId)
  function edit(fn: (p: Project) => void) {
    const next = structuredClone(project)
    fn(next)
    onChange(next)
  }
  function editEntity(fn: (e: NonNullable<typeof entity>) => void) {
    edit((p) => {
      const obj = getScene(p).entities.find((e) => e.id === entityId)
      if (obj) fn(obj)
    })
  }
  function patch(i: number, data: Partial<Component>) {
    editEntity((e) => Object.assign(e.components[i], data))
  }
  function add(kind: string) {
    const assetId = uid('asset')
    const item: Component = { type: kind, enabled: true }
    switch (kind) {
      case 'terrain':
        Object.assign(item, makeTerrain())
        break
      case 'water':
        Object.assign(item, {
          size: 16,
          segments: 24,
          depth: 2,
          deepColor: '#153a4a',
          shallowColor: '#3c8ea0',
          waveHeight: 0.14,
          waveSpeed: 1.4,
          waveScale: 0.7,
          opacity: 0.82,
          fresnelPower: 2.6,
          foamAmount: 0.35,
          reflectionStrength: 0.75, reflectionSharpness: 256,
        })
        break
      case 'bakeZone':
        Object.assign(item, {
          size: [8, 5, 8],
          bakeLight: true,
          lightBounce: 0.65,
          bakeReflections: true,
          reflectionMode: 'baked',
          reflectionResolution: 256,
          updateInterval: 4,
        })
        break
      case 'volumetric':
        Object.assign(item, {
          shape: 'cone',
          color: '#ffe5b4',
          intensity: 0.42,
          softness: 2.2,
          dustSpeed: 0.35,
          topRadius: 0.2,
          bottomRadius: 1.6,
        })
        break
      case 'animation':
        Object.assign(item, { clip: '', loop: true, autoplay: true, speed: 1, event: '' })
        break
      case 'sprite':
        Object.assign(item, { texture: '', color: '#ffffff', opacity: 1, width: 1, height: 1 })
        break
      case 'mesh':
        Object.assign(item, { shape: 'box', material: '' })
        break
      case 'eventGraph':
        Object.assign(item, {
          asset: project.assets.find((a) => a.type === 'graph')?.id ?? '',
          overrides: {},
        })
        break
      case 'rule':
        Object.assign(item, {
          event: 'object.clicked',
          source: '',
          tag: '',
          actions: [{ kind: 'addVariable', key: 'score', value: 1 }],
        })
        break
      case 'behavior':
        Object.assign(item, { kind: 'rotate', params: { ...behaviorDefaults.rotate[1] } })
        break
      case 'light':
        Object.assign(item, { kind: 'point', color: '#ffffff', intensity: 2, range: 12, angle: 0.6, coneSoftness: 0.25, glow: 0, glowFalloff: 1, flare: 0 })
        break
      case 'camera':
        Object.assign(item, { projection: 'perspective', fov: 50 })
        break
      case 'script':
        Object.assign(item, {
          asset: project.assets.find((a) => a.type === 'script')?.id || assetId,
          params: {},
        })
        break
      case 'collider':
        Object.assign(item, { shape: 'box', trigger: false, friction: 0.5, restitution: 0.1 })
        break
      case 'body':
        Object.assign(item, {
          kind: 'static',
          mass: 1,
          friction: 0.5,
          restitution: 0.1,
          linearDamping: 0.1,
          angularDamping: 0.1,
          gravityScale: 1,
          lockRotation: false,
        })
        break
      case 'audio':
        Object.assign(item, { asset: '', volume: 1 })
        break
      case 'particle':
        Object.assign(item, {
          assetId: project.assets.find((a) => a.type === 'particle')?.id || '',
          preset: 'steam',
          playing: true,
        })
        break
      case 'billboard':
        Object.assign(item, {
          texture: '',
          color: '#ffffff',
          width: 1.5,
          height: 1.5,
          opacity: 1,
          lockY: false,
          additive: false,
          unlit: true,
          pixelated: false,
          atlasCols: 1,
          atlasRows: 1,
          atlasFrame: 0,
          fps: 0,
        })
        break
      case 'decal':
        Object.assign(item, {
          texture: '',
          color: '#ffffff',
          width: 1.2,
          height: 1.2,
          opacity: 0.9,
          normalOffset: 0.008,
          blendMode: 'alpha',
          pixelated: false,
        })
        break
      case 'navZone':
        Object.assign(item, makeNavZone())
        break
      case 'networkSync':
        Object.assign(item, {
          owner: 'host',
          syncTransform: true,
          syncActive: true,
          syncLifecycle: false,
          syncAnimation: true,
          syncVariables: false,
          interpolate: true,
          syncKeys: '',
          syncPaths: '',
        })
        break
      case 'navAgent':
        Object.assign(item, {
          speed: 2.8,
          turnSpeed: 8,
          stopDistance: 0.35,
          walkClip: '',
          idleClip: '',
          crossfade: 0.2,
        })
        break
    }
    edit((p) => {
      if (kind === 'script' && item.asset === assetId)
        p.assets.push({
          id: assetId,
          type: 'script',
          name: 'New script.ts',
          data: defaultScript,
          properties: {},
        })
      const obj = getScene(p).entities.find((e) => e.id === entityId)
      obj?.components.push(item)
    })
    showAdd(false)
  }
  const asset = (id: string) => project.assets.find((a) => a.id === id)
  const select = (label: string, options: string[], value: string, change: (s: string) => void) => (
    <Field label={label}>
      <select aria-label={label} value={value || options[0]} onChange={(e) => change(e.target.value)}>
        {options.map((s) => (
          <option key={s} value={s}>
            {titleCase(s)}
          </option>
        ))}
      </select>
    </Field>
  )
  const mesh = entity?.components.find((c) => c.type === 'mesh')
  function renderComponent(c: Component, i: number) {
    const prop = (key: string, value: unknown) => patch(i, { [key]: value })
    function parameter(key: string, value: unknown) {
      prop('params', { ...c.params, [key]: value })
    }
    const num = (label: string, key: string, def: number, min?: number, max?: number, step?: number) => (
      <Field label={label}>
        <Numeric
          label={label}
          value={c[key] ?? def}
          min={min}
          max={max}
          step={step}
          change={(n) => prop(key, n)}
        />
      </Field>
    )
    const link = (label: string, type: Asset['type'], key: string) => (
      <Field label={label}>
        <AssetSelect
          assets={project.assets}
          type={type}
          label={label}
          value={c[key]}
          change={(s) => prop(key, s)}
        />
      </Field>
    )
    const mat = asset(c.material)
    return (
      <div key={c.type + i}>
        <Section
          icon={icons[c.type as keyof typeof icons] || Shapes}
          name={names[c.type] || titleCase(c.type)}
          enabled={c.enabled}
          toggle={() => prop('enabled', c.enabled === false)}
          remove={() => editEntity((e) => e.components.splice(i, 1))}
        >
          {c.type === 'terrain' && (
            <TerrainEditor terrain={c as Terrain} assets={project.assets} change={(data) => patch(i, data)} brush={terrainBrush} onBrushChange={onTerrainBrushChange} />
          )}
          {c.type === 'water' && (
            <>
              {num('Size', 'size', 16, 1, 256, 1)}
              {num('Segments', 'segments', 24, 4, 64, 2)}
              {num('Depth (sensor)', 'depth', 2, 0.2, 50, 0.5)}
              <Field label="Deep color">
                <Color label="Deep color" value={c.deepColor ?? '#153a4a'} change={(v) => prop('deepColor', v)} />
              </Field>
              <Field label="Shallow color">
                <Color
                  label="Shallow color"
                  value={c.shallowColor ?? '#3c8ea0'}
                  change={(v) => prop('shallowColor', v)}
                />
              </Field>
              {num('Wave height', 'waveHeight', 0.14, 0, 2, 0.02)}
              {num('Wave speed', 'waveSpeed', 1.4, 0, 10, 0.1)}
              {num('Wave scale', 'waveScale', 0.7, 0.05, 5, 0.05)}
              {num('Opacity', 'opacity', 0.82, 0.05, 1, 0.05)}
              {num('Fresnel power', 'fresnelPower', 2.6, 0.5, 8, 0.1)}
              {num('Foam amount', 'foamAmount', 0.35, 0, 1, 0.05)}
              {num('Reflection strength', 'reflectionStrength', 0.75, 0, 1, 0.05)}
              {num('Reflection sharpness', 'reflectionSharpness', 256, 8, 1024, 16)}
            </>
          )}
          {c.type === 'bakeZone' && (
            <>
              <Field label="Zone size (X/Y/Z)">
                <div className="mf-pair">
                  {(['X', 'Y', 'Z'] as const).map((ax, idx) => (
                    <Numeric
                      key={ax}
                      label={'Zone ' + ax}
                      value={(c.size ?? [8, 5, 8])[idx]}
                      min={0.5}
                      max={200}
                      change={(v) => {
                        const sz = [...(c.size ?? [8, 5, 8])]
                        sz[idx] = v
                        prop('size', sz)
                      }}
                    />
                  ))}
                </div>
              </Field>
              <Field label="Bake lighting">
                <input type="checkbox" checked={c.bakeLight !== false} onChange={(e) => prop('bakeLight', e.target.checked)} />
              </Field>
              {num('Light bounce', 'lightBounce', 0.65, 0, 2, 0.05)}
              <Field label="Reflections">
                <input type="checkbox" checked={c.bakeReflections !== false} onChange={(e) => prop('bakeReflections', e.target.checked)} />
              </Field>
              {select('Reflection mode', ['baked', 'realtime'], c.reflectionMode ?? 'baked', (v) => prop('reflectionMode', v))}
              {select('Cubemap size', ['64', '128', '256', '512'], String(c.reflectionResolution ?? 128), (v) => prop('reflectionResolution', Number(v)))}
              {c.reflectionMode === 'realtime' && num('Update every N frames', 'updateInterval', 4, 1, 60, 1)}
              <button
                type="button"
                className="mf-secondary"
                onClick={() => prop('lastBaked', new Date().toLocaleTimeString())}
              >
                <Sparkles size={12} /> Bake Zone Now {c.lastBaked ? '(' + c.lastBaked + ')' : ''}
              </button>
            </>
          )}
          {c.type === 'volumetric' && (
            <>
              {select('Shape', ['cone', 'box'], c.shape ?? 'cone', (v) => prop('shape', v))}
              <Field label="Beam color">
                <Color label="Beam color" value={c.color ?? '#ffe5b4'} change={(v) => prop('color', v)} />
              </Field>
              {num('Intensity', 'intensity', 0.42, 0.02, 1.5, 0.05)}
              {num('Edge softness', 'softness', 2.2, 0.5, 8, 0.1)}
              {num('Dust speed', 'dustSpeed', 0.35, 0, 5, 0.05)}
              {(c.shape ?? 'cone') === 'cone' && (
                <>
                  {num('Top radius', 'topRadius', 0.2, 0, 10, 0.05)}
                  {num('Bottom radius', 'bottomRadius', 1.6, 0.1, 20, 0.1)}
                </>
              )}
            </>
          )}
          {c.type === 'particle' && (
          <>
            <Field label="Particle asset">
              <AssetSelect
                label="Particle asset"
                assets={project.assets}
                type="particle"
                value={c.assetId || ''}
                change={(id) => prop('assetId', id)}
              />
            </Field>
            <div className="mf-row" style={{ gap: 6, marginBottom: 6 }}>
              {c.assetId ? (
                <button
                  type="button"
                  className="mf-text-action"
                  onClick={() => onEditAsset?.(c.assetId)}
                >
                  <Sliders size={12} /> Open Particle Editor
                </button>
              ) : (
                <button
                  type="button"
                  className="mf-text-action"
                  onClick={() => {
                    const created = makeParticleAsset(`${entity?.name || 'Effect'} Particles`, c.preset || 'steam')
                    edit((p) => {
                      p.assets.push(created)
                      const obj = getScene(p).entities.find((e) => e.id === entityId)
                      if (obj?.components[i]) obj.components[i].assetId = created.id
                    })
                    onEditAsset?.(created.id)
                  }}
                >
                  <Flame size={12} /> Create & Edit Particles
                </button>
              )}
            </div>
            {!c.assetId && (
              <Field label="Quick preset">
                <select value={c.preset || 'steam'} onChange={(e) => prop('preset', e.target.value)}>
                  {Object.keys(PARTICLE_PRESETS).map((k) => (
                    <option key={k} value={k}>
                      {titleCase(k)}
                    </option>
                  ))}
                </select>
              </Field>
            )}
            <Field label="Playing">
              <input type="checkbox" checked={c.playing !== false} onChange={(e) => prop('playing', e.target.checked)} />
            </Field>
            <Field label="Rate override">
              <Numeric label="Rate override" value={c.rate ?? 0} min={0} max={200} step={1} change={(n) => prop('rate', n > 0 ? n : undefined)} />
            </Field>
          </>
        )}
        {c.type === 'billboard' && (
          <>
            <Field label="Texture">
              <AssetSelect label="Billboard texture" assets={project.assets} type="texture" value={c.texture || ''} change={(id) => prop('texture', id)} />
            </Field>
            <Field label="Color">
              <Color label="Billboard color" value={c.color || '#ffffff'} change={(v) => prop('color', v)} />
            </Field>
            <Field label="Width">
              <Numeric label="Billboard width" value={c.width ?? 1.5} min={0.05} step={0.1} change={(n) => prop('width', n)} />
            </Field>
            <Field label="Height">
              <Numeric label="Billboard height" value={c.height ?? 1.5} min={0.05} step={0.1} change={(n) => prop('height', n)} />
            </Field>
            <Field label="Opacity">
              <Numeric label="Billboard opacity" value={c.opacity ?? 1} min={0} max={1} step={0.05} change={(n) => prop('opacity', n)} />
            </Field>
            <Field label="Lock Y (cylindrical)">
              <input type="checkbox" checked={Boolean(c.lockY)} onChange={(e) => prop('lockY', e.target.checked)} />
            </Field>
            <Field label="Additive glow">
              <input type="checkbox" checked={Boolean(c.additive)} onChange={(e) => prop('additive', e.target.checked)} />
            </Field>
            <Field label="Unlit">
              <input type="checkbox" checked={c.unlit !== false} onChange={(e) => prop('unlit', e.target.checked)} />
            </Field>
            <Field label="Pixelated">
              <input type="checkbox" checked={Boolean(c.pixelated)} onChange={(e) => prop('pixelated', e.target.checked)} />
            </Field>
            <Field label="Atlas cols / rows">
              <div className="mf-vec2-inline">
                <Numeric label="Atlas cols" value={c.atlasCols ?? 1} min={1} max={16} step={1} change={(n) => prop('atlasCols', Math.round(n))} />
                <Numeric label="Atlas rows" value={c.atlasRows ?? 1} min={1} max={16} step={1} change={(n) => prop('atlasRows', Math.round(n))} />
              </div>
            </Field>
            <Field label="Frame / FPS">
              <div className="mf-vec2-inline">
                <Numeric label="Atlas frame" value={c.atlasFrame ?? 0} min={0} step={1} change={(n) => prop('atlasFrame', Math.round(n))} />
                <Numeric label="Atlas FPS" value={c.fps ?? 0} min={0} max={60} step={1} change={(n) => prop('fps', n)} />
              </div>
            </Field>
          </>
        )}
        {c.type === 'decal' && (
          <>
            <Field label="Projection mode">
              <select
                aria-label="Decal projection mode"
                value={c.projection ?? 'surface'}
                onChange={(e) => prop('projection', e.target.value)}
              >
                <option value="surface">Surface Projection (GPU / depth)</option>
                <option value="plane">Plane (flat quad)</option>
              </select>
            </Field>
            {(c.projection ?? 'surface') === 'surface' && (
              <>
                {num('Projection depth', 'projectionDepth', 0.6, 0.01, 50, 0.05)}
                {num('Minimum surface facing', 'projectionFacing', 0.2, 0, 0.95, 0.05)}
                <Field label="Dark background transparent">
                  <input type="checkbox" checked={Boolean(c.darkBackgroundTransparent)} onChange={(e) => prop('darkBackgroundTransparent', e.target.checked)} />
                </Field>
                {c.darkBackgroundTransparent && num('Dark pixel threshold', 'darkThreshold', 0.08, 0, 0.95, 0.02)}
                <small className="mf-muted" style={{ display: 'block', marginBottom: 8 }}>
                  Project the material onto visible surfaces using the scene depth buffer — no overlay polygons.
                  The volume extends half the depth on each side. Aim the local Z axis into the target surface.
                  Transparent surfaces without depth are not receivers. Use a texture with an alpha channel to avoid a solid rectangle.
                </small>
              </>
            )}
            {link('Material', 'material', 'material')}
            {mat?.type === 'material' && (
              <>
                <MaterialPreview p={project} a={mat} compact />
                <button className="mf-secondary" type="button" onClick={() => onEditAsset?.(mat.id)}>
                  <SlidersHorizontal size={12} /> Edit decal material <ChevronRight size={12} />
                </button>
              </>
            )}
            {!c.material && (
              <button
                className="mf-secondary"
                type="button"
                onClick={() => {
                  const id = uid('asset')
                  edit((p) => {
                    p.assets.push({
                      id,
                      name: (entity?.name || 'Decal') + ' material',
                      type: 'material',
                      data: '',
                      properties: { color: '#ffffff', opacity: 1, roughness: 0.85, metalness: 0 },
                    })
                    const target = getScene(p).entities.find((e) => e.id === entityId)
                    if (target?.components[i]) target.components[i].material = id
                  })
                  onEditAsset?.(id)
                }}
              >
                <Plus size={12} /> Create decal material
              </button>
            )}
            <Field label={c.material ? 'Texture override (optional)' : 'Texture'}>
              <AssetSelect
                label="Decal texture override"
                assets={project.assets}
                type="texture"
                value={c.texture || ''}
                change={(id) => prop('texture', id)}
              />
            </Field>
            {c.material && c.texture && (
              <small style={{ display: 'block', marginBottom: 8 }}>
                The texture override replaces the material’s base map. Clear it to use the material’s own texture.
              </small>
            )}
            <Field label="Tint color">
              <Color label="Decal color" value={c.color || '#ffffff'} change={(v) => prop('color', v)} />
            </Field>
            <Field label="Width">
              <Numeric label="Decal width" value={c.width ?? 1.2} min={0.05} step={0.1} change={(n) => prop('width', n)} />
            </Field>
            <Field label="Height">
              <Numeric label="Decal height" value={c.height ?? 1.2} min={0.05} step={0.1} change={(n) => prop('height', n)} />
            </Field>
            <Field label="Opacity">
              <Numeric label="Decal opacity" value={c.opacity ?? 0.9} min={0} max={1} step={0.05} change={(n) => prop('opacity', n)} />
            </Field>
            {(c.projection ?? 'surface') === 'plane' && (
              <Field label="Plane offset">
                <Numeric label="Plane offset" value={c.normalOffset ?? 0.008} min={0.001} max={0.2} step={0.002} change={(n) => prop('normalOffset', n)} />
              </Field>
            )}
            <Field label="Blend mode">
              <select value={c.blendMode || 'alpha'} onChange={(e) => prop('blendMode', e.target.value)}>
                <option value="alpha">Alpha (Standard)</option>
                <option value="additive">Additive</option>
              </select>
            </Field>
            <Field label="Pixelated">
              <input type="checkbox" checked={Boolean(c.pixelated)} onChange={(e) => prop('pixelated', e.target.checked)} />
            </Field>
          </>
        )}
        {c.type === 'navZone' && (
          <>
            <Field label="Zone size (X / Z)">
              <div className="mf-vec2-inline">
                <Numeric
                  label="Nav width"
                  value={c.size?.[0] ?? 24}
                  min={2}
                  max={200}
                  step={2}
                  change={(v) => prop('size', [v, c.size?.[1] ?? 24])}
                />
                <Numeric
                  label="Nav depth"
                  value={c.size?.[1] ?? 24}
                  min={2}
                  max={200}
                  step={2}
                  change={(v) => prop('size', [c.size?.[0] ?? 24, v])}
                />
              </div>
            </Field>
            <Field label="Cell size (m)">
              <Numeric label="Cell size" value={c.cellSize ?? 0.75} min={0.25} max={4} step={0.05} change={(v) => prop('cellSize', v)} />
            </Field>
            <Field label="Agent radius">
              <Numeric label="Agent radius" value={c.agentRadius ?? 0.35} min={0.05} max={3} step={0.05} change={(v) => prop('agentRadius', v)} />
            </Field>
            <Field label="Max slope (deg)">
              <Numeric label="Max slope" value={c.maxSlope ?? 42} min={5} max={85} step={1} change={(v) => prop('maxSlope', v)} />
            </Field>
            <Field label="Step height">
              <Numeric label="Step height" value={c.stepHeight ?? 0.65} min={0.1} max={3} step={0.05} change={(v) => prop('stepHeight', v)} />
            </Field>
            <Field label="Show overlay">
              <input type="checkbox" checked={c.showOverlay !== false} onChange={(e) => prop('showOverlay', e.target.checked)} />
            </Field>
            <div className="mf-row" style={{ gap: 6, margin: '6px 0' }}>
              <button
                type="button"
                className="mf-btn"
                style={{ width: '100%', justifyContent: 'center' }}
                onClick={() => {
                  edit((p) => {
                    const sc = getScene(p)
                    const ent = sc.entities.find((e) => e.id === entityId)
                    const nz = ent?.components[i] as NavZone | undefined
                    if (ent && nz) bakeNavZone(nz, ent.transform, sc)
                  })
                }}
              >
                <Compass size={13} /> Bake NavGrid ({c.cols ?? 0}×{c.rows ?? 0})
              </button>
            </div>
            <div className="mf-minor-label" style={{ justifyContent: 'space-between' }}>
              <span>Off-Mesh Links ({(c.links || []).length})</span>
              <button
                type="button"
                className="mf-btn"
                onClick={() => {
                  const links = structuredClone(c.links || [])
                  const pos = entity?.transform.position || [0, 0, 0]
                  links.push({
                    id: 'link-' + (links.length + 1),
                    from: [pos[0], pos[1], pos[2]],
                    to: [pos[0] + 2, pos[1] + 2, pos[2]],
                    bidirectional: true,
                    cost: 1.5,
                    enabled: true,
                  })
                  prop('links', links)
                }}
              >
                <Plus size={11} /> Add Link
              </button>
            </div>
            {(c.links || []).map((lnk: any, li: number) => (
              <div key={lnk.id || li} style={{ padding: 5, borderRadius: 6, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', marginBottom: 4 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4 }}>
                  <input
                    aria-label="Link ID"
                    value={lnk.id || ''}
                    onChange={(e) => {
                      const links = structuredClone(c.links || [])
                      links[li].id = e.target.value
                      prop('links', links)
                    }}
                    style={{ flex: 1, fontSize: 11 }}
                  />
                  <button
                    type="button"
                    onClick={() => prop('links', (c.links || []).filter((_: any, j: number) => j !== li))}
                    style={{ background: 'transparent', border: 'none', color: '#e68177', cursor: 'pointer' }}
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
                <div style={{ fontSize: 10, color: '#9ab', marginBottom: 2 }}>From (X/Y/Z)</div>
                <div className="mf-vec3-inline" style={{ marginBottom: 4 }}>
                  {[0, 1, 2].map((ax) => (
                    <Numeric key={ax} label={`From ${ax}`} value={lnk.from?.[ax] ?? 0} step={0.5} change={(v) => {
                      const links = structuredClone(c.links || [])
                      links[li].from[ax] = v
                      prop('links', links)
                    }} />
                  ))}
                </div>
                <div style={{ fontSize: 10, color: '#9ab', marginBottom: 2 }}>To (X/Y/Z)</div>
                <div className="mf-vec3-inline">
                  {[0, 1, 2].map((ax) => (
                    <Numeric key={ax} label={`To ${ax}`} value={lnk.to?.[ax] ?? 0} step={0.5} change={(v) => {
                      const links = structuredClone(c.links || [])
                      links[li].to[ax] = v
                      prop('links', links)
                    }} />
                  ))}
                </div>
              </div>
            ))}
          </>
        )}
        {c.type === 'navAgent' && (
          <>
            <Field label="Move speed">
              <Numeric label="Agent speed" value={c.speed ?? 2.8} min={0.1} max={30} step={0.2} change={(v) => prop('speed', v)} />
            </Field>
            <Field label="Turn speed">
              <Numeric label="Turn speed" value={c.turnSpeed ?? 8} min={1} max={30} step={0.5} change={(v) => prop('turnSpeed', v)} />
            </Field>
            <Field label="Stop distance">
              <Numeric label="Stop distance" value={c.stopDistance ?? 0.35} min={0.05} max={5} step={0.05} change={(v) => prop('stopDistance', v)} />
            </Field>
            <Field label="Walk clip">
              <input value={c.walkClip || ''} placeholder="e.g. Walk" onChange={(e) => prop('walkClip', e.target.value)} />
            </Field>
            <Field label="Idle clip">
              <input value={c.idleClip || ''} placeholder="e.g. Idle" onChange={(e) => prop('idleClip', e.target.value)} />
            </Field>
            <Field label="Crossfade (s)">
              <Numeric label="Crossfade" value={c.crossfade ?? 0.2} min={0} max={2} step={0.05} change={(v) => prop('crossfade', v)} />
            </Field>
          </>
        )}
        {c.type === 'networkSync' && (
          <>
            <Field label="Owner authority">
              <select value={c.owner || 'host'} onChange={(e) => prop('owner', e.target.value)}>
                <option value="host">Host authoritative</option>
                <option value="local">Local player owned</option>
              </select>
            </Field>
            <Field label="Sync Transform">
              <input type="checkbox" checked={c.syncTransform !== false} onChange={(e) => prop('syncTransform', e.target.checked)} />
            </Field>
            <Field label="Sync Active / Visibility">
              <input type="checkbox" checked={Boolean(c.syncActive)} onChange={(e) => prop('syncActive', e.target.checked)} />
            </Field>
            <Field label="Sync Spawn / Despawn">
              <input type="checkbox" checked={Boolean(c.syncLifecycle)} onChange={(e) => prop('syncLifecycle', e.target.checked)} />
            </Field>
            <Field label="Sync Animation">
              <input type="checkbox" checked={Boolean(c.syncAnimation)} onChange={(e) => prop('syncAnimation', e.target.checked)} />
            </Field>
            <Field label="Sync WorldState">
              <input type="checkbox" checked={Boolean(c.syncVariables)} onChange={(e) => prop('syncVariables', e.target.checked)} />
            </Field>
            <Field label="Interpolate">
              <input type="checkbox" checked={c.interpolate !== false} onChange={(e) => prop('interpolate', e.target.checked)} />
            </Field>
            <Field label="Sync Paths (comma-separated)">
              <textarea
                rows={3}
                value={String(c.syncPaths ?? '')}
                placeholder="properties.hp, components.light.intensity, components.behavior.params.speed"
                onChange={(e) => prop('syncPaths', e.target.value)}
              />
              <small>Declarative fields only. Nested paths: properties.*, components.TYPE.field, components.TYPE[1].field. Changes replicate at the network tick; custom render parameters may require a script to apply them.</small>
              <select value="" aria-label="Add Network Sync field" onChange={(e) => {
                if (!e.target.value) return
                const paths = String(c.syncPaths || '').split(',').map((v: string) => v.trim()).filter(Boolean)
                if (!paths.includes(e.target.value)) prop('syncPaths', [...paths, e.target.value].join(', '))
              }}>
                <option value="">+ Add entity field…</option>
                {networkFieldOptions(entity).map(path => <option key={path} value={path}>{path}</option>)}
              </select>
            </Field>
            {Boolean(c.syncKeys) && <Field label="Legacy Sync Keys (properties)">
              <input value={String(c.syncKeys || '')} placeholder="hp, ammo" onChange={(e) => prop('syncKeys', e.target.value)} />
            </Field>}
          </>
        )}
        {(c.type === 'animation' || c.type === 'sprite') && (
            <VisualFields
              c={c}
              assets={project.assets}
              modelId={entity?.components.find((part) => part.type === 'mesh' && part.shape === 'model')?.asset}
              change={prop}
            />
          )}
          {c.type === 'animation' && (
            <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 4 }}>
              <button
                type="button"
                className="mf-secondary"
                onClick={() => setEditingAnimSM(i)}
              >
                <SlidersHorizontal size={12} /> {c.stateMachine?.states?.length ? `Edit State Machine (${c.stateMachine.states.length} states)` : 'Open Animation State Machine…'}
              </button>
              {editingAnimSM === i && (
                <AnimStateMachineEditor
                  value={c.stateMachine}
                  modelAsset={project.assets.find(
                    (a) => a.id === entity?.components.find((part) => part.type === 'mesh' && part.shape === 'model')?.asset,
                  )}
                  onSave={(sm) => prop('stateMachine', sm)}
                  onClose={() => setEditingAnimSM(null)}
                />
              )}
            </div>
          )}
          {c.type === 'mesh' && (
            <>
              {select(
                'Geometry',
                [
                  'box',
                  'sphere',
                  'plane',
                  'cylinder',
                  'capsule',
                  'cone',
                  'model',
                  ...(!['box', 'sphere', 'plane', 'cylinder', 'capsule', 'cone', 'model'].includes(c.shape)
                    ? [c.shape]
                    : []),
                ].filter(Boolean),
                c.shape,
                (v) => prop('shape', v),
              )}
              {['model', 'imported'].includes(c.shape) && link('Model', 'model', 'asset')}
            </>
          )}
          {c.type === 'light' && (
            <>
              {select('Type', ['directional', 'point', 'spot', 'ambient'], c.kind, (v) => prop('kind', v))}
              <Field label="Color">
                <Color label="Light color" value={c.color} change={(v) => prop('color', v)} />
              </Field>
              {num('Intensity', 'intensity', 1, 0, 20, 0.1)}
              {(c.kind === 'point' || c.kind === 'spot') && (
                <>
                  {num('Range', 'range', 12, 0.5, 100, 0.5)}
                  {num('Fog glow', 'glow', 0, 0, 5, 0.05)}
                  {num('Glow falloff', 'glowFalloff', 1, 0.1, 8, 0.1)}
                </>
              )}
              {c.kind !== 'ambient' && (
                <>
                  {num('Lens flare', 'flare', 0, 0, 5, 0.1)}
                  <Field label="Sun rays (God rays)">
                    <input type="checkbox" checked={Boolean(c.sunRays)} onChange={(e) => prop('sunRays', e.target.checked)} />
                  </Field>
                  {c.sunRays && (
                    <>
                      {num('Sun ray intensity', 'sunRayIntensity', 0.75, 0.05, 2, 0.05)}
                      {num('Sun ray decay', 'sunRayDecay', 0.94, 0.82, 0.99, 0.01)}
                    </>
                  )}
                </>
              )}
              {(c.kind === 'spot' || c.kind === 'point') && (
                <>
                  {c.kind === 'spot' && num('Cone angle (rad)', 'angle', 0.6, 0.05, 1.5, 0.05)}
                  {c.kind === 'spot' && num('Cone softness', 'coneSoftness', 0.25, 0, 1, 0.05)}
                  <Field label="Cast shadow (active)">
                    <input type="checkbox" checked={Boolean(c.castShadow)} onChange={(e) => prop('castShadow', e.target.checked)} />
                  </Field>
                  {c.castShadow && (
                    <>
                      <Field label="Pin shadow slot">
                        <input type="checkbox" checked={Boolean(c.shadowPinned)} onChange={(e) => prop('shadowPinned', e.target.checked)} />
                      </Field>
                      {num('Shadow priority adjustment', 'shadowPriority', 0, -40, 40, 1)}
                      {select('Shadow resolution', ['inherit', 'low', 'medium', 'high'],
                        c.shadowResolution || 'inherit', (v) => prop('shadowResolution', v))}
                    </>
                  )}
                  {c.kind === 'spot' && <Field label="Gel texture (Gobo)">
                    <AssetSelect
                      label="Gel texture (Gobo)"
                      assets={project.assets}
                      type="texture"
                      value={c.gel || ''}
                      change={(id) => patch(i, { gel: id, castShadow: id ? true : c.castShadow })}
                    />
                  </Field>}
                </>
              )}
            </>
          )}
          {c.type === 'camera' && (
            <>
              {select('Projection', ['perspective', 'orthographic'], c.projection, (v) =>
                prop('projection', v),
              )}
              {num('Field of view', 'fov', 50, 1, 179)}
            </>
          )}
          {c.type === 'collider' && (
            <>
              {select('Shape', ['box', 'sphere', 'capsule', 'mesh'], c.shape, (v) => prop('shape', v))}
              <Field label="Trigger">
                <input
                  type="checkbox"
                  checked={Boolean(c.trigger)}
                  onChange={(e) => prop('trigger', e.target.checked)}
                />
              </Field>
              {num('Friction', 'friction', 0.5, 0, 2, 0.05)}
              {num('Restitution (bounce)', 'restitution', 0.1, 0, 1.5, 0.05)}
            </>
          )}
          {c.type === 'body' && (
            <>
              {select('Body type', ['static', 'dynamic', 'kinematic'], c.kind, (v) => prop('kind', v))}
              {c.kind === 'dynamic' && (
                <>
                  {num('Mass', 'mass', 1, 0.01, 1000, 0.1)}
                  {num('Gravity scale', 'gravityScale', 1, -5, 5, 0.1)}
                  {num('Linear damping', 'linearDamping', 0.1, 0, 20, 0.1)}
                  {num('Angular damping', 'angularDamping', 0.1, 0, 20, 0.1)}
                  {num('Friction', 'friction', 0.5, 0, 2, 0.05)}
                  {num('Restitution', 'restitution', 0.1, 0, 1.5, 0.05)}
                  <Field label="Lock rotation">
                    <input
                      type="checkbox"
                      checked={Boolean(c.lockRotation)}
                      onChange={(e) => prop('lockRotation', e.target.checked)}
                    />
                  </Field>
                </>
              )}
            </>
          )}
          {c.type === 'audio' && (
            <>
              {link('Audio clip', 'audio', 'asset')}
              {num('Volume', 'volume', 1, 0, 1)}
            </>
          )}
          {c.type === 'script' && (
            <>
              {link('Script', 'script', 'asset')}
              {c.asset && (
                <button className="mf-secondary" onClick={() => onEditAsset?.(c.asset)}>
                  <Code2 size={13} /> Edit script <ChevronRight size={12} />
                </button>
              )}
              <ScriptParams project={project} component={c} change={(fields) => patch(i, fields)} />
            </>
          )}
          {c.type === 'eventGraph' && (() => {
            const graphAsset = project.assets.find((a) => a.id === c.asset && a.type === 'graph')
            const graphData = graphAsset ? parseEventGraph(graphAsset.data) : null
            const exposedVars = (graphData?.variables || []).filter((v) => v.exposed !== false)
            return (
              <>
                {link('Event Graph', 'graph', 'asset')}
                <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                  {c.asset ? (
                    <button
                      type="button"
                      className="mf-secondary"
                      style={{ flex: 1 }}
                      onClick={() => onEditAsset?.(c.asset)}
                    >
                      <GitBranch size={13} /> Open Event Graph <ChevronRight size={12} />
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="mf-secondary"
                      style={{ flex: 1 }}
                      onClick={() => {
                        if (!entity) return
                        const entId = entity.id
                        const entName = entity.name
                        const gid = uid('graph')
                        edit((p) => {
                          p.assets.push({
                            id: gid,
                            name: `${entName} Graph`,
                            type: 'graph',
                            data: JSON.stringify(makeDefaultEventGraph()),
                            properties: {},
                          })
                          const target = getScene(p).entities.find((e) => e.id === entId)
                          if (target && target.components[i]) target.components[i].asset = gid
                        })
                        onEditAsset?.(gid)
                      }}
                    >
                      <Plus size={13} /> Create &amp; Open Event Graph
                    </button>
                  )}
                </div>
                {exposedVars.length > 0 && (
                  <div style={{ marginTop: 8, paddingTop: 6, borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                    <div style={{ fontSize: 10.5, color: 'var(--muted)', marginBottom: 4, textTransform: 'uppercase' }}>
                      Exposed Variables
                    </div>
                    {exposedVars.map((v) => {
                      const val = c.overrides?.[v.name] !== undefined ? c.overrides[v.name] : v.defaultValue
                      const setOvr = (nextVal: any) =>
                        patch(i, { overrides: { ...(c.overrides || {}), [v.name]: nextVal } })
                      return (
                        <Field key={v.id} label={v.name}>
                          {v.type === 'number' ? (
                            <Numeric label={v.name} value={Number(val) || 0} change={setOvr} />
                          ) : v.type === 'boolean' ? (
                            <input
                              type="checkbox"
                              checked={Boolean(val)}
                              onChange={(e) => setOvr(e.target.checked)}
                            />
                          ) : (
                            <input
                              value={Array.isArray(val) ? val.join(', ') : String(val ?? '')}
                              onChange={(e) => {
                                if (v.type === 'vec3') {
                                  const arr = e.target.value.split(',').map((s) => Number(s.trim()) || 0)
                                  setOvr([arr[0] ?? 0, arr[1] ?? 0, arr[2] ?? 0])
                                } else setOvr(e.target.value)
                              }}
                            />
                          )}
                        </Field>
                      )
                    })}
                  </div>
                )}
              </>
            )
          })()}
          {c.type === 'rule' && <RuleFields project={project} rule={c} change={(data) => patch(i, data)} />}
          {c.type === 'behavior' && (
            <>
              <Field label="Behavior">
                <BehaviorPicker
                  value={c.kind}
                  onSelect={(kind) => patch(i, { kind, params: { ...behaviorDefaults[kind][1] } })}
                />
              </Field>
              {Object.entries({ ...behaviorDefaults[c.kind]?.[1], ...c.params }).map(([key, v]) => (
                <Field key={key} label={titleCase(key)}>
                  {typeof v === 'number' ? (
                    <Numeric label={key} value={v} change={(n) => parameter(key, n)} />
                  ) : typeof v === 'boolean' ? (
                    <input type="checkbox" checked={v} onChange={(e) => parameter(key, e.target.checked)} />
                  ) : key === 'event' ? (
                    <>
                      <input
                        aria-label="Behavior event"
                        list="mf-event-catalog"
                        value={String(v)}
                        onChange={(e) => parameter(key, e.target.value)}
                      />
                    </>
                  ) : key === 'prefab' ? (
                    <AssetSelect
                      label="Spawn prefab"
                      assets={project.assets}
                      type="prefab"
                      value={String(v || '')}
                      change={(id) => parameter(key, id)}
                    />
                  ) : key === 'target' || key === 'scene' ? (
                    <select value={String(v ?? '')} onChange={(e) => parameter(key, e.target.value)}>
                      <option value="">Select…</option>
                      {(key === 'scene'
                        ? project.scenes
                        : c.kind === 'toggleUI'
                          ? project.ui
                          : scene.entities
                      ).map((o) => (
                        <option key={o.id} value={o.id}>
                          {'name' in o ? String(o.name) : String(o.text || o.id)}
                        </option>
                      ))}
                    </select>
                  ) : key === 'asset' ? (
                    <AssetSelect
                      assets={project.assets}
                      type="audio"
                      label="Audio clip"
                      value={String(v)}
                      change={(s) => parameter(key, s)}
                    />
                  ) : key === 'axis' ? (
                    <select value={String(v)} onChange={(e) => parameter(key, e.target.value)}>
                      {['x', 'y', 'z'].map((k) => (
                        <option key={k}>{k}</option>
                      ))}
                    </select>
                  ) : (
                    <input value={String(v)} onChange={(e) => parameter(key, e.target.value)} />
                  )}
                </Field>
              ))}
            </>
          )}
        </Section>
        {c.type === 'mesh' && (
          <Section icon={CircleDot} name="Material">
            {link('Surface', 'material', 'material')}
            {mat && (
              <>
                <MaterialPreview p={project} a={mat} compact />
                <Field label="Base color">
                  <Color
                    label="Material base color"
                    value={mat.properties.color || '#ffffff'}
                    change={(v) =>
                      edit((p) => {
                        p.assets.find((a) => a.id === mat.id)!.properties.color = v
                      })
                    }
                  />
                </Field>
                <button className="mf-secondary" onClick={() => onEditAsset?.(mat.id)}>
                  <SlidersHorizontal size={12} /> Edit material <ChevronRight size={12} />
                </button>
              </>
            )}
            {!mat && (
              <button
                className="mf-secondary"
                onClick={() => {
                  const id = uid('asset')
                  edit((p) => {
                    p.assets.push({
                      id,
                      name: (entity?.name || 'New') + ' material',
                      type: 'material',
                      data: '',
                      properties: { color: '#a3b9a6', roughness: 0.7, metalness: 0 },
                    })
                    getScene(p).entities.find((e) => e.id === entityId)!.components[i].material = id
                  })
                }}
              >
                <Plus size={12} /> Create material
              </button>
            )}
          </Section>
        )}
      </div>
    )
  }
  return (
    <aside className="mf-inspector">
      <datalist id="mf-event-catalog">
        {eventNames.map((name) => (
          <option key={name} value={name} />
        ))}
      </datalist>
      <div className="mf-pane-heading">
        <SlidersHorizontal size={15} />
        <strong>Inspector</strong>
      </div>
      {entity ? (
        <div className="mf-inspector-scroll" key={entity.id}>
          <div className="mf-identity">
            <div className="mf-identity-icon">
              <Box size={21} />
            </div>
            <div>
              <input
                aria-label="Object name"
                value={entity.name}
                onChange={(e) => editEntity((obj) => (obj.name = e.target.value))}
              />
              <small>{mesh ? titleCase(mesh.shape || 'Mesh') + ' mesh' : 'Scene object'}</small>
            </div>
            <input
              title="Object active"
              aria-label="Object active"
              type="checkbox"
              checked={entity.active}
              onChange={(e) => editEntity((obj) => (obj.active = e.target.checked))}
            />
          </div>
          <Section name="Transform" icon={Move}>
            <Field label="Tags">
              <input
                key={entity.id + JSON.stringify(entity.properties.tags || [])}
                aria-label="Object tags"
                placeholder="Comma-separated tags"
                defaultValue={(Array.isArray(entity.properties.tags) ? entity.properties.tags : []).join(', ')}
                onBlur={(e) => {
                  const tags = [
                    ...new Set(
                      e.target.value
                        .split(',')
                        .map((s) => s.trim())
                        .filter(Boolean),
                    ),
                  ]
                  if (JSON.stringify(tags) !== JSON.stringify(entity.properties.tags || []))
                    editEntity((obj) => {
                      obj.properties.tags = tags
                    })
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') e.currentTarget.blur()
                }}
              />
            </Field>
            <Field label="Static (Batch)">
              <input
                type="checkbox"
                aria-label="Static batching"
                title="Combine this static mesh with other static meshes sharing the same material at runtime"
                checked={Boolean(entity.properties.staticBatch)}
                onChange={(e) =>
                  editEntity((obj) => {
                    obj.properties.staticBatch = e.target.checked
                  })
                }
              />
            </Field>
            <Field label="Cull distance (m)">
              <Numeric
                label="Entity cull distance"
                value={entity.properties.cullDistance ?? 0}
                min={0}
                max={300}
                step={5}
                change={(v) =>
                  editEntity((obj) => {
                    obj.properties.cullDistance = v > 0 ? v : undefined
                  })
                }
              />
            </Field>
            {entity.properties.prefabId && (
              <div style={{ padding: '6px 8px', borderRadius: 6, background: 'rgba(88, 216, 255, 0.08)', border: '1px solid rgba(88, 216, 255, 0.28)', marginTop: 4, display: 'flex', flexDirection: 'column', gap: 5 }}>
                <small style={{ color: '#8ee6ff', fontWeight: 600 }}>
                  Live Prefab: {asset(entity.properties.prefabId)?.name || entity.properties.prefabId}
                </small>
                <div className="mf-row" style={{ gap: 5, flexWrap: 'wrap' }}>
                  <button type="button" className="mf-btn" onClick={() => onEditAsset?.(entity.properties.prefabId)}>
                    Edit Prefab
                  </button>
                  <button
                    type="button"
                    className="mf-btn"
                    onClick={() => {
                      edit((p) => {
                        updatePrefabFromEntity(p, entity.id)
                      })
                      setFeedback(entity.id)
                    }}
                  >
                    Apply &amp; Sync All
                  </button>
                  <button
                    type="button"
                    className="mf-btn"
                    onClick={() =>
                      editEntity((obj) => {
                        delete obj.properties.prefabId
                      })
                    }
                  >
                    Unlink
                  </button>
                </div>
              </div>
            )}
            {(['position', 'rotation', 'scale'] as const).map((key) => (
              <div className="mf-transform" key={key}>
                <span>{titleCase(key)}</span>
                <div>
                  {['X', 'Y', 'Z'].map((axis, j) => (
                    <label key={axis}>
                      <i className={'mf-axis-' + axis}>{axis}</i>
                      <Numeric
                        label={key + ' ' + axis}
                        value={
                          key === 'rotation'
                            ? (entity.transform[key][j] * 180) / Math.PI
                            : entity.transform[key][j]
                        }
                        step={key === 'rotation' ? 5 : 0.1}
                        change={(n) =>
                          editEntity((obj) => {
                            ;(obj.transform[key] as Vec3)[j] = key === 'rotation' ? (n * Math.PI) / 180 : n
                          })
                        }
                      />
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </Section>
          {entity.components.map(renderComponent)}
          <div className="mf-inspector-actions">
            <button
              ref={addBtnRef}
              type="button"
              className="mf-add"
              aria-expanded={adding}
              onClick={() => {
                setCompSearch('')
                showAdd(!adding)
              }}
            >
              <Plus size={14} /> Add component
            </button>
            {adding && (
              <div
                ref={compPopRef}
                className="mf-component-picker mf-floating-picker"
                style={{ top: compBox.top, left: compBox.left, width: compBox.width }}
              >
                <div className="mf-comp-search">
                  <Search size={13} />
                  <input
                    autoFocus
                    placeholder="Search components…"
                    aria-label="Search components"
                    value={compSearch}
                    onChange={(e) => setCompSearch(e.target.value)}
                  />
                </div>
                <div className="mf-comp-list" style={{ maxHeight: compBox.listMaxHeight }}>
                  {COMPONENT_CATALOG.filter((item) => {
                    const q = compSearch.trim().toLowerCase()
                    if (!q) return true
                    return (
                      item.name.toLowerCase().includes(q) ||
                      item.category.toLowerCase().includes(q) ||
                      item.desc.toLowerCase().includes(q) ||
                      item.keywords.toLowerCase().includes(q)
                    )
                  }).map((item) => {
                    const CompIcon = item.icon
                    const has = entity.components.some((c) => c.type === item.type)
                    return (
                      <button
                        key={item.type}
                        type="button"
                        aria-label={item.name}
                        className={'mf-comp-item' + (has ? ' has' : '')}
                        onClick={() => add(item.type)}
                      >
                        <span className="mf-comp-icon">
                          <CompIcon size={15} />
                        </span>
                        <span className="mf-comp-meta">
                          <strong>{item.name}</strong>
                          <small>{item.desc}</small>
                        </span>
                        <span className="mf-comp-cat">{item.category}</span>
                      </button>
                    )
                  })}
                </div>
              </div>
            )}
            <button
              className="mf-text-action"
              onClick={() => {
                edit((p) => p.assets.push(makePrefab(getScene(p), entity.id)))
                setFeedback(entity.id)
              }}
            >
              {feedback === entity.id ? <Check size={12} /> : <PackagePlus size={12} />}{' '}
              {feedback === entity.id ? 'Prefab saved' : 'Save as prefab'}
            </button>
          </div>
        </div>
      ) : (
        <div className="mf-noselection">
          <MousePointer2 size={23} />
          <span>Select an object in the scene</span>
        </div>
      )}
    </aside>
  )
}
export const defaultScript =
  'export default function (api: GameAPI) {\n  return {\n    onStart() {\n      // Initialize systems or register services here\n    },\n    onUpdate(deltaTime: number) {\n      api.object.rotation.y += deltaTime;\n    },\n  };\n}\n'
export default Inspector
