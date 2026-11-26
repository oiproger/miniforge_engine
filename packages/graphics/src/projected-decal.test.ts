import { describe, expect, it } from 'vitest'
import { mat4, vec3 } from 'gl-matrix'
import { projectDecalTriangles, hasDynamicDecalGeometry, type DecalTriangle } from './projected-decal'

const identity = new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1])
const cover: DecalTriangle[] = [
  { a: [-1,-1,0], b: [1,-1,0], c: [1,1,0] },
  { a: [-1,-1,0], b: [1,1,0], c: [-1,1,0] },
]

describe('surface-projected decals', () => {
  it('clips a large surface to the decal volume, preserving UVs', () => {
    const out = projectDecalTriangles(identity, cover, { depth: .3 })
    expect(out.triangles).toBeGreaterThanOrEqual(2)
    for (const p of out.points) {
      expect(Math.abs(p[0])).toBeLessThanOrEqual(.500001)
      expect(Math.abs(p[1])).toBeLessThanOrEqual(.500001)
      expect(p[2]).toBeCloseTo(-.008)
    }
    for (const [u,v] of out.uvs) {
      expect(u).toBeGreaterThanOrEqual(0)
      expect(u).toBeLessThanOrEqual(1)
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThanOrEqual(1)
    }
  })
  it('does not project through thick walls outside the volume', () => {
    const outside: DecalTriangle[] = [{ a:[-.2,-.2,1],b:[.2,-.2,1],c:[0,.2,1] }]
    expect(projectDecalTriangles(identity,outside,{depth:.3}).triangles).toBe(0)
  })
  it('rejects nearly perpendicular faces to avoid vertical smears', () => {
    const wall: DecalTriangle[] = [{ a:[0,-.2,-.2],b:[0,.2,-.2],c:[0,0,.2] }]
    expect(projectDecalTriangles(identity,wall,{depth:1,minFacing:.2}).triangles).toBe(0)
  })
  it('projects world-space triangles into a translated, scaled decal', () => {
    // A decal 2 units wide, centered at x=5, should only receive the
    // part of the surface inside [4,6] rather than the global origin.
    const world = new Float32Array([2,0,0,0, 0,1,0,0, 0,0,1,0, 5,2,0,1])
    const floor: DecalTriangle[] = [
      { a: [3,1,0], b: [7,1,0], c: [7,3,0] },
      { a: [3,1,0], b: [7,3,0], c: [3,3,0] },
    ]
    const out = projectDecalTriangles(world, floor, { depth: .5, normalOffset: .01 })
    expect(out.triangles).toBeGreaterThan(0)
    for (const p of out.points) {
      expect(Math.abs(p[0])).toBeLessThanOrEqual(.500001)
      expect(Math.abs(p[1])).toBeLessThanOrEqual(.500001)
      expect(p[2]).toBeCloseTo(-.01)
    }
  })
  it('includes static models with Behavior, Script and EventGraph components', () => {
    expect(hasDynamicDecalGeometry([{type:'mesh'}, {type:'behavior',kind:'collectible'}])).toBe(false)
    expect(hasDynamicDecalGeometry([{type:'mesh'}, {type:'script'}, {type:'eventGraph'}])).toBe(false)
    expect(hasDynamicDecalGeometry([{type:'mesh'}, {type:'body',kind:'static'}])).toBe(false)
    expect(hasDynamicDecalGeometry([{type:'mesh'}, {type:'animation',enabled:false}])).toBe(false)
  })
  it('excludes moving/animated geometry but not merely scripted entities', () => {
    expect(hasDynamicDecalGeometry([{type:'mesh'}, {type:'body',kind:'dynamic'}])).toBe(true)
    expect(hasDynamicDecalGeometry([{type:'mesh'}, {type:'body',kind:'kinematic'}])).toBe(true)
    expect(hasDynamicDecalGeometry([{type:'mesh'}, {type:'animation'}])).toBe(true)
    expect(hasDynamicDecalGeometry([{type:'mesh'}, {type:'navAgent'}])).toBe(true)
  })
  it('keeps decals above the receiver regardless of triangle winding', () => {
    const backFacing = [{a:[-1,-1,0],b:[1,1,0],c:[1,-1,0]}] as DecalTriangle[]
    const forward = projectDecalTriangles(identity,cover,{depth:.3,normalOffset:.05})
    const backward = projectDecalTriangles(identity,backFacing,{depth:.3,normalOffset:.05})
    expect(forward.triangles).toBeGreaterThan(0)
    expect(backward.triangles).toBeGreaterThan(0)
    for (const p of [...forward.points,...backward.points]) expect(p[2]).toBeCloseTo(-.05)
  })
  it('uses outward model normals regardless of projector direction or triangle winding', () => {
    const front: DecalTriangle[] = [{a:[-.2,-.2,0],b:[.2,-.2,0],c:[.2,.2,0],normal:[0,0,1]}]
    const back: DecalTriangle[] = [{a:[-.2,-.2,0],b:[.2,.2,0],c:[.2,-.2,0],normal:[0,0,1]}]
    for (const surface of [front,back]) {
      const result = projectDecalTriangles(identity,surface,{depth:.4,normalOffset:.025})
      expect(result.triangles).toBe(1)
      for (const p of result.points) expect(p[2]).toBeCloseTo(.025)
    }
  })
  it('follows outward ground normals even when the projector faces up or down', () => {
    const ground: DecalTriangle[] = [
      {a:[-.2,0,-.2],b:[.2,0,-.2],c:[.2,0,.2],normal:[0,1,0]},
    ]
    for (const pitch of [Math.PI / 2, -Math.PI / 2]) {
      const projector = mat4.fromXRotation(mat4.create(), pitch)
      const projected = projectDecalTriangles(projector, ground, {depth:1,normalOffset:.025})
      expect(projected.triangles).toBeGreaterThan(0)
      for (const point of projected.points) {
        const world = vec3.transformMat4(vec3.create(), point, projector)
        expect(world[1]).toBeCloseTo(.025)
      }
    }
  })
  it('offsets along the receiver normal when projecting on a slope', () => {
    const sloped: DecalTriangle[] = [{ a:[-.2,-.2,0],b:[.2,-.2,-.1],c:[.2,.2,-.1] }]
    const out = projectDecalTriangles(identity,sloped,{depth:.5,normalOffset:.02})
    expect(out.triangles).toBe(1)
    // The surface is not parallel to XY; moving only in Z would not be a normal offset.
    expect(out.points[0][0]).toBeCloseTo(sloped[0].a[0] - .02 / Math.sqrt(17), 6)
    expect(out.points[0][2]).toBeLessThan(sloped[0].a[2])
  })

  it('keeps shared vertices connected on smooth rounded geometry', () => {
    // Two adjacent surface triangles with different face normals but shared
    // smooth normals must produce exactly the same overlay points at the seam.
    const a: DecalTriangle['a'] = [-.25, -.25, -.08]
    const b: DecalTriangle['a'] = [.25, -.25, -.08]
    const c: DecalTriangle['a'] = [.25, .25, .08]
    const d: DecalTriangle['a'] = [-.25, .25, .08]
    const na: DecalTriangle['a'] = [-.3, -.2, -.93]
    const nb: DecalTriangle['a'] = [.3, -.2, -.93]
    const nc: DecalTriangle['a'] = [.3, .2, -.93]
    const nd: DecalTriangle['a'] = [-.3, .2, -.93]
    const triangles: DecalTriangle[] = [
      {a,b,c,normals:[na,nb,nc]},
      {a:c,b:d,c:a,normals:[nc,nd,na]},
    ]
    const out = projectDecalTriangles(identity, triangles, {depth:.6,normalOffset:.05})
    expect(out.triangles).toBe(2)
    expect(out.normals).toHaveLength(out.points.length)
    const aCopies = out.points.filter((_, i) => Math.abs(out.uvs[i][0]-.25)<1e-5 && Math.abs(out.uvs[i][1]-.75)<1e-5)
    expect(aCopies).toHaveLength(2)
    for (let axis=0;axis<3;axis++) expect(aCopies[0][axis]).toBeCloseTo(aCopies[1][axis], 6)
    // The smooth normal must differ from an artificial flat -Z normal.
    expect(out.normals[0][0]).toBeLessThan(-.1)
  })

  it('interpolates surface normals for clipped vertices instead of creating facets', () => {
    const triangle: DecalTriangle = {
      a:[-.8,-.1,0],b:[.8,-.1,0],c:[0,.4,0],
      normals:[[-.45,0,-.9],[.45,0,-.9],[0,.2,-.98]],
    }
    const out=projectDecalTriangles(identity,[triangle],{depth:.5,normalOffset:.02})
    expect(out.triangles).toBeGreaterThan(0)
    expect(out.normals).toHaveLength(out.points.length)
    const edge = out.points.findIndex((_,i) => Math.abs(out.uvs[i][0]-1)<1e-5)
    expect(edge).toBeGreaterThanOrEqual(0)
    // A clipped vertex halfway across an edge has a blended normal, not a
    // copy of the original first or second vertex's normal.
    expect(out.normals[edge][0]).toBeGreaterThan(-.45)
    expect(out.normals[edge][0]).toBeLessThan(.45)
  })

  it('limits generated triangles for very high-poly surfaces', () => {
    const out = projectDecalTriangles(identity,cover,{depth:.3,maxTriangles:1})
    expect(out.triangles).toBe(1)
    expect(out.truncated).toBe(true)
  })
})
