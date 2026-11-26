import {test,expect} from 'vitest'
import {readFileSync} from 'node:fs'
import {runInNewContext} from 'node:vm'

// These checks run under pnpm test; the renderer extension is evaluated in the
// same lexical context as the pinned LittleJS release in the real device.
const source = readFileSync(new URL('../packages/graphics/multi-shadow.js',import.meta.url),'utf8')
function loadExtension(nativeLights=[]) {
  const scene = {
    shadows:true,multiShadowMax:4,multiShadowLights:[],
    camera:{pos:{x:0,y:0,z:0}},cameraForward:{x:0,y:0,z:-1},
  }
  const ctx={
    render3D:scene,
    RENDER3D_MAX_LIGHTS:8,
    render3DFragmentSource(){return 'uniform highp sampler2DShadow shadowMap;\nvoid main(){ if(i==si)lc*=sh*gel(); }'},
    render3DCollectLights(){return [...nativeLights]},
    render3DLightCone(){return []},
    render3DRenderShadowMap(){},
    render3DUseProgram(){},
    render3DSetMaterialUniforms(){},
    render3DFreeGL(){},
  }
  runInNewContext(source+'\nthis.mfTest={mfPatchFragmentShader,mfSpotCandidates,mfPointCandidates,mfSpotImportance,mfShadowSphereInFrustum};',ctx)
  return {ctx,scene}
}
function light({x=0,y=0,z=-3,radius=6,intensity=1,pinned=false}={}) {
  return {
    intensity,radius,coneAngle:.6,color:{r:1,g:1,b:1,a:1},destroyed:false,
    getWorldPos3D(){return {x,y,z}},getForward3D(){return {x:0,y:0,z:-1}},
  }
}
function entry(l,priority=0,pinned=false) {return {light:l,priority,pinned}}

