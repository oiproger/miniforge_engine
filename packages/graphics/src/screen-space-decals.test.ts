import { describe, expect, it } from 'vitest'
import { ScreenSpaceDecals, decalScreenRect, prepareDecalBatches, type ScreenDecal } from './screen-space-decals'

const identity = new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1])
const matrixAt = (x: number, y = 0, z = 0) => {
  const m = new Float32Array(identity)
  m[12] = x; m[13] = y; m[14] = z
  return m
}
const decal = (x=0, texture?: WebGLTexture, blend: 'alpha'|'additive'='alpha'):ScreenDecal => ({
  matrix:matrixAt(x),depth:1,facing:0,tint:[1,1,1,.7],blend,texture,
})
function mockGL() {
  const calls: {name: string;args:unknown[]}[] = []
  const gl = new Proxy({} as WebGL2RenderingContext, {
    get(_target,key) {
      if (key==='getShaderParameter'||key==='getProgramParameter')return ()=>true
      if (key==='getUniformLocation')return ()=>({})
      if (['createProgram','createShader','createTexture','createVertexArray','createBuffer'].includes(String(key)))return ()=>({})
      if (key==='TEXTURE0')return 33984
      if (typeof key==='string' && key===key.toUpperCase())return 1
      return (...args:unknown[])=>{calls.push({name:String(key),args})}
    },
  })
  return {gl,calls}
}

describe('depth projected material decals',()=>{
  it('conservatively rejects offscreen projectors and retains near-plane intersections',()=>{
    expect(decalScreenRect(matrixAt(8),1,identity)).toBeNull()
    expect(decalScreenRect(matrixAt(0),1,identity)).toEqual([.25,.25,.75,.75])
    expect(decalScreenRect(matrixAt(0,0,-1),1,identity)).toEqual([0,0,1,1])
    expect(decalScreenRect(matrixAt(0,0,-5),1,identity)).toBeNull()
  })
  it('batches identical consecutive textures without changing alpha order',()=>{
    const a={} as WebGLTexture,b={} as WebGLTexture
    const batches=prepareDecalBatches([decal(0,a),decal(.2,a),decal(.3,b),decal(.4,a),decal(8,a)],identity)
    expect(batches.map(batch=>batch.length)).toEqual([2,1,1])
    expect(batches[0][0].decal.texture).toBe(a)
    expect(batches[2][0].decal.texture).toBe(a)
  })
  it('renders an instanced rectangle batch and skips invisible decals',()=>{
    const {gl,calls}=mockGL(),renderer=new ScreenSpaceDecals(gl)
    try{
      const sameTex={} as WebGLTexture
      const decals=[decal(0,sameTex),decal(.25,sameTex),decal(6,sameTex)]
      expect(renderer.render({} as WebGLTexture,identity,decals,640,480)).toBe(1)
      expect(renderer.lastStats).toEqual({projectors:2,culled:1,batches:1,drawCalls:1})
      const draw=calls.find(c=>c.name==='drawArraysInstanced')
      expect(draw?.args[3]).toBe(2)
      expect(calls.map(c=>c.name)).not.toContain('drawArrays')
      expect(calls.map(c=>c.name)).not.toContain('drawElements')
    }finally{renderer.dispose()}
  })
  it('transfers roughness, metalness and normal strength to per-instance data',()=>{
    const {gl,calls}=mockGL(),renderer=new ScreenSpaceDecals(gl)
    try{
      const item={...decal(0),roughness:.22,metalness:.75,normalScale:1.4,unlit:false,
        normalTexture:{} as WebGLTexture,alphaCutoff:.35}
      renderer.render({} as WebGLTexture,identity,[item],128,128)
      const packed=calls.find(c=>c.name==='bufferSubData')?.args[2] as Float32Array
      expect(packed[40]).toBeCloseTo(.22)
      expect(packed[41]).toBeCloseTo(.75)
      expect(packed[42]).toBeCloseTo(1.4)
      expect(packed[44]).toBeCloseTo(.35)
      expect(calls.map(c=>c.name)).toContain('uniform1i')
    }finally{renderer.dispose()}
  })
  it('does not render without depth texture',()=>{
    const {gl,calls}=mockGL(),renderer=new ScreenSpaceDecals(gl)
    expect(renderer.render(null,identity,[decal()],640,480)).toBe(0)
    expect(calls.map(c=>c.name)).not.toContain('drawArraysInstanced')
    renderer.dispose()
  })
  it('separates changes to blend state or normal map for correct material layering',()=>{
    const a={} as WebGLTexture,b={} as WebGLTexture
    const batches=prepareDecalBatches([
      {...decal(0,a),normalTexture:a},
      {...decal(.1,a),normalTexture:b},
      decal(.2,a,'additive'),
      decal(.3,a,'alpha'),
    ],identity)
    expect(batches).toHaveLength(4)
  })
})
