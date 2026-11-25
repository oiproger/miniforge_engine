import { ExportSettingsPanel } from './ExportSettings'
import { SceneProfiler } from './SceneProfiler'
import { ScatterBrushPanel, DEFAULT_SCATTER_BRUSH } from './ScatterBrush'
import { InputManager } from './InputManager'
import { MultiplayerStudio } from './MultiplayerStudio'
import { SteamStudio } from './SteamStudio'
import { ProjectHub } from './ProjectHub'
import { collectEditorPluginActions } from './editorPlugins'
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
  Wifi,
  Radio,
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
  GitBranch,
  Puzzle,
  Paintbrush,
  Clapperboard,
  MessageSquare,
  Volume2,
  Hammer,
  Activity,
  Trees,
  Plus,
  Globe,
  Monitor,
  FilePlus2,
  Upload,
  Camera,
  Sun,
  CircleDot,
  Flame,
  Compass,
  Stamp,
  Image,
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
  Waves,
  Sparkles,
} from 'lucide-react'
import {
  makeTerrain,
  makeEntity,
  makeNavZone,
  sampleTerrainLayerAt,
  type Terrain,
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
  type Vec3,
} from '../../../packages/project-schema/src'
import { createTemplate, freshTemplate } from '../../../templates'
import { SceneViewport, type TerrainBrushConfig, type ScatterBrushConfig } from '../../../packages/editor-tools/src'
import { buildGame, previewGame, exportProject, importProject } from '../../../packages/exporter/src'
import { projectIssues, type ProjectIssue } from '../../../packages/project-schema/src/references'
import { Inspector } from './Inspector'
import Authoring from './Authoring'
import ScriptWorkspace from './ScriptWorkspace'
import Hierarchy from './Hierarchy'
import Assets from './Assets'
import PlatformPanel from './PlatformPanel'
import { readAssets } from './importAssets'
import { download, persist, restore, saveProjectToDisk, openProjectFromDisk, getLinkedDiskPath, clearLinkedDiskPath, canSaveToDisk } from './io'
import './style.css'

