import type { Component } from './index'

export const terrainTools = ['Raise', 'Lower', 'Flatten', 'Smooth', 'Paint', 'Erase paint'] as const
export type TerrainTool = (typeof terrainTools)[number]
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

// Coordinates and brush radius are measured in grid cells, independently of the terrain's transform.
export function brushTerrain(
  t: Terrain,
  tool: TerrainTool,
  x: number,
  z: number,
  radius: number,
  strength: number,
  level: number,
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
      const weight = (1 - distance / radius) * strength
      if (tool === 'Raise' || tool === 'Lower') t.heights[k] += (tool === 'Raise' ? 1 : -1) * weight
      else {
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
