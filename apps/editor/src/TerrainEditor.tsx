import { useEffect, useRef, useState, type PointerEvent } from 'react'
import { Plus, Trash2, Paintbrush } from 'lucide-react'
import {
  addTerrainMaterialLayer,
  autoPaintTerrain,
  brushTerrain,
  ensureTerrainLayers,
  generateTerrainPreset,
  removeTerrainMaterialLayer,
  resizeTerrain,
  terrainTools,
  type Terrain,
  type TerrainPreset,
  type TerrainTool,
} from '../../../packages/project-schema/src/terrain'
import type { Asset } from '../../../packages/project-schema/src'
import type { TerrainBrushConfig } from '../../../packages/editor-tools/src'
import { Field, Numeric } from './Fields'

const terrainPresets: { id: TerrainPreset; label: string }[] = [
  { id: 'flat', label: 'Flat' },
  { id: 'hills', label: 'Hills' },
  { id: 'valley', label: 'Valley' },
  { id: 'crater', label: 'Crater' },
  { id: 'ridge', label: 'Ridge' },
]

const fallbackColors = ['#6b8352', '#9e7d54', '#6d737a', '#d5dde3', '#524b44', '#8e6243', '#495a47', '#b59d78']

function hexRgb(hex: string): [number, number, number] {
  const c = (hex || '#888888').replace('#', '')
  const f = c.length === 3 ? c.split('').map((v) => v + v).join('') : c.padEnd(6, '8')
  const n = parseInt(f.slice(0, 6), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

function draw(canvas: HTMLCanvasElement, t: Terrain, assets: Asset[]) {
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const copy = structuredClone(t)
  const { materials, splatWeights } = ensureTerrainLayers(copy)
  const rgbs = materials.map((id, i) => {
    const col = assets.find((a) => a.id === id && a.type === 'material')?.properties?.color
    return hexRgb(col || fallbackColors[i % fallbackColors.length])
  })
  const n = copy.segments,
    cell = canvas.width / n
  for (let z = 0; z < n; z++) {
    for (let x = 0; x < n; x++) {
      const vi = z * (n + 1) + x
      const h = copy.heights[vi],
        east = copy.heights[vi + 1]
      const shade = Math.min(1.45, Math.max(0.45, 0.85 + 0.08 * h + 0.16 * (east - h)))
      let r = 0, g = 0, b = 0, sum = 0
      for (let l = 0; l < rgbs.length; l++) {
        const w = splatWeights[l][vi]
        if (w <= 0) continue
        r += rgbs[l][0] * w
        g += rgbs[l][1] * w
        b += rgbs[l][2] * w
        sum += w
      }
      if (sum <= 1e-4) {
        r = rgbs[0][0]; g = rgbs[0][1]; b = rgbs[0][2]; sum = 1
      }
      ctx.fillStyle = `rgb(${Math.min(255, Math.round((r / sum) * shade))},${Math.min(255, Math.round((g / sum) * shade))},${Math.min(255, Math.round((b / sum) * shade))})`
      ctx.fillRect(x * cell, z * cell, cell + 0.6, cell + 0.6)
    }
  }
}

export function TerrainEditor({
  terrain,
  assets,
  change,
  brush,
  onBrushChange,
}: {
  terrain: Terrain
  assets: Asset[]
  change: (patch: Partial<Terrain>) => void
  brush?: TerrainBrushConfig
  onBrushChange?: (patch: Partial<TerrainBrushConfig>) => void
}) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const stroke = useRef<{ data: Terrain; x: number; z: number; pointer: number } | null>(null)
  const [localTool, setLocalTool] = useState<TerrainTool>('Raise')
  const [localRadius, setLocalRadius] = useState(3)
  const [localStrength, setLocalStrength] = useState(0.35)
  const [localFalloff, setLocalFalloff] = useState(1.2)
  const [localHardness, setLocalHardness] = useState(0.5)
  const [localLevel, setLocalLevel] = useState(0.5)
  const [localLayer, setLocalLayer] = useState(1)
  const [amplitude, setAmplitude] = useState(2.4)
  const [slopeThreshold, setSlopeThreshold] = useState(0.35)

  const tool = brush?.tool ?? localTool
  const radius = brush?.radius ?? localRadius
  const strength = brush?.strength ?? localStrength
  const falloff = brush?.falloff ?? localFalloff
  const hardness = brush?.hardness ?? localHardness
  const level = brush?.level ?? localLevel
  const activeLayer = brush?.activeLayer ?? localLayer

  const setTool = (v: TerrainTool) => { setLocalTool(v); onBrushChange?.({ tool: v }) }
  const setRadius = (v: number) => { setLocalRadius(v); onBrushChange?.({ radius: v }) }
  const setStrength = (v: number) => { setLocalStrength(v); onBrushChange?.({ strength: v }) }
  const setFalloff = (v: number) => { setLocalFalloff(v); onBrushChange?.({ falloff: v }) }
  const setHardness = (v: number) => { setLocalHardness(v); onBrushChange?.({ hardness: v }) }
  const setLevel = (v: number) => { setLocalLevel(v); onBrushChange?.({ level: v }) }
  const setActiveLayer = (v: number) => { setLocalLayer(v); onBrushChange?.({ activeLayer: v }) }

  const copyForLayers = structuredClone(terrain)
  const { materials, layerSoftness } = ensureTerrainLayers(copyForLayers)
  const matAssets = assets.filter((a) => a.type === 'material')

  useEffect(() => {
    stroke.current = null
    if (canvas.current) draw(canvas.current, terrain, assets)
  }, [terrain, assets])

  function stamp(e: PointerEvent<HTMLCanvasElement>, start = false) {
    const el = e.currentTarget,
      rect = el.getBoundingClientRect()
    const x = ((e.clientX - rect.left) * terrain.segments) / rect.width,
      z = ((e.clientY - rect.top) * terrain.segments) / rect.height
    if (start) {
      if (e.button !== 0 || stroke.current) return
      el.setPointerCapture(e.pointerId)
      stroke.current = { data: structuredClone(terrain), x, z, pointer: e.pointerId }
    }
    const s = stroke.current
    if (!s || s.pointer !== e.pointerId) return
    const count = Math.ceil(Math.hypot(x - s.x, z - s.z) / Math.max(0.5, radius / 2))
    for (let i = 1; i <= Math.max(Number(start), count); i++) {
      const fraction = count ? i / count : 1
      brushTerrain(
        s.data,
        tool,
        s.x + (x - s.x) * fraction,
        s.z + (z - s.z) * fraction,
        radius,
        strength,
        level,
        falloff,
        activeLayer,
        hardness,
      )
    }
    s.x = x
    s.z = z
    draw(el, s.data, assets)
  }

  function finish(e: PointerEvent<HTMLCanvasElement>) {
    const s = stroke.current
    if (s?.pointer !== e.pointerId) return
    stroke.current = null
    change({ heights: s.data.heights, layers: s.data.layers, splatWeights: s.data.splatWeights })
  }

  function applyPreset(preset: TerrainPreset) {
    const copy = structuredClone(terrain)
    generateTerrainPreset(copy, preset, amplitude)
    change({ heights: copy.heights })
  }

  function applyAutoPaint() {
    const copy = structuredClone(terrain)
    autoPaintTerrain(copy, slopeThreshold, 999, Math.max(1, activeLayer))
    change({ layers: copy.layers, splatWeights: copy.splatWeights })
  }

  function addLayer() {
    const copy = structuredClone(terrain)
    const idx = addTerrainMaterialLayer(copy, '', 0.5)
    change({
      materials: copy.materials,
      splatWeights: copy.splatWeights,
      layerSoftness: copy.layerSoftness,
      baseMaterial: copy.baseMaterial,
      paintMaterial: copy.paintMaterial,
    })
    setActiveLayer(idx)
  }

  function removeLayer(idx: number) {
    const copy = structuredClone(terrain)
    removeTerrainMaterialLayer(copy, idx)
    change({
      materials: copy.materials,
      splatWeights: copy.splatWeights,
      layerSoftness: copy.layerSoftness,
      baseMaterial: copy.baseMaterial,
      paintMaterial: copy.paintMaterial,
    })
    if (activeLayer >= (copy.materials?.length ?? 1)) setActiveLayer(Math.max(0, (copy.materials?.length ?? 1) - 1))
  }

  function updateLayerMat(idx: number, matId: string) {
    const copy = structuredClone(terrain)
    const ld = ensureTerrainLayers(copy)
    ld.materials[idx] = matId
    copy.baseMaterial = ld.materials[0] || ''
    copy.paintMaterial = ld.materials[1] || ''
    change({
      materials: ld.materials,
      splatWeights: ld.splatWeights,
      layerSoftness: ld.layerSoftness,
      baseMaterial: copy.baseMaterial,
      paintMaterial: copy.paintMaterial,
    })
  }

  function updateLayerSoftness(idx: number, softness: number) {
    const copy = structuredClone(terrain)
    const ld = ensureTerrainLayers(copy)
    ld.layerSoftness[idx] = Math.max(0, Math.min(1, softness))
    change({ layerSoftness: ld.layerSoftness, materials: ld.materials, splatWeights: ld.splatWeights })
  }

  return (
    <>
      {onBrushChange && brush && (
        <div className="mf-row" style={{ marginBottom: 8 }}>
          <button
            type="button"
            className="mf-btn"
            style={{
              width: '100%',
              justifyContent: 'center',
              borderColor: brush.enabled ? '#58d8ff' : undefined,
              background: brush.enabled ? 'rgba(88, 216, 255, 0.2)' : undefined,
              color: brush.enabled ? '#9ce9ff' : undefined,
              fontWeight: 600,
            }}
            onClick={() => onBrushChange({ enabled: !brush.enabled })}
          >
            <Paintbrush size={13} />
            {brush.enabled ? '3D Viewport Brush: ON (LMB drag)' : 'Edit in 3D Viewport'}
          </button>
        </div>
      )}
      <Field label="Terrain tool">
        <select value={tool} onChange={(e) => setTool(e.target.value as TerrainTool)}>
          {terrainTools.map((k) => (
            <option key={k}>{k}</option>
          ))}
        </select>
      </Field>
      <canvas
        ref={canvas}
        width={320}
        height={320}
        aria-label="Terrain brush map"
        title="Drag to brush the terrain (or use 3D Viewport Brush)"
        style={{ width: '100%', display: 'block', touchAction: 'none', cursor: 'crosshair', borderRadius: 6 }}
        onPointerDown={(e) => stamp(e, true)}
        onPointerMove={(e) => stamp(e)}
        onPointerUp={finish}
        onLostPointerCapture={finish}
      />
      <Field label="Radius (cells)">
        <Numeric label="Brush radius" value={radius} min={0.5} max={terrain.segments} step={0.5} change={setRadius} />
      </Field>
      <Field label="Strength">
        <Numeric label="Brush strength" value={strength} min={0.01} max={1} step={0.05} change={setStrength} />
      </Field>
      <Field label="Sculpt falloff">
        <Numeric label="Brush falloff" value={falloff} min={0.1} max={4} step={0.1} change={setFalloff} />
      </Field>
      {(tool === 'Paint' || tool === 'Erase paint') && (
        <Field label="Paint hardness">
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%' }}>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={hardness}
              onChange={(e) => setHardness(Number(e.target.value))}
              style={{ flex: 1 }}
            />
            <small style={{ minWidth: 34, textAlign: 'right' }}>{hardness.toFixed(2)}</small>
          </div>
        </Field>
      )}
      {(tool === 'Flatten' || tool === 'Terrace') && (
        <Field label={tool === 'Terrace' ? 'Step height' : 'Target height'}>
          <Numeric label="Target height" value={level} change={setLevel} />
        </Field>
      )}
      <Field label="Generator amplitude">
        <Numeric label="Generator amplitude" value={amplitude} min={0.2} max={16} change={setAmplitude} />
      </Field>
      <div className="mf-presets" style={{ marginBottom: 6 }}>
        {terrainPresets.map((p) => (
          <button key={p.id} type="button" onClick={() => applyPreset(p.id)}>
            {p.label}
          </button>
        ))}
      </div>
      <Field label="Auto-paint slope">
        <div className="mf-pair">
          <Numeric
            label="Slope threshold"
            value={slopeThreshold}
            min={0.05}
            max={3}
            step={0.05}
            change={setSlopeThreshold}
          />
          <button type="button" className="mf-secondary" onClick={applyAutoPaint}>
            Auto-paint
          </button>
        </div>
      </Field>
      <Field label="Grid resolution">
        <select
          aria-label="Terrain grid resolution"
          value={terrain.segments}
          onChange={(e) => {
            const copy = structuredClone(terrain)
            resizeTerrain(copy, Number(e.target.value), terrain.size)
            change({
              segments: copy.segments,
              heights: copy.heights,
              layers: copy.layers,
              splatWeights: copy.splatWeights,
              layerSoftness: copy.layerSoftness,
            })
          }}
        >
          {[16, 24, 32, 48, 64, 96, 128].map((seg) => (
            <option key={seg} value={seg}>
              {seg} × {seg} cells
            </option>
          ))}
        </select>
      </Field>
      <Field label="Terrain size (m)">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, width: '100%' }}>
          <Numeric label="Terrain size" value={terrain.size} min={2} max={512} step={2} change={(size) => change({ size })} />
          <div style={{ display: 'flex', gap: 4 }}>
            {[16, 32, 64, 128].map((sz) => (
              <button key={sz} type="button" className="mf-preset-chip" onClick={() => change({ size: sz })}>
                {sz}m
              </button>
            ))}
          </div>
        </div>
      </Field>
      <Field label="Texture repeat">
        <Numeric
          label="Texture repeat"
          value={terrain.tiling}
          min={0.1}
          change={(tiling) => change({ tiling })}
        />
      </Field>

      <div className="mf-minor-label" style={{ justifyContent: 'space-between', marginTop: 10 }}>
        <span>Material Layers ({materials.length})</span>
        <button type="button" className="mf-btn" onClick={addLayer}>
          <Plus size={12} /> Add Layer
        </button>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {materials.map((matId, idx) => {
          const mat = matAssets.find((a) => a.id === matId)
          const swatch = mat?.properties?.color || fallbackColors[idx % fallbackColors.length]
          const isSelected = activeLayer === idx
          const soft = layerSoftness[idx] ?? 0.5
          return (
            <div
              key={idx}
              style={{
                padding: 6,
                borderRadius: 6,
                background: isSelected ? 'rgba(255, 184, 77, 0.12)' : 'rgba(255,255,255,0.03)',
                border: '1px solid ' + (isSelected ? 'rgba(255, 184, 77, 0.5)' : 'rgba(255,255,255,0.09)'),
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                <span
                  style={{
                    width: 14,
                    height: 14,
                    borderRadius: 4,
                    background: swatch,
                    border: '1px solid rgba(255,255,255,0.35)',
                    flexShrink: 0,
                  }}
                />
                <button
                  type="button"
                  onClick={() => {
                    setActiveLayer(idx)
                    if (tool !== 'Paint' && tool !== 'Erase paint') setTool('Paint')
                  }}
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    padding: '1px 6px',
                    borderRadius: 4,
                    border: 'none',
                    cursor: 'pointer',
                    background: isSelected ? '#ffb84d' : 'rgba(255,255,255,0.1)',
                    color: isSelected ? '#14181f' : '#d5dee8',
                  }}
                >
                  {idx === 0 ? 'Base' : `L${idx}`}
                </button>
                <select
                  aria-label={`Layer ${idx} material`}
                  value={matId}
                  onChange={(e) => updateLayerMat(idx, e.target.value)}
                  style={{ flex: 1, minWidth: 0 }}
                >
                  <option value="">Default</option>
                  {matAssets.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
                {idx > 0 && (
                  <button
                    type="button"
                    title="Remove material layer"
                    onClick={() => removeLayer(idx)}
                    style={{ background: 'transparent', border: 'none', color: '#e68177', cursor: 'pointer', padding: 2 }}
                  >
                    <Trash2 size={13} />
                  </button>
                )}
              </div>
              {idx > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10.5, color: '#9eb0c4' }}>
                  <span>Hard</span>
                  <input
                    type="range"
                    aria-label={`Layer ${idx} blend softness`}
                    min={0}
                    max={1}
                    step={0.05}
                    value={soft}
                    onChange={(e) => updateLayerSoftness(idx, Number(e.target.value))}
                    style={{ flex: 1 }}
                  />
                  <span>Soft ({soft.toFixed(2)})</span>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </>
  )
}