test('multi-shadow GLSL keeps sun shadows and shades individual spotlights',()=>{
  const {ctx}=loadExtension()
  const shader=ctx.render3DFragmentSource()
  expect(shader).toContain('uniform highp sampler2DShadow mfShadow0')
  expect(shader).toContain('lc*=mfLightVisibility(i,P)*mfPointVisibility(i,P);')
  expect(shader).toContain('if(shadowParams.x<=0.)return vec3(1.);')
  expect(shader).not.toContain('lc*=sh*gel();')
})
test('automatic shadow selection favors nearby visible spotlights over far ones',()=>{
  const {ctx,scene}=loadExtension()
  const near=light({z:-2}),far=light({z:-50}),mid=light({z:-5})
  scene.multiShadowMax=2
  scene.multiShadowLights=[entry(far),entry(mid),entry(near)]
  const selected=ctx.mfTest.mfSpotCandidates(scene)
  expect(selected.map(e=>e.light)).toEqual([near,mid])
})
test('spotlight cones intersecting camera frustum count even if emitter is outside',()=>{
  const {ctx,scene}=loadExtension()
  // Clip coordinates x/y/z in [-1,1]. A light whose cone edge is visible
  // must be considered; a distant emitter illuminating nothing visible must not.
  scene.viewProjection={m:[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]}
  const visible=light({x:1.4,z:0,radius:1})
  const offscreen=light({x:30,z:0,radius:1,intensity:100})
  scene.multiShadowLights=[entry(offscreen),entry(visible)]
  expect(ctx.mfTest.mfSpotCandidates(scene).map(e=>e.light)).toEqual([visible])
})
test('shadow pin keeps a chosen source even offscreen, without blocking sunlight',()=>{
  const {ctx,scene}=loadExtension()
  scene.viewProjection={m:[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]}
  scene.multiShadowMax=1
  const far=light({x:40,z:0,radius:1}),near=light({x:0,z:0,radius:1})
  scene.multiShadowLights=[entry(near),entry(far,0,true)]
  expect(ctx.mfTest.mfSpotCandidates(scene).map(e=>e.light)).toEqual([far])
  scene.multiShadowLights=[entry(near),entry(far,0,false)]
  expect(ctx.mfTest.mfSpotCandidates(scene).map(e=>e.light)).toEqual([near])
})
test('hysteresis keeps previously selected spotlight until another is clearly better',()=>{
  const {ctx,scene}=loadExtension()
  scene.multiShadowMax=1
  const a=light({x:-.6}),b=light({x:.6})
  scene.multiShadowLights=[entry(a),entry(b)]
  expect(ctx.mfTest.mfSpotCandidates(scene)[0].light).toBe(a)
  scene.camera.pos={x:.12,y:0,z:0}
  expect(ctx.mfTest.mfSpotCandidates(scene)[0].light).toBe(a)
  scene.camera.pos={x:3,y:0,z:-3}
  expect(ctx.mfTest.mfSpotCandidates(scene)[0].light).toBe(b)
})
test('manual priority biases automatic ranking but is not required',()=>{
  const {ctx,scene}=loadExtension()
  scene.multiShadowMax=1
  const near=light({z:-2}),mid=light({z:-3})
  scene.multiShadowLights=[entry(near),entry(mid,12)]
  expect(ctx.mfTest.mfSpotCandidates(scene)[0].light).toBe(mid)
})
test('disabled, non-spot and culled emitters do not consume shadow slots',()=>{
  const {ctx,scene}=loadExtension()
  const point=light();point.coneAngle=0
  const disabled=light({intensity:0})
  scene.multiShadowLights=[entry(point),entry(disabled),entry(light())]
  expect(ctx.mfTest.mfSpotCandidates(scene).length).toBe(1)
  scene.shadows=false
  expect(ctx.mfTest.mfSpotCandidates(scene).length).toBe(0)
  expect(scene.mfPreviousShadowLights.size).toBe(0)
})
test('shadow-selected spotlights remain in LittleJS eight-light budget',()=>{
  const existing=Array.from({length:8},(_,i)=>light({x:i,z:-1}))
  const {ctx,scene}=loadExtension(existing)
  const s=light({z:-.2,intensity:3})
  scene.multiShadowMax=1
  scene.multiShadowLights=[entry(s)]
  const combined=ctx.render3DCollectLights()
  expect(combined).toHaveLength(8)
  expect(combined).toContain(s)
  expect(scene.mfFrameSpots).toHaveLength(1)
})
test('renderer shader changes fail loudly after incompatible LittleJS upgrade',()=>{
  const {ctx}=loadExtension()
  expect(()=>ctx.mfTest.mfPatchFragmentShader('void main(){}')).toThrow(/unsupported LittleJS/)
})

test('point lights use automatic nearest-visible shadow selection with pinned override',()=>{
  const {ctx,scene}=loadExtension()
  const near=light({z:-2}), far=light({z:-35}), medium=light({z:-8})
  for(const l of [near,far,medium])l.coneAngle=0
  scene.multiPointShadowMax=2
  scene.multiPointShadowLights=[entry(far),entry(medium),entry(near)]
  expect(Array.from(ctx.mfTest.mfPointCandidates(scene), e=>e.light)).toEqual([near,medium])
  scene.multiPointShadowLights=[entry(far,0,true),entry(medium),entry(near)]
  expect(ctx.mfTest.mfPointCandidates(scene).map(e=>e.light)).toContain(far)
})
test('point shadows can be disabled without disabling spotlight or sunlight',()=>{
  const {ctx,scene}=loadExtension()
  const p=light();p.coneAngle=0
  scene.multiPointShadowMax=0
  scene.multiPointShadowLights=[entry(p)]
  expect(ctx.mfTest.mfPointCandidates(scene)).toHaveLength(0)
  expect(ctx.render3DFragmentSource()).toContain('mfPointVisibility')
})
test('local reflection shader corrects cubemap rays inside box bounds',()=>{
  const {ctx}=loadExtension()
  const source=ctx.render3DFragmentSource()
  expect(source).toContain('mfParallaxDirection')
  expect(source).toContain('mfReflectionBoxMin')
})
