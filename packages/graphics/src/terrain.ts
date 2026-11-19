import type { Terrain } from '../../project-schema/src/terrain'

export function terrainGeometry(t: Terrain) {
  const n = t.segments,
    vertices: number[] = [],
    uv: number[] = [],
    splatUv: number[] = [],
    allIndices: number[] = [],
    triangles: number[][] = [[], []]
  for (let z = 0; z <= n; z++)
    for (let x = 0; x <= n; x++) {
      vertices.push((x / n - 0.5) * t.size, t.heights[z * (n + 1) + x], (z / n - 0.5) * t.size)
      uv.push((x / n) * t.tiling, (1 - z / n) * t.tiling)
      splatUv.push(x / n, z / n)
      if (x < n && z < n) {
        const a = z * (n + 1) + x,
          b = a + n + 1
        allIndices.push(a, b, a + 1, a + 1, b, b + 1)
        const cellLayer = t.layers[z * n + x] ? 1 : 0
        triangles[cellLayer].push(a, b, a + 1, a + 1, b, b + 1)
      }
    }
  return { positions: vertices, uv, splatUv, layers: triangles, indices: allIndices }
}
