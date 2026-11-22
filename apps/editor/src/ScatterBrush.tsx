import { Trees, Eraser, Trash2, X, Layers } from 'lucide-react'
import type { Project } from '../../../packages/project-schema/src'
import type { ScatterBrushConfig } from '../../../packages/editor-tools/src'

export const DEFAULT_SCATTER_BRUSH: ScatterBrushConfig = {
  enabled: false,
  erase: false,
  radius: 4,
  density: 4,
  spacing: 1.2,
  scaleMin: 0.75,
  scaleMax: 1.35,
  randomYaw: true,
  staticBatch: true,
  assets: [],
}

export function ScatterBrushPanel({
  p,
  brush,
  scatteredCount,
  onChange,
  onClearAll,
  onClose,
}: {
  p: Project
  brush: ScatterBrushConfig
  scatteredCount: number
  onChange: (patch: Partial<ScatterBrushConfig>) => void
  onClearAll: () => void
  onClose: () => void
}) {
  const candidates = p.assets.filter((a) => a.type === 'prefab' || a.type === 'model')

  const toggleAsset = (id: string) => {
    const cur = brush.assets || []
    const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]
    onChange({ assets: next })
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        height: '100%',
        overflowY: 'auto',
        background: '#11161d',
        color: '#e6edf3',
        fontSize: 12,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '8px 11px',
          borderBottom: '1px solid #242c37',
          background: '#141b24',
          flexShrink: 0,
        }}
      >
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 600, color: '#86efac' }}>
          <Trees size={14} /> Prop / Foliage Scatter Brush
        </span>
        <button type="button" className="mf-btn" style={{ padding: '2px 5px' }} onClick={onClose} title="Close Scatter Brush">
          <X size={12} />
        </button>
      </div>

      <div style={{ padding: 10, display: 'flex', flexDirection: 'column', gap: 9 }}>
        {/* Mode toggle */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
          <button
            type="button"
            className={!brush.erase ? 'mf-primary' : 'mf-btn'}
            style={{ fontSize: 11.5, padding: '5px 8px', justifyContent: 'center' }}
            onClick={() => onChange({ enabled: true, erase: false })}
          >
            <Trees size={12} /> Paint Props
          </button>
          <button
            type="button"
            className={brush.erase ? 'mf-primary' : 'mf-btn'}
            style={{ fontSize: 11.5, padding: '5px 8px', justifyContent: 'center' }}
            onClick={() => onChange({ enabled: true, erase: true })}
          >
            <Eraser size={12} /> Erase Props
          </button>
        </div>

        <div style={{ fontSize: 10.5, color: '#94a3b8', background: '#111720', padding: '5px 8px', borderRadius: 6, border: '1px solid #222b38' }}>
          Click &amp; drag in the 3D viewport to paint on <strong>Terrain</strong> heightmaps or <strong>any 3D Mesh</strong>.
        </div>

        {/* Sliders */}
        <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
          <span style={{ color: '#cbd5e1' }}>Brush Radius ({brush.radius.toFixed(1)}m)</span>
          <input
            type="range"
            min={0.5}
            max={24}
            step={0.5}
            value={brush.radius}
            onChange={(e) => onChange({ radius: Number(e.target.value) })}
            style={{ width: 125 }}
          />
        </label>

        <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
          <span style={{ color: '#cbd5e1' }}>Density ({brush.density} / stroke)</span>
          <input
            type="range"
            min={1}
            max={20}
            step={1}
            value={brush.density}
            onChange={(e) => onChange({ density: Math.round(Number(e.target.value)) })}
            style={{ width: 125 }}
          />
        </label>

        <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
          <span style={{ color: '#cbd5e1' }}>Min Spacing ({brush.spacing.toFixed(1)}m)</span>
          <input
            type="range"
            min={0.2}
            max={8}
            step={0.1}
            value={brush.spacing}
            onChange={(e) => onChange({ spacing: Number(e.target.value) })}
            style={{ width: 125 }}
          />
        </label>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 11 }}>
            <span style={{ color: '#94a3b8' }}>Scale Min</span>
            <input
              type="number"
              min={0.1}
              max={10}
              step={0.05}
              value={brush.scaleMin}
              onChange={(e) => onChange({ scaleMin: Math.max(0.1, Number(e.target.value) || 0.5) })}
            />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 11 }}>
            <span style={{ color: '#94a3b8' }}>Scale Max</span>
            <input
              type="number"
              min={0.1}
              max={10}
              step={0.05}
              value={brush.scaleMax}
              onChange={(e) => onChange({ scaleMax: Math.max(brush.scaleMin, Number(e.target.value) || 1.2) })}
            />
          </label>
        </div>

        <label style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 11.5, color: '#cbd5e1' }}>
          <input type="checkbox" checked={brush.randomYaw} onChange={(e) => onChange({ randomYaw: e.target.checked })} />
          Random Y Rotation (0–360°)
        </label>

        <label style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 11.5, color: '#cbd5e1' }}>
          <input type="checkbox" checked={brush.staticBatch} onChange={(e) => onChange({ staticBatch: e.target.checked })} />
          <Layers size={12} color="#38bdf8" /> Enable Static Batching on placed props
        </label>

        {/* Asset picker */}
        <div style={{ borderTop: '1px solid #242c37', paddingTop: 8 }}>
          <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 5 }}>
            Prefabs &amp; 3D Models to scatter ({brush.assets.length} selected):
          </div>
          {candidates.length === 0 ? (
            <div style={{ fontSize: 11, color: '#94a3b8', padding: '6px 8px', background: '#111720', borderRadius: 6 }}>
              No Prefabs or 3D Models yet — painting will scatter stylized primitive foliage/rocks automatically, or add a Prefab/Model to select it here.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 150, overflowY: 'auto' }}>
              {candidates.map((a) => {
                const picked = brush.assets.includes(a.id)
                return (
                  <label
                    key={a.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 7,
                      padding: '4px 7px',
                      borderRadius: 6,
                      background: picked ? 'rgba(74,222,128,0.14)' : '#111720',
                      border: '1px solid ' + (picked ? 'rgba(74,222,128,0.45)' : '#222b38'),
                      cursor: 'pointer',
                      fontSize: 11.5,
                    }}
                  >
                    <input type="checkbox" checked={picked} onChange={() => toggleAsset(a.id)} />
                    <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.name}</span>
                    <span style={{ fontSize: 9.5, color: '#94a3b8', textTransform: 'uppercase' }}>{a.type}</span>
                  </label>
                )
              })}
            </div>
          )}
        </div>

        {/* Footer stats + Clear */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid #242c37', paddingTop: 8 }}>
          <span style={{ fontSize: 11, color: '#94a3b8' }}>Scattered in scene: <b style={{ color: '#e6edf3' }}>{scatteredCount}</b></span>
          <button
            type="button"
            className="mf-btn"
            disabled={scatteredCount === 0}
            style={{ fontSize: 11, padding: '3px 8px' }}
            onClick={onClearAll}
          >
            <Trash2 size={11} /> Clear All
          </button>
        </div>
      </div>
    </div>
  )
}
