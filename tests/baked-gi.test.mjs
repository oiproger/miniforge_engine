// CPU GI tests run under Vitest via pnpm test or pnpm test:gi.
import { test } from 'vitest'
import assert from 'node:assert/strict'
import { GIBaker, sampleGITexture, surfaceEmission } from '../packages/graphics/src/baked-gi.ts'
const WHITE = {width:1,height:1,pixels:Uint8ClampedArray.from([255,255,255,255])}
const mat = (emissive=[0,0,0], emissiveMap=WHITE) => ({ albedo:[0.8,0.8,0.8], emissive, emissiveMap, opacity:1, castShadow:true, receiveShadow:true })
const quad = (y, size, material, owner, flipped=false) => {
  const a=[-size,y,-size],b=[size,y,-size],c=[size,y,size],d=[-size,y,size]
  const uvA=[0,0],uvB=[1,0],uvC=[1,1],uvD=[0,1]
  const tris = [
    { a,b,c,uvA,uvB,uvC,material,owner },
    { a,c,b: d,uvA,uvB: uvD,uvC,material,owner }
  ]
  // second triangle must be (a,c,d); recreate so its texture UV matches geometry.
  tris[1] = {a,b:c,c:d,uvA,uvB:uvC,uvC:uvD,material,owner}
  return flipped ? tris.map(t=>({...t,b:t.c,c:t.b,uvB:t.uvC,uvC:t.uvB})) : tris
}
const conf = {resolution:16,rays:32,bounces:2,strength:1,ambient:[0,0,0],ambientIntensity:0}
test('CPU texture samples emissive RGB by UV', () => {
  const tex = {width:2,height:1,pixels:Uint8ClampedArray.from([255,0,0,255,0,0,255,255])}
  const triangles=quad(2,4,mat([1,1,1],tex),'lamp')
  assert.ok(surfaceEmission(triangles[0],0.05,0.05)[0] > 0.95)
  assert.ok(surfaceEmission(triangles[0],0.95,0.0)[2] > 0.95)
  assert.deepEqual(sampleGITexture(tex,[0.1,0.3]),[1,0,0])
})
test('emissive surfaces illuminate a facing receiver via traced rays', () => {
  const source=quad(2,4,mat([1,0.1,0.05]),'lamp',true)
  const floor=quad(0,4,mat(),'floor')
  const bake=new GIBaker([...source,...floor],[],conf)
  const ir=bake.indirectAt([0,0.005,0],[0,1,0],0.123)
  assert.ok(ir[0]>0.06,`red indirect ${ir}`)
  assert.ok(ir[0]>ir[1]*2,`tinted radiance ${ir}`)
})
test('opaque geometry blocks emissive transport', () => {
  const source=quad(2,4,mat([1,1,1]),'lamp',true)
  const blocker=quad(1,5,mat(),'blocker',true)
  const clear=new GIBaker(source,[],conf).indirectAt([0,0.005,0],[0,1,0],0.123)
  const blocked=new GIBaker([...source,...blocker],[],conf).indirectAt([0,0.005,0],[0,1,0],0.123)
  assert.ok(clear[0]>0.1)
  assert.ok(blocked[0]<clear[0]*0.05,`blocked ${blocked} vs ${clear}`)
})
test('direct point lighting observes distance and obstruction', () => {
  const light={kind:'point',position:[0,2,0],direction:[0,0,-1],color:[1,1,1],intensity:3,range:8}
  const plain=new GIBaker([], [light], conf).directIrradiance([0,0,0],[0,1,0])
  const blocked=new GIBaker(quad(1,2,mat(),'wall'),[light],conf).directIrradiance([0,0,0],[0,1,0])
  assert.ok(plain[0]>0.1)
  assert.ok(blocked[0]<0.001)
})
test('lightmap output preserves original emissive channel', () => {
  const emitting=quad(1,2,mat([0.8,0.2,0.1]),'lamp',true)
  const bake=new GIBaker(emitting,[],conf).bake('lamp',16)
  assert.ok(bake.populated>10)
  const center=(8*16+8)*4
  assert.ok(bake.pixels[center]>bake.pixels[center+1])
  assert.ok(bake.pixels[center]>120)
})
test('a point-lit colored wall bleeds its albedo into indirect light', () => {
  const redWall=quad(2,4,{...mat(),albedo:[1,0.02,0.02]},'red-wall',true)
  const light={kind:'point',position:[0,0.5,0],direction:[0,0,-1],color:[1,1,1],intensity:6,range:7}
  const ir=new GIBaker(redWall,[light],conf).indirectAt([0,0,0],[0,1,0],0.4)
  assert.ok(ir[0]>0.002,`red bounced radiance ${ir}`)
  assert.ok(ir[0]>ir[1]*10,`color bleeding ${ir}`)
})
test('unlit base color emits but is not duplicated in the additive emissive map', () => {
  const unlit=quad(1,2,{...mat(),emissiveMap:undefined,unlit:1,albedo:[0.3,0.6,0.8]},'neon')
  assert.ok(surfaceEmission(unlit[0],0.2,0.2)[2]>0.5)
  const result=new GIBaker(unlit,[],conf).bake('neon',16)
  assert.ok(result.populated>0)
  const index=(8*16+8)*4
  assert.equal(result.pixels[index],0)
  assert.equal(result.pixels[index+1],0)
  assert.equal(result.pixels[index+2],0)
})
