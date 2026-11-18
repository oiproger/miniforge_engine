import React, { useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import {
  Anvil,
  ChevronDown,
  ChevronRight,
  Box,
  Boxes,
  FolderOpen,
  Save,
  Undo2,
  Redo2,
  Play,
  Pause,
  Square,
  Rocket,
  Settings2,
  Check,
  Circle,
  Layers3,
  Gamepad2,
  MousePointer2,
  Move,
  RotateCw,
  Scaling,
  Grid2X2,
  Magnet,
  Focus,
  Maximize,
  Minimize,
  Eye,
  X,
  PackageOpen,
  Terminal,
  Code2,
  Hammer,
  Activity,
  Plus,
  Globe,
  Monitor,
  FilePlus2,
  Upload,
  Camera,
  Sun,
  CircleDot,
  Hexagon,
  Diamond,
  Hand,
  Mouse,
  Keyboard,
  Copy,
  Trash2,
  PackagePlus,
  PanelTop,
  Music2,
  Triangle,
  Search,
  HardDrive,
  Workflow,
  Aperture,
} from 'lucide-react'
import {
  makeEntity,
  makeScene,
  makePrefab,
  instantiatePrefab,
  duplicateEntity,
  removeEntity,
  getScene,
  uid,
  type Project,
  type Asset,
  type Entity,
} from '../../../packages/project-schema/src'
import { createTemplate, freshTemplate } from '../../../templates'
import { SceneViewport } from '../../../packages/editor-tools/src'
import { buildGame, previewGame, exportProject, importProject } from '../../../packages/exporter/src'
import { Inspector } from './Inspector'
import Authoring from './Authoring'
import Hierarchy from './Hierarchy'
import Assets from './Assets'
import PlatformPanel from './PlatformPanel'
import { readAssets } from './importAssets'
import { download, persist, restore } from './io'
import './style.css'

type Icon = typeof Box
type MenuItem = [string, () => void, Icon?, string?]
type Tool = 'select' | 'translate' | 'rotate' | 'scale'
type Profile = 'web' | 'yandex' | 'poki' | 'windows' | 'linux'
const profiles: Record<Profile, string> = {
  web: 'Web Standalone',
  yandex: 'Yandex Games',
  poki: 'Poki',
  windows: 'Windows · Tauri build project',
  linux: 'Linux · Tauri build project',
}
const tools: [Tool, Icon, string][] = [
  ['select', MousePointer2, 'Select'],
  ['translate', Move, 'Move'],
  ['rotate', RotateCw, 'Rotate'],
  ['scale', Scaling, 'Scale'],
]
const docks: [string, Icon][] = [
  ['Assets', PackageOpen],
  ['Console', Terminal],
  ['Scripts', Code2],
  ['Build', Hammer],
  ['Performance', Activity],
]
const geometries = [
  'Box',
  'Sphere',
  'Plane',
  'Cylinder',
  'Capsule',
  'Cone',
  'Empty',
  'Perspective Camera',
  'Orthographic Camera',
  'Directional Light',
  'Ambient Light',
  'Point Light',
  'Spot Light',
  'Audio Source',
  'Trigger',
]
function bytes(n: number) {
  return n > 1e6 ? (n / 1e6).toFixed(2) + ' MB' : (n / 1024).toFixed(1) + ' KB'
}
function App() {
  const [p, setP] = useState<Project>(() => createTemplate('coin-rush')),
    [selection, sel] = useState<string[]>(['player']),
    [ready, setReady] = useState(false),
    [saved, setSaved] = useState('Loading')
  const [history, setHistory] = useState<Project[]>([]),
    [future, setFuture] = useState<Project[]>([])
  const [tool, setTool] = useState<Tool>('translate'),
    [grid, setGrid] = useState(true),
    [snap, setSnap] = useState(false),
    [ortho, setOrtho] = useState(true),
    [helpers, setHelpers] = useState(true),
    [focus, setFocus] = useState(0)
  const [dock, setDock] = useState('Assets'),
    [tab, setTab] = useState<'scene' | 'game'>('scene'),
    [preview, setPreview] = useState<Project | null>(null),
    [full, setFull] = useState(false)
  const [target, edit] = useState(''),
    [dialog, modal] = useState(''),
    [template, setTemplate] = useState('empty'),
    [newName, setNewName] = useState(''),
    [profile, setProfile] = useState<Profile>('web'),
    [busy, setBusy] = useState(false)
  const [logs, setLogs] = useState<string[]>([]),
    [notice, say] = useState(''),
    [report, setReport] = useState<Record<string, any> | null>(null),
    [stats, setStats] = useState<Record<string, number>>({})
  const [menu, menuAt] = useState<{ items: MenuItem[]; x: number; y: number } | null>(null),
    [sidebar, sizeSidebar] = useState(() => Number(localStorage.getItem('forge.left')) || 214),
    [right, sizeRight] = useState(() => Number(localStorage.getItem('forge.right')) || 268),
    [bottom, sizeBottom] = useState(() => Number(localStorage.getItem('forge.dock')) || 220)
  const fileInput = useRef<HTMLInputElement>(null),
    assetInput = useRef<HTMLInputElement>(null),
    frame = useRef<HTMLIFrameElement>(null),
    scene = getScene(p),
    selected = selection.at(-1) || null
  const live = useRef(p)
  live.current = p
  const note = (s: string) => {
    say(s)
    setLogs((l) => [...l.slice(-150), s])
  }
  function change(next: Project) {
    if (next === p) return
    const before = live.current
    live.current = next
    setHistory((h) => [...h.slice(-30), before])
    setFuture([])
    setP(next)
  }
  function patch(fn: (p: Project) => void) {
    const n = structuredClone(p)
    fn(n)
    change(n)
  }
  function select(id: string | null, add = false) {
    sel((prev) =>
      id ? (add ? (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]) : [id]) : [],
    )
  }
  function replace(next: Project) {
    setPreview(null)
    setTab('scene')
    setP(next)
    setHistory([])
    setFuture([])
    select(getScene(next).entities.find((e) => e.id === 'player')?.id ?? null)
    modal('')
  }
  function undo() {
    if (history.length) {
      setP(history.at(-1)!)
      setHistory(history.slice(0, -1))
      setFuture([p, ...future])
    }
  }
  function redo() {
    if (future.length) {
      setP(future[0])
      setFuture(future.slice(1))
      setHistory([...history, p])
    }
  }
  useEffect(() => {
    restore()
      .then((stored) => {
        if (stored) replace(stored)
      })
      .catch((e) => note(String(e)))
      .finally(() => setReady(true))
  }, [])
  useEffect(() => {
    if (!ready) return
    let current = true
    setSaved('Saving')
    const id = setTimeout(
      () =>
        persist(p)
          .then(() => {
            if (current) setSaved('Saved locally')
          })
          .catch((e) => {
            if (current) {
              setSaved('Save failed')
              note(String(e))
            }
          }),
      220,
    )
    return () => {
      current = false
      clearTimeout(id)
    }
  }, [p, ready])
  useEffect(() => {
    if (notice) {
      const id = setTimeout(() => say(''), 4200)
      return () => clearTimeout(id)
    }
  }, [notice])
  useEffect(() => {
    if (!preview || !frame.current) return
    let dead = false,
      cleanup: (() => void) | undefined
    const el = frame.current
    previewGame(preview, el)
      .then((fn) => {
        if (dead) fn()
        else cleanup = fn
      })
      .catch((e) => {
        if (!dead) {
          setPreview(null)
          setTab('scene')
          note(String(e))
        }
      })
    function receive(e: MessageEvent) {
      if (e.source !== el.contentWindow) return
      const d = e.data
      if (d?.stats) setStats(d.stats)
      if (d?.error) note(String(d.error))
    }
    window.addEventListener('message', receive)
    return () => {
      dead = true
      cleanup?.()
      window.removeEventListener('message', receive)
    }
  }, [preview])
  const play = () => {
    frame.current?.contentWindow?.postMessage({ type: 'miniforge:resume' }, '*')
    setTab('game')
    setPreview((v) => v ?? structuredClone(p))
  }
  const stop = () => {
    setPreview(null)
    setTab('scene')
  }
  async function save() {
    try {
      await persist(p)
      if (!(await download(exportProject(p), p.name + '.miniforge'))) return
      note('Project saved')
    } catch (e) {
      note(String(e))
    }
  }
  async function open(file?: File) {
    if (!file) return
    try {
      replace(await importProject(file))
      note('Project opened')
    } catch (e) {
      note(String(e))
    }
  }
  async function importAssets(files: File[]) {
    try {
      const loaded = await readAssets(files)
      if (live.current.id !== p.id) {
        note('Import cancelled because the project changed')
        return
      }
      const next = structuredClone(live.current)
      next.assets.push(...loaded)
      change(next)
      note('Imported ' + loaded.length + ' asset(s)')
    } catch (e) {
      note(String(e))
    }
  }
  function newEntity(kind: string, parent: string | null = null) {
    patch((n) => {
      const e = makeEntity(kind, geometries.slice(0, 6).includes(kind) ? kind.toLowerCase() : undefined)
      e.parent = parent
      if (kind.endsWith('Camera'))
        e.components.push({ type: 'camera', projection: kind.split(' ')[0].toLowerCase() })
      if (kind.endsWith('Light'))
        e.components.push({
          type: 'light',
          kind: kind.split(' ')[0].toLowerCase(),
          color: '#fff7de',
          intensity: 2,
        })
      if (kind === 'Audio Source') e.components.push({ type: 'audio', asset: '', volume: 1 })
      if (kind === 'Trigger') e.components.push({ type: 'collider', shape: 'box', trigger: true })
      getScene(n).entities.push(e)
      select(e.id)
    })
    modal('')
  }
  function remove(ids = selection) {
    patch((n) => ids.forEach((id) => removeEntity(getScene(n), id)))
    select(null)
  }
  function duplicate(id = selected) {
    if (id) patch((n) => select(duplicateEntity(getScene(n), id).id))
  }
  function use(a: Asset) {
    if (a.type === 'prefab' || a.type === 'model') {
      patch((n) => {
        const s = getScene(n)
        if (a.type === 'prefab') select(instantiatePrefab(s, a).id)
        else {
          const e = makeEntity(a.name)
          e.components.push({ type: 'mesh', shape: 'model', asset: a.id })
          s.entities.push(e)
          select(e.id)
        }
      })
      return
    }
    edit(a.id)
  }
  function context(entity: Entity, x: number, y: number) {
    select(entity.id)
    menuAt({
      x,
      y,
      items: [
        ['Add child', () => modal('child'), Plus],
        ['Duplicate', () => duplicate(entity.id), Copy],
        [
          'Save as prefab',
          () => patch((n) => n.assets.unshift(makePrefab(getScene(n), entity.id))),
          PackagePlus,
        ],
        ['Delete', () => remove([entity.id]), Trash2],
      ],
    })
  }
  function manage(a: Asset, x: number, y: number) {
    menuAt({
      x,
      y,
      items: [
        ['Open asset', () => use(a), FolderOpen],
        [
          'Rename',
          () => {
            const name = prompt('Asset name', a.name)?.trim()
            if (name)
              patch((n) => {
                n.assets.find((o) => o.id === a.id)!.name = name
              })
          },
          FilePlus2,
        ],
        [
          'Delete',
          () => {
            const other = { ...p, assets: p.assets.filter((o) => o.id !== a.id) }
            if (JSON.stringify(other).includes(a.id)) {
              note('This asset is in use')
              return
            }
            patch((n) => (n.assets = n.assets.filter((o) => o.id !== a.id)))
          },
          Trash2,
        ],
      ],
    })
  }
  async function build() {
    setBusy(true)
    try {
      const result =
        profile === 'windows' || profile === 'linux'
          ? await (await import('./nativeExport')).desktopSources(p, profile)
          : await buildGame(p, profile)
      const name = p.name + '-' + profile + '.zip'
      if (!(await download(result.blob, name))) return
      setReport({ ...result.report, archive: result.blob.size, name })
      note('Build complete · ' + name)
      setDock('Build')
      modal('')
    } catch (e) {
      note(String(e))
      setDock('Console')
    } finally {
      setBusy(false)
    }
  }
  function menuFrom(el: HTMLElement, items: MenuItem[]) {
    const r = el.getBoundingClientRect()
    menuAt({ x: r.left, y: r.bottom + 5, items })
  }
  const fileMenu: MenuItem[] = [
    [
      'New project',
      () => {
        setNewName('')
        modal('new')
      },
      FilePlus2,
    ],
    ['Open project', () => fileInput.current?.click(), FolderOpen],
    ['Save project', save, Save, 'Ctrl S'],
    ['Import assets', () => assetInput.current?.click(), Upload],
    ['New material', () => edit('new-material'), CircleDot],
    ['New shader', () => edit('new-shader'), Code2],
  ]
  useEffect(() => {
    function key(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        menuAt(null)
        modal('')
        edit('')
        setFull(false)
        return
      }
      if (
        (e.target as HTMLElement).closest('input,select,textarea,[contenteditable=true]') ||
        target ||
        dialog
      )
        return
      const mod = e.ctrlKey || e.metaKey,
        k = e.key.toLowerCase()
      if (mod && ['s', 'z', 'd', 'y'].includes(k)) e.preventDefault()
      if (mod && k === 's') void save()
      else if (mod && k === 'z') e.shiftKey ? redo() : undo()
      else if (mod && k === 'y') redo()
      else if (mod && k === 'd') duplicate()
      else if (k === 'delete' && selected) remove()
      else if (k === 'f') setFocus((f) => f + 1)
      else if (['q', 'w', 'e', 'r'].includes(k)) setTool(tools['qwer'.indexOf(k)][0])
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  })
  function resize(e: React.PointerEvent, side: string) {
    const el = e.currentTarget
    el.setPointerCapture(e.pointerId)
    const start = side === 'dock' ? e.clientY : e.clientX,
      orig = side === 'dock' ? bottom : side === 'left' ? sidebar : right
    const move = (ev: Event) => {
      const pe = ev as PointerEvent,
        d = (side === 'dock' ? pe.clientY : pe.clientX) - start,
        v = Math.round(
          Math.max(
            side === 'dock' ? 135 : 165,
            Math.min(
              side === 'dock' ? window.innerHeight * 0.54 : window.innerWidth * 0.35,
              orig + (side === 'left' ? d : -d),
            ),
          ),
        )
      ;(side === 'dock' ? sizeBottom : side === 'left' ? sizeSidebar : sizeRight)(v)
      localStorage.setItem('forge.' + side, String(v))
    }
    const end = () => {
      el.removeEventListener('pointermove', move)
      el.removeEventListener('pointerup', end)
    }
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerup', end)
  }
  const iconBtn = (label: string, Icon: Icon, fn: () => void, active = false) => (
    <button
      key={label}
      title={label}
      aria-label={label}
      className={'icon ' + (active ? 'lit' : '')}
      onClick={fn}
    >
      <Icon />
    </button>
  )
  return (
    <div
      className={'studio ' + (full ? 'fullscreen' : '')}
      style={
        { '--left': sidebar + 'px', '--right': right + 'px', '--dock': bottom + 'px' } as React.CSSProperties
      }
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes('Files')) e.preventDefault()
      }}
      onDrop={(e) => {
        if (e.dataTransfer.files.length) {
          e.preventDefault()
          void importAssets([...e.dataTransfer.files])
        }
      }}
    >
      <header className="appbar">
        <div className="brand">
          <div className="brandmark">
            <Anvil size={23} strokeWidth={2.5} />
          </div>
          <b>Miniforge</b>
          <span>ENGINE</span>
        </div>
        <nav>
          {[
            ['File', fileMenu],
            [
              'Edit',
              [
                ['Undo', undo, Undo2],
                ['Redo', redo, Redo2],
                ['Duplicate selection', () => duplicate(), Copy],
              ],
            ],
            [
              'Project',
              [
                ['Project settings', () => edit('settings'), Settings2],
                ['UI editor', () => edit('ui'), PanelTop],
                ['Localization', () => edit('locales'), Globe],
                ['Platform settings', () => modal('platform'), Globe],
                ['Build profiles', () => modal('export'), Hammer],
              ],
            ],
          ].map(([label, items]) => (
            <button key={String(label)} onClick={(e) => menuFrom(e.currentTarget, items as MenuItem[])}>
              {String(label)}
            </button>
          ))}
        </nav>
        <div className="app-actions">
          <span className="local-status">
            <i />
            {saved}
          </span>
          <i className="separator" />
          {iconBtn('Save project', Save, save)}
          {iconBtn('Project settings', Settings2, () => edit('settings'))}
          <button className="export-btn" aria-label="Export" onClick={() => modal('export')}>
            <Upload size={14} />
            Export
            <ChevronDown size={13} />
          </button>
        </div>
      </header>
      <div className="workbar">
        <div className="project-breadcrumb">
          <span className="project-glyph">
            <Boxes size={16} />
          </span>
          <b>{p.name}</b>
          <ChevronRight size={14} />
          <button
            onClick={(e) =>
              menuFrom(e.currentTarget, [
                ...p.scenes.map(
                  (s) => [s.name, () => patch((n) => (n.activeScene = s.id)), Layers3] as MenuItem,
                ),
                [
                  'Add scene',
                  () => {
                    const name = prompt('Scene name', 'New Scene')?.trim()
                    if (name)
                      patch((n) => {
                        const s = makeScene(name)
                        n.scenes.push(s)
                        n.activeScene = s.id
                      })
                  },
                  Plus,
                ],
              ])
            }
          >
            {scene.name}
            <ChevronDown size={12} />
          </button>
        </div>
        <div className="playback">
          <button className={'play ' + (preview ? 'playing' : '')} aria-label="Play" onClick={play}>
            <Play size={12} fill="currentColor" />
            Play
          </button>
          <button
            className="stop"
            aria-label="Pause preview"
            disabled={!preview}
            onClick={() => frame.current?.contentWindow?.postMessage({ type: 'miniforge:pause' }, '*')}
          >
            <Pause size={12} />
          </button>
          <button className="stop" aria-label="Stop" disabled={!preview} onClick={stop}>
            <Square size={12} />
          </button>
        </div>
        <div className="work-end">
          <button className="icon" title="Undo" disabled={!history.length} onClick={undo}>
            <Undo2 />
          </button>
          <button className="icon" title="Redo" disabled={!future.length} onClick={redo}>
            <Redo2 />
          </button>
          <i className="separator" />
          <span>
            <Globe size={13} /> WebGL 2
          </span>
        </div>
      </div>
      <main className="layout">
        <Hierarchy
          project={p}
          selection={selection}
          select={select}
          change={change}
          add={() => modal('add')}
          context={context}
        />
        <div className="split left" onPointerDown={(e) => resize(e, 'left')} />
        <section className="scene-panel">
          <div className="scene-tabs">
            <button className={tab === 'scene' ? 'active' : ''} onClick={() => setTab('scene')}>
              <Box />
              Scene
            </button>
            <button className={tab === 'game' ? 'active' : ''} onClick={play}>
              <Gamepad2 />
              Game
            </button>
            <div className="scene-extras">
              {iconBtn('Frame selected object', Focus, () => setFocus((f) => f + 1))}
              {iconBtn('Maximize viewport', full ? Minimize : Maximize, () => setFull(!full))}
            </div>
          </div>
          <div
            className="viewport"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              const a = p.assets.find((a) => a.id === e.dataTransfer.getData('miniforge/asset'))
              if (a) use(a)
            }}
          >
            <div className="world" style={{ visibility: tab === 'game' ? 'hidden' : 'visible' }}>
              <SceneViewport
                visible={tab === 'scene'}
                project={p}
                sceneId={p.activeScene}
                selectedId={selected}
                tool={tool}
                grid={grid}
                snap={snap}
                orthographic={ortho}
                helpers={helpers}
                focusToken={focus}
                onSelect={select}
                onTransform={(id, tr) =>
                  patch((n) => {
                    getScene(n).entities.find((e) => e.id === id)!.transform = tr
                  })
                }
              />
            </div>
            {preview && (
              <iframe
                title="Game preview"
                ref={frame}
                className={'preview ' + (tab === 'scene' ? 'hidden' : '')}
              />
            )}
            {tab === 'scene' && (
              <>
                <div className="canvas-controls">
                  <div className="toolstrip">
                    {tools.map(([key, I, label]) => iconBtn(label, I, () => setTool(key), tool === key))}
                  </div>
                  <div className="toolstrip">
                    {iconBtn('Grid', Grid2X2, () => setGrid(!grid), grid)}
                    {iconBtn('Snap to grid', Magnet, () => setSnap(!snap), snap)}
                  </div>
                </div>
                <button
                  className="view-mode"
                  onClick={(e) =>
                    menuFrom(e.currentTarget, [
                      ['Orthographic', () => setOrtho(true), Box],
                      ['Perspective', () => setOrtho(false), Aperture],
                      ['Toggle helpers', () => setHelpers(!helpers), Eye],
                    ])
                  }
                >
                  <Box size={13} />
                  {ortho ? 'Orthographic' : 'Perspective'}
                  <ChevronDown size={12} />
                </button>
                <div className="view-caption">
                  <Mouse size={12} /> Orbit <i /> Scroll to zoom
                </div>
              </>
            )}
          </div>
        </section>
        <div className="split right" onPointerDown={(e) => resize(e, 'right')} />
        <aside className="inspect-wrap">
          <Inspector project={p} entityId={selected} onChange={change} onEditAsset={edit} />
        </aside>
        <section className="dock">
          <div className="split dock-split" onPointerDown={(e) => resize(e, 'dock')} />
          <div className="dock-tabs">
            {docks.map(([name, I]) => (
              <button key={name} className={dock === name ? 'active' : ''} onClick={() => setDock(name)}>
                <I />
                {name}
              </button>
            ))}
            <span className="dock-trail">
              <HardDrive size={12} />
              Project library
            </span>
          </div>
          {dock === 'Assets' ? (
            <Assets
              project={p}
              onUse={use}
              importFiles={() => assetInput.current?.click()}
              editAsset={edit}
              manage={manage}
            />
          ) : (
            <div className="dock-body">
              {dock === 'Console' ? (
                <>
                  <strong>Session console</strong>
                  {logs.length ? logs.map((l, i) => <p key={i}>{l}</p>) : <p>No messages in this session.</p>}
                </>
              ) : dock === 'Scripts' ? (
                <>
                  <button className="minor-btn" onClick={() => edit('new-script')}>
                    <Plus size={13} />
                    New script
                  </button>
                  {p.assets
                    .filter((a) => a.type === 'script')
                    .map((a) => (
                      <button className="dock-link" key={a.id} onClick={() => edit(a.id)}>
                        <Code2 size={15} />
                        {a.name}
                      </button>
                    ))}
                </>
              ) : dock === 'Build' ? (
                <>
                  <button className="minor-btn" onClick={() => modal('export')}>
                    <Hammer size={13} />
                    Build project
                  </button>
                  {report ? (
                    <>
                      <h4>
                        {report.name} · {bytes(report.archive)}
                      </h4>
                      <pre>{JSON.stringify(report, null, 2)}</pre>
                    </>
                  ) : (
                    <p>Build a profile to see its size report.</p>
                  )}
                </>
              ) : (
                <>
                  <strong>Preview performance</strong>
                  {Object.keys(stats).length ? (
                    <pre>{JSON.stringify(stats, null, 2)}</pre>
                  ) : (
                    <p>Run the game to measure rendering performance.</p>
                  )}
                </>
              )}
            </div>
          )}
        </section>
      </main>
      <footer className="status">
        <i className="ready-dot" />
        {busy ? 'Building' : preview ? 'Preview running' : 'Editor ready'}
        <span className="status-right">
          <Workflow size={12} />
          {scene.name}
          <i />
          Miniforge Engine <b>v0.1.0</b>
        </span>
      </footer>
      <input
        ref={fileInput}
        type="file"
        accept=".miniforge,.json,.zip"
        hidden
        onChange={(e) => {
          void open(e.target.files?.[0])
          e.target.value = ''
        }}
      />
      <input
        ref={assetInput}
        type="file"
        multiple
        hidden
        onChange={(e) => {
          void importAssets([...(e.target.files || [])])
          e.target.value = ''
        }}
      />
      {menu && (
        <div className="dismiss" onPointerDown={() => menuAt(null)}>
          <div
            className="popup"
            style={{
              left: Math.min(menu.x, innerWidth - 205),
              top: Math.min(menu.y, innerHeight - menu.items.length * 34 - 12),
            }}
            onPointerDown={(e) => e.stopPropagation()}
          >
            {menu.items.map(([label, fn, I, key]) => (
              <button
                key={label}
                onClick={() => {
                  menuAt(null)
                  fn()
                }}
              >
                {I && <I size={14} />} {label}
                <small>{key}</small>
              </button>
            ))}
          </div>
        </div>
      )}
      {target && (
        <Authoring key={target} project={p} target={target} onChange={change} onClose={() => edit('')} />
      )}
      {dialog && (
        <div
          className="backdrop"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !busy) modal('')
          }}
        >
          <section className="dialog">
            <div className="dialog-head">
              <span className="dialog-icon">
                {dialog === 'export' ? <Rocket /> : dialog === 'new' ? <FilePlus2 /> : <Box />}
              </span>
              <h2>
                {dialog === 'export'
                  ? 'Build project'
                  : dialog === 'platform'
                    ? 'Platform settings'
                    : dialog === 'new'
                      ? 'New project'
                      : dialog === 'child'
                        ? 'Add child'
                        : 'Add entity'}
              </h2>
              {iconBtn('Close', X, () => modal(''))}
            </div>
            {dialog === 'platform' ? (
              <PlatformPanel id={p.id} />
            ) : dialog === 'new' ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault()
                  const n = freshTemplate(template)
                  if (newName.trim()) n.name = newName.trim()
                  replace(n)
                }}
              >
                <label>
                  Project name
                  <input
                    autoFocus
                    placeholder="Untitled project"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                  />
                </label>
                <label>
                  Template
                  <select value={template} onChange={(e) => setTemplate(e.target.value)}>
                    {[
                      ['empty', 'Empty 3D'],
                      ['coin-rush', 'Top Down Collectathon'],
                      ['first-person', 'First Person Prototype'],
                      ['clicker', 'Clicker'],
                      ['runner', 'Mobile Runner'],
                    ].map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </select>
                </label>
                <button className="primary">Create project</button>
              </form>
            ) : dialog === 'export' ? (
              <>
                <label>
                  Build profile
                  <select value={profile} onChange={(e) => setProfile(e.target.value as Profile)}>
                    {Object.entries(profiles).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="build-line">
                  <Globe size={16} />
                  <span>{p.name}</span>
                  <small>
                    {profile === 'windows' || profile === 'linux'
                      ? 'Source ZIP · compile on target OS'
                      : 'Playable web ZIP'}
                  </small>
                </div>
                <button className="primary" disabled={busy} onClick={build}>
                  <Hammer size={15} />
                  {busy ? 'Building…' : 'Build & download'}
                </button>
              </>
            ) : (
              <div className="entity-grid">
                {geometries.map((kind, i) => {
                  const I = [
                    Box,
                    CircleDot,
                    Layers3,
                    HardDrive,
                    Diamond,
                    Triangle,
                    Plus,
                    Camera,
                    Camera,
                    Sun,
                    Sun,
                    Sun,
                    Sun,
                    Music2,
                    Hexagon,
                  ][i]
                  return (
                    <button key={kind} onClick={() => newEntity(kind, dialog === 'child' ? selected : null)}>
                      <I size={16} />
                      {kind}
                    </button>
                  )
                })}
              </div>
            )}
          </section>
        </div>
      )}
      {notice && (
        <div className="toast" role="status">
          {notice}
          <button className="icon" onClick={() => say('')}>
            <X />
          </button>
        </div>
      )}
    </div>
  )
}
createRoot(document.getElementById('root')!).render(<App />)
