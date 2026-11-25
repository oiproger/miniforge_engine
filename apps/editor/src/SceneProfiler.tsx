import { useEffect, useMemo, useRef, useState } from 'react'
import { Activity, X } from 'lucide-react'
import { getScene, isEligibleForStaticBatch, type Project } from '../../../packages/project-schema/src'
import { opaqueMaterialBatchKey, spatialBatchCell } from '../../../packages/graphics/src/batch-planning'

function estimateShapeTriangles(shape: string | undefined): number {
  switch (shape) {
    case 'box':
      return 12
    case 'plane':
      return 2
    case 'sphere':
      return 768
    case 'cylinder':
      return 96
    case 'cone':
      return 64
    case 'capsule':
      return 512
    case 'model':
      return 1200
    default:
      return 12
  }
}

export function SceneProfiler({
  p,
  onClose,
  runtimeStats,
}: {
  p: Project
  onClose: () => void
  runtimeStats?: Record<string, number>
}) {
  const [fps, setFps] = useState(60)
  const [frameMs, setFrameMs] = useState(16.6)
  const [history, setHistory] = useState<number[]>(() => Array(28).fill(60))
  const lastRef = useRef(performance.now())
  const framesRef = useRef(0)
  const runtimeActive = useRef(false)
  runtimeActive.current = Number.isFinite(runtimeStats?.fps)

  useEffect(() => {
    let raf = 0
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick)
      framesRef.current++
      const elapsed = now - lastRef.current
      if (elapsed >= 350) {
        const curFps = Math.round((framesRef.current * 1000) / elapsed)
        const ms = Number((elapsed / Math.max(1, framesRef.current)).toFixed(1))
        setFps(curFps)
        setFrameMs(ms)
        if (!runtimeActive.current) setHistory((prev) => [...prev.slice(1), Math.min(120, curFps)])
        framesRef.current = 0
        lastRef.current = now
      }
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])

  useEffect(() => {
    if (Number.isFinite(runtimeStats?.fps))
      setHistory(prev => [...prev.slice(1), Math.min(120, runtimeStats!.fps)])
  }, [runtimeStats?.fps])

  const stats = useMemo(() => {
    const scene = getScene(p)
    let activeEntities = 0
    let meshCount = 0
    let triangles = 0
    let lights = 0
    let particles = 0
    const entityById=new Map(scene.entities.map(e=>[e.id,e]))
    const isActive=(entity: typeof scene.entities[number])=>{
      let current: typeof entity | undefined=entity
      const seen=new Set<string>()
      while(current && !seen.has(current.id)) {
        if(current.active===false)return false
        seen.add(current.id)
        current=current.parent ? entityById.get(current.parent) : undefined
      }
      return true
    }
    const batchBuckets = new Map<string, number>()
    const instanceBuckets = new Map<string, number>()
    const batching = Boolean(p.settings?.performance?.staticBatching) &&
      !Boolean(scene.environment.bakedLighting) && (scene.environment.reflectionMode ?? 'off') === 'off'
    const propsOf = (id: string) => p.assets.find(a => a.type==='material' && a.id===id)?.properties || {}
    const cell=(e: typeof scene.entities[number])=>spatialBatchCell(e.transform.position)

    for (const ent of scene.entities) {
      if (!isActive(ent)) continue
      activeEntities++
      for (const c of ent.components) {
        if (c.enabled === false) continue
        if (c.type === 'mesh') {
          meshCount++
          triangles += estimateShapeTriangles(c.shape)
          if (batching && Number(p.settings?.performance?.cullDistance??0) <= 0 &&
              !Number(ent.properties?.cullDistance??0)) {
            if (c.shape==='model') {
              const dynamic=ent.components.some(x=>x.enabled!==false &&
                ['animation','script','behavior','navAgent','particle','water','terrain'].includes(x.type))
              if(!dynamic && ent.properties.instancing!==false) {
                const asset=p.assets.find(a=>a.id===c.asset)
                const key=cell(ent)+':gltf:'+String(c.asset)+JSON.stringify([asset?.properties.partMaterials,asset?.properties.partOverrides])
                instanceBuckets.set(key,(instanceBuckets.get(key)||0)+1)
              }
            } else if (ent.properties.staticBatch===true && isEligibleForStaticBatch(ent)) {
              const props=propsOf(String(c.material||''))
              const signature=opaqueMaterialBatchKey(props,Boolean(props.doubleSided))
              if(signature!==null) {
                const key=cell(ent)+':primitive:'+signature
                batchBuckets.set(key,(batchBuckets.get(key)||0)+1)
              }
            }
          }
        } else if (c.type === 'terrain') {
          const seg = Number(c.segments ?? 16)
          triangles += seg * seg * 2
          meshCount++
        } else if (c.type === 'light') {
          lights++
        } else if (c.type === 'particle') {
          particles++
        }
      }
    }

    const primitiveSaved=[...batchBuckets.values()].reduce((sum,n)=>sum+(n>=2?n-1:0),0)
    const modelSaved=[...instanceBuckets.values()].reduce((sum,n)=>sum+(n>=2?n-1:0),0)
    // Model draw calls depend on the number of glTF parts and render passes,
    // which cannot be known from the scene JSON. The estimate counts a model
    // as one draw; Preview supplies actual drawCount including shadow passes.
    const estimatedDrawCalls=Math.max(0,meshCount-primitiveSaved-modelSaved)

    let assetBytes = 0
    const heaviest: Array<{ name: string; type: string; kb: number }> = []
    for (const a of p.assets) {
      let sz = typeof a.data === 'string' ? a.data.length : 0
      const match = typeof a.data === 'string' && a.data.match(/^data:[^,]*;base64,([\s\S]*)$/)
      if(match)sz=Math.max(0,Math.floor(match[1].length*.75)-(match[1].endsWith('==')?2:match[1].endsWith('=')?1:0))
      assetBytes += sz
      heaviest.push({ name: a.name, type: a.type, kb: Math.round(sz / 1024) })
    }
    heaviest.sort((x, y) => y.kb - x.kb)

    return {
      totalEntities: scene.entities.length,
      activeEntities,
      meshCount,
      estimatedDrawCalls,
      batchedSaved: primitiveSaved + modelSaved,
      triangles,
      lights,
      particles,
      assetMb: (assetBytes / (1024 * 1024)).toFixed(2),
      topAssets: heaviest.slice(0, 4),
    }
  }, [p])

  const measured = Number.isFinite(runtimeStats?.drawCalls)
  const displayFps = Number.isFinite(runtimeStats?.fps) ? runtimeStats!.fps : fps
  const displayFrameMs = Number.isFinite(runtimeStats?.frameTime) ? runtimeStats!.frameTime : frameMs
  const displayDraws = measured ? runtimeStats!.drawCalls : stats.estimatedDrawCalls
  const displayTriangles = Number.isFinite(runtimeStats?.triangles) ? runtimeStats!.triangles : stats.triangles

  return (
    <div
      style={{
        position: 'fixed',
        right: 16,
        bottom: 16,
        width: 310,
        zIndex: 60,
        borderRadius: 10,
        border: '1px solid #303a47',
        background: 'rgba(13, 17, 23, 0.94)',
        backdropFilter: 'blur(10px)',
        color: 'var(--text)',
        boxShadow: '0 12px 32px rgba(0,0,0,0.45)',
        fontFamily: 'Inter, system-ui, sans-serif',
        fontSize: 12,
        overflow: 'hidden',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 10px', borderBottom: '1px solid #242c37', background: '#141a22' }}>
        <strong style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: '#f59e0b', fontSize: 12 }}>
          <Activity size={13} /> Scene Profiler
        </strong>
        <button type="button" onClick={onClose} aria-label="Close profiler" style={{ background: 'none', border: 'none', color: '#8b9bb0', cursor: 'pointer', padding: 2 }}>
          <X size={14} />
        </button>
      </div>

      <div style={{ padding: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <span style={{ fontFamily: 'ui-monospace, monospace', fontSize: 18, fontWeight: 700, color: displayFps >= 50 ? '#7ee787' : displayFps >= 30 ? '#f59e0b' : '#ff7b72' }}>
            {displayFps} FPS
          </span>
          <span style={{ fontFamily: 'ui-monospace, monospace', fontSize: 11.5, color: '#8b9bb0' }}>
            {displayFrameMs.toFixed(1)} ms / frame
          </span>
        </div>

        {/* Mini FPS Sparkline */}
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 28, background: '#0b0f14', borderRadius: 5, padding: '3px 4px', border: '1px solid #1f2733' }}>
          {history.map((v, i) => (
            <div
              key={i}
              style={{
                flex: 1,
                height: `${Math.max(10, Math.min(100, (v / 65) * 100))}%`,
                background: v >= 50 ? '#3fb950' : v >= 30 ? '#f59e0b' : '#f85149',
                borderRadius: 1,
              }}
            />
          ))}
        </div>

        {!measured && <div style={{ fontSize: 10, color: '#8b9bb0' }}>Estimated from scene metadata. Start Preview for actual renderer draw calls (including shadow passes).</div>}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, fontSize: 11 }}>
          <div style={{ background: '#161d27', borderRadius: 6, padding: '6px 8px' }}>
            <div style={{ color: '#8b9bb0' }}>{measured ? 'Draw Calls (runtime)' : 'Estimated draws'}</div>
            <strong style={{ fontSize: 13 }}>{displayDraws}</strong>
            {stats.batchedSaved > 0 && <span style={{ color: '#7ee787', marginLeft: 4 }}>(-{stats.batchedSaved})</span>}
          </div>
          <div style={{ background: '#161d27', borderRadius: 6, padding: '6px 8px' }}>
            <div style={{ color: '#8b9bb0' }}>{measured ? 'Scene triangles' : 'Estimated triangles'}</div>
            <strong style={{ fontSize: 13 }}>{displayTriangles.toLocaleString()}</strong>
          </div>
          <div style={{ background: '#161d27', borderRadius: 6, padding: '6px 8px' }}>
            <div style={{ color: '#8b9bb0' }}>Entities</div>
            <strong style={{ fontSize: 13 }}>{stats.activeEntities} / {stats.totalEntities}</strong>
          </div>
          <div style={{ background: '#161d27', borderRadius: 6, padding: '6px 8px' }}>
            <div style={{ color: '#8b9bb0' }}>Asset payload</div>
            <strong style={{ fontSize: 13 }}>{stats.assetMb} MB</strong>
          </div>
        </div>

        <div style={{ fontSize: 11, color: 'var(--muted)', display: 'flex', justifyContent: 'space-between' }}>
          <span>Lights: <b style={{ color: 'var(--text)' }}>{stats.lights}</b></span>
          <span>Particles: <b style={{ color: 'var(--text)' }}>{stats.particles}</b></span>
          <span>Meshes: <b style={{ color: 'var(--text)' }}>{stats.meshCount}</b></span>
        </div>

        {stats.topAssets.length > 0 && (
          <div style={{ borderTop: '1px solid #242c37', paddingTop: 6 }}>
            <div style={{ fontSize: 10.5, color: '#8b9bb0', marginBottom: 4, textTransform: 'uppercase' }}>Heaviest Assets</div>
            {stats.topAssets.map((a, idx) => (
              <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#cbd5e1', padding: '1px 0' }}>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 205 }}>
                  {a.name} <span style={{ color: '#6e7f93' }}>({a.type})</span>
                </span>
                <span style={{ fontFamily: 'ui-monospace, monospace', color: '#7cc7ff' }}>{a.kb} KB</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
