import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import {
  X,
  Plus,
  Trash2,
  SlidersHorizontal,
  Check,
  Code2,
  Monitor,
  Languages,
  CircleDot,
  AlertTriangle,
  File,
  Import,
  Download,
} from 'lucide-react'
import { getScene, uid, makeMaterial, type Asset, type Project } from '../../../packages/project-schema/src'
import { Field, Numeric, Color } from './Fields'
import { defaultScript, AssetSelect } from './Inspector'
import { shaders, checkShader } from './shaderTemplates'

const CodeEditor = lazy(() => import('./CodeEditor'))
type Edit = (fn: (p: Project) => void) => void
const presets: Record<string, Record<string, unknown>> = {
  Default: { background: '#242b35', ambient: 1.3, exposure: 1, shadows: true, fogDensity: 0 },
  Outdoor: {
    background: '#a6c6df',
    ambient: 1.7,
    exposure: 1.15,
    shadows: true,
    fogDensity: 0.008,
    fogColor: '#a6c6df',
  },
  Sunset: {
    background: '#da987f',
    ambient: 1.1,
    exposure: 1.05,
    shadows: true,
    fogDensity: 0.018,
    fogColor: '#d99983',
  },
  Night: {
    background: '#141c38',
    ambient: 0.45,
    exposure: 0.7,
    shadows: true,
    fogDensity: 0.02,
    fogColor: '#202b48',
  },
  Unlit: {
    background: '#31343c',
    ambient: 3,
    exposure: 1,
    shadows: false,
    fogDensity: 0,
    toneMapping: 'none',
  },
  'Mobile Low': {
    background: '#28343d',
    ambient: 1,
    exposure: 1,
    shadows: false,
    fogDensity: 0,
    resolutionScale: 0.8,
    pixelRatioLimit: 1,
  },
}
function Settings({ p, edit }: { p: Project; edit: Edit }) {
  const env = getScene(p).environment
  const patch = (k: string, v: unknown) =>
    edit((n) => {
      getScene(n).environment[k] = v
    })
  return (
    <>
      <h4>Project</h4>
      <div className="mf-form-grid">
        <Field label="Name">
          <input value={p.name} onChange={(e) => edit((n) => (n.name = e.target.value))} />
        </Field>
        <Field label="Game duration (s)">
          <Numeric
            label="Game duration"
            value={p.settings.duration}
            min={1}
            step={1}
            change={(v) => edit((n) => (n.settings.duration = v))}
          />
        </Field>
        <Field label="Fallback language">
          <select
            value={p.settings.language}
            onChange={(e) => edit((n) => (n.settings.language = e.target.value))}
          >
            {Object.keys(p.locales).map((k) => (
              <option key={k}>{k}</option>
            ))}
          </select>
        </Field>
      </div>
      <h4>Scene environment</h4>
      <div className="mf-presets">
        {Object.keys(presets).map((k) => (
          <button key={k} onClick={() => edit((n) => Object.assign(getScene(n).environment, presets[k]))}>
            {k}
          </button>
        ))}
      </div>
      <div className="mf-form-grid">
        {['background', 'fogColor'].map((k) => (
          <Field label={k === 'background' ? 'Background' : 'Fog color'} key={k}>
            <Color label={k} value={env[k] || '#222b35'} change={(v) => patch(k, v)} />
          </Field>
        ))}
        {(
          [
            ['ambient', 'Ambient light', 1, 0, 10],
            ['fogDensity', 'Fog density', 0, 0, 1],
            ['exposure', 'Exposure', 1, 0.01, 5],
            ['resolutionScale', 'Resolution scale', 1, 0.25, 2],
            ['pixelRatioLimit', 'Pixel ratio limit', 2, 0.5, 4],
          ] as const
        ).map(([k, label, def, min, max]) => (
          <Field key={k} label={label}>
            <Numeric label={label} value={env[k] ?? def} min={min} max={max} change={(v) => patch(k, v)} />
          </Field>
        ))}
        <Field label="Shadows">
          <input
            type="checkbox"
            checked={env.shadows !== false}
            onChange={(e) => patch('shadows', e.target.checked)}
          />
        </Field>
        <Field label="Shadow quality">
          <select
            value={env.shadowQuality || 'medium'}
            onChange={(e) => patch('shadowQuality', e.target.value)}
          >
            {['low', 'medium', 'high'].map((k) => (
              <option key={k}>{k}</option>
            ))}
          </select>
        </Field>
        <Field label="Tone mapping">
          <select value={env.toneMapping || 'aces'} onChange={(e) => patch('toneMapping', e.target.value)}>
            <option value="aces">ACES Filmic</option>
            <option value="none">None</option>
          </select>
        </Field>
      </div>
    </>
  )
}
function MaterialForm({ a, p, patch }: { a: Asset; p: Project; patch: (k: string, v: unknown) => void }) {
  const m = a.properties
  return (
    <>
      <div
        className="mf-material-preview"
        style={{
          background:
            'radial-gradient(circle at 40% 28%, white -20%, ' + (m.color || '#ffffff') + ' 35%, #121319 96%)',
        }}
      />
      <div className="mf-form-grid">
        <Field label="Shading">
          <select
            value={m.unlit ? 'unlit' : 'pbr'}
            onChange={(e) => patch('unlit', e.target.value === 'unlit')}
          >
            <option value="pbr">Standard / PBR</option>
            <option value="unlit">Basic / Unlit</option>
          </select>
        </Field>
        {['color', 'emissive'].map((k) => (
          <Field key={k} label={k === 'color' ? 'Base color' : 'Emissive'}>
            <Color
              label={k}
              value={m[k] || (k === 'color' ? '#ffffff' : '#000000')}
              change={(v) => patch(k, v)}
            />
          </Field>
        ))}
        {(['roughness', 'metalness', 'opacity', 'alphaTest'] as const).map((k, i) => (
          <Field key={k} label={['Roughness', 'Metallic', 'Opacity', 'Alpha cutoff'][i]}>
            <Numeric
              label={k}
              min={0}
              max={1}
              value={m[k] ?? [0.8, 0, 1, 0][i]}
              change={(v) => patch(k, v)}
            />
          </Field>
        ))}
        {(['map', 'normalMap', 'emissiveMap', 'shader'] as const).map((k, i) => (
          <Field key={k} label={['Base color map', 'Normal map', 'Emissive map', 'Custom shader'][i]}>
            <AssetSelect
              assets={p.assets}
              type={k === 'shader' ? 'shader' : 'texture'}
              label={k}
              value={m[k]}
              change={(v) => patch(k, v)}
            />
          </Field>
        ))}
        {['doubleSided', 'flatShading'].map((k, i) => (
          <Field key={k} label={['Double sided', 'Flat shading'][i]}>
            <input type="checkbox" checked={!!m[k]} onChange={(e) => patch(k, e.target.checked)} />
          </Field>
        ))}
        {['tiling', 'offset'].map((k) => (
          <Field label={k === 'tiling' ? 'UV tiling' : 'UV offset'} key={k}>
            <div className="mf-pair">
              {['U', 'V'].map((axis, i) => (
                <Numeric
                  key={axis}
                  label={k + ' ' + axis}
                  value={m[k]?.[i] ?? (k === 'tiling' ? 1 : 0)}
                  change={(v) => {
                    const vec = [...(m[k] || (k === 'tiling' ? [1, 1] : [0, 0]))]
                    vec[i] = v
                    patch(k, vec)
                  }}
                />
              ))}
            </div>
          </Field>
        ))}
      </div>
    </>
  )
}
function InterfaceForm({ p, edit }: { p: Project; edit: Edit }) {
  const [selected, select] = useState(p.ui[0]?.id || ''),
    [type, setType] = useState('text')
  const el = p.ui.find((x) => x.id === selected)
  const patch = (k: string, v: unknown) =>
    edit((n) => {
      n.ui.find((x) => x.id === selected)![k] = v
    })
  const add = () => {
    const id = uid('ui')
    edit((n) =>
      n.ui.push({
        id,
        type,
        text: type === 'button' ? 'Continue' : 'HUD',
        x: 5,
        y: 15,
        color: '#ffffff',
        fontSize: 18,
        visible: true,
        ...(type === 'counter' ? { variable: 'score' } : {}),
      }),
    )
    select(id)
  }
  return (
    <>
      <div className="mf-row">
        <select aria-label="UI element type" value={type} onChange={(e) => setType(e.target.value)}>
          {['text', 'button', 'image', 'progress', 'panel', 'counter'].map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
        <button onClick={add}>
          <Plus size={14} /> Add element
        </button>
      </div>
      <div className="mf-screen">
        {p.ui.map((u) => (
          <button
            key={u.id}
            title={u.text || u.type}
            className={u.id === selected ? 'chosen' : ''}
            onClick={() => select(u.id)}
            style={{
              left: u.x + '%',
              top: u.y + '%',
              color: u.color,
              fontSize: Math.min(24, u.fontSize || 14),
              opacity: u.visible === false ? 0.45 : 1,
            }}
          >
            {u.text || u.type}
          </button>
        ))}
      </div>
      {el && (
        <>
          <div className="mf-row">
            <select aria-label="Selected element" value={selected} onChange={(e) => select(e.target.value)}>
              {p.ui.map((u) => (
                <option value={u.id} key={u.id}>
                  {u.text || u.type} · {u.type}
                </option>
              ))}
            </select>
            <button
              aria-label="Delete element"
              onClick={() => {
                edit((n) => (n.ui = n.ui.filter((u) => u.id !== selected)))
                select(p.ui.find((u) => u.id !== selected)?.id || '')
              }}
            >
              <Trash2 size={13} />
            </button>
          </div>
          <div className="mf-form-grid">
            <Field label="Text / locale key">
              <input value={el.text} onChange={(e) => patch('text', e.target.value)} />
            </Field>
            <Field label="Text color">
              <Color label="Text color" value={el.color} change={(v) => patch('color', v)} />
            </Field>
            {(['x', 'y', 'fontSize', 'zIndex'] as const).map((k, i) => (
              <Field key={k} label={['Left (%)', 'Top (%)', 'Font size', 'Z order'][i]}>
                <Numeric
                  label={k}
                  value={el[k] ?? (k === 'fontSize' ? 16 : 0)}
                  min={k === 'fontSize' ? 1 : 0}
                  max={k === 'x' || k === 'y' ? 100 : undefined}
                  change={(v) => patch(k, v)}
                />
              </Field>
            ))}
            <Field label="Alignment">
              <select value={el.align || 'left'} onChange={(e) => patch('align', e.target.value)}>
                {['left', 'center', 'right'].map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </Field>
            <Field label="Visible">
              <input
                type="checkbox"
                checked={el.visible !== false}
                onChange={(e) => patch('visible', e.target.checked)}
              />
            </Field>
            {el.type === 'button' && (
              <Field label="Click event">
                <input value={el.event || ''} onChange={(e) => patch('event', e.target.value)} />
              </Field>
            )}
            {el.type === 'image' && (
              <Field label="Image">
                <AssetSelect
                  assets={p.assets}
                  type="texture"
                  value={el.asset || ''}
                  label="Image"
                  change={(v) => patch('asset', v)}
                />
              </Field>
            )}
            {['progress', 'counter'].includes(el.type) && (
              <Field label="Variable">
                <input value={el.variable || ''} onChange={(e) => patch('variable', e.target.value)} />
              </Field>
            )}
            {el.type === 'panel' && (
              <Field label="Background">
                <Color
                  label="Panel color"
                  value={el.background || '#35383c'}
                  change={(v) => patch('background', v)}
                />
              </Field>
            )}
            {el.type === 'progress' && (
              <Field label="Maximum">
                <Numeric label="Maximum" min={1} value={el.max ?? 100} change={(v) => patch('max', v)} />
              </Field>
            )}
          </div>
        </>
      )}
    </>
  )
}
function LocalesForm({ p, edit, fail }: { p: Project; edit: Edit; fail: (s: string) => void }) {
  const [search, setSearch] = useState(''),
    [newKey, setKey] = useState(''),
    [newLang, setLang] = useState(''),
    [missing, onlyMissing] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const langs = Object.keys(p.locales)
  const keys = [...new Set(Object.values(p.locales).flatMap(Object.keys))].sort()
  function exportData() {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(p.locales, null, 2)], { type: 'application/json' }),
    )
    const a = document.createElement('a')
    a.href = url
    a.download = 'locales.json'
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 800)
  }
  async function load(file?: File) {
    if (!file) return
    try {
      const data: unknown = JSON.parse(await file.text())
      if (
        !data ||
        typeof data !== 'object' ||
        Array.isArray(data) ||
        !Object.keys(data).length ||
        Object.entries(data).some(
          ([lang, v]) =>
            !lang.trim() ||
            !v ||
            typeof v !== 'object' ||
            Array.isArray(v) ||
            Object.values(v).some((s) => typeof s !== 'string'),
        )
      )
        throw Error('Expected a JSON object with a string dictionary per language')
      edit((n) => {
        n.locales = data as Project['locales']
        if (!n.locales[n.settings.language]) n.settings.language = Object.keys(n.locales)[0]
      })
      fail('')
    } catch (e) {
      fail(String(e))
    }
  }
  return (
    <>
      <div className="mf-row">
        <input
          placeholder="Search keys"
          aria-label="Search translations"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <label>
          <input type="checkbox" checked={missing} onChange={(e) => onlyMissing(e.target.checked)} /> Missing
          only
        </label>
        <button title="Import translations" onClick={() => input.current?.click()}>
          <Import size={14} />
        </button>
        <button title="Export translations" onClick={exportData}>
          <Download size={14} />
        </button>
        <input
          hidden
          ref={input}
          type="file"
          accept=".json"
          onChange={(e) => void load(e.target.files?.[0])}
        />
      </div>
      <div className="mf-table-scroll">
        <table>
          <thead>
            <tr>
              <th>Key</th>
              {langs.map((s) => (
                <th key={s}>{s.toUpperCase()}</th>
              ))}
              <th />
            </tr>
          </thead>
          <tbody>
            {keys
              .filter((k) => k.includes(search) && (!missing || langs.some((s) => !p.locales[s][k])))
              .map((k) => (
                <tr key={k}>
                  <td>{k}</td>
                  {langs.map((s) => (
                    <td key={s}>
                      <input
                        aria-label={s + ' ' + k}
                        value={p.locales[s][k] || ''}
                        onChange={(e) => edit((n) => (n.locales[s][k] = e.target.value))}
                      />
                    </td>
                  ))}
                  <td>
                    <button
                      aria-label={'Delete ' + k}
                      onClick={() => edit((n) => Object.values(n.locales).forEach((d) => delete d[k]))}
                    >
                      <Trash2 size={12} />
                    </button>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
      <div className="mf-row">
        <input
          placeholder="New translation key"
          aria-label="New translation key"
          value={newKey}
          onChange={(e) => setKey(e.target.value)}
        />
        <button
          disabled={!newKey.trim() || keys.includes(newKey.trim())}
          onClick={() => {
            edit((n) => Object.values(n.locales).forEach((d) => (d[newKey.trim()] = '')))
            setKey('')
          }}
        >
          <Plus size={13} /> Key
        </button>
        <input
          placeholder="Language code"
          aria-label="Language code"
          value={newLang}
          onChange={(e) => setLang(e.target.value)}
        />
        <button
          disabled={!/^[a-z]{2,3}(-[a-zA-Z]{2,4})?$/.test(newLang) || langs.includes(newLang)}
          onClick={() => {
            edit((n) => (n.locales[newLang] = {}))
            setLang('')
          }}
        >
          <Plus size={13} /> Language
        </button>
      </div>
    </>
  )
}
export interface AuthoringProps {
  project: Project
  target: string
  onChange: (p: Project) => void
  onClose: () => void
}
export function Authoring(props: AuthoringProps) {
  return <AuthoringDialog key={props.target} {...props} />
}
function AuthoringDialog({ project, target, onChange, onClose }: AuthoringProps) {
  const [p, set] = useState(() => structuredClone(project))
  const [newId] = useState(() => uid('asset'))
  const [vertex, setVertex] = useState(false),
    [error, fail] = useState('')
  const id = target.startsWith('new-') ? newId : target
  const a = p.assets.find((a) => a.id === id)
  const edit: Edit = (fn) =>
    set((old) => {
      const n = structuredClone(old)
      fn(n)
      return n
    })
  useEffect(() => {
    if (!target.startsWith('new-')) return
    const type = target.slice(4)
    const created: Asset =
      type === 'material'
        ? makeMaterial('New material', '#78aca0', id)
        : {
            id,
            type: type === 'shader' ? 'shader' : 'script',
            name: type === 'shader' ? 'New shader.glsl' : 'New script.ts',
            data: type === 'shader' ? shaders.Unlit.fragment : defaultScript,
            properties: type === 'shader' ? { vertex: shaders.Unlit.vertex } : {},
          }
    edit((n) => {
      if (!n.assets.some((i) => i.id === id)) n.assets.push(created)
    })
  }, [target, id])
  const root = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    root.current?.focus()
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !document.querySelector('.suggest-widget.visible')) {
        e.preventDefault()
        onClose()
      }
      if (e.key === 'Tab') {
        const all = root.current?.querySelectorAll<HTMLElement>(
          'button:not([disabled]),input:not([hidden]),select,textarea,[tabindex="0"]',
        )
        if (!all?.length) return
        const first = all[0],
          last = all[all.length - 1]
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault()
          last.focus()
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault()
          first.focus()
        }
      }
    }
    const el = root.current
    el?.addEventListener('keydown', key)
    return () => {
      el?.removeEventListener('keydown', key)
      previous?.focus()
    }
  }, [onClose])
  const changeA = (fn: (a: Asset) => void) =>
    edit((n) => {
      const asset = n.assets.find((a) => a.id === id)
      if (asset) fn(asset)
    })
  const name =
    target === 'settings'
      ? 'Project settings'
      : target === 'ui'
        ? 'Game interface'
        : target === 'locales'
          ? 'Localization'
          : a?.type === 'material'
            ? 'Material editor'
            : a?.type === 'shader'
              ? 'Shader editor'
              : a?.type === 'script'
                ? 'Script editor'
                : 'Asset properties'
  const Icon =
    target === 'settings'
      ? SlidersHorizontal
      : target === 'ui'
        ? Monitor
        : target === 'locales'
          ? Languages
          : a?.type === 'material'
            ? CircleDot
            : ['shader', 'script'].includes(a?.type || '')
              ? Code2
              : File
  const save = () => {
    try {
      if (a?.type === 'shader') checkShader(a.properties.vertex || shaders.Unlit.vertex, a.data)
      if (!p.name.trim() || (a && !a.name.trim())) throw Error('Enter a name before saving.')
      onChange(p)
      onClose()
    } catch (err) {
      fail(String(err))
    }
  }
  return (
    <div
      className="mf-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="mf-dialog" role="dialog" aria-modal="true" aria-label={name} tabIndex={-1} ref={root}>
        <header>
          <Icon size={17} />
          <h3>{name}</h3>
          <button title="Close" aria-label="Close dialog" onClick={onClose}>
            <X size={17} />
          </button>
        </header>
        <div className="mf-dialog-body">
          {target === 'settings' && <Settings p={p} edit={edit} />}{' '}
          {target === 'ui' && <InterfaceForm p={p} edit={edit} />}{' '}
          {target === 'locales' && <LocalesForm p={p} edit={edit} fail={fail} />}
          {a && (
            <>
              <Field label="Asset name">
                <input value={a.name} onChange={(e) => changeA((a) => (a.name = e.target.value))} />
              </Field>
              {a.type === 'material' && (
                <MaterialForm p={p} a={a} patch={(k, v) => changeA((a) => (a.properties[k] = v))} />
              )}
              {a.type === 'shader' && (
                <div className="mf-row">
                  <select
                    aria-label="Shader stage"
                    value={vertex ? 'vertex' : 'fragment'}
                    onChange={(e) => setVertex(e.target.value === 'vertex')}
                  >
                    <option value="fragment">Fragment</option>
                    <option value="vertex">Vertex</option>
                  </select>
                  <select
                    value=""
                    aria-label="Replace with shader template"
                    onChange={(e) => {
                      const s = shaders[e.target.value]
                      changeA((a) => {
                        a.data = s.fragment
                        a.properties.vertex = s.vertex
                      })
                    }}
                  >
                    <option value="">Apply template…</option>
                    {Object.keys(shaders).map((k) => (
                      <option key={k}>{k}</option>
                    ))}
                  </select>
                </div>
              )}
              {(a.type === 'script' || a.type === 'shader') && (
                <Suspense fallback={<p>Loading code editor…</p>}>
                  <CodeEditor
                    language={a.type === 'script' ? 'typescript' : 'glsl'}
                    value={vertex ? a.properties.vertex || shaders.Unlit.vertex : a.data}
                    onChange={(s) =>
                      changeA((a) => {
                        if (vertex) a.properties.vertex = s
                        else a.data = s
                      })
                    }
                  />
                </Suspense>
              )}
              {a.type === 'texture' && <img className="mf-image" alt={a.name} src={a.data} />}
              {a.type === 'audio' && <audio controls src={a.data} />}
              {['json', 'prefab'].includes(a.type) && (
                <pre className="mf-readonly">{JSON.stringify(JSON.parse(a.data || '{}'), null, 2)}</pre>
              )}
              {a.type === 'model' && (
                <p className="mf-help">
                  Use a Mesh Renderer with imported geometry to place this model in the scene.
                </p>
              )}
            </>
          )}
          {error && (
            <div className="mf-error" role="alert">
              <AlertTriangle size={15} />
              <pre>{error}</pre>
            </div>
          )}
        </div>
        <footer>
          <button onClick={onClose}>Cancel</button>
          <button className="mf-primary" onClick={save}>
            <Check size={14} /> Save changes
          </button>
        </footer>
      </div>
    </div>
  )
}
export default Authoring
