import type { Component, Transform, Vec3 } from './index'

export const terrainTools = [
  'Raise',
  'Lower',
  'Flatten',
  'Smooth',
  'Noise',
  'Terrace',
  'Paint',
  'Erase paint',
  'Scatter',
  'Erase scatter',
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
  /** Unlimited material layer asset IDs (index 0 = base material). */
  materials?: string[]
  /** Per-layer vertex weight maps, each of length (segments + 1)^2, values in [0..1]. */
  splatWeights?: number[][]
  /** Per-layer edge softness in [0..1] (0 = hard crisp edge, 1 = very soft gradual blend). */
  layerSoftness?: number[]
}

export function makeTerrain(segments = 32): Terrain {
  const verts = (segments + 1) ** 2
  return {
    type: 'terrain',
    segments,
    size: 16,
    tiling: 4,
    baseMaterial: '',
    paintMaterial: '',
    heights: Array(verts).fill(0),
    layers: Array(segments ** 2).fill(0),
    materials: ['', ''],
    splatWeights: [Array(verts).fill(1), Array(verts).fill(0)],
    layerSoftness: [0.5, 0.5],
  }
}

/** Ensures unlimited materials/splatWeights/layerSoftness arrays exist & match segments. */
export function ensureTerrainLayers(t: Terrain): {
  materials: string[]
  splatWeights: number[][]
  layerSoftness: number[]
} {
  const n = t.segments
  const verts = (n + 1) ** 2
  if (!Array.isArray(t.materials) || t.materials.length < 1) {
    t.materials = [t.baseMaterial || '', t.paintMaterial || '']
  } else {
    t.materials[0] = t.materials[0] ?? t.baseMaterial ?? ''
    if (t.materials.length > 1 && !t.materials[1] && t.paintMaterial) t.materials[1] = t.paintMaterial
  }
  const count = t.materials.length
  if (!Array.isArray(t.splatWeights) || t.splatWeights.length !== count || t.splatWeights.some((w) => !Array.isArray(w) || w.length !== verts)) {
    const base = Array(verts).fill(1)
    const layer1 = Array(verts).fill(0)
    // Migrate legacy cell-based layers into vertex weights
    if (Array.isArray(t.layers) && t.layers.length === n * n) {
      for (let z = 0; z < n; z++) {
        for (let x = 0; x < n; x++) {
          if (t.layers[z * n + x] === 1) {
            const idxs = [z * (n + 1) + x, z * (n + 1) + x + 1, (z + 1) * (n + 1) + x, (z + 1) * (n + 1) + x + 1]
            for (const vi of idxs) {
              layer1[vi] = Math.min(1, layer1[vi] + 0.5)
              base[vi] = Math.max(0, 1 - layer1[vi])
            }
          }
        }
      }
    }
    const weights: number[][] = []
    for (let i = 0; i < count; i++) {
      if (Array.isArray(t.splatWeights?.[i]) && t.splatWeights![i].length === verts) {
        weights.push(t.splatWeights![i])
      } else if (i === 0) {
        weights.push(base)
      } else if (i === 1) {
        weights.push(layer1)
      } else {
        weights.push(Array(verts).fill(0))
      }
    }
    t.splatWeights = weights
  }
  if (!Array.isArray(t.layerSoftness) || t.layerSoftness.length !== count) {
    const soft: number[] = []
    for (let i = 0; i < count; i++) soft.push(Number.isFinite(t.layerSoftness?.[i]) ? t.layerSoftness![i] : 0.5)
    t.layerSoftness = soft
  }
  t.baseMaterial = t.materials[0] || ''
  t.paintMaterial = t.materials[1] || ''
  return { materials: t.materials, splatWeights: t.splatWeights, layerSoftness: t.layerSoftness }
}

export function addTerrainMaterialLayer(t: Terrain, materialId = '', softness = 0.5): number {
  const { materials, splatWeights, layerSoftness } = ensureTerrainLayers(t)
  const verts = (t.segments + 1) ** 2
  materials.push(materialId)
  splatWeights.push(Array(verts).fill(0))
  layerSoftness.push(Math.max(0, Math.min(1, softness)))
  return materials.length - 1
}

