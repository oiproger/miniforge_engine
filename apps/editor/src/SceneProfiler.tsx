import { useEffect, useMemo, useRef, useState } from 'react'
import { Activity, X } from 'lucide-react'
import { getScene, type Project } from '../../../packages/project-schema/src'

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
}: {
  p: Project
  onClose: () => void
}) {
  const [fps, setFps] = useState(60)
  const [frameMs, setFrameMs] = useState(16.6)
  const [history, setHistory] = useState<number[]>(() => Array(28).fill(60))
  const lastRef = useRef(performance.now())
  const framesRef = useRef(0)

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
        setHistory((prev) => [...prev.slice(1), Math.min(120, curFps)])
        framesRef.current = 0
        lastRef.current = now
      }
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])

  const stats = useMemo(() => {
    const scene = getScene(p)
    let activeEntities = 0
    let meshCount = 0
    let staticBatched = 0
    let triangles = 0
    let lights = 0
    let particles = 0
    const batchBuckets = new Set<string>()

    for (const ent of scene.entities) {
      if (ent.active !== false) activeEntities++
      for (const c of ent.components) {
        if (c.enabled === false) continue
        if (c.type === 'mesh') {
          meshCount++
          triangles += estimateShapeTriangles(c.shape)
          if (c.staticBatch && c.shape !== 'model') {
            staticBatched++
            batchBuckets.add(String(c.material || 'default'))
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

    const unbatchedDraws = Math.max(0, meshCount - staticBatched)
    const estimatedDrawCalls = unbatchedDraws + batchBuckets.size

    let assetBytes = 0
    const heaviest: Array<{ name: string; type: string; kb: number }> = []
    for (const a of p.assets) {
      const sz = typeof a.data === 'string' ? a.data.length : 0
      assetBytes += sz
      heaviest.push({ name: a.name, type: a.type, kb: Math.round(sz / 1024) })
    }
    heaviest.sort((x, y) => y.kb - x.kb)

    return {
      totalEntities: scene.entities.length,
      activeEntities,
      meshCount,
      estimatedDrawCalls,
      batchedSaved: Math.max(0, staticBatched - batchBuckets.size),
      triangles,
      lights,
      particles,
      assetMb: (assetBytes / (1024 * 1024)).toFixed(2),
      topAssets: heaviest.slice(0, 4),
    }
  }, [p])

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
          <span style={{ fontFamily: 'ui-monospace, monospace', fontSize: 18, fontWeight: 700, color: fps >= 50 ? '#7ee787' : fps >= 30 ? '#f59e0b' : '#ff7b72' }}>
            {fps} FPS
          </span>
          <span style={{ fontFamily: 'ui-monospace, monospace', fontSize: 11.5, color: '#8b9bb0' }}>
            {frameMs} ms / frame
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

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, fontSize: 11 }}>
          <div style={{ background: '#161d27', borderRadius: 6, padding: '6px 8px' }}>
            <div style={{ color: '#8b9bb0' }}>Draw Calls</div>
            <strong style={{ fontSize: 13 }}>{stats.estimatedDrawCalls}</strong>
            {stats.batchedSaved > 0 && <span style={{ color: '#7ee787', marginLeft: 4 }}>(-{stats.batchedSaved})</span>}
          </div>
          <div style={{ background: '#161d27', borderRadius: 6, padding: '6px 8px' }}>
            <div style={{ color: '#8b9bb0' }}>Triangles</div>
            <strong style={{ fontSize: 13 }}>{stats.triangles.toLocaleString()}</strong>
          </div>
          <div style={{ background: '#161d27', borderRadius: 6, padding: '6px 8px' }}>
            <div style={{ color: '#8b9bb0' }}>Entities</div>
            <strong style={{ fontSize: 13 }}>{stats.activeEntities} / {stats.totalEntities}</strong>
          </div>
          <div style={{ background: '#161d27', borderRadius: 6, padding: '6px 8px' }}>
            <div style={{ color: '#8b9bb0' }}>Assets Memory</div>
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
