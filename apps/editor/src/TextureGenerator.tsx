import { useEffect, useRef, useState } from 'react'
import { Shuffle, Layers, Sparkles } from 'lucide-react'
import { uid, type Asset, type Project } from '../../../packages/project-schema/src'
import { Field, Numeric, Color } from './Fields'

export type TexPattern =
  | 'concrete'
  | 'panel'
  | 'brick'
  | 'tile'
  | 'asphalt'
  | 'rust'
  | 'wood'
  | 'snow'
  | 'checker'
  | 'noise'

export interface ProceduralTextureConfig {
  pattern: TexPattern
  baseColor: string
  accentColor: string
  asNormalMap: boolean
  normalStrength: number
  scale: number
  grain: number
  contrast: number
  seed: number
  resolution: number
}

export const defaultProceduralTexture = (): ProceduralTextureConfig => ({
  pattern: 'concrete',
  baseColor: '#8d9499',
  accentColor: '#4c5258',
  asNormalMap: false,
  normalStrength: 2.4,
  scale: 2,
  grain: 0.35,
  contrast: 1.0,
  seed: 42,
  resolution: 256,
})

const PATTERNS: { id: TexPattern; label: string }[] = [
  { id: 'concrete', label: 'Concrete / Бетон' },
  { id: 'panel', label: 'Panel / Панелька' },
  { id: 'brick', label: 'Brick / Кирпич' },
  { id: 'tile', label: 'Tiles / Плитка' },
  { id: 'asphalt', label: 'Asphalt / Асфальт' },
  { id: 'rust', label: 'Rust / Ржавчина' },
  { id: 'wood', label: 'Wood / Дерево' },
  { id: 'snow', label: 'Snow / Снег' },
  { id: 'checker', label: 'Checker / Сетка' },
  { id: 'noise', label: 'Noise / Шум' },
]

function parseHex(hex: string): [number, number, number] {
  const c = (hex || '#888888').replace('#', '')
  const f = c.length === 3 ? c.split('').map((v) => v + v).join('') : c.padEnd(6, '0')
  return [parseInt(f.slice(0, 2), 16) || 0, parseInt(f.slice(2, 4), 16) || 0, parseInt(f.slice(4, 6), 16) || 0]
}

function hash2(x: number, y: number, seed: number): number {
  const s = Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453123
  return s - Math.floor(s)
}

function tileNoise(u: number, v: number, freq: number, seed: number): number {
  const fx = u * freq
  const fy = v * freq
  const ix = Math.floor(fx)
  const iy = Math.floor(fy)
  const tx = fx - ix
  const ty = fy - iy
  const sx = tx * tx * (3 - 2 * tx)
  const sy = ty * ty * (3 - 2 * ty)
  const x0 = ((ix % freq) + freq) % freq
  const y0 = ((iy % freq) + freq) % freq
  const x1 = (x0 + 1) % freq
  const y1 = (y0 + 1) % freq
  const a = hash2(x0, y0, seed)
  const b = hash2(x1, y0, seed)
  const c = hash2(x0, y1, seed)
  const d = hash2(x1, y1, seed)
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy
}

