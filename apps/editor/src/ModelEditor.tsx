import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Play,
  Pause,
  Square,
  Plus,
  Trash2,
  Download,
  Palette,
  Film,
  RotateCcw,
  Scissors,
  Pencil,
  Check,
  X,
} from 'lucide-react'
import { createWorld, type RenderWorld } from '../../../packages/graphics/src'
import { Vector3 } from '../../../packages/graphics/src/scene'
import {
  makeEntity,
  makeProject,
  uid,
  type Asset,
  type ModelAnimationClip,
  type ModelPartMaterialOverride,
  type Project,
} from '../../../packages/project-schema/src'
import { Field, Numeric, Color } from './Fields'

type InspectedPart = {
  index: number
  name: string
  vertices: number
  triangles: number
  color: string
  hasTexture: boolean
  roughness: number
  unlit: boolean
  pixelated: boolean
  doubleSided: boolean
}

type InspectedModel = {
  parts: InspectedPart[]
  nativeClips: { name: string; duration: number }[]
  allClips: { name: string; duration: number }[]
  bones: string[]
  bounds: { min: [number, number, number]; max: [number, number, number] }
}

const PREVIEW_ENTITY_ID = 'model-preview-entity'

export function ModelEditor({
  a,
  p,
  changeA,
  edit,
  onDownload,
}: {
  a: Asset
  p: Project
  changeA: (fn: (asset: Asset) => void) => void
  edit: (fn: (proj: Project) => void) => void
  onDownload: () => void
}) {
  const [tab, setTab] = useState<'materials' | 'animations'>('materials')
  const [info, setInfo] = useState<InspectedModel | null>(null)
  const [updating, setUpdating] = useState(false)
  const [previewError, setPreviewError] = useState('')
  const [attempt, setAttempt] = useState(0)
  const [showGrid, setShowGrid] = useState(true)
  const [partQuery, setPartQuery] = useState('')
  const [selectedPart, setSelectedPart] = useState(0)
  const [autoRotate, setAutoRotate] = useState(false)

  // Animation workbench state
  const [sourceClip, setSourceClip] = useState('')
  const [activeClip, setActiveClip] = useState('')
  const [playing, setPlaying] = useState(false)
  const [loop] = useState(true)
  const [speed, setSpeed] = useState(1)
  const [fps, setFps] = useState(30)
  const [curTime, setCurTime] = useState(0)
  const [curDuration, setCurDuration] = useState(0)
  const [loopRangeOnly, setLoopRangeOnly] = useState(false)

  // Slice range form state
  const [editingClipId, setEditingClipId] = useState<string | null>(null)
  const [sliceName, setSliceName] = useState('')
  const [sliceStart, setSliceStart] = useState(0)
  const [sliceEnd, setSliceEnd] = useState(1)
  const [sliceLoop, setSliceLoop] = useState(true)
  const [sliceSpeed, setSliceSpeed] = useState(1)

  const previewHostRef = useRef<HTMLDivElement | null>(null)
  const worldRef = useRef<RenderWorld | null>(null)
  const orbitRef = useRef({
    yaw: 0.55,
    pitch: 0.32,
    dist: 4.5,
    targetX: 0, targetY: 0.8, targetZ: 0,
    dragging: false,
    panning: false,
    lx: 0,
    ly: 0,
  })
  const autoRotateRef = useRef(false)
  const loopRangeRef = useRef({ enabled: false, start: 0, end: 1, active: '', source: '' })

  useEffect(() => {
    autoRotateRef.current = autoRotate
  }, [autoRotate])

  useEffect(() => {
    loopRangeRef.current = {
      enabled: loopRangeOnly,
      start: sliceStart,
      end: sliceEnd,
      active: activeClip,
      source: sourceClip,
    }
  }, [loopRangeOnly, sliceStart, sliceEnd, activeClip, sourceClip])

  const customClips: ModelAnimationClip[] = Array.isArray(a.properties?.clips) ? a.properties.clips : []
  const partMaterials: Record<string, string> = a.properties?.partMaterials || {}
  const partOverrides: Record<string, ModelPartMaterialOverride> = a.properties?.partOverrides || {}
  const matAssets = useMemo(() => p.assets.filter((x) => x.type === 'material'), [p.assets])
  const syncKey = useMemo(() => JSON.stringify({
    pm: a.properties?.partMaterials, po: a.properties?.partOverrides, cl: a.properties?.clips,
    mats: matAssets.map((material) => [material.id, material.properties]),
  }), [a.properties, matAssets])

  const buildPreviewProject = () => {
    const sample = makeProject('Model Preview')
    sample.assets = p.assets.map((x) => (x.id === a.id ? a : x))
    if (!sample.assets.some((x) => x.id === a.id)) sample.assets.push(a)
    sample.scenes[0].environment.background = '#161c24'
    sample.scenes[0].environment.ambient = 1.5
    const ent = makeEntity(a.name || 'Model')
    ent.id = PREVIEW_ENTITY_ID
    ent.transform.position = [0, 0, 0]
    ent.components = [{ type: 'mesh', shape: 'model', asset: a.id }]
    sample.scenes[0].entities = [ent]
    return sample
  }

  const frameModelBounds = (bounds: { min: [number, number, number]; max: [number, number, number] }) => {
    const sx = bounds.max[0] - bounds.min[0]
    const sy = bounds.max[1] - bounds.min[1]
    const sz = bounds.max[2] - bounds.min[2]
    const radius = Math.max(0.35, Math.hypot(sx, sy, sz) * 0.5)
    const host = previewHostRef.current
    const aspect = host && host.clientHeight ? host.clientWidth / host.clientHeight : 1
    orbitRef.current.dist = radius * 3 / Math.max(0.1, Math.min(1, aspect))
    orbitRef.current.targetX = (bounds.min[0] + bounds.max[0]) / 2
    orbitRef.current.targetZ = (bounds.min[2] + bounds.max[2]) / 2
    orbitRef.current.targetY = (bounds.min[1] + bounds.max[1]) * 0.5
  }

  const lastSync = useRef('')
  useEffect(() => { worldRef.current?.setGrid(showGrid, -0.01) }, [showGrid])
  // Initialize live 3D preview world
  useEffect(() => {
    const host = previewHostRef.current
    if (!host) return
    setPreviewError('')
    setUpdating(false)
    setInfo(null)
    lastSync.current = syncKey
    const sample = buildPreviewProject()
    let w: RenderWorld
    try {
      w = createWorld(host, sample, undefined, { editor: true })
    } catch (error) {
      setPreviewError(String(error))
      return
    }
    worldRef.current = w
    w.setGrid(showGrid, -0.01)

    let cancelled = false
    w.ready().then(() => {
      if (cancelled) return
      const insp = w.inspectModel(PREVIEW_ENTITY_ID) as InspectedModel | undefined
      if (!insp) { setPreviewError('No model geometry could be decoded.'); return }
      if (insp) {
        setInfo(insp)
        frameModelBounds(insp.bounds)
        if (insp.nativeClips.length) {
          const first = insp.nativeClips[0]
          setSourceClip(first.name)
          setActiveClip(first.name)
          setCurDuration(first.duration)
          setSliceStart(0)
          setSliceEnd(Number(first.duration.toFixed(3)))
          w.playAnimation(PREVIEW_ENTITY_ID, first.name, true, 1, 0)
          w.pauseAnimation(PREVIEW_ENTITY_ID)
          w.setAnimationTime(PREVIEW_ENTITY_ID, 0)
        }
      }
    }).catch((error) => { if (!cancelled) setPreviewError(String(error)) })

    let raf = 0
    let lastUiSync = 0
    const loopFrame = (now: number) => {
      raf = requestAnimationFrame(loopFrame)
      const o = orbitRef.current
      if (autoRotateRef.current && !o.dragging) {
        o.yaw += 0.006
      }
      w.camera.position.set(
        o.targetX + Math.sin(o.yaw) * Math.cos(o.pitch) * o.dist,
        Math.sin(o.pitch) * o.dist + o.targetY,
        o.targetZ + Math.cos(o.yaw) * Math.cos(o.pitch) * o.dist,
      )
      w.camera.lookAt(new Vector3(o.targetX, o.targetY, o.targetZ))
      w.camera.height = 0
      w.camera.fov = 42
      w.render()

      const st = w.getAnimationState(PREVIEW_ENTITY_ID)
      if (st) {
        const lr = loopRangeRef.current
        if (
          lr.enabled &&
          st.playing &&
          lr.active === lr.source &&
          lr.end > lr.start + 0.005 &&
          (st.time < lr.start - 0.01 || st.time >= lr.end)
        ) {
          w.setAnimationTime(PREVIEW_ENTITY_ID, lr.start)
        }
        if (now - lastUiSync > 45) {
          lastUiSync = now
          setCurTime(st.time)
          setCurDuration(st.duration)
          setPlaying(st.playing)
        }
      }
    }
    raf = requestAnimationFrame(loopFrame)
    const zoom = (event: WheelEvent) => {
      event.preventDefault()
      const orbit = orbitRef.current
      orbit.dist = Math.max(0.05, orbit.dist * Math.exp(Math.max(-1, Math.min(1, event.deltaY * 0.0012))))
    }
    host.addEventListener('wheel', zoom, { passive: false })
    return () => {
      cancelled = true
      host.removeEventListener('wheel', zoom)
      cancelAnimationFrame(raf)
      worldRef.current = null
      w.dispose()
    }
  }, [a.id, a.data, attempt])

  // Sync preview whenever material overrides, project materials, or custom clips change
  useEffect(() => {
    const w = worldRef.current
    if (!w || lastSync.current === syncKey) return
    lastSync.current = syncKey
    setPreviewError('')
    setUpdating(true)
    const prevState = w.getAnimationState(PREVIEW_ENTITY_ID)
    w.load(buildPreviewProject())
    w.setGrid(showGrid, -0.01)
    let cancelled = false
    w.ready().then(() => {
      if (cancelled) return
      const insp = w.inspectModel(PREVIEW_ENTITY_ID) as InspectedModel | undefined
      setInfo(insp ?? null)
      if (!insp) setPreviewError('No model geometry could be decoded.')
      if (prevState?.clip) {
        const ok = w.playAnimation(
          PREVIEW_ENTITY_ID,
          prevState.clip,
          prevState.loop,
          prevState.speed,
          0,
        )
        if (ok) {
          w.setAnimationTime(PREVIEW_ENTITY_ID, prevState.time)
          if (!prevState.playing) w.pauseAnimation(PREVIEW_ENTITY_ID)
        }
      }
    }).catch((error) => { if (!cancelled) setPreviewError(String(error)) })
      .finally(() => { if (!cancelled) setUpdating(false) })
    return () => {
      cancelled = true
    }
  }, [syncKey])

  // Playback helpers
  const playClipByName = (clipName: string, clipLoop = loop, clipSpeed = speed, startAt = 0) => {
    const w = worldRef.current
    if (!w || !clipName) return
    setActiveClip(clipName)
    const ok = w.playAnimation(PREVIEW_ENTITY_ID, clipName, clipLoop, clipSpeed, 0)
    if (ok) {
      if (startAt > 0) w.setAnimationTime(PREVIEW_ENTITY_ID, startAt)
      setPlaying(true)
      const st = w.getAnimationState(PREVIEW_ENTITY_ID)
      if (st) {
        setCurTime(st.time)
        setCurDuration(st.duration)
      }
    }
  }

  const togglePlay = () => {
    const w = worldRef.current
    if (!w) return
    const st = w.getAnimationState(PREVIEW_ENTITY_ID)
    if (st?.playing) {
      w.pauseAnimation(PREVIEW_ENTITY_ID)
      setPlaying(false)
    } else if (st?.clip) {
      if (loopRangeOnly && activeClip === sourceClip && (st.time < sliceStart || st.time >= sliceEnd)) {
        w.setAnimationTime(PREVIEW_ENTITY_ID, sliceStart)
      }
      w.resumeAnimation(PREVIEW_ENTITY_ID)
      setPlaying(true)
    } else if (sourceClip) {
      playClipByName(sourceClip, loop, speed, loopRangeOnly ? sliceStart : 0)
    }
  }

  const stopPlay = () => {
    const w = worldRef.current
    if (!w) return
    w.pauseAnimation(PREVIEW_ENTITY_ID)
    const resetT = loopRangeOnly && activeClip === sourceClip ? sliceStart : 0
    w.setAnimationTime(PREVIEW_ENTITY_ID, resetT)
    setCurTime(resetT)
    setPlaying(false)
  }

  const scrubTo = (t: number) => {
    const w = worldRef.current
    if (!w) return
    const targetClip = activeClip || sourceClip
    const st = w.getAnimationState(PREVIEW_ENTITY_ID)
    if (!st?.clip && targetClip) {
      w.playAnimation(PREVIEW_ENTITY_ID, targetClip, loop, speed, 0)
      w.pauseAnimation(PREVIEW_ENTITY_ID)
    }
    const clamped = Math.max(0, Math.min(curDuration || 1, t))
    w.setAnimationTime(PREVIEW_ENTITY_ID, clamped)
    setCurTime(clamped)
  }

  const selectSourceTrack = (trackName: string) => {
    setSourceClip(trackName)
    const found = info?.nativeClips.find((c) => c.name === trackName)
    const dur = found?.duration ?? 1
    setSliceStart(0)
    setSliceEnd(Number(dur.toFixed(3)))
    setActiveClip(trackName)
    const w = worldRef.current
    if (w) {
      w.playAnimation(PREVIEW_ENTITY_ID, trackName, loop, speed, 0)
      w.pauseAnimation(PREVIEW_ENTITY_ID)
      w.setAnimationTime(PREVIEW_ENTITY_ID, 0)
      setCurTime(0)
      setCurDuration(dur)
      setPlaying(false)
    }
  }

  // Material slot helpers
  const setPartMaterial = (partIdx: number, matId: string) => {
    changeA((asset) => {
      asset.properties = { ...(asset.properties || {}) }
      const next = { ...(asset.properties.partMaterials || {}) }
      if (matId) next[String(partIdx)] = matId
      else delete next[String(partIdx)]
      asset.properties.partMaterials = next
    })
  }

  const setPartOverride = (partIdx: number, patch: Partial<ModelPartMaterialOverride>) => {
    changeA((asset) => {
      asset.properties = { ...(asset.properties || {}) }
      const all = { ...(asset.properties.partOverrides || {}) }
      all[String(partIdx)] = { ...(all[String(partIdx)] || {}), ...patch }
      asset.properties.partOverrides = all
    })
  }

  const resetPartSlot = (partIdx: number) => {
    changeA((asset) => {
      asset.properties = { ...(asset.properties || {}) }
      if (asset.properties.partMaterials) {
        const pm = { ...asset.properties.partMaterials }
        delete pm[String(partIdx)]
        asset.properties.partMaterials = pm
      }
      if (asset.properties.partOverrides) {
        const po = { ...asset.properties.partOverrides }
        delete po[String(partIdx)]
        asset.properties.partOverrides = po
      }
    })
  }

  const createAndAssignMaterial = (part: InspectedPart) => {
    const newId = uid('mat')
    const baseName = `${a.name.replace(/\.[^.]+$/, '')}_${part.name.replace(/\s+/g, '_')}`
    edit((proj) => {
      proj.assets.push({
        id: newId,
        name: baseName,
        type: 'material',
        data: '',
        properties: {
          color: part.color || '#ffffff',
          roughness: Number(part.roughness ?? 0.8),
          metalness: 0,
          unlit: part.unlit,
          pixelated: part.pixelated,
        },
      })
    })
    setPartMaterial(part.index, newId)
  }

  // Custom sliced clip helpers
  const saveSlicedClip = () => {
    const cleanName = sliceName.trim()
    if (!cleanName || !sourceClip) return
    const s = Math.max(0, Number(sliceStart) || 0)
    const e = Math.max(s + 0.01, Number(sliceEnd) || s + 0.01)
    changeA((asset) => {
      asset.properties = { ...(asset.properties || {}) }
      const list: ModelAnimationClip[] = Array.isArray(asset.properties.clips)
        ? [...asset.properties.clips]
        : []
      const entry: ModelAnimationClip = {
        id: editingClipId || uid('clip'),
        name: cleanName,
        sourceClip,
        startTime: Number(s.toFixed(4)),
        endTime: Number(e.toFixed(4)),
        loop: sliceLoop,
        speed: sliceSpeed,
      }
      const idx = editingClipId ? list.findIndex((c) => c.id === editingClipId) : -1
      if (idx >= 0) list[idx] = entry
      else list.push(entry)
      asset.properties.clips = list
    })
    setEditingClipId(null)
    setSliceName('')
  }

  const startEditClip = (clip: ModelAnimationClip) => {
    setEditingClipId(clip.id)
    setSliceName(clip.name)
    setSourceClip(clip.sourceClip)
    setSliceStart(clip.startTime)
    setSliceEnd(clip.endTime)
    setSliceLoop(clip.loop !== false)
    setSliceSpeed(clip.speed ?? 1)
    setLoopRangeOnly(true)
    playClipByName(clip.sourceClip, true, clip.speed ?? 1, clip.startTime)
  }

  const deleteSlicedClip = (clipId: string) => {
    changeA((asset) => {
      asset.properties = { ...(asset.properties || {}) }
      const list: ModelAnimationClip[] = Array.isArray(asset.properties.clips)
        ? asset.properties.clips
        : []
      asset.properties.clips = list.filter((c) => c.id !== clipId)
    })
    if (editingClipId === clipId) {
      setEditingClipId(null)
      setSliceName('')
    }
  }

  const visibleParts = info?.parts.filter((part) => part.name.toLowerCase().includes(partQuery.trim().toLowerCase())) ?? []
  const totalTris = info ? info.parts.reduce((s, pt) => s + pt.triangles, 0) : 0
  const safePartIdx = info && info.parts.length ? Math.min(selectedPart, info.parts.length - 1) : 0
  const curPart = info?.parts[safePartIdx]
  const curPartMatId = curPart ? partMaterials[String(curPart.index)] || '' : ''
  const curPartOvr = curPart ? partOverrides[String(curPart.index)] || {} : {}
  const activeSourceDur =
    info?.nativeClips.find((c) => c.name === sourceClip)?.duration ?? curDuration ?? 1
  const safeDur = Math.max(0.001, curDuration || activeSourceDur || 1)
  const startPct = Math.max(0, Math.min(100, (sliceStart / Math.max(0.001, activeSourceDur)) * 100))
  const endPct = Math.max(startPct, Math.min(100, (sliceEnd / Math.max(0.001, activeSourceDur)) * 100))
  const playheadPct = Math.max(0, Math.min(100, (curTime / safeDur) * 100))

  return (
    <div className="mf-html-studio mf-model-editor">
      <div className="mf-html-top">
        <div className="mf-html-tabs">
          <button
            type="button"
            className={tab === 'materials' ? 'active' : ''}
            onClick={() => setTab('materials')}
          >
            <Palette size={13} /> Materials ({info?.parts.length ?? 0})
          </button>
          <button
            type="button"
            className={tab === 'animations' ? 'active' : ''}
            onClick={() => setTab('animations')}
          >
            <Film size={13} /> Animations ({(info?.nativeClips.length ?? 0) + customClips.length})
          </button>
          <span style={{ fontSize: 11, color: 'var(--muted)', marginLeft: 8 }}>
            {totalTris.toLocaleString()} tris · {info?.bones.length ?? 0} nodes
            {a.properties?.convertedFrom ? ` · from ${a.properties.convertedFrom}` : ''}
          </span>
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <button
            type="button"
            className="mf-btn"
            style={{ fontSize: 11.5 }}
            aria-pressed={autoRotate}
            onClick={() => setAutoRotate((v) => !v)}
            title="Toggle turntable auto-rotation"
          >
            <RotateCcw size={12} /> {autoRotate ? 'Stop spin' : 'Spin'}
          </button>
          <button
            type="button"
            className="mf-btn"
            style={{ fontSize: 11.5 }}
            disabled={!info}
            onClick={() => info && frameModelBounds(info.bounds)}
            title="Re-center preview camera"
          >
            Frame
          </button>
          <button type="button" className="mf-btn" aria-pressed={showGrid} onClick={() => setShowGrid(!showGrid)}>Grid</button>
          <button
            type="button"
            className="mf-btn"
            style={{ fontSize: 11.5 }}
            onClick={onDownload}
            title="Download source model"
          >
            <Download size={12} /> Download
          </button>
        </div>
      </div>

      <div
        className="mf-html-split mf-model-columns"
        style={{ gridTemplateColumns: 'minmax(300px, 1.05fr) minmax(360px, 1.15fr)', minHeight: 490 }}
      >
        {/* Left: Live 3D Interactive Preview */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            borderRight: '1px solid var(--border)',
            background: '#141920',
            minHeight: 480,
          }}
        >
          <div
            ref={previewHostRef}
            style={{ flex: 1, position: 'relative', minHeight: 360, cursor: 'grab', overflow: 'hidden' }}
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId)
              orbitRef.current.dragging = true
              orbitRef.current.panning = e.button === 2 || e.shiftKey
              orbitRef.current.lx = e.clientX
              orbitRef.current.ly = e.clientY
            }}
            onPointerMove={(e) => {
              const o = orbitRef.current
              if (!o.dragging) return
              const dx = e.clientX - o.lx
              const dy = e.clientY - o.ly
              o.lx = e.clientX
              o.ly = e.clientY
              if (o.panning) {
                const units = o.dist / Math.max(1, e.currentTarget.clientHeight)
                o.targetY += dy * units
                o.targetX -= dx * Math.cos(o.yaw) * units
                o.targetZ += dx * Math.sin(o.yaw) * units
              } else {
                o.yaw -= dx * 0.01
                o.pitch = Math.max(-1.25, Math.min(1.4, o.pitch + dy * 0.01))
              }
            }}
            onPointerUp={(e) => {
              orbitRef.current.dragging = false
              orbitRef.current.panning = false
              try {
                e.currentTarget.releasePointerCapture(e.pointerId)
              } catch {}
            }}
            onLostPointerCapture={() => { orbitRef.current.dragging = false }}
            onContextMenu={(e) => e.preventDefault()}
          />

          {/* Compact preview playback & hint bar */}
          <div
            style={{
              padding: '8px 10px',
              borderTop: '1px solid var(--border)',
              background: '#192028',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              flexWrap: 'wrap',
              fontSize: 11.5,
            }}
          >
            {updating && <span role="status">Updating preview…</span>}
            {previewError && <div role="alert">Preview unavailable · {previewError} <button type="button" className="mf-btn" onClick={() => setAttempt(attempt + 1)}>Retry preview</button></div>}
            {(info?.allClips.length ?? 0) > 0 ? (
              <>
                <button type="button" className="mf-btn" onClick={togglePlay} title="Play / Pause">
                  {playing ? <Pause size={12} /> : <Play size={12} />}
                </button>
                <button type="button" className="mf-btn" onClick={stopPlay} title="Stop">
                  <Square size={12} />
                </button>
                <span style={{ color: '#dbe4ef', fontWeight: 600 }}>
                  {activeClip || sourceClip || '—'}
                </span>
                <span style={{ color: 'var(--muted)', fontFamily: 'monospace' }}>
                  {curTime.toFixed(2)}s / {safeDur.toFixed(2)}s ({Math.round(curTime * fps)}f)
                </span>
              </>
            ) : (
              <span style={{ color: '#8d99a8' }}>
                Drag to orbit · Shift+drag to pan · Scroll to zoom
              </span>
            )}
          </div>
        </div>

        {/* Right: Materials or Animations Editor */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            overflowY: 'auto',
            maxHeight: 540,
            padding: 12,
            gap: 12,
          }}
        >
          {tab === 'materials' && (
            <>
              <div style={{ fontSize: 11.5, color: 'var(--muted)' }}>
                Assign a project Material to any mesh slot or tweak embedded GLB properties directly.
              </div>

              {!info ? (
                <div style={{ fontSize: 12, color: 'var(--muted)' }}>{previewError ? 'Model geometry unavailable' : 'Loading model geometry…'}</div>
              ) : info.parts.length === 0 ? (
                <div style={{ fontSize: 12, color: 'var(--muted)' }}>No renderable mesh parts found in this model.</div>
              ) : (
                <>
                  <input type="search" aria-label="Filter mesh parts" placeholder="Filter mesh parts" value={partQuery} onChange={(e) => setPartQuery(e.target.value)} />
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 4,
                      maxHeight: 155,
                      overflowY: 'auto',
                      border: '1px solid var(--border)',
                      borderRadius: 6,
                      padding: 6,
                      background: 'var(--panel)',
                    }}
                  >
                    {visibleParts.length === 0 && <span role="status">No matching mesh parts</span>}
                    {visibleParts.map((pt) => {
                      const assignedId = partMaterials[String(pt.index)]
                      const assignedMat = assignedId ? matAssets.find((m) => m.id === assignedId) : undefined
                      const hasOvr = Boolean(partOverrides[String(pt.index)])
                      const active = pt.index === safePartIdx
                      return (
                        <button
                          key={pt.index}
                          type="button"
                          aria-pressed={active}
                          onClick={() => setSelectedPart(pt.index)}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: 8,
                            padding: '6px 8px',
                            borderRadius: 4,
                            border: active ? '1px solid #4c9aff' : '1px solid transparent',
                            background: active ? '#222c3a' : 'transparent',
                            color: 'var(--text)',
                            cursor: 'pointer',
                            textAlign: 'left',
                            fontSize: 12,
                          }}
                        >
                          <span style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
                            <span
                              style={{
                                width: 12,
                                height: 12,
                                borderRadius: 3,
                                background: assignedMat?.properties?.color || partOverrides[String(pt.index)]?.color || pt.color,
                                border: '1px solid rgba(255,255,255,0.25)',
                                flexShrink: 0,
                              }}
                            />
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              <b>#{pt.index}</b> {pt.name}
                            </span>
                          </span>
                          <span style={{ fontSize: 11, color: '#8d99a8', flexShrink: 0 }}>
                            {assignedMat
                              ? `Mat: ${assignedMat.name}`
                              : hasOvr
                                ? 'Custom override'
                                : pt.hasTexture
                                  ? 'GLB + tex'
                                  : 'GLB default'}
                            {' · '}
                            {pt.triangles}t
                          </span>
                        </button>
                      )
                    })}
                  </div>

                  {/* Selected Slot Controls */}
                  {curPart && (
                    <div
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 8,
                        border: '1px solid var(--border)',
                        borderRadius: 6,
                        padding: 10,
                        background: '#192028',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <strong style={{ fontSize: 12.5 }}>
                          Slot #{curPart.index}: {curPart.name}
                        </strong>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button
                            type="button"
                            className="mf-btn"
                            style={{ fontSize: 11 }}
                            onClick={() => createAndAssignMaterial(curPart)}
                          >
                            <Plus size={12} /> New material
                          </button>
                          {(curPartMatId || partOverrides[String(curPart.index)]) && (
                            <button
                              type="button"
                              className="mf-btn"
                              style={{ fontSize: 11 }}
                              onClick={() => resetPartSlot(curPart.index)}
                            >
                              Reset
                            </button>
                          )}
                        </div>
                      </div>

                      <Field label="Material asset">
                        <select
                          aria-label="Material asset"
                          value={curPartMatId}
                          onChange={(e) => setPartMaterial(curPart.index, e.target.value)}
                        >
                          <option value="">Embedded GLB default</option>
                          {matAssets.map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.name}
                            </option>
                          ))}
                        </select>
                      </Field>

                      {curPartMatId ? (
                        <div style={{ fontSize: 11.5, color: 'var(--muted)' }}>
                          Using project Material asset. Edit its textures, shader, and PBR settings in the Materials
                          library.
                        </div>
                      ) : (
                        <>
                          <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
                            Quick embedded slot overrides (keeps GLB texture):
                          </div>
                          <Field label="Tint color">
                            <Color
                              label="Tint color"
                              value={curPartOvr.color ?? curPart.color ?? '#ffffff'}
                              change={(v) => setPartOverride(curPart.index, { color: v })}
                            />
                          </Field>
                          <Field label="Opacity">
                            <Numeric
                              label="Opacity"
                              value={curPartOvr.opacity ?? 1}
                              min={0}
                              max={1}
                              step={0.05}
                              change={(v) => setPartOverride(curPart.index, { opacity: v })}
                            />
                          </Field>
                          <Field label="Roughness">
                            <Numeric
                              label="Roughness"
                              value={curPartOvr.roughness ?? curPart.roughness ?? 0.85}
                              min={0}
                              max={1}
                              step={0.05}
                              change={(v) => setPartOverride(curPart.index, { roughness: v })}
                            />
                          </Field>
                          <Field label="Metalness">
                            <Numeric
                              label="Metalness"
                              value={curPartOvr.metalness ?? 0}
                              min={0}
                              max={1}
                              step={0.05}
                              change={(v) => setPartOverride(curPart.index, { metalness: v })}
                            />
                          </Field>
                          <Field label="Emissive">
                            <Color
                              label="Emissive"
                              value={curPartOvr.emissive ?? '#000000'}
                              change={(v) => setPartOverride(curPart.index, { emissive: v })}
                            />
                          </Field>
                          <Field label="Emissive power">
                            <Numeric
                              label="Emissive power"
                              value={curPartOvr.emissiveIntensity ?? 0}
                              min={0}
                              max={5}
                              step={0.1}
                              change={(v) => setPartOverride(curPart.index, { emissiveIntensity: v })}
                            />
                          </Field>
                          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 12, paddingTop: 2 }}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                              <input
                                type="checkbox"
                                checked={curPartOvr.unlit ?? curPart.unlit}
                                onChange={(e) => setPartOverride(curPart.index, { unlit: e.target.checked })}
                              />
                              Unlit
                            </label>
                            <label style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                              <input
                                type="checkbox"
                                checked={curPartOvr.pixelated ?? curPart.pixelated}
                                onChange={(e) => setPartOverride(curPart.index, { pixelated: e.target.checked })}
                              />
                              Pixelated
                            </label>
                            <label style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                              <input
                                type="checkbox"
                                checked={curPartOvr.doubleSided ?? curPart.doubleSided}
                                onChange={(e) => setPartOverride(curPart.index, { doubleSided: e.target.checked })}
                              />
                              Double-sided
                            </label>
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </>
              )}
            </>
          )}

          {tab === 'animations' && (
            <>
              {!info ? (
                <div style={{ fontSize: 12, color: 'var(--muted)' }}>Loading animations…</div>
              ) : info.nativeClips.length === 0 ? (
                <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                  This model has no embedded animation tracks. Import a rigged/animated .glb, .fbx, .x, or .smd model
                  to slice clips.
                </div>
              ) : (
                <>
                  {/* Source Track & FPS */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 90px', gap: 8 }}>
                    <Field label="Source track">
                      <select
                        aria-label="Source track"
                        value={sourceClip}
                        onChange={(e) => selectSourceTrack(e.target.value)}
                      >
                        {info.nativeClips.map((c) => (
                          <option key={c.name} value={c.name}>
                            {c.name} ({c.duration.toFixed(2)}s)
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field label="FPS">
                      <select aria-label="FPS" value={fps} onChange={(e) => setFps(Number(e.target.value))}>
                        <option value={24}>24 fps</option>
                        <option value={30}>30 fps</option>
                        <option value={60}>60 fps</option>
                      </select>
                    </Field>
                  </div>

                  {/* Interactive Timeline Scrubber */}
                  <div
                    style={{
                      border: '1px solid var(--border)',
                      borderRadius: 6,
                      padding: 10,
                      background: '#192028',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 8,
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: 12, fontWeight: 600 }}>
                        <Scissors size={12} style={{ verticalAlign: -2, marginRight: 4 }} />
                        Timeline Slicer
                      </span>
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 11.5 }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <input
                            type="checkbox"
                            checked={loopRangeOnly}
                            onChange={(e) => setLoopRangeOnly(e.target.checked)}
                          />
                          Loop range
                        </label>
                        <select
                          aria-label="Preview speed"
                          value={speed}
                          onChange={(e) => {
                            const sp = Number(e.target.value)
                            setSpeed(sp)
                            if (activeClip) playClipByName(activeClip, loop, sp, curTime)
                          }}
                          style={{ fontSize: 11, padding: '2px 4px' }}
                        >
                          <option value={0.25}>0.25x</option>
                          <option value={0.5}>0.5x</option>
                          <option value={1}>1x</option>
                          <option value={1.5}>1.5x</option>
                          <option value={2}>2x</option>
                        </select>
                      </div>
                    </div>

                    {/* Visual Timeline Bar with Range Highlight */}
                    <div
                      style={{
                        position: 'relative',
                        height: 26,
                        background: '#0f141a',
                        borderRadius: 4,
                        border: '1px solid #2c3540',
                        cursor: 'pointer',
                        userSelect: 'none',
                      }}
                      onPointerDown={(e) => {
                        const rect = e.currentTarget.getBoundingClientRect()
                        const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
                        if (activeClip !== sourceClip) {
                          setActiveClip(sourceClip)
                          const w = worldRef.current
                          if (w) {
                            w.playAnimation(PREVIEW_ENTITY_ID, sourceClip, loop, speed, 0)
                            w.pauseAnimation(PREVIEW_ENTITY_ID)
                          }
                        }
                        scrubTo(ratio * activeSourceDur)
                      }}
                    >
                      {/* Selected [Start..End] range */}
                      <div
                        style={{
                          position: 'absolute',
                          top: 2,
                          bottom: 2,
                          left: `${startPct}%`,
                          width: `${Math.max(1, endPct - startPct)}%`,
                          background: 'rgba(63, 185, 80, 0.35)',
                          borderLeft: '2px solid #3fb950',
                          borderRight: '2px solid #3fb950',
                          pointerEvents: 'none',
                        }}
                      />
                      {/* Current Playhead */}
                      <div
                        style={{
                          position: 'absolute',
                          top: 0,
                          bottom: 0,
                          left: `${activeClip === sourceClip ? playheadPct : 0}%`,
                          width: 2,
                          background: '#f5a623',
                          pointerEvents: 'none',
                        }}
                      />
                    </div>

                    <input
                      type="range"
                      min={0}
                      max={activeSourceDur}
                      step={0.005}
                      value={activeClip === sourceClip ? Math.min(curTime, activeSourceDur) : 0}
                      onChange={(e) => {
                        const t = Number(e.target.value)
                        if (activeClip !== sourceClip) {
                          setActiveClip(sourceClip)
                          const w = worldRef.current
                          if (w) {
                            w.playAnimation(PREVIEW_ENTITY_ID, sourceClip, loop, speed, 0)
                            w.pauseAnimation(PREVIEW_ENTITY_ID)
                          }
                        }
                        scrubTo(t)
                      }}
                      style={{ width: '100%' }}
                    />

                    {/* Start / End Range Controls */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: 11, color: 'var(--muted)' }}>
                            Start ({Math.round(sliceStart * fps)}f)
                          </span>
                          <button
                            type="button"
                            className="mf-btn"
                            style={{ fontSize: 10.5, padding: '2px 6px' }}
                            onClick={() => {
                              const t = Number(Math.min(curTime, Math.max(0, sliceEnd - 0.01)).toFixed(3))
                              setSliceStart(t)
                            }}
                          >
                            [ Set Start
                          </button>
                        </div>
                        <Numeric
                          label="Start time (s)"
                          value={sliceStart}
                          min={0}
                          max={Math.max(0, sliceEnd - 0.01)}
                          step={0.01}
                          change={(v) => setSliceStart(Math.max(0, Math.min(v, activeSourceDur)))}
                        />
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: 11, color: 'var(--muted)' }}>
                            End ({Math.round(sliceEnd * fps)}f)
                          </span>
                          <button
                            type="button"
                            className="mf-btn"
                            style={{ fontSize: 10.5, padding: '2px 6px' }}
                            onClick={() => {
                              const t = Number(Math.max(curTime, sliceStart + 0.01).toFixed(3))
                              setSliceEnd(Math.min(activeSourceDur, t))
                            }}
                          >
                            ] Set End
                          </button>
                        </div>
                        <Numeric
                          label="End time (s)"
                          value={sliceEnd}
                          min={Math.min(activeSourceDur, sliceStart + 0.01)}
                          max={activeSourceDur}
                          step={0.01}
                          change={(v) => setSliceEnd(Math.max(sliceStart + 0.01, Math.min(v, activeSourceDur)))}
                        />
                      </div>
                    </div>

                    <div style={{ fontSize: 11, color: '#8d99a8' }}>
                      Selection length: <b>{Math.max(0, sliceEnd - sliceStart).toFixed(3)}s</b> (
                      {Math.round(Math.max(0, sliceEnd - sliceStart) * fps)} frames @ {fps} fps)
                    </div>

                    {/* New / Edit Clip Form */}
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <input
                        placeholder="New clip name (e.g. Idle, Walk, Attack)"
                        value={sliceName}
                        onChange={(e) => setSliceName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') saveSlicedClip()
                        }}
                        style={{ flex: 1 }}
                      />
                      <button
                        type="button"
                        className="mf-primary"
                        disabled={!sliceName.trim() || sliceEnd <= sliceStart}
                        onClick={saveSlicedClip}
                        style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '5px 10px' }}
                      >
                        {editingClipId ? <Check size={13} /> : <Plus size={13} />}
                        {editingClipId ? 'Update' : 'Add clip'}
                      </button>
                      {editingClipId && (
                        <button
                          type="button"
                          className="mf-btn"
                          onClick={() => {
                            setEditingClipId(null)
                            setSliceName('')
                          }}
                        >
                          <X size={13} />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Custom Sliced Clips List */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <div style={{ fontSize: 11.5, fontWeight: 600, color: '#dbe4ef' }}>
                      Custom Sliced Clips ({customClips.length})
                    </div>
                    {customClips.length === 0 ? (
                      <div style={{ fontSize: 11.5, color: '#8d99a8' }}>
                        No custom clips yet. Pick a Start/End range above and click <b>Add clip</b>.
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {customClips.map((cl) => (
                          <div
                            key={cl.id}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              gap: 6,
                              padding: '6px 8px',
                              borderRadius: 5,
                              border:
                                activeClip === cl.name ? '1px solid #3fb950' : '1px solid #2b323b',
                              background: 'var(--panel)',
                              fontSize: 12,
                            }}
                          >
                            <div style={{ minWidth: 0 }}>
                              <div style={{ fontWeight: 600, color: 'var(--text)' }}>{cl.name}</div>
                              <div style={{ fontSize: 10.5, color: '#8d99a8' }}>
                                {cl.sourceClip} · {cl.startTime.toFixed(2)}s – {cl.endTime.toFixed(2)}s (
                                {(cl.endTime - cl.startTime).toFixed(2)}s)
                              </div>
                            </div>
                            <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                              <button
                                type="button"
                                className="mf-btn"
                                title="Play sliced clip"
                                onClick={() => {
                                  setLoopRangeOnly(false)
                                  playClipByName(cl.name, cl.loop !== false, cl.speed ?? 1, 0)
                                }}
                              >
                                <Play size={11} />
                              </button>
                              <button
                                type="button"
                                className="mf-btn"
                                title="Edit range"
                                onClick={() => startEditClip(cl)}
                              >
                                <Pencil size={11} />
                              </button>
                              <button
                                type="button"
                                className="mf-btn"
                                title="Delete clip"
                                onClick={() => deleteSlicedClip(cl.id)}
                              >
                                <Trash2 size={11} />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Imported Native Tracks */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <div style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--muted)' }}>
                      Imported Tracks ({info.nativeClips.length})
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {info.nativeClips.map((c) => (
                        <div
                          key={c.name}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '5px 8px',
                            borderRadius: 5,
                            border: activeClip === c.name ? '1px solid #4c9aff' : '1px solid #252c35',
                            background: '#141920',
                            fontSize: 12,
                          }}
                        >
                          <span>
                            {c.name}{' '}
                            <small style={{ color: '#8d99a8' }}>
                              ({c.duration.toFixed(2)}s / {Math.round(c.duration * fps)}f)
                            </small>
                          </span>
                          <button
                            type="button"
                            className="mf-btn"
                            title="Play full imported track"
                            onClick={() => {
                              setSourceClip(c.name)
                              setLoopRangeOnly(false)
                              playClipByName(c.name, true, speed, 0)
                            }}
                          >
                            <Play size={11} />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
