import { useEffect, useRef, useState } from 'react'
import { Plus, Trash2, RefreshCw, Layers, Box } from 'lucide-react'
import { createWorld, type RenderWorld } from '../../../packages/graphics/src'
import { Vector3 } from '../../../packages/graphics/src/scene'
import {
  makeEntity,
  makeProject,
  syncPrefabInstances,
  type Asset,
  type Component,
  type Entity,
  type Project,
  type Vec3,
} from '../../../packages/project-schema/src'
import { Field, Numeric, Color } from './Fields'

const ENTITY_PRESETS = [
  'Box',
  'Sphere',
  'Plane',
  'Cylinder',
  'Capsule',
  'Cone',
  'Empty',
  'Point Light',
  'Spot Light',
  'Volumetric Light',
  '3D Particle',
  '3D Billboard',
  '3D Decal',
  'Audio Source',
  'Trigger',
  'Camera',
] as const

const COMP_TYPES = [
  'mesh',
  'light',
  'particle',
  'billboard',
  'decal',
  'volumetric',
  'collider',
  'body',
  'script',
  'behavior',
  'audio',
  'animation',
  'navAgent',
  'camera',
] as const

function buildPrefabEntity(kind: string, name: string): Entity {
  const prims = ['Box', 'Sphere', 'Plane', 'Cylinder', 'Capsule', 'Cone']
  const e = makeEntity(name, prims.includes(kind) ? kind.toLowerCase() : undefined)
  if (kind === 'Point Light') e.components.push({ type: 'light', kind: 'point', color: '#fff2d0', intensity: 2, range: 12 })
  else if (kind === 'Spot Light') e.components.push({ type: 'light', kind: 'spot', color: '#fff2d0', intensity: 2.5, range: 16, angle: 0.6, coneSoftness: 0.25 })
  else if (kind === 'Volumetric Light') {
    e.transform.scale = [1, 3, 1]
    e.components.push({ type: 'volumetric', shape: 'cone', color: '#ffe5b4', intensity: 0.42, softness: 2.2, dustSpeed: 0.35, topRadius: 0.2, bottomRadius: 1.4 })
  } else if (kind === '3D Particle') e.components.push({ type: 'particle', preset: 'steam', playing: true })
  else if (kind === '3D Billboard') e.components.push({ type: 'billboard', color: '#ffffff', width: 1.2, height: 1.2, opacity: 1, unlit: true })
  else if (kind === '3D Decal') e.components.push({ type: 'decal', material: '', texture: '', color: '#ffffff', width: 1, height: 1, opacity: 0.9, normalOffset: 0.008, projection: 'surface', projectionDepth: 0.6 })
  else if (kind === 'Audio Source') e.components.push({ type: 'audio', asset: '', volume: 1 })
  else if (kind === 'Trigger') e.components.push({ type: 'collider', shape: 'box', trigger: true })
  else if (kind === 'Camera') e.components.push({ type: 'camera', projection: 'perspective', fov: 50 })
  return e
}

function defaultComp(type: string): Component {
  const c: Component = { type, enabled: true }
  if (type === 'mesh') Object.assign(c, { shape: 'box', material: '' })
  else if (type === 'light') Object.assign(c, { kind: 'point', color: '#ffffff', intensity: 2, range: 12 })
  else if (type === 'particle') Object.assign(c, { preset: 'steam', playing: true })
  else if (type === 'billboard') Object.assign(c, { color: '#ffffff', width: 1.2, height: 1.2, opacity: 1, unlit: true })
  else if (type === 'decal') Object.assign(c, { color: '#ffffff', width: 1, height: 1, opacity: 0.9, normalOffset: 0.008, projection: 'surface', projectionDepth: 0.6 })
  else if (type === 'volumetric') Object.assign(c, { shape: 'cone', color: '#ffe5b4', intensity: 0.4, softness: 2, dustSpeed: 0.3, topRadius: 0.2, bottomRadius: 1.4 })
  else if (type === 'collider') Object.assign(c, { shape: 'box', trigger: false, friction: 0.5, restitution: 0.1 })
  else if (type === 'body') Object.assign(c, { kind: 'static', mass: 1, friction: 0.5, restitution: 0.1 })
  else if (type === 'script') Object.assign(c, { asset: '', params: {} })
  else if (type === 'behavior') Object.assign(c, { kind: 'rotate', params: {} })
  else if (type === 'audio') Object.assign(c, { asset: '', volume: 1 })
  else if (type === 'animation') Object.assign(c, { clip: '', loop: true, autoplay: true, speed: 1 })
  else if (type === 'navAgent') Object.assign(c, { speed: 2.8, turnSpeed: 8, stopDistance: 0.35 })
  else if (type === 'camera') Object.assign(c, { projection: 'perspective', fov: 50 })
  return c
}