export function renderProceduralTextureDataUrl(cfg: ProceduralTextureConfig, forceNormal = false): string {
  const size = Math.max(64, Math.min(512, cfg.resolution || 256))
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d')!
  const img = ctx.createImageData(size, size)
  const data = img.data
  const heights = new Float32Array(size * size)
  const c1 = parseHex(cfg.baseColor)
  const c2 = parseHex(cfg.accentColor)
  const scale = Math.max(1, Math.round(cfg.scale || 2))
  const grain = Math.max(0, Math.min(1, cfg.grain ?? 0.35))
  const contrast = Math.max(0.2, Math.min(3, cfg.contrast ?? 1))
  const seed = cfg.seed || 42
  const asNormal = forceNormal || cfg.asNormalMap

  for (let y = 0; y < size; y++) {
    const v = y / size
    for (let x = 0; x < size; x++) {
      const u = x / size
      const idx = y * size + x
      const f1 = tileNoise(u, v, 8 * scale, seed)
      const f2 = tileNoise(u, v, 16 * scale, seed + 13)
      const f3 = tileNoise(u, v, 32 * scale, seed + 29)
      const fbm = f1 * 0.52 + f2 * 0.31 + f3 * 0.17
      const fine = hash2(x, y, seed)
      let mix = fbm
      let h = fbm

      if (cfg.pattern === 'concrete') {
        mix = fbm * (1 - grain * 0.4) + fine * grain * 0.4
        h = mix
      } else if (cfg.pattern === 'asphalt') {
        const sp = fine * 0.6 + f3 * 0.4
        mix = sp > 0.7 ? 0.88 : sp * 0.48
        h = sp
      } else if (cfg.pattern === 'brick') {
        const rows = 4 * scale
        const cols = 2 * scale
        const ry = (v * rows) % 1
        const rowIdx = Math.floor(v * rows)
        const rx = (u * cols + (rowIdx % 2) * 0.5) % 1
        const mortar = rx < 0.06 || ry < 0.12
        mix = mortar ? 0.92 : 0.12 + f1 * 0.35 + fine * grain * 0.3
        h = mortar ? 0.12 : 0.78 + f2 * 0.15
      } else if (cfg.pattern === 'tile') {
        const t = 2 * scale
        const tx = (u * t) % 1
        const ty = (v * t) % 1
        const grout = tx < 0.05 || ty < 0.05
        mix = grout ? 0.95 : 0.15 + f1 * 0.22 + fine * grain * 0.15
        h = grout ? 0.08 : 0.85 + f2 * 0.08
      } else if (cfg.pattern === 'panel') {
        const t = scale
        const tx = (u * t) % 1
        const ty = (v * t) % 1
        const seam = tx < 0.035 || ty < 0.035
        mix = seam ? 0.94 : 0.18 + fbm * 0.4 + fine * grain * 0.2
        h = seam ? 0.06 : 0.75 + fbm * 0.2
      } else if (cfg.pattern === 'rust') {
        const patch = f1 * 0.65 + f2 * 0.35
        mix = patch > 0.5 ? 0.78 + fine * 0.2 : 0.12 + f3 * 0.25
        h = patch
      } else if (cfg.pattern === 'wood') {
        const rings = Math.sin((u * 12 * scale + f1 * 2.5) * Math.PI * 2) * 0.5 + 0.5
        mix = rings * 0.7 + f2 * 0.3
        h = mix
      } else if (cfg.pattern === 'snow') {
        const drift = f1 * 0.7 + f2 * 0.2 + fine * 0.1
        mix = 0.15 + drift * 0.45
        h = drift
      } else if (cfg.pattern === 'checker') {
        const c = 4 * scale
        const chk = (Math.floor(u * c) + Math.floor(v * c)) % 2
        mix = chk ? 0.85 - fine * grain * 0.15 : 0.15 + fine * grain * 0.15
        h = chk ? 0.85 : 0.25
      } else {
        mix = fbm * (1 - grain * 0.5) + fine * grain * 0.5
        h = mix
      }

      mix = Math.max(0, Math.min(1, (mix - 0.5) * contrast + 0.5))
      heights[idx] = Math.max(0, Math.min(1, (h - 0.5) * contrast + 0.5))

      if (!asNormal) {
        const o = idx * 4
        data[o] = Math.round(c1[0] + (c2[0] - c1[0]) * mix)
        data[o + 1] = Math.round(c1[1] + (c2[1] - c1[1]) * mix)
        data[o + 2] = Math.round(c1[2] + (c2[2] - c1[2]) * mix)
        data[o + 3] = 255
      }
    }
  }

  if (asNormal) {
    const str = Math.max(0.2, Math.min(10, cfg.normalStrength ?? 2.4))
    const sample = (sx: number, sy: number) => heights[((sy + size) % size) * size + ((sx + size) % size)]
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const tl = sample(x - 1, y - 1), t = sample(x, y - 1), tr = sample(x + 1, y - 1)
        const l = sample(x - 1, y), r = sample(x + 1, y)
        const bl = sample(x - 1, y + 1), b = sample(x, y + 1), br = sample(x + 1, y + 1)
        const gx = (tr + 2 * r + br - (tl + 2 * l + bl)) * str
        const gy = (bl + 2 * b + br - (tl + 2 * t + tr)) * str
        const gz = 1
        const len = Math.hypot(gx, gy, gz) || 1
        const o = (y * size + x) * 4
        data[o] = Math.round((-gx / len * 0.5 + 0.5) * 255)
        data[o + 1] = Math.round((-gy / len * 0.5 + 0.5) * 255)
        data[o + 2] = Math.round((gz / len * 0.5 + 0.5) * 255)
        data[o + 3] = 255
      }
    }
  }

  ctx.putImageData(img, 0, 0)
  return canvas.toDataURL('image/png')
}

