export type ProceduralPattern = 'concrete' | 'brick' | 'tile' | 'asphalt' | 'rust' | 'panel'

export interface MaterialPreset {
  name: string
  pattern?: ProceduralPattern
  accent?: string
  properties: Record<string, any>
}

export const materialPresets: MaterialPreset[] = [
  {
    name: 'Concrete / Панелька',
    pattern: 'concrete',
    accent: '#6f7478',
    properties: { color: '#9aa0a4', roughness: 0.92, metalness: 0, flatShading: false, tiling: [2, 2] },
  },
  {
    name: 'Wet Asphalt / Асфальт',
    pattern: 'asphalt',
    accent: '#23272c',
    properties: { color: '#3b4047', roughness: 0.35, metalness: 0.15, flatShading: false, tiling: [4, 4] },
  },
  {
    name: 'Soviet Tile / Плитка',
    pattern: 'tile',
    accent: '#4d665c',
    properties: { color: '#7fa194', roughness: 0.45, metalness: 0.05, tiling: [3, 3] },
  },
  {
    name: 'Brick / Кирпич',
    pattern: 'brick',
    accent: '#59362b',
    properties: { color: '#8f5544', roughness: 0.88, metalness: 0, tiling: [2, 2] },
  },
  {
    name: 'Rusty Metal / Ржавчина',
    pattern: 'rust',
    accent: '#7a3f22',
    properties: { color: '#5c5855', roughness: 0.65, metalness: 0.65, tiling: [2, 2] },
  },
  {
    name: 'Glass / Стекло',
    properties: { color: '#a8d5e5', roughness: 0.08, metalness: 0.25, opacity: 0.38, doubleSided: true },
  },
  {
    name: 'Lamp / Лампа',
    properties: { color: '#fff3d6', emissive: '#ffdf9e', emissiveIntensity: 1, unlit: true, roughness: 0.2 },
  },
  {
    name: 'Panel Grid / Плиты',
    pattern: 'panel',
    accent: '#4a5056',
    properties: { color: '#7d8389', roughness: 0.85, metalness: 0.05, tiling: [2, 2] },
  },
]

function parseHex(hex: string): [number, number, number] {
  const c = (hex || '#888888').replace('#', '')
  const f = c.length === 3 ? c.split('').map((x) => x + x).join('') : c.padEnd(6, '0')
  return [parseInt(f.slice(0, 2), 16) || 0, parseInt(f.slice(2, 4), 16) || 0, parseInt(f.slice(4, 6), 16) || 0]
}

function hash(x: number, y: number): number {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453
  return s - Math.floor(s)
}

/** Generate a seamless 256x256 albedo + Sobel normal map pair as PNG data URLs directly in the browser. */
export function generateProceduralTextures(
  pattern: ProceduralPattern,
  baseHex = '#9aa0a4',
  accentHex = '#585e64',
  size = 256,
): { diffuse: string; normal: string } {
  const c1 = parseHex(baseHex)
  const c2 = parseHex(accentHex)
  const diffCanvas = document.createElement('canvas')
  diffCanvas.width = diffCanvas.height = size
  const dCtx = diffCanvas.getContext('2d')!
  const dImg = dCtx.createImageData(size, size)
  const heights = new Float32Array(size * size)

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = y * size + x
      const n1 = hash(x >> 2, y >> 2)
      const n2 = hash(x >> 1, y >> 1)
      const fine = hash(x, y)
      let mixVal = 0.5
      let h = 0.5

      if (pattern === 'concrete') {
        const grain = n1 * 0.5 + n2 * 0.3 + fine * 0.2
        mixVal = grain
        h = grain
      } else if (pattern === 'asphalt') {
        const speckle = fine * 0.65 + n2 * 0.35
        mixVal = speckle > 0.72 ? 0.9 : speckle * 0.5
        h = speckle
      } else if (pattern === 'brick') {
        const row = Math.floor(y / 32)
        const offset = (row % 2) * 32
        const bx = (x + offset) % 64
        const by = y % 32
        const mortar = bx < 4 || by < 4
        mixVal = mortar ? 0.92 : 0.15 + n1 * 0.35 + fine * 0.15
        h = mortar ? 0.15 : 0.75 + fine * 0.15
      } else if (pattern === 'tile') {
        const tx = x % 64,
          ty = y % 64
        const grout = tx < 3 || ty < 3
        mixVal = grout ? 0.95 : 0.2 + n1 * 0.2 + fine * 0.08
        h = grout ? 0.1 : 0.85
      } else if (pattern === 'rust') {
        const patch = Math.sin(x * 0.07) * Math.cos(y * 0.07) * 0.5 + 0.5
        const r = patch * 0.6 + n1 * 0.25 + fine * 0.15
        mixVal = r > 0.52 ? 0.85 : 0.15 + fine * 0.2
        h = r
      } else {
        // Soviet concrete panel grid
        const seam = x % 128 < 4 || y % 64 < 3
        mixVal = seam ? 0.95 : 0.2 + n1 * 0.3 + fine * 0.15
        h = seam ? 0.1 : 0.75 + fine * 0.1
      }

      heights[idx] = h
      const p = idx * 4
      dImg.data[p] = Math.round(c1[0] + (c2[0] - c1[0]) * mixVal)
      dImg.data[p + 1] = Math.round(c1[1] + (c2[1] - c1[1]) * mixVal)
      dImg.data[p + 2] = Math.round(c1[2] + (c2[2] - c1[2]) * mixVal)
      dImg.data[p + 3] = 255
    }
  }
  dCtx.putImageData(dImg, 0, 0)

  const normCanvas = document.createElement('canvas')
  normCanvas.width = normCanvas.height = size
  const nCtx = normCanvas.getContext('2d')!
  const nImg = nCtx.createImageData(size, size)
  const strength = 2.6
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const xm = (x - 1 + size) % size,
        xp = (x + 1) % size
      const ym = (y - 1 + size) % size,
        yp = (y + 1) % size
      const dx = (heights[y * size + xp] - heights[y * size + xm]) * strength
      const dy = (heights[yp * size + x] - heights[ym * size + x]) * strength
      const dz = 1
      const len = Math.hypot(dx, dy, dz) || 1
      const p = (y * size + x) * 4
      nImg.data[p] = Math.round(((-dx / len) * 0.5 + 0.5) * 255)
      nImg.data[p + 1] = Math.round(((-dy / len) * 0.5 + 0.5) * 255)
      nImg.data[p + 2] = Math.round(((dz / len) * 0.5 + 0.5) * 255)
      nImg.data[p + 3] = 255
    }
  }
  nCtx.putImageData(nImg, 0, 0)

  return {
    diffuse: diffCanvas.toDataURL('image/png'),
    normal: normCanvas.toDataURL('image/png'),
  }
}
