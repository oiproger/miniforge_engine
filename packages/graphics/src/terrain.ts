import { BufferGeometry, Float32BufferAttribute } from 'three'
import type { Terrain } from '../../project-schema/src/terrain'

export function terrainGeometry(t: Terrain) {
  const n = t.segments,
    vertices: number[] = [],
    uv: number[] = [],
    triangles: number[][] = [[], []]
  for (let z = 0; z <= n; z++)
    for (let x = 0; x <= n; x++) {
      vertices.push((x / n - 0.5) * t.size, t.heights[z * (n + 1) + x], (z / n - 0.5) * t.size)
      uv.push((x / n) * t.tiling, (1 - z / n) * t.tiling)
      if (x < n && z < n) {
        const a = z * (n + 1) + x,
          b = a + n + 1
        triangles[t.layers[z * n + x]].push(a, b, a + 1, a + 1, b, b + 1)
      }
    }
  const geo = new BufferGeometry()
  geo.setAttribute('position', new Float32BufferAttribute(vertices, 3))
  geo.setAttribute('uv', new Float32BufferAttribute(uv, 2))
  geo.setIndex(triangles.flat())
  geo.addGroup(0, triangles[0].length, 0)
  geo.addGroup(triangles[0].length, triangles[1].length, 1)
  geo.computeVertexNormals()
  return geo
}