export function TextureGenerator({
  a,
  changeA,
  edit,
}: {
  a: Asset
  changeA: (fn: (asset: Asset) => void) => void
  edit: (fn: (p: Project) => void) => void
}) {
  const cfg: ProceduralTextureConfig = {
    ...defaultProceduralTexture(),
    ...(a.properties?.procedural || {}),
  }
  const [tilePreview, setTilePreview] = useState(false)
  const [savedNormalNote, setSavedNormalNote] = useState('')
  const mounted = useRef(false)

  const updateCfg = (patch: Partial<ProceduralTextureConfig>) => {
    const next = { ...cfg, ...patch }
    const url = renderProceduralTextureDataUrl(next)
    changeA((asset) => {
      asset.data = url
      asset.properties = { ...(asset.properties || {}), procedural: next, isNormalMap: next.asNormalMap }
    })
  }

  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true
      if (!a.data) updateCfg({})
    }
  }, [])

  const savePairedNormal = () => {
    const normalUrl = renderProceduralTextureDataUrl(cfg, true)
    const normalName = a.name.replace(/\.png$/i, '') + ' (Normal)'
    edit((proj) => {
      proj.assets.push({
        id: uid('tex'),
        name: normalName,
        type: 'texture',
        data: normalUrl,
        properties: {
          procedural: { ...cfg, asNormalMap: true },
          isNormalMap: true,
        },
      })
    })
    setSavedNormalNote(`Saved "${normalName}" to Assets`)
    setTimeout(() => setSavedNormalNote(''), 2600)
  }

  return (
    <div className="mf-particle-editor">
      <div className="mf-particle-preview-col">
        <div
          style={{
            width: '100%',
            height: 260,
            borderRadius: 8,
            border: '1px solid rgba(255,255,255,0.14)',
            backgroundImage: a.data ? `url(${a.data})` : undefined,
            backgroundSize: tilePreview ? '50% 50%' : '100% 100%',
            backgroundRepeat: 'repeat',
            backgroundColor: '#12171f',
          }}
        />
        <div className="mf-particle-toolbar">
          <button type="button" className="mf-btn" onClick={() => setTilePreview((v) => !v)}>
            <Layers size={12} /> {tilePreview ? '2×2 Tile: ON' : '1×1 View'}
          </button>
          <button
            type="button"
            className="mf-btn"
            onClick={() => updateCfg({ seed: Math.floor(Math.random() * 9999) })}
          >
            <Shuffle size={12} /> Random Seed
          </button>
          {!cfg.asNormalMap && (
            <button type="button" className="mf-btn" onClick={savePairedNormal}>
              <Sparkles size={12} /> + Save Normal Map
            </button>
          )}
        </div>
        {savedNormalNote && <small style={{ color: '#7ee787' }}>{savedNormalNote}</small>}
      </div>

      <div className="mf-particle-params-col">
        <div className="mf-minor-label">Pattern &amp; Output Mode</div>
        <Field label="Pattern">
          <select value={cfg.pattern} onChange={(e) => updateCfg({ pattern: e.target.value as TexPattern })}>
            {PATTERNS.map((pt) => (
              <option key={pt.id} value={pt.id}>
                {pt.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="As Normal Map">
          <input
            type="checkbox"
            checked={Boolean(cfg.asNormalMap)}
            onChange={(e) => updateCfg({ asNormalMap: e.target.checked })}
          />
        </Field>
        {cfg.asNormalMap && (
          <Field label="Normal strength">
            <Numeric
              label="Normal strength"
              value={cfg.normalStrength}
              min={0.2}
              max={8}
              step={0.2}
              change={(v) => updateCfg({ normalStrength: v })}
            />
          </Field>
        )}
        <Field label="Resolution">
          <select
            value={cfg.resolution}
            onChange={(e) => updateCfg({ resolution: Number(e.target.value) })}
          >
            <option value={128}>128 × 128</option>
            <option value={256}>256 × 256</option>
            <option value={512}>512 × 512</option>
          </select>
        </Field>

        <div className="mf-minor-label">Colors &amp; Detail</div>
        {!cfg.asNormalMap && (
          <>
            <Field label="Base color">
              <Color label="Base color" value={cfg.baseColor} change={(v) => updateCfg({ baseColor: v })} />
            </Field>
            <Field label="Accent / grout">
              <Color label="Accent color" value={cfg.accentColor} change={(v) => updateCfg({ accentColor: v })} />
            </Field>
          </>
        )}
        <Field label="Pattern scale">
          <Numeric label="Scale" value={cfg.scale} min={1} max={8} step={1} change={(v) => updateCfg({ scale: Math.round(v) })} />
        </Field>
        <Field label="Grain / noise">
          <Numeric label="Grain" value={cfg.grain} min={0} max={1} step={0.05} change={(v) => updateCfg({ grain: v })} />
        </Field>
        <Field label="Contrast">
          <Numeric label="Contrast" value={cfg.contrast} min={0.3} max={2.5} step={0.1} change={(v) => updateCfg({ contrast: v })} />
        </Field>
        <Field label="Seed">
          <Numeric label="Seed" value={cfg.seed} min={0} max={99999} step={1} change={(v) => updateCfg({ seed: Math.round(v) })} />
        </Field>
      </div>
    </div>
  )
}
