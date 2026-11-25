/** Geometry-conforming static decals clipped to an oriented projector volume.
 * The decal projector uses local XY in [-.5,.5], and local Z for depth.
 * The generated triangles are in decal-local space, with smoothly interpolated
 * receiver normals; the decal remains independent of the receiver material.
 */
import { mat4, vec3 } from 'gl-matrix'

export type DecalV3 = [number, number, number]
export interface DecalTriangle {
  a: DecalV3
  b: DecalV3
  c: DecalV3
  /** Outward world-space face normal, used when vertex normals are unavailable. */
  normal?: DecalV3
  /** Outward world-space normals for a/b/c (smooth surfaces, GLB, terrain). */
  normals?: [DecalV3, DecalV3, DecalV3]
}
export interface DecalOutput {
  points: DecalV3[]
  normals: DecalV3[]
  uvs: [number, number][]
  indices: number[]
  triangles: number
  truncated: boolean
}

/** Purely scripted objects can still have static geometry. Only known
 * deformations, animation and moving physics bodies prevent static projection.
 */
export function hasDynamicDecalGeometry(
  components: ReadonlyArray<{ type: string; enabled?: boolean; kind?: string }>,
): boolean {
  return components.some(c => c.enabled !== false && (
    c.type === 'animation' || c.type === 'sequencer' || c.type === 'navAgent' ||
    (c.type === 'body' && (c.kind === 'dynamic' || c.kind === 'kinematic'))
  ))
}

type ClipVertex = { position: DecalV3; normal: DecalV3 }
const EPS = 1e-7

function normalize(v: DecalV3): DecalV3 {
  const d = Math.hypot(...v)
  return d > EPS ? [v[0] / d, v[1] / d, v[2] / d] : [0, 0, -1]
}
function lerp(a: DecalV3, b: DecalV3, t: number): DecalV3 {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
}
function clipPlane(poly: ClipVertex[], axis: number, limit: number, positive: boolean): ClipVertex[] {
  if (!poly.length) return []
  const inside = (v: ClipVertex) => positive ? v.position[axis] <= limit + EPS : v.position[axis] >= limit - EPS
  const out: ClipVertex[] = []
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length]
    const ia = inside(a), ib = inside(b)
    if (ia) out.push(a)
    if (ia !== ib) {
      const denom = b.position[axis] - a.position[axis]
      const t = Math.abs(denom) < EPS ? 0 : Math.max(0, Math.min(1, (limit - a.position[axis]) / denom))
      out.push({ position: lerp(a.position, b.position, t), normal: normalize(lerp(a.normal, b.normal, t)) })
    }
  }
  return out
}
function localPoint(inverse: mat4, p: DecalV3): DecalV3 {
  const out = vec3.transformMat4(vec3.create(), p, inverse)
  return [out[0], out[1], out[2]]
}
function geometricWorldNormal(t: DecalTriangle): DecalV3 {
  const u: DecalV3 = [t.b[0] - t.a[0], t.b[1] - t.a[1], t.b[2] - t.a[2]]
  const v: DecalV3 = [t.c[0] - t.a[0], t.c[1] - t.a[1], t.c[2] - t.a[2]]
  return normalize([u[1]*v[2] - u[2]*v[1], u[2]*v[0] - u[0]*v[2], u[0]*v[1] - u[1]*v[0]])
}

export function projectDecalTriangles(
  decalWorld: ArrayLike<number>,
  triangles: Iterable<DecalTriangle>,
  opts: { depth: number; normalOffset?: number; maxTriangles?: number; minFacing?: number },
): DecalOutput {
  const result: DecalOutput = { points: [], normals: [], uvs: [], indices: [], triangles: 0, truncated: false }
  const inverse = mat4.invert(mat4.create(), decalWorld as unknown as mat4)
  if (!inverse) return result
  const halfDepth = Math.max(0.005, opts.depth) / 2
  const offset = Math.max(0, opts.normalOffset ?? 0.008)
  const max = Math.max(1, opts.maxTriangles ?? 12000)
  const facing = Math.min(0.99, Math.max(0, opts.minFacing ?? 0.2))
  for (const triangle of triangles) {
    const positions = [
      localPoint(inverse, triangle.a), localPoint(inverse, triangle.b), localPoint(inverse, triangle.c),
    ]
    const [a,b,c] = positions
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2]
    const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2]
    const nx = uy*vz - uz*vy, ny = uz*vx - ux*vz, nz = ux*vy - uy*vx
    const len = Math.hypot(nx,ny,nz)
    if (len < EPS || Math.abs(nz) / len < facing) continue

    // Preserve author-provided smooth vertex normals across triangle seams.
    // Without normals, use the face normal, facing the decal's local -Z.
    let worldNormals = triangle.normals || (triangle.normal && [triangle.normal, triangle.normal, triangle.normal])
    if (!worldNormals) {
      let n = geometricWorldNormal(triangle)
      const localZ = decalWorld[8]*n[0] + decalWorld[9]*n[1] + decalWorld[10]*n[2]
      if (localZ > 0) n = [-n[0], -n[1], -n[2]]
      worldNormals = [n, n, n]
    }
    let poly: ClipVertex[] = positions.map((position, i) => ({
      position, normal: normalize(worldNormals[i]),
    }))
    for (const [axis,limit,positive] of [
      [0,.5,true],[0,-.5,false],[1,.5,true],[1,-.5,false],
      [2,halfDepth,true],[2,-halfDepth,false],
    ] as const) {
      poly = clipPlane(poly, axis, limit, positive)
      if (poly.length < 3) break
    }
    if (poly.length < 3) continue
    for (let i = 1; i < poly.length - 1; i++) {
      if (result.triangles >= max) { result.truncated = true; return result }
      const base = result.points.length
      for (const vertex of [poly[0], poly[i], poly[i+1]]) {
        const p = vertex.position, n = vertex.normal
        // Offset in world units, not along a potentially scaled projector axis.
        result.points.push([
          p[0] + offset*(inverse[0]*n[0] + inverse[4]*n[1] + inverse[8]*n[2]),
          p[1] + offset*(inverse[1]*n[0] + inverse[5]*n[1] + inverse[9]*n[2]),
          p[2] + offset*(inverse[2]*n[0] + inverse[6]*n[1] + inverse[10]*n[2]),
        ])
        // Normal transformation from world to projector-local: transpose(M).
        // Mesh.addTriangles uses these normals directly, avoiding flat facets.
        result.normals.push(normalize([
          decalWorld[0]*n[0] + decalWorld[1]*n[1] + decalWorld[2]*n[2],
          decalWorld[4]*n[0] + decalWorld[5]*n[1] + decalWorld[6]*n[2],
          decalWorld[8]*n[0] + decalWorld[9]*n[1] + decalWorld[10]*n[2],
        ]))
        result.uvs.push([p[0]+.5, .5-p[1]])
      }
      result.indices.push(base,base+1,base+2)
      ++result.triangles
    }
  }
  return result
}
