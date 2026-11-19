import { useState } from 'react'
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
  ChevronRight,
  MousePointer2,
  Shapes,
  PackagePlus,
  Check,
} from 'lucide-react'
import {
  getScene,
  uid,
  makePrefab,
  type Project,
  type Asset,
  type Component,
  type Vec3,
} from '../../../packages/project-schema/src'
import ScriptParams from './ScriptParams'
import { VisualFields } from './VisualFields'
import { Section, Field, Numeric, Color } from './Fields'
import './authoring.css'

import {behaviorDefaults, eventNames} from '../../../packages/behaviors/src/catalog'
import {RuleFields} from './RuleFields'
export {behaviorDefaults}
const names: Record<string, string> = {
  mesh: 'Mesh Renderer',
  behavior: 'Behavior',
  rule: 'Event Rule',
  light: 'Light',
  camera: 'Camera',
  collider: 'Collider',
  body: 'Physics Body',
  script: 'Script',
  audio: 'Audio Source',
  animation: 'Animation Player',
  sprite: 'Billboard Sprite',
}
const icons = {
  mesh: Box,
  light: Sun,
  camera: Video,
  collider: Cuboid,
  body: Box,
  script: Code2,
  behavior: Zap,
  audio: AudioLines,
}
const titleCase = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
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
export function Inspector({
  project,
  entityId,
  onChange,
  onEditAsset,
}: {
  project: Project
  entityId: string | null
  onChange: (p: Project) => void
  onEditAsset?: (id: string) => void
}) {
  const [adding, showAdd] = useState(false),
    [feedback, setFeedback] = useState('')
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
      case 'animation':
        Object.assign(item, { clip: '', loop: true, autoplay: true, speed: 1, event: '' })
        break
      case 'sprite':
        Object.assign(item, { texture: '', color: '#ffffff', opacity: 1, width: 1, height: 1 })
        break
      case 'mesh':
        Object.assign(item, { shape: 'box', material: '' })
        break
      case 'rule':
        Object.assign(item, { event: 'object.clicked', source: '', tag: '', actions: [{kind:'addVariable', key:'score', value:1}] })
        break
      case 'behavior':
        Object.assign(item, { kind: 'rotate', params: { ...behaviorDefaults.rotate[1] } })
        break
      case 'light':
        Object.assign(item, { kind: 'point', color: '#ffffff', intensity: 2 })
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
        Object.assign(item, { shape: 'box', trigger: false })
        break
      case 'body':
        Object.assign(item, { kind: 'static' })
        break
      case 'audio':
        Object.assign(item, { asset: '', volume: 1 })
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
    const num = (label: string, key: string, def: number, min?: number, max?: number) => (
      <Field label={label}>
        <Numeric label={label} value={c[key] ?? def} min={min} max={max} change={(n) => prop(key, n)} />
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
          {(c.type === 'animation' || c.type === 'sprite') && (
            <VisualFields c={c} assets={project.assets} modelId={entity?.components.find(part => part.type === 'mesh' && part.shape === 'model')?.asset} change={prop}/>
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
              {num('Intensity', 'intensity', 1, 0)}
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
              {select('Shape', ['box', 'sphere', 'capsule'], c.shape, (v) => prop('shape', v))}
              <Field label="Trigger">
                <input
                  type="checkbox"
                  checked={Boolean(c.trigger)}
                  onChange={(e) => prop('trigger', e.target.checked)}
                />
              </Field>
            </>
          )}
          {c.type === 'body' &&
            select('Body type', ['static', 'dynamic', 'kinematic'], c.kind, (v) => prop('kind', v))}
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
          {c.type === 'rule' && <RuleFields project={project} rule={c} change={data=>patch(i,data)} />}
          {c.type === 'behavior' && (
            <>
              <Field label="Behavior">
                <select
                  aria-label="Behavior"
                  value={c.kind}
                  onChange={(e) =>
                    patch(i, { kind: e.target.value, params: { ...behaviorDefaults[e.target.value][1] } })
                  }
                >
                  {Object.entries(behaviorDefaults).map(([k, [label]]) => (
                    <option value={k} key={k}>
                      {label}
                    </option>
                  ))}
                  {!behaviorDefaults[c.kind] && <option value={c.kind}>{c.kind}</option>}
                </select>
              </Field>
              {Object.entries({ ...behaviorDefaults[c.kind]?.[1], ...c.params }).map(([key, v]) => (
                <Field key={key} label={titleCase(key)}>
                  {typeof v === 'number' ? (
                    <Numeric label={key} value={v} change={(n) => parameter(key, n)} />
                  ) : typeof v === 'boolean' ? (
                    <input type="checkbox" checked={v} onChange={e=>parameter(key,e.target.checked)} />
                  ) : key === 'event' ? (
                    <><input aria-label="Behavior event" list="mf-event-catalog" value={String(v)} onChange={e=>parameter(key,e.target.value)}/></>
                  ) : key === 'prefab' ? (
                    <AssetSelect label="Spawn prefab" assets={project.assets} type="prefab" value={String(v||'')} change={id=>parameter(key,id)}/>
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
      <datalist id="mf-event-catalog">{eventNames.map(name=><option key={name} value={name}/>)}</datalist>
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
            <Field label="Tags"><input key={entity.id+JSON.stringify(entity.properties.tags || [])} aria-label="Object tags" placeholder="Comma-separated tags" defaultValue={(Array.isArray(entity.properties.tags)?entity.properties.tags:[]).join(", ")} onBlur={e=>{const tags=[...new Set(e.target.value.split(",").map(s=>s.trim()).filter(Boolean))]; if(JSON.stringify(tags)!==JSON.stringify(entity.properties.tags||[]))editEntity(obj=>{obj.properties.tags=tags})}} onKeyDown={e=>{if(e.key==="Enter")e.currentTarget.blur()}}/></Field>
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
            <button className="mf-add" aria-expanded={adding} onClick={() => showAdd(!adding)}>
              <Plus size={14} /> Add component
            </button>
            {adding && (
              <div className="mf-component-menu">
                {Object.entries(names).map(([k, n]) => (
                  <button key={k} onClick={() => add(k)}>
                    {n}
                  </button>
                ))}
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
  'export default function (api: GameAPI) {\n  return {\n    onUpdate(deltaTime: number) {\n      api.object.rotation.y += deltaTime;\n    },\n  };\n}\n'
export default Inspector
