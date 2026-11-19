import type { Component } from './index'

export const terrainTools = [
  'Raise',
  'Lower',
  'Flatten',
  'Smooth',
  'Noise',
  'Terrace',
  'Paint',
  'Erase paint',
] as const
export type TerrainTool = (typeof terrainTools)[number]
export type TerrainPreset = 'flat' | 'hills' | 'valley' | 'crater' | 'ridge'

export interface Terrain extends Component {
  type: 'terrain'
  segments: number
  size: number
  heights: number[]
  layers: number[]
  baseMaterial: string
  paintMaterial: string
  tiling: number
}

export function makeTerrain(segments = 32): Terrain {
  return {
    type: 'terrain',
    segments,
    size: 16,
    tiling: 4,
    baseMaterial: '',
    paintMaterial: '',
    heights: Array((segments + 1) ** 2).fill(0),
    layers: Array(segments ** 2).fill(0),
  }
}

export function validTerrain(c: Component) {
  return (
    Number.isInteger(c.segments) &&
    c.segments >= 2 &&
    c.segments <= 128 &&
    Number.isFinite(c.size) &&
    c.size > 0 &&
    Number.isFinite(c.tiling) &&
    c.tiling > 0 &&
    Array.isArray(c.heights) &&
    c.heights.length === (c.segments + 1) ** 2 &&
    c.heights.every(Number.isFinite) &&
    Array.isArray(c.layers) &&
    c.layers.length === c.segments ** 2 &&
    c.layers.every((v: number) => v === 0 || v === 1)
  )
}

function hash2d(x: number, z: number): number {
  const n = Math.sin(x * 127.1 + z * 311.7) * 43758.5453123
  return n - Math.floor(n)
}

function valueNoise(x: number, z: number): number {
  const ix = Math.floor(x),
    iz = Math.floor(z)
  const fx = x - ix,
    fz = z - iz
  const ux = fx * fx * (3 - 2 * fx),
    uz = fz * fz * (3 - 2 * fz)
  const a = hash2d(ix, iz),
    b = hash2d(ix + 1, iz)
  const c = hash2d(ix, iz + 1),
    d = hash2d(ix + 1, iz + 1)
  return a + (b - a) * ux + (c - a) * uz + (a - b - c + d) * ux * uz
}

export function generateTerrainPreset(t: Terrain, preset: TerrainPreset, amplitude = 2.4) {
  const n = t.segments
  for (let z = 0; z <= n; z++) {
    for (let x = 0; x <= n; x++) {
      const nx = x / n - 0.5,
        nz = z / n - 0.5
      const dist = Math.hypot(nx, nz) * 2
      let h = 0
      if (preset === 'hills') {
        h =
          (valueNoise(x * 0.14, z * 0.14) * 0.65 +
            valueNoise(x * 0.32 + 11, z * 0.32 + 7) * 0.35 -
            0.45) *
          amplitude
      } else if (preset === 'valley') {
        h = Math.pow(Math.abs(nx * 2), 1.6) * amplitude + (valueNoise(x * 0.2, z * 0.2) - 0.5) * amplitude * 0.25
      } else if (preset === 'crater') {
        const rim = Math.exp(-Math.pow((dist - 0.62) * 4.5, 2)) * amplitude * 0.8
        const pit = Math.max(0, 1 - dist * 1.6) * -amplitude * 0.75
        h = rim + pit + (valueNoise(x * 0.25, z * 0.25) - 0.5) * amplitude * 0.15
      } else if (preset === 'ridge') {
        const ridge = (1 - Math.abs(nx * 2)) * amplitude
        h = Math.max(0, ridge) * (0.65 + 0.35 * valueNoise(x * 0.22, z * 0.22))
      }
      t.heights[z * (n + 1) + x] = Math.round(h * 1000) / 1000
    }
  }
}

export function autoPaintTerrain(t: Terrain, slopeThreshold = 0.35, heightThreshold = 999) {
  const n = t.segments
  const cellSize = t.size / n
  for (let z = 0; z < n; z++) {
    for (let x = 0; x < n; x++) {
      const h00 = t.heights[z * (n + 1) + x]
      const h10 = t.heights[z * (n + 1) + x + 1]
      const h01 = t.heights[(z + 1) * (n + 1) + x]
      const h11 = t.heights[(z + 1) * (n + 1) + x + 1]
      const avg = (h00 + h10 + h01 + h11) * 0.25
      const dx = Math.abs(h10 - h00) / cellSize
      const dz = Math.abs(h01 - h00) / cellSize
      const slope = Math.hypot(dx, dz)
      t.layers[z * n + x] = slope >= slopeThreshold || avg >= heightThreshold ? 1 : 0
    }
  }
}

// Coordinates and brush radius are measured in grid cells, independently of the terrain's transform.
export function brushTerrain(
  t: Terrain,
  tool: TerrainTool,
  x: number,
  z: number,
  radius: number,
  strength: number,
  level: number,
  falloff = 1,
) {
  const paint = tool === 'Paint' || tool === 'Erase paint'
  const width = t.segments + (paint ? 0 : 1)
  const heights = tool === 'Smooth' ? t.heights.slice() : t.heights
  for (let j = Math.max(0, Math.floor(z - radius)); j <= Math.min(width - 1, Math.ceil(z + radius)); j++) {
    for (let i = Math.max(0, Math.floor(x - radius)); i <= Math.min(width - 1, Math.ceil(x + radius)); i++) {
      const offset = paint ? 0.5 : 0
      const distance = Math.hypot(i + offset - x, j + offset - z)
      if (distance > radius) continue
      const k = j * width + i
      if (paint) {
        t.layers[k] = Number(tool === 'Paint')
        continue
      }
      const norm = Math.max(0, 1 - distance / radius)
      const weight = Math.pow(norm, Math.max(0.1, falloff)) * strength
      if (tool === 'Raise' || tool === 'Lower') {
        t.heights[k] += (tool === 'Raise' ? 1 : -1) * weight
      } else if (tool === 'Noise') {
        const delta = (valueNoise(i * 0.35 + x * 0.05, j * 0.35 + z * 0.05) - 0.5) * 2
        t.heights[k] += delta * weight
      } else if (tool === 'Terrace') {
        const step = Math.max(0.1, Math.abs(level) || 0.5)
        const snapped = Math.round(heights[k] / step) * step
        t.heights[k] += (snapped - heights[k]) * Math.min(1, weight)
      } else {
        const target =
          tool === 'Flatten'
            ? level
            : (heights[j * width + Math.max(0, i - 1)] +
                heights[j * width + Math.min(width - 1, i + 1)] +
                heights[Math.max(0, j - 1) * width + i] +
                heights[Math.min(width - 1, j + 1) * width + i]) /
              4
        t.heights[k] += (target - heights[k]) * Math.min(1, weight)
      }
    }
  }
}