type Icon = typeof Box
type MenuItem = [string, () => void, Icon?, string?]
type Tool = 'select' | 'translate' | 'rotate' | 'scale'
type Profile = 'web' | 'yandex' | 'poki' | 'windows' | 'macos' | 'linux'
const profiles: Record<Profile, string> = {
  web: 'Web Standalone',
  yandex: 'Yandex Games',
  poki: 'Poki',
  windows: 'Windows · Tauri build project (.exe)',
  macos: 'macOS · Tauri build project (.dmg / .app)',
  linux: 'Linux · Tauri build project (.deb)',
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
  'Terrain',
  'Water',
  'Volumetric Light',
  'Bake Zone',
  '3D Particle',
  '3D Billboard',
  '3D Decal',
  'NavGrid Zone',
]
function bytes(n: number) {
  return n > 1e6 ? (n / 1e6).toFixed(2) + ' MB' : (n / 1024).toFixed(1) + ' KB'
}
function App() {
  const [p, setP] = useState<Project>(() => createTemplate('coin-rush')),
    [selection, sel] = useState<string[]>(['player']),
    [ready, setReady] = useState(false),
    [hasSessionProject, setHasSessionProject] = useState(false),
    [showHub, setShowHub] = useState(false),
    [saved, setSaved] = useState('Loading')
  const [history, setHistory] = useState<Project[]>([]),
    [future, setFuture] = useState<Project[]>([])
  const [tool, setTool] = useState<Tool>('translate'),
    [grid, setGrid] = useState(true),
    [snap, setSnap] = useState(false),
    [ortho, setOrtho] = useState(false),
    [helpers, setHelpers] = useState(true),
    [focus, setFocus] = useState(0)
  const [terrainBrush, setTerrainBrush] = useState<TerrainBrushConfig>({
    enabled: false,
    tool: 'Raise',
    radius: 3,
    strength: 0.35,
    falloff: 1.2,
    hardness: 0.5,
    level: 0.5,
    activeLayer: 1,

  })
  const patchTerrainBrush = (patchData: Partial<TerrainBrushConfig>) =>
    setTerrainBrush((prev) => ({ ...prev, ...patchData }))
  const [dock, setDock] = useState('Assets'),
    [tab, setTab] = useState<'scene' | 'game' | 'script'>('scene'),
    [activeScript, setActiveScript] = useState<string>(''),
    [preview, setPreview] = useState<Project | null>(null),
    [full, setFull] = useState(false)
  const [showProfiler, setShowProfiler] = useState(false)
  const [showInputManager, setShowInputManager] = useState(false)
  const [showMultiplayer, setShowMultiplayer] = useState(false)
  const [showSteam, setShowSteam] = useState(false)
  const [scatterBrush, setScatterBrush] = useState<ScatterBrushConfig>(DEFAULT_SCATTER_BRUSH)
  const [focusUiId, setFocusUiId] = useState<string>()
  const [target, edit] = useState(''),
    [dialog, modal] = useState(''),
    [template, setTemplate] = useState('empty'),
    [newName, setNewName] = useState(''),
    [profile, setProfile] = useState<Profile>('web'),
    [localTemplates, setLocalTemplates] = useState<Partial<Record<'windows' | 'macos' | 'linux', { name: string; bytes: Uint8Array }>>>({}),
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
    setHasSessionProject(true)
    setShowHub(false)
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
        if (stored) {
          replace(stored)
          setHasSessionProject(true)
          setShowHub(false)
        } else {
          setHasSessionProject(false)
          setShowHub(true)
          setSaved('Not saved')
        }
      })
      .catch((e) => {
        note(String(e))
        setShowHub(true)
      })
      .finally(() => setReady(true))
  }, [])
  useEffect(() => {
    if (!ready || !hasSessionProject) return
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
      if (d?.log) setLogs((l) => [...l.slice(-150), String(d.log)])
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
  async function save(forcePick = false) {
    try {
      await persist(p)
      if (canSaveToDisk()) {
        const path = await saveProjectToDisk(p, forcePick)
        if (!path) return
        const name = path.split(/[\\/]/).pop() || path
        setSaved('Saved · ' + name)
        note('Saved to disk: ' + path)
        return
      }
      if (!(await download(exportProject(p), p.name + '.miniforge'))) return
      note('Project saved')
    } catch (e) {
      note(String(e))
    }
  }
  async function saveArchive() {
    try {
      await persist(p)
      if (!(await download(exportProject(p), p.name + '.miniforge'))) return
      note('Exported archive: ' + p.name + '.miniforge')
    } catch (e) {
      note(String(e))
    }
  }
  async function openDisk() {
    try {
      const res = await openProjectFromDisk()
      if (!res) return
      replace(res.project)
      const name = res.label.split(/[\\/]/).pop() || res.label
      setSaved('Opened · ' + name)
      note('Opened from disk: ' + res.label)
    } catch (e) {
      note(String(e))
    }
  }
  async function open(file?: File) {
    if (!file) return
    try {
      const project = await importProject(file)
      clearLinkedDiskPath()
      replace(project)
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
  function dropAsset(assetId: string, targetId?: string, worldPos?: Vec3) {
    const asset = p.assets.find((a) => a.id === assetId)
    if (!asset) return
    const pos: Vec3 = worldPos ?? [0, 0, 0]
    if (asset.type === 'particle') {
      patch((n) => {
        const e = makeEntity(asset.name)
        e.transform.position = [...pos]
        if (targetId && !worldPos) e.parent = targetId
        e.components.push({ type: 'particle', assetId: asset.id, preset: 'steam', playing: true })
        getScene(n).entities.push(e)
        select(e.id)
      })
      note('Placed particle ' + asset.name)
      return
    }
    if (asset.type === 'skybox') {
      patch((n) => {
        getScene(n).environment.skyEnabled = true
        getScene(n).environment.skyAsset = asset.id
      })
      note('Applied skybox ' + asset.name)
      return
    }
    if (asset.type === 'prefab') {
      patch((n) => {
        const created = instantiatePrefab(getScene(n), asset, targetId && !worldPos ? targetId : null)
        if (worldPos) created.transform.position = [...pos]
        select(created.id)
      })
      note('Spawned prefab ' + asset.name)
      return
    }
    if (asset.type === 'model') {
      patch((n) => {
        const e = makeEntity(asset.name.replace(/\.[^.]+$/, ''))
        e.transform.position = [...pos]
        if (targetId && !worldPos) e.parent = targetId
        e.components.push({ type: 'mesh', shape: 'model', asset: asset.id })
        getScene(n).entities.push(e)
        select(e.id)
      })
      note('Placed model ' + asset.name)
      return
    }
    if (asset.type === 'material') {
      patch((n) => {
        const scene = getScene(n)
        const target = targetId ? scene.entities.find((e) => e.id === targetId) : undefined
        const mesh = target?.components.find((c) => c.type === 'mesh')
        if (mesh) {
          mesh.material = asset.id
          select(target!.id)
        } else {
          const e = makeEntity(asset.name + ' Box', 'box')
          e.transform.position = [pos[0], pos[1] + 0.5, pos[2]]
          e.components[0].material = asset.id
          scene.entities.push(e)
          select(e.id)
        }
      })
      note('Applied material ' + asset.name)
      return
    }
    if (asset.type === 'texture') {
      patch((n) => {
        const scene = getScene(n)
        const target = targetId ? scene.entities.find((e) => e.id === targetId) : undefined
        const mesh = target?.components.find((c) => c.type === 'mesh')
        if (mesh) {
          let mat = n.assets.find((a) => a.id === mesh.material && a.type === 'material')
          if (!mat) {
            const matId = uid('mat')
            mat = { id: matId, name: asset.name + ' Mat', type: 'material', data: '', properties: { color: '#ffffff', roughness: 0.75, metalness: 0 } }
            n.assets.push(mat)
            mesh.material = matId
          }
          mat.properties.map = asset.id
          select(target!.id)
        } else {
          const e = makeEntity(asset.name)
          e.transform.position = [pos[0], pos[1] + 0.5, pos[2]]
          e.components.push({ type: 'sprite', texture: asset.id, color: '#ffffff', opacity: 1, width: 1.5, height: 1.5 })
          scene.entities.push(e)
          select(e.id)
        }
      })
      note('Applied texture ' + asset.name)
      return
    }
    if (asset.type === 'shader' && targetId) {
      patch((n) => {
        const target = getScene(n).entities.find((e) => e.id === targetId)
        const mesh = target?.components.find((c) => c.type === 'mesh')
        if (!mesh) return
        let mat = n.assets.find((a) => a.id === mesh.material && a.type === 'material')
        if (!mat) {
          const matId = uid('mat')
          mat = { id: matId, name: target!.name + ' Mat', type: 'material', data: '', properties: { color: '#ffffff', roughness: 0.7, metalness: 0 } }
          n.assets.push(mat)
          mesh.material = matId
        }
        mat.properties.shader = asset.id
        select(target!.id)
      })
      note('Applied shader ' + asset.name)
      return
    }
    if (asset.type === 'script') {
      patch((n) => {
        const scene = getScene(n)
        const target = targetId ? scene.entities.find((e) => e.id === targetId) : undefined
        if (target) {
          target.components.push({ type: 'script', asset: asset.id, params: {} })
          select(target.id)
        } else {
          const e = makeEntity(asset.name.replace(/\.[^.]+$/, ''))
          e.transform.position = [...pos]
          e.components.push({ type: 'script', asset: asset.id, params: {} })
          scene.entities.push(e)
          select(e.id)
        }
      })
      note('Attached script ' + asset.name)
      return
    }
    if (asset.type === 'audio') {
      patch((n) => {
        const scene = getScene(n)
        const target = targetId ? scene.entities.find((e) => e.id === targetId) : undefined
        if (target) {
          target.components.push({ type: 'audio', asset: asset.id, volume: 1 })
          select(target.id)
        } else {
          const e = makeEntity(asset.name)
          e.transform.position = [...pos]
          e.components.push({ type: 'audio', asset: asset.id, volume: 1 })
          scene.entities.push(e)
          select(e.id)
        }
      })
      note('Attached audio ' + asset.name)
      return
    }
    use(asset)
  }
  function newEntity(kind: string, parent: string | null = null) {
    patch((n) => {
      const e = makeEntity(kind, geometries.slice(0, 6).includes(kind) ? kind.toLowerCase() : undefined)
      e.parent = parent
      if (kind.endsWith('Camera'))
        e.components.push({ type: 'camera', projection: kind.split(' ')[0].toLowerCase() })
      if (kind.endsWith('Light') && kind !== 'Volumetric Light')
        e.components.push({
          type: 'light',
          kind: kind.split(' ')[0].toLowerCase(),
          color: '#fff7de',
          intensity: 2,
        })
      if (kind === 'Audio Source') e.components.push({ type: 'audio', asset: '', volume: 1 })
      if (kind === 'Terrain') e.components.push(makeTerrain())
      if (kind === 'Water')
        e.components.push({
          type: 'water',
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
        })
      if (kind === 'Volumetric Light') {
        e.transform.scale = [1, 4, 1]
        e.components.push({
          type: 'volumetric',
          shape: 'cone',
          color: '#ffe5b4',
          intensity: 0.42,
          softness: 2.2,
          dustSpeed: 0.35,
          topRadius: 0.2,
          bottomRadius: 1.6,
        })
      }
      if (kind === 'Trigger') e.components.push({ type: 'collider', shape: 'box', trigger: true })
      if (kind === 'Bake Zone')
        e.components.push({
          type: 'bakeZone',
          size: [8, 5, 8],
          bakeLight: true,
          lightBounce: 0.65,
          bakeReflections: true,
          reflectionMode: 'baked',
          reflectionResolution: 256,
          updateInterval: 4,
        })
      if (kind === '3D Particle')
        e.components.push({
          type: 'particle',
          assetId: n.assets.find((a) => a.type === 'particle')?.id || '',
          preset: 'steam',
          playing: true,
        })
      if (kind === '3D Billboard')
        e.components.push({
          type: 'billboard',
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
      if (kind === '3D Decal')
        e.components.push({
          type: 'decal',
          material: '',
          projection: 'surface', projectionDepth: 0.6,
          texture: '',
          color: '#ffffff',
          width: 1.2,
          height: 1.2,
          opacity: 0.9,
          normalOffset: 0.008,
          blendMode: 'alpha',
          pixelated: false,
        })
      if (kind === 'NavGrid Zone') e.components.push(makeNavZone())
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
    if (['script', 'shader', 'json', 'text'].includes(a.type)) {
      setActiveScript(a.id)
      setTab('script')
      return
    }
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
        ...(a.type === 'model'
          ? [
              ['Edit model', () => edit(a.id), FolderOpen] as MenuItem,
              ['Place in scene', () => use(a), Plus] as MenuItem,
            ]
          : a.type === 'prefab'
            ? [
                ['Edit prefab', () => edit(a.id), FolderOpen] as MenuItem,
                ['Spawn in scene', () => use(a), Plus] as MenuItem,
              ]
            : [['Open asset', () => use(a), FolderOpen] as MenuItem]),
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
  const buildIssues = dialog === 'export' ? projectIssues(p) : []
  function locateIssue(issue:ProjectIssue) {
    modal('')
    if (issue.uiId){setFocusUiId(issue.uiId);edit('ui');return}
    if (issue.assetId){edit(issue.assetId);return}
    if (issue.sceneId && p.activeScene!==issue.sceneId)patch(n=>n.activeScene=issue.sceneId!)
    select(issue.entityId??null)
    setTab('scene')
  }
  async function build() {
    setBusy(true)
    try {
      const result =
        profile === 'windows' || profile === 'linux' || profile === 'macos'
          ? await (await import('./nativeExport')).desktopSources(p, profile, localTemplates)
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
    ['Open from disk (.json)', () => void openDisk(), FolderOpen],
    ['Open archive (.miniforge)', () => fileInput.current?.click(), FolderOpen],
    ['Save project', () => void save(false), Save, 'Ctrl S'],
    ['Save as…', () => void save(true), Save, 'Ctrl Shift S'],
    ['Export archive (.miniforge)', () => void saveArchive(), Upload],
  ]
  const assetsMenu: MenuItem[] = [
    ['Import assets…', () => assetInput.current?.click(), Upload],
    ['New script', () => edit('new-script'), Code2],
    ['New Event Graph', () => edit('new-graph'), GitBranch],
    ['New prefab', () => edit('new-prefab'), Box],
    ['New material', () => edit('new-material'), CircleDot],
    ['New shader', () => edit('new-shader'), Code2],
    ['New procedural texture', () => edit('new-texture'), Image],
    ['New 3D particle', () => edit('new-particle'), Flame],
    ['New HTML widget', () => edit('new-html'), PanelTop],
    ['New Low-Poly Mesh (Builder)', () => edit('new-mesh'), Box],
    ['New 2D Paint Texture', () => edit('new-paint'), Paintbrush],
    ['New Sound / Music (Synth)', () => edit('new-sound'), Volume2],
    ['New Dialogue & Quest Graph', () => edit('new-dialogue'), MessageSquare],
    ['New Keyframe Sequence', () => edit('new-sequence'), Clapperboard],
    ['New Plugin / Examples', () => edit('new-plugin'), Puzzle],
  ]
  const pluginActions = collectEditorPluginActions(p, patch, note)
  const pluginsMenu: MenuItem[] = [
    ['Plugin Manager (Installed & Available)…', () => edit('plugins'), Puzzle],
    ['New Custom Plugin…', () => edit('new-plugin'), Plus],
    ...pluginActions.map((act) => [act.label, act.run, Puzzle] as MenuItem),
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
      if (mod && k === 's') void save(e.shiftKey)
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
            ['Assets', assetsMenu],
            ['Plugins', pluginsMenu],
            [
              'Project',
              [
                ['Project settings', () => edit('settings'), Settings2],
                ['UI editor', () => edit('ui'), PanelTop],
                ['Localization', () => edit('locales'), Globe],
                ['Export settings', () => modal('exportSettings'), Settings2],
                ['Platform settings', () => modal('platform'), Globe],
                ['Build profiles', () => modal('export'), Hammer],
                ['Input, Gamepad & Touch', () => setShowInputManager(true), Gamepad2],
                ['Multiplayer & Net Debugger', () => setShowMultiplayer(true), Wifi],
                ['Steamworks & Debug Panel', () => setShowSteam(true), Radio],
                ['Prop / Foliage Scatter Brush', () => setScatterBrush((b) => ({ ...b, enabled: !b.enabled })), Trees],
                ['Scene Profiler', () => setShowProfiler((v) => !v), Activity],
              ],
            ],
          ].map(([label, items]) => (
            <button key={String(label)} onClick={(e) => menuFrom(e.currentTarget, items as MenuItem[])}>
              {String(label)}
            </button>
          ))}
        </nav>
        <i className="separator" />
        <div className="project-breadcrumb">
          <button
            type="button"
            title="Return to Project Hub (Create / Open / Examples)"
            onClick={() => { setPreview(null); setShowHub(true) }}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
              padding: '3px 8px',
              marginRight: 6,
              borderRadius: 5,
              border: '1px solid rgba(255,255,255,0.14)',
              background: 'rgba(255,255,255,0.05)',
              color: '#cbd5e1',
              fontSize: 11.5,
              cursor: 'pointer',
            }}
          >
            <FolderOpen size={12} /> Projects
          </button>
          <span className="project-glyph">
            <Boxes size={14} />
          </span>
          <b>{p.name}</b>
          <ChevronRight size={13} />
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
        <div className="playback inline-playback">
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
        <div className="app-actions">
          <button className="icon" title="Undo (Ctrl+Z)" disabled={!history.length} onClick={undo}>
            <Undo2 />
          </button>
          <button className="icon" title="Redo (Ctrl+Y)" disabled={!future.length} onClick={redo}>
            <Redo2 />
          </button>
          <i className="separator" />
          <span className="webgl-badge">
            <Globe size={12} /> WebGL 2
          </span>
          <span className="local-status" title={getLinkedDiskPath() || saved}>
            <i />
            {saved}
          </span>
          <i className="separator" />
          {iconBtn('Save project (Ctrl+S)', Save, () => void save(false))}
          {iconBtn('Project settings', Settings2, () => edit('settings'))}
          <button className="export-btn" aria-label="Export" onClick={() => modal('export')}>
            <Upload size={14} />
            Export
            <ChevronDown size={13} />
          </button>
        </div>
      </header>
            <main className="layout">
        <Hierarchy
          project={p}
          selection={selection}
          select={select}
          change={change}
          add={() => modal('add')}
          context={context}
          onDropAsset={(assetId, targetId) => dropAsset(assetId, targetId)}
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
            <button className={tab === 'script' ? 'active' : ''} onClick={() => setTab('script')}>
              <Code2 />
              Script
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
            <div className="world" style={{ visibility: tab === 'scene' ? 'visible' : 'hidden' }}>
              <SceneViewport
                visible={tab === 'scene'}
                project={p}
                sceneId={p.activeScene}
                selectedId={selected}
                tool={tool}
                grid={grid}
                snap={snap}
                orthographic={ortho}
                onDropAsset={dropAsset}
                helpers={helpers}
                focusToken={focus}
              terrainBrush={terrainBrush}
              onTerrainBrushChange={patchTerrainBrush}
              onTerrainEdit={(entityId, patchData, commit) => {
                const next = structuredClone(live.current)
                const ent = getScene(next).entities.find((e) => e.id === entityId)
                const tc = ent?.components.find((c) => c.type === 'terrain')
                if (!tc) return
                Object.assign(tc, patchData)
                if (commit) {
                  change(next)
                } else {
                  live.current = next
                  setP(next)
                }
              }}
              scatterBrush={scatterBrush}
              onScatter={(worldPos, radiusMeters, erase) => {
                const next = structuredClone(live.current)
                const sc = getScene(next)
                if (erase) {
                  const toDrop = sc.entities.filter(
                    (e) =>
                      Array.isArray(e.properties?.tags) &&
                      e.properties.tags.includes('scatter') &&
                      Math.hypot(e.transform.position[0] - worldPos[0], e.transform.position[2] - worldPos[2]) <= radiusMeters,
                  )
                  for (const dEnt of toDrop) removeEntity(sc, dEnt.id)
                  if (toDrop.length) change(next)
                  return
                }
                const pickedIds = scatterBrush.assets.length
                  ? scatterBrush.assets
                  : next.assets.filter((a) => a.type === 'prefab' || a.type === 'model').slice(0, 1).map((a) => a.id)
                const terrains = sc.entities
                  .map((e) => ({ ent: e, tc: e.components.find((c) => c.type === 'terrain' && c.enabled !== false) as Terrain | undefined }))
                  .filter((x): x is { ent: Entity; tc: Terrain } => Boolean(x.tc))
                const density = Math.max(1, Math.min(25, scatterBrush.density || 4))
                const spacing = Math.max(0.2, scatterBrush.spacing || 1.2)
                const sMin = scatterBrush.scaleMin || 0.75
                const sMax = Math.max(sMin, scatterBrush.scaleMax || 1.35)
                let spawned = 0
                for (let k = 0; k < density; k++) {
                  const ang = Math.random() * Math.PI * 2
                  const r = Math.sqrt(Math.random()) * radiusMeters
                  const wx = worldPos[0] + Math.cos(ang) * r
                  const wz = worldPos[2] + Math.sin(ang) * r
                  let wy = worldPos[1]
                  for (const t of terrains) {
                    const sample = sampleTerrainLayerAt(t.tc, wx, wz, t.ent.transform)
                    if (sample.inside) {
                      wy = sample.height
                      break
                    }
                  }
                  const tooClose = sc.entities.some(
                    (e) =>
                      Array.isArray(e.properties?.tags) &&
                      e.properties.tags.includes('scatter') &&
                      Math.hypot(e.transform.position[0] - wx, e.transform.position[2] - wz) < spacing,
                  )
                  if (tooClose) continue
                  let placed: Entity
                  if (pickedIds.length) {
                    const chosenId = pickedIds[Math.floor(Math.random() * pickedIds.length)]
                    const asset = next.assets.find((a) => a.id === chosenId)
                    if (!asset) continue
                    if (asset.type === 'prefab') {
                      placed = instantiatePrefab(sc, asset, null)
                    } else {
                      placed = makeEntity(asset.name.replace(/\.[^.]+$/, ''))
                      placed.components.push({ type: 'mesh', shape: 'model', asset: asset.id })
                      sc.entities.push(placed)
                    }
                  } else {
                    placed = makeEntity('Foliage Prop')
                    placed.components.push({ type: 'mesh', shape: Math.random() < 0.65 ? 'cone' : 'sphere', color: Math.random() < 0.65 ? '#3c8c4a' : '#6c757d' })
                    sc.entities.push(placed)
                  }
                  const scVal = sMin + Math.random() * (sMax - sMin)
                  placed.transform.position = [wx, wy, wz]
                  placed.transform.rotation = [0, scatterBrush.randomYaw ? Math.random() * Math.PI * 2 : 0, 0]
                  placed.transform.scale = [scVal, scVal, scVal]
                  placed.properties = { ...(placed.properties || {}), staticBatch: Boolean(scatterBrush.staticBatch) }
                  const existingTags = Array.isArray(placed.properties.tags) ? placed.properties.tags : []
                  placed.properties.tags = [...new Set([...existingTags, 'scatter'])]
                  spawned++
                }
                if (spawned) change(next)
              }}
                onSelect={select}
                onTransform={(id, tr) =>
                  patch((n) => {
                    getScene(n).entities.find((e) => e.id === id)!.transform = tr
                  })
                }
              />
            </div>
            {tab === 'script' && (
              <ScriptWorkspace
                project={p}
                activeId={activeScript}
                onSelect={setActiveScript}
                onChange={change}
                onNotify={note}
              />
            )}
            {preview && tab === 'game' && (
              <iframe
                title="Game preview"
                ref={frame}
                className="preview"
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
                  <div className="toolstrip">
                    {iconBtn(
                      'Prop / Foliage Scatter Brush',
                      Trees,
                      () => setScatterBrush((b) => ({ ...b, enabled: !b.enabled })),
                      scatterBrush.enabled,
                    )}
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
          {scatterBrush.enabled ? (
            <ScatterBrushPanel
              p={p}
              brush={scatterBrush}
              scatteredCount={scene.entities.filter((e) => Array.isArray(e.properties?.tags) && e.properties.tags.includes('scatter')).length}
              onChange={(patchData) => setScatterBrush((b) => ({ ...b, ...patchData }))}
              onClearAll={() => {
                const next = structuredClone(live.current)
                const sc = getScene(next)
                const targets = sc.entities.filter((e) => Array.isArray(e.properties?.tags) && e.properties.tags.includes('scatter'))
                for (const dEnt of targets) removeEntity(sc, dEnt.id)
                if (targets.length) change(next)
              }}
              onClose={() => setScatterBrush((b) => ({ ...b, enabled: false }))}
            />
          ) : (
            <Inspector project={p} entityId={selected} onChange={change} onEditAsset={edit} terrainBrush={terrainBrush} onTerrainBrushChange={patchTerrainBrush} />
          )}
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
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
                    <strong>Preview performance</strong>
                    <button
                      type="button"
                      className={showProfiler ? 'mf-primary' : 'mf-btn'}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5, padding: '4px 10px' }}
                      onClick={() => setShowProfiler((v) => !v)}
                    >
                      <Activity size={13} /> {showProfiler ? 'Hide Scene Profiler' : 'Open Scene Profiler'}
                    </button>
                  </div>
                  {Object.keys(stats).length ? (
                    <pre>{JSON.stringify(stats, null, 2)}</pre>
                  ) : (
                    <p>Run the game to measure rendering performance, or open Scene Profiler for live FPS, draw-call, triangle and asset memory stats.</p>
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
          Miniforge Engine <b>v3.0.3</b>
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
              left: Math.max(8, Math.min(menu.x, innerWidth - 260)),
              top: Math.max(8, Math.min(menu.y, innerHeight - Math.min(menu.items.length * 34 + 16, innerHeight - 60))),
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
        <Authoring key={target} project={p} target={target} focusUiId={focusUiId} onChange={change} onClose={() => {setFocusUiId(undefined);edit('')}} />
      )}
      {showProfiler && <SceneProfiler p={p} runtimeStats={preview ? stats : undefined} onClose={() => setShowProfiler(false)} />}
      {showSteam && (
        <SteamStudio
          p={p}
          onSave={(steam) =>
            patch((n) => {
              n.settings.steam = steam
            })
          }
          onClose={() => setShowSteam(false)}
        />
      )}
      {showMultiplayer && (
        <MultiplayerStudio
          p={p}
          onSave={(mp) =>
            patch((n) => {
              n.settings.multiplayer = mp
            })
          }
          onClose={() => setShowMultiplayer(false)}
        />
      )}
      {showInputManager && (
        <InputManager
          p={p}
          onSave={(bindings, deadzone, touch) =>
            patch((n) => {
              n.settings.bindings = bindings
              ;(n.settings as any).gamepadDeadzone = deadzone
              n.settings.touch = touch
            })
          }
          onClose={() => setShowInputManager(false)}
        />
      )}
      {dialog && (
        <div
          className="backdrop"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !busy) modal('')
          }}
        >
          <section className="dialog" style={dialog === 'exportSettings' ? { width: 'min(820px, 94vw)', maxWidth: '820px' } : undefined}>
            <div className="dialog-head">
              <span className="dialog-icon">
                {dialog === 'export' ? <Rocket /> : dialog === 'exportSettings' ? <Settings2 /> : dialog === 'new' ? <FilePlus2 /> : <Box />}
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
            {dialog === 'exportSettings' ? (
              <>
                <ExportSettingsPanel
                  p={p}
                  edit={patch}
                  localTemplates={localTemplates}
                  onPickLocalTemplate={(plat, file) => {
                    void file.arrayBuffer().then((buf) => {
                      setLocalTemplates((prev) => ({ ...prev, [plat]: { name: file.name, bytes: new Uint8Array(buf) } }))
                      note(`Loaded ${plat} export template: ${file.name}`)
                    })
                  }}
                />
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 10 }}>
                  <button className="minor-btn" onClick={() => modal('export')}>
                    <Rocket size={13} /> Open Export Dialog
                  </button>
                  <button className="primary" onClick={() => modal('')}>
                    Done
                  </button>
                </div>
              </>
            ) : dialog === 'platform' ? (
              <PlatformPanel id={p.id} />
            ) : dialog === 'new' ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault()
                  const n = freshTemplate(template)
                  if (newName.trim()) n.name = newName.trim()
                  clearLinkedDiskPath()
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
                      ['key-vault', 'Key Vault'],
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
                    {profile === 'windows' || profile === 'linux' || profile === 'macos'
                      ? (p.settings.export?.desktopMode === 'source'
                          ? 'Tauri Source ZIP · compile on target OS'
                          : 'Instant Executable (Export Template) · fallback to Source ZIP')
                      : 'Playable web ZIP'}
                  </small>
                </div>
                {buildIssues.length>0 && <div className="project-issues" role="alert"><strong>Resolve before building</strong>{buildIssues.map((issue,index)=><button key={index} onClick={()=>locateIssue(issue)}><b>{issue.owner}</b><span>{issue.message}</span></button>)}</div>}
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <button className="minor-btn" type="button" onClick={() => modal('exportSettings')}>
                    <Settings2 size={14} /> Export settings…
                  </button>
                  <button className="primary" style={{ flex: 1 }} disabled={busy || !!buildIssues.length} onClick={build}>
                    <Hammer size={15} />
                    {busy ? 'Building…' : 'Build & download'}
                  </button>
                </div>
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
                    Layers3,
                    Waves,
                    Sparkles,
                    Aperture,
                    Flame,
                    Image,
                    Stamp,
                    Compass,
                  ][i] ?? Box
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
          <span>{notice}</span>
          <button className="icon" aria-label="Dismiss notification" onClick={() => say('')}>
            <X />
          </button>
        </div>
      )}
      {showHub && (
        <ProjectHub
          currentProject={hasSessionProject ? p : null}
          canResume={hasSessionProject}
          onResume={() => setShowHub(false)}
          onCreateBlank={(templateId, name, description) => {
            const np = freshTemplate(templateId)
            if (name) np.name = name
            if (description) np.description = description
            clearLinkedDiskPath()
            replace(np)
            note('Created new project: ' + np.name)
          }}
          onOpenExample={(exProj) => {
            clearLinkedDiskPath()
            replace(exProj)
            note('Opened example: ' + exProj.name)
          }}
          onOpenFromFile={() => {
            if (canSaveToDisk()) {
              void openProjectFromDisk()
                .then((res) => {
                  if (res) {
                    replace(res.project)
                    note('Opened from disk: ' + res.label)
                  }
                })
                .catch((e) => note(String(e)))
            } else {
              fileInput.current?.click()
            }
          }}
        />
      )}
    </div>
  )
}
createRoot(document.getElementById('root')!).render(<App />)