export function PrefabEditor({
  a,
  p,
  changeA,
  edit,
}: {
  a: Asset
  p: Project
  changeA: (fn: (asset: Asset) => void) => void
  edit: (fn: (proj: Project) => void) => void
}) {
  const nodes: Entity[] = (() => {
    try {
      const parsed = JSON.parse(a.data || '[]')
      return Array.isArray(parsed) && parsed.length ? parsed : [makeEntity(a.name || 'Prefab', 'box')]
    } catch {
      return [makeEntity(a.name || 'Prefab', 'box')]
    }
  })()

  const [selectedIdx, setSelectedIdx] = useState(0)
  const [newKind, setNewKind] = useState<string>('Box')
  const [newComp, setNewComp] = useState<string>('mesh')
  const [syncNote, setSyncNote] = useState('')
  const previewHostRef = useRef<HTMLDivElement | null>(null)
  const worldRef = useRef<RenderWorld | null>(null)
  const orbitRef = useRef({ yaw: 0.65, pitch: 0.4, dist: 5.5, dragging: false, lx: 0, ly: 0 })

  const safeIdx = Math.min(selectedIdx, nodes.length - 1)
  const cur = nodes[safeIdx]

  const linkedCount = p.scenes.reduce(
    (sum, sc) => sum + sc.entities.filter((e) => e.properties?.prefabId === a.id).length,
    0,
  )

  // Live 3D Prefab Preview Viewport
  useEffect(() => {
    const host = previewHostRef.current
    if (!host) return
    const sample = makeProject('Prefab Preview')
    sample.assets = p.assets
    sample.scenes[0].environment.background = '#181f28'
    sample.scenes[0].environment.ambient = 1.4
    sample.scenes[0].entities = structuredClone(nodes)
    sample.scenes[0].entities[0].transform.position = [0, 0, 0]
    let w: RenderWorld
    try {
      w = createWorld(host, sample, undefined, { editor: true })
    } catch {
      return
    }
    worldRef.current = w
    w.setGrid(true, -0.02)
    let raf = 0
    const loop = () => {
      raf = requestAnimationFrame(loop)
      const o = orbitRef.current
      w.camera.position.set(
        Math.sin(o.yaw) * Math.cos(o.pitch) * o.dist,
        Math.sin(o.pitch) * o.dist + 0.5,
        Math.cos(o.yaw) * Math.cos(o.pitch) * o.dist,
      )
      w.camera.lookAt(new Vector3(0, 0.4, 0))
      w.camera.fov = 42
      w.render()
    }
    raf = requestAnimationFrame(loop)
    return () => {
      cancelAnimationFrame(raf)
      worldRef.current = null
      w.dispose()
    }
  }, [])

  // Sync live 3D preview whenever prefab nodes or assets change
  useEffect(() => {
    const w = worldRef.current
    if (!w) return
    const sample = makeProject('Prefab Preview')
    sample.assets = p.assets
    sample.scenes[0].environment.background = '#181f28'
    sample.scenes[0].environment.ambient = 1.4
    sample.scenes[0].entities = structuredClone(nodes)
    sample.scenes[0].entities[0].transform.position = [0, 0, 0]
    w.load(sample)
    w.setGrid(true, -0.02)
  }, [a.data, p.assets])

  const commitNodes = (next: Entity[]) => {
    changeA((asset) => {
      asset.data = JSON.stringify(next)
    })
  }

  const updateCur = (fn: (e: Entity) => void) => {
    const next = structuredClone(nodes)
    fn(next[safeIdx])
    commitNodes(next)
  }

  const addChildEntity = () => {
    const next = structuredClone(nodes)
    const child = buildPrefabEntity(newKind, `${newKind} ${next.length}`)
    child.parent = next[safeIdx].id
    next.push(child)
    commitNodes(next)
    setSelectedIdx(next.length - 1)
  }

  const removeChild = (idx: number) => {
    if (idx === 0) return
    const next = structuredClone(nodes)
    const remId = next[idx].id
    const filtered = next.filter((n, i) => i !== idx && n.parent !== remId)
    commitNodes(filtered)
    setSelectedIdx(0)
  }

  const syncAll = () => {
    let count = 0
    edit((proj) => {
      const targetAsset = proj.assets.find((x) => x.id === a.id)
      if (targetAsset) targetAsset.data = JSON.stringify(nodes)
      count = syncPrefabInstances(proj, a.id)
    })
    setSyncNote(`Synced ${count} instance(s) across all scenes`)
    setTimeout(() => setSyncNote(''), 2800)
  }

  const matAssets = p.assets.filter((x) => x.type === 'material')
  const modelAssets = p.assets.filter((x) => x.type === 'model')

  return (
    <div className="mf-html-studio">
      <div className="mf-html-top">
        <div className="mf-html-tabs">
          <select aria-label="Child entity type" value={newKind} onChange={(e) => setNewKind(e.target.value)} style={{ fontSize: 11.5 }}>
            {ENTITY_PRESETS.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
          <button type="button" className="mf-btn" onClick={addChildEntity}>
            <Plus size={12} /> Add Child Entity
          </button>
        </div>
        <div className="mf-html-templates">
          <button type="button" className="mf-btn" onClick={syncAll}>
            <RefreshCw size={12} /> Sync All Instances ({linkedCount})
          </button>
        </div>
      </div>
      {syncNote && <small style={{ color: '#7ee787' }}>{syncNote}</small>}

      <div className="mf-html-split">
        <div className="mf-html-code-col">
          <div className="mf-minor-label" style={{ marginTop: 0 }}>
            Live 3D Prefab Preview (drag to orbit, scroll to zoom)
          </div>
          <div
            ref={previewHostRef}
            style={{
              position: 'relative',
              width: '100%',
              height: 210,
              borderRadius: 8,
              overflow: 'hidden',
              border: '1px solid rgba(255,255,255,0.14)',
              background: '#141a22',
              cursor: 'grab',
            }}
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId)
              orbitRef.current.dragging = true
              orbitRef.current.lx = e.clientX
              orbitRef.current.ly = e.clientY
            }}
            onPointerMove={(e) => {
              const o = orbitRef.current
              if (!o.dragging) return
              o.yaw -= (e.clientX - o.lx) * 0.01
              o.pitch = Math.max(-1.2, Math.min(1.4, o.pitch + (e.clientY - o.ly) * 0.009))
              o.lx = e.clientX
              o.ly = e.clientY
            }}
            onPointerUp={() => { orbitRef.current.dragging = false }}
            onPointerCancel={() => { orbitRef.current.dragging = false }}
            onWheel={(e) => {
              e.preventDefault()
              orbitRef.current.dist = Math.max(1.5, Math.min(30, orbitRef.current.dist * Math.exp(e.deltaY * 0.001)))
            }}
          />

          <div className="mf-minor-label">
            <Layers size={12} /> Prefab Hierarchy ({nodes.length})
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 165, overflowY: 'auto' }}>
            {nodes.map((node, i) => (
              <div
                key={node.id}
                onClick={() => setSelectedIdx(i)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '5px 8px',
                  paddingLeft: i === 0 ? 8 : 20,
                  borderRadius: 6,
                  cursor: 'pointer',
                  background: i === safeIdx ? 'rgba(88, 216, 255, 0.18)' : 'rgba(255,255,255,0.03)',
                  border: '1px solid ' + (i === safeIdx ? 'rgba(88, 216, 255, 0.5)' : 'rgba(255,255,255,0.08)'),
                }}
              >
                <Box size={13} />
                <span style={{ flex: 1, fontSize: 12, fontWeight: i === 0 ? 700 : 500 }}>
                  {node.name} {i === 0 ? '(Root)' : ''}
                </span>
                <small style={{ opacity: 0.65 }}>{node.components.length} comp</small>
                {i > 0 && (
                  <button
                    type="button"
                    title="Remove child"
                    onClick={(ev) => {
                      ev.stopPropagation()
                      removeChild(i)
                    }}
                    style={{ background: 'transparent', border: 'none', color: '#e68177', cursor: 'pointer' }}
                  >
                    <Trash2 size={12} />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="mf-html-preview-col" style={{ maxHeight: 420, overflowY: 'auto' }}>
          <div className="mf-minor-label" style={{ marginTop: 0 }}>
            Node Properties: {cur.name}
          </div>
          <Field label="Name">
            <input value={cur.name} onChange={(e) => updateCur((n) => (n.name = e.target.value))} />
          </Field>
          <Field label="Active">
            <input type="checkbox" checked={cur.active} onChange={(e) => updateCur((n) => (n.active = e.target.checked))} />
          </Field>
          <Field label="Static (Batch)">
            <input
              type="checkbox"
              checked={Boolean(cur.properties.staticBatch)}
              onChange={(e) => updateCur((n) => (n.properties.staticBatch = e.target.checked))}
            />
          </Field>
          <Field label="Cull distance (m)">
            <Numeric
              label="Cull distance"
              value={cur.properties.cullDistance ?? 0}
              min={0}
              max={300}
              step={5}
              change={(v) => updateCur((n) => (n.properties.cullDistance = v > 0 ? v : undefined))}
            />
          </Field>
          <Field label="Tags">
            <input
              value={(Array.isArray(cur.properties.tags) ? cur.properties.tags : []).join(', ')}
              onChange={(e) =>
                updateCur((n) => {
                  n.properties.tags = e.target.value
                    .split(',')
                    .map((s) => s.trim())
                    .filter(Boolean)
                })
              }
            />
          </Field>
          {(['position', 'rotation', 'scale'] as const).map((axisKey) => (
            <Field key={axisKey} label={axisKey}>
              <div className="mf-vec3-inline">
                {[0, 1, 2].map((ax) => (
                  <Numeric
                    key={ax}
                    label={`${axisKey} ${ax}`}
                    value={
                      axisKey === 'rotation'
                        ? Math.round(((cur.transform[axisKey][ax] * 180) / Math.PI) * 10) / 10
                        : cur.transform[axisKey][ax]
                    }
                    step={axisKey === 'rotation' ? 5 : 0.1}
                    change={(v) =>
                      updateCur((n) => {
                        ;(n.transform[axisKey] as Vec3)[ax] = axisKey === 'rotation' ? (v * Math.PI) / 180 : v
                      })
                    }
                  />
                ))}
              </div>
            </Field>
          ))}

          <div className="mf-minor-label" style={{ justifyContent: 'space-between' }}>
            <span>Components ({cur.components.length})</span>
            <div style={{ display: 'flex', gap: 4 }}>
              <select aria-label="Component to add" value={newComp} onChange={(e) => setNewComp(e.target.value)} style={{ fontSize: 11 }}>
                {COMP_TYPES.map((ct) => (
                  <option key={ct} value={ct}>
                    {ct}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="mf-btn"
                onClick={() => updateCur((n) => n.components.push(defaultComp(newComp)))}
              >
                <Plus size={11} /> Add
              </button>
            </div>
          </div>
          {cur.components.map((comp, ci) => (
            <div
              key={ci}
              style={{
                padding: 6,
                borderRadius: 6,
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.09)',
                marginBottom: 4,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                <strong style={{ fontSize: 11.5 }}>{comp.type}</strong>
                <button
                  type="button"
                  onClick={() => updateCur((n) => n.components.splice(ci, 1))}
                  style={{ background: 'transparent', border: 'none', color: '#e68177', cursor: 'pointer' }}
                >
                  <Trash2 size={12} />
                </button>
              </div>
              {comp.type === 'mesh' && (
                <>
                  <Field label="Shape">
                    <select
                      value={comp.shape || 'box'}
                      onChange={(e) => updateCur((n) => (n.components[ci].shape = e.target.value))}
                    >
                      {['box', 'sphere', 'plane', 'cylinder', 'capsule', 'cone', 'model'].map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </Field>
                  {comp.shape === 'model' ? (
                    <Field label="Model (.glb)">
                      <select
                        value={comp.asset || ''}
                        onChange={(e) => updateCur((n) => (n.components[ci].asset = e.target.value))}
                      >
                        <option value="">Select model…</option>
                        {modelAssets.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.name}
                          </option>
                        ))}
                      </select>
                    </Field>
                  ) : (
                    <Field label="Material">
                      <select
                        value={comp.material || ''}
                        onChange={(e) => updateCur((n) => (n.components[ci].material = e.target.value))}
                      >
                        <option value="">Default</option>
                        {matAssets.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.name}
                          </option>
                        ))}
                      </select>
                    </Field>
                  )}
                </>
              )}
              {comp.type === 'light' && (
                <>
                  <Field label="Color">
                    <Color label="Light color" value={comp.color || '#ffffff'} change={(v) => updateCur((n) => (n.components[ci].color = v))} />
                  </Field>
                  <Field label="Intensity">
                    <Numeric
                      label="Light intensity"
                      value={comp.intensity ?? 2}
                      min={0}
                      max={20}
                      step={0.1}
                      change={(v) => updateCur((n) => (n.components[ci].intensity = v))}
                    />
                  </Field>
                </>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