export function removeTerrainMaterialLayer(t: Terrain, index: number) {
  const { materials, splatWeights, layerSoftness } = ensureTerrainLayers(t)
  if (index <= 0 || index >= materials.length) return
  const removed = splatWeights[index]
  for (let i = 0; i < removed.length; i++) {
    splatWeights[0][i] = Math.min(1, splatWeights[0][i] + removed[i])
  }
  materials.splice(index, 1)
  splatWeights.splice(index, 1)
  layerSoftness.splice(index, 1)
  t.baseMaterial = materials[0] || ''
  t.paintMaterial = materials[1] || ''
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
    c.layers.every((v: number) => Number.isInteger(v) && v >= 0)
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

export function autoPaintTerrain(t: Terrain, slopeThreshold = 0.35, heightThreshold = 999, targetLayer = 1) {
  const { splatWeights } = ensureTerrainLayers(t)
  const layerIdx = Math.max(1, Math.min(splatWeights.length - 1, targetLayer))
  const n = t.segments
  const cellSize = t.size / n
  for (let z = 0; z <= n; z++) {
    for (let x = 0; x <= n; x++) {
      const x1 = Math.min(n, x + 1)
      const z1 = Math.min(n, z + 1)
      const h00 = t.heights[z * (n + 1) + x]
      const h10 = t.heights[z * (n + 1) + x1]
      const h01 = t.heights[z1 * (n + 1) + x]
      const dx = Math.abs(h10 - h00) / cellSize
      const dz = Math.abs(h01 - h00) / cellSize
      const slope = Math.hypot(dx, dz)
      const vi = z * (n + 1) + x
      const w = slope >= slopeThreshold || h00 >= heightThreshold ? 1 : 0
      splatWeights[layerIdx][vi] = w
      if (w > 0) {
        for (let l = 0; l < splatWeights.length; l++) if (l !== layerIdx) splatWeights[l][vi] = 0
      } else if (splatWeights.every((arr) => arr[vi] <= 0.001)) {
        splatWeights[0][vi] = 1
      }
      if (x < n && z < n) t.layers[z * n + x] = w ? 1 : 0
    }
  }
}

/** Sample interpolated local terrain height at fractional grid coords (gx, gz) in [0..segments]. */
export function sampleTerrainGridHeight(t: Terrain, gx: number, gz: number): number {
  const n = t.segments
  const cx = Math.max(0, Math.min(n, gx))
  const cz = Math.max(0, Math.min(n, gz))
  const x0 = Math.min(n - 1, Math.floor(cx))
  const z0 = Math.min(n - 1, Math.floor(cz))
  const fx = cx - x0
  const fz = cz - z0
  const h00 = t.heights[z0 * (n + 1) + x0]
  const h10 = t.heights[z0 * (n + 1) + x0 + 1]
  const h01 = t.heights[(z0 + 1) * (n + 1) + x0]
  const h11 = t.heights[(z0 + 1) * (n + 1) + x0 + 1]
  return h00 * (1 - fx) * (1 - fz) + h10 * fx * (1 - fz) + h01 * (1 - fx) * fz + h11 * fx * fz
}

/** Convert a world position to terrain grid coordinates [gx, gz] (0..segments). */
export function worldToTerrainGrid(t: Terrain, worldPos: Vec3, transform?: Transform): [number, number] {
  const px = transform?.position[0] ?? 0
  const pz = transform?.position[2] ?? 0
  const sx = transform?.scale[0] || 1
  const sz = transform?.scale[2] || 1
  const lx = (worldPos[0] - px) / sx
  const lz = (worldPos[2] - pz) / sz
  return [(lx / t.size + 0.5) * t.segments, (lz / t.size + 0.5) * t.segments]
}

/** Raycast a 3D world ray against a terrain heightmap; returns exact hit worldPos + grid coords. */
export function raycastTerrain(
  t: Terrain,
  origin: Vec3,
  dir: Vec3,
  transform?: Transform,
): { worldPos: Vec3; gx: number; gz: number } | null {
  const px = transform?.position[0] ?? 0
  const py = transform?.position[1] ?? 0
  const pz = transform?.position[2] ?? 0
  const sx = transform?.scale[0] || 1
  const sy = transform?.scale[1] || 1
  const sz = transform?.scale[2] || 1
  const half = t.size * 0.5
  const step = Math.max(0.15, (t.size / t.segments) * 0.45)
  let prevT = 0
  let prevDiff = 1
  let started = false
  for (let dist = 0.2; dist <= 260; dist += step) {
    const wx = origin[0] + dir[0] * dist
    const wy = origin[1] + dir[1] * dist
    const wz = origin[2] + dir[2] * dist
    const lx = (wx - px) / sx
    const lz = (wz - pz) / sz
    if (lx < -half || lx > half || lz < -half || lz > half) {
      started = false
      continue
    }
    const gx = (lx / t.size + 0.5) * t.segments
    const gz = (lz / t.size + 0.5) * t.segments
    const ty = py + sampleTerrainGridHeight(t, gx, gz) * sy
    const diff = wy - ty
    if (started && prevDiff >= 0 && diff <= 0) {
      // Binary refine hit
      let lo = prevT, hi = dist
      for (let it = 0; it < 6; it++) {
        const mid = (lo + hi) * 0.5
        const mx = origin[0] + dir[0] * mid
        const my = origin[1] + dir[1] * mid
        const mz = origin[2] + dir[2] * mid
        const mgx = ((mx - px) / sx / t.size + 0.5) * t.segments
        const mgz = ((mz - pz) / sz / t.size + 0.5) * t.segments
        const mty = py + sampleTerrainGridHeight(t, mgx, mgz) * sy
        if (my - mty > 0) lo = mid
        else hi = mid
      }
      const hitT = (lo + hi) * 0.5
      const hx = origin[0] + dir[0] * hitT
      const hz = origin[2] + dir[2] * hitT
      const hgx = ((hx - px) / sx / t.size + 0.5) * t.segments
      const hgz = ((hz - pz) / sz / t.size + 0.5) * t.segments
      const hy = py + sampleTerrainGridHeight(t, hgx, hgz) * sy
      return { worldPos: [hx, hy, hz], gx: hgx, gz: hgz }
    }
    prevT = dist
    prevDiff = diff
    started = true
  }
  return null
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
  layerIndex = 1,
  hardness = 0.5,
) {
  const paint = tool === 'Paint' || tool === 'Erase paint'
  const width = t.segments + 1
  const heights = tool === 'Smooth' ? t.heights.slice() : t.heights
  const layerData = paint ? ensureTerrainLayers(t) : null
  const activeLayer = layerData
    ? Math.max(0, Math.min(layerData.splatWeights.length - 1, layerIndex))
    : 1

  for (let j = Math.max(0, Math.floor(z - radius)); j <= Math.min(width - 1, Math.ceil(z + radius)); j++) {
    for (let i = Math.max(0, Math.floor(x - radius)); i <= Math.min(width - 1, Math.ceil(x + radius)); i++) {
      const distance = paint ? Math.hypot(i + 0.5 - x, j + 0.5 - z) : Math.hypot(i - x, j - z)
      if (distance > radius) continue
      const k = j * width + i
      const norm = Math.max(0, 1 - distance / Math.max(0.001, radius))

      if (paint && layerData) {
        const hardClamped = Math.max(0, Math.min(1, hardness))
        // hardness = 1 -> crisp flat disk; hardness = 0 -> wide smooth feathered falloff
        const paintFalloff =
          hardClamped >= 0.96
            ? 1
            : norm >= hardClamped
              ? 1
              : Math.pow(norm / Math.max(0.04, 1 - hardClamped), 1.6)
        const amount = Math.min(1, paintFalloff * Math.max(0.02, strength))
        const weights = layerData.splatWeights
        if (tool === 'Paint') {
          const prev = weights[activeLayer][k]
          const next = Math.min(1, prev + amount * (1 - prev * 0.35))
          const added = next - prev
          weights[activeLayer][k] = next
          let otherSum = 0
          for (let l = 0; l < weights.length; l++) if (l !== activeLayer) otherSum += weights[l][k]
          if (otherSum > 1e-5) {
            const scale = Math.max(0, (1 - next) / otherSum)
            for (let l = 0; l < weights.length; l++) if (l !== activeLayer) weights[l][k] *= scale
          } else if (added > 0 && activeLayer !== 0) {
            weights[0][k] = Math.max(0, 1 - next)
          }
        } else {
          // Erase activeLayer back toward base layer 0
          const prev = weights[activeLayer][k]
          const next = Math.max(0, prev - amount)
          const diff = prev - next
          weights[activeLayer][k] = next
          if (activeLayer !== 0) weights[0][k] = Math.min(1, weights[0][k] + diff)
        }
        // Keep legacy cell layer array updated for backward compatibility
        if (i < t.segments && j < t.segments) {
          let dom = 0, best = weights[0][k]
          for (let l = 1; l < weights.length; l++) {
            if (weights[l][k] > best) { best = weights[l][k]; dom = l }
          }
          t.layers[j * t.segments + i] = dom
        }
        continue
      }

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


/** Bilinearly resize terrain grid resolution (segments) and/or world size while preserving heights & all material layers. */
export function resizeTerrain(t: Terrain, newSegments: number, newSize?: number) {
  const oldN = t.segments
  const n = Math.max(4, Math.min(128, Math.round(newSegments)))
  const { materials, splatWeights, layerSoftness } = ensureTerrainLayers(t)
  const oldHeights = t.heights.slice()
  const oldWeights = splatWeights.map((w) => w.slice())

  const sampleGrid = (arr: number[], gx: number, gz: number) => {
    const cx = Math.max(0, Math.min(oldN, gx))
    const cz = Math.max(0, Math.min(oldN, gz))
    const x0 = Math.min(oldN - 1, Math.floor(cx))
    const z0 = Math.min(oldN - 1, Math.floor(cz))
    const fx = cx - x0
    const fz = cz - z0
    const i00 = z0 * (oldN + 1) + x0
    return (
      arr[i00] * (1 - fx) * (1 - fz) +
      arr[i00 + 1] * fx * (1 - fz) +
      arr[i00 + oldN + 1] * (1 - fx) * fz +
      arr[i00 + oldN + 2] * fx * fz
    )
  }

  const nextHeights = new Array<number>((n + 1) ** 2)
  const nextWeights = materials.map(() => new Array<number>((n + 1) ** 2))
  const nextLayers = new Array<number>(n * n).fill(0)

  for (let z = 0; z <= n; z++) {
    const oz = (z / n) * oldN
    for (let x = 0; x <= n; x++) {
      const ox = (x / n) * oldN
      const vi = z * (n + 1) + x
      nextHeights[vi] = Math.round(sampleGrid(oldHeights, ox, oz) * 1000) / 1000
      let sum = 0
      for (let l = 0; l < materials.length; l++) {
        const w = sampleGrid(oldWeights[l], ox, oz)
        nextWeights[l][vi] = w
        sum += w
      }
      if (sum > 1e-5) {
        for (let l = 0; l < materials.length; l++) nextWeights[l][vi] /= sum
      } else {
        nextWeights[0][vi] = 1
      }
      if (x < n && z < n) {
        let dom = 0, best = nextWeights[0][vi]
        for (let l = 1; l < materials.length; l++) {
          if (nextWeights[l][vi] > best) { best = nextWeights[l][vi]; dom = l }
        }
        nextLayers[z * n + x] = dom
      }
    }
  }

  t.segments = n
  if (newSize !== undefined && Number.isFinite(newSize) && newSize > 0) t.size = newSize
  t.heights = nextHeights
  t.splatWeights = nextWeights
  t.layers = nextLayers
  t.layerSoftness = layerSoftness
}

export function sampleTerrainLayerAt(
  t: Terrain,
  worldX: number,
  worldZ: number,
  transform?: Transform,
): { inside: boolean; height: number; layerIndex: number; materialId: string; weights: number[] } {
  const px = transform?.position[0] ?? 0
  const py = transform?.position[1] ?? 0
  const pz = transform?.position[2] ?? 0
  const sx = transform?.scale[0] || 1
  const sy = transform?.scale[1] || 1
  const sz = transform?.scale[2] || 1
  const lx = (worldX - px) / sx
  const lz = (worldZ - pz) / sz
  const half = t.size * 0.5
  const inside = lx >= -half && lx <= half && lz >= -half && lz <= half
  const { materials, splatWeights } = ensureTerrainLayers(t)
  const gx = Math.max(0, Math.min(t.segments, (lx / t.size + 0.5) * t.segments))
  const gz = Math.max(0, Math.min(t.segments, (lz / t.size + 0.5) * t.segments))
  const height = py + sampleTerrainGridHeight(t, gx, gz) * sy
  const n = t.segments
  const x0 = Math.min(n - 1, Math.floor(gx))
  const z0 = Math.min(n - 1, Math.floor(gz))
  const fx = gx - x0
  const fz = gz - z0
  const i00 = z0 * (n + 1) + x0
  const weights = splatWeights.map(
    (arr) =>
      arr[i00] * (1 - fx) * (1 - fz) +
      arr[i00 + 1] * fx * (1 - fz) +
      arr[i00 + n + 1] * (1 - fx) * fz +
      arr[i00 + n + 2] * fx * fz,
  )
  let layerIndex = 0
  let best = weights[0] ?? 1
  for (let l = 1; l < weights.length; l++) {
    if (weights[l] > best) {
      best = weights[l]
      layerIndex = l
    }
  }
  return { inside, height, layerIndex, materialId: materials[layerIndex] || '', weights }
}
