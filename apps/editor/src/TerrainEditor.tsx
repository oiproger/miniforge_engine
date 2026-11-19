import { useEffect, useRef, useState, type PointerEvent } from 'react'
import {
  autoPaintTerrain,
  brushTerrain,
  generateTerrainPreset,
  terrainTools,
  type Terrain,
  type TerrainPreset,
  type TerrainTool,
} from '../../../packages/project-schema/src/terrain'
import type { Asset } from '../../../packages/project-schema/src'
import { Field, Numeric } from './Fields'

const terrainPresets: { id: TerrainPreset; label: string }[] = [
  { id: 'flat', label: 'Flat' },
  { id: 'hills', label: 'Hills' },
  { id: 'valley', label: 'Valley' },
  { id: 'crater', label: 'Crater' },
  { id: 'ridge', label: 'Ridge' },
]

function draw(canvas: HTMLCanvasElement, t: Terrain) {
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const n = t.segments,
    cell = canvas.width / n
  for (let z = 0; z < n; z++)
    for (let x = 0; x < n; x++) {
      const h = t.heights[z * (n + 1) + x],
        east = t.heights[z * (n + 1) + x + 1]
      const light = Math.min(82, Math.max(15, 45 + 4 * h + 8 * (east - h)))
      ctx.fillStyle = 'hsl(' + (t.layers[z * n + x] ? 32 : 92) + ' 30% ' + light + '%)'
      ctx.fillRect(x * cell, z * cell, cell + 0.5, cell + 0.5)
    }
}
export function TerrainEditor({
  terrain,
  assets,
  change,
}: {
  terrain: Terrain
  assets: Asset[]
  change: (patch: Partial<Terrain>) => void
}) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const stroke = useRef<{ data: Terrain; x: number; z: number; pointer: number } | null>(null)
  const [tool, setTool] = useState<TerrainTool>('Raise'),
    [radius, setRadius] = useState(3),
    [strength, setStrength] = useState(0.35),
    [falloff, setFalloff] = useState(1.2),
    [level, setLevel] = useState(0.5),
    [amplitude, setAmplitude] = useState(2.4),
    [slopeThreshold, setSlopeThreshold] = useState(0.35)
  useEffect(() => {
    stroke.current = null
    if (canvas.current) draw(canvas.current, terrain)
  }, [terrain])
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
      )
    }
    s.x = x
    s.z = z
    draw(el, s.data)
  }
  function finish(e: PointerEvent<HTMLCanvasElement>) {
    const s = stroke.current
    if (s?.pointer !== e.pointerId) return
    stroke.current = null
    change({ heights: s.data.heights, layers: s.data.layers })
  }
  function applyPreset(preset: TerrainPreset) {
    const copy = structuredClone(terrain)
    generateTerrainPreset(copy, preset, amplitude)
    change({ heights: copy.heights })
  }
  function applyAutoPaint() {
    const copy = structuredClone(terrain)
    autoPaintTerrain(copy, slopeThreshold)
    change({ layers: copy.layers })
  }
  return (
    <>
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
        title="Drag to brush the terrain"
        style={{ width: '100%', display: 'block', touchAction: 'none', cursor: 'crosshair' }}
        onPointerDown={(e) => stamp(e, true)}
        onPointerMove={(e) => stamp(e)}
        onPointerUp={finish}
        onLostPointerCapture={finish}
      />
      <Field label="Radius (cells)">
        <Numeric label="Brush radius" value={radius} min={1} max={terrain.segments} change={setRadius} />
      </Field>
      <Field label="Strength">
        <Numeric label="Brush strength" value={strength} min={0.01} max={1} change={setStrength} />
      </Field>
      <Field label="Brush falloff">
        <Numeric label="Brush falloff" value={falloff} min={0.1} max={4} step={0.1} change={setFalloff} />
      </Field>
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
      <Field label="Terrain size">
        <Numeric label="Terrain size" value={terrain.size} min={0.1} change={(size) => change({ size })} />
      </Field>
      <Field label="Texture repeat">
        <Numeric
          label="Texture repeat"
          value={terrain.tiling}
          min={0.1}
          change={(tiling) => change({ tiling })}
        />
      </Field>
      {(['baseMaterial', 'paintMaterial'] as const).map((key) => (
        <Field key={key} label={key === 'baseMaterial' ? 'Base material' : 'Paint material'}>
          <select value={terrain[key]} onChange={(e) => change({ [key]: e.target.value })}>
            <option value="">Default</option>
            {assets
              .filter((a) => a.type === 'material')
              .map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
          </select>
        </Field>
      ))}
    </>
  )
}
