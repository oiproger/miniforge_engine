/**
 * Depth-projected decals in LittleJS's WebGL2 forward renderer.
 *
 * Each decal is rasterized only over its conservative screen-space bounds.
 * Adjacent projectors that share textures and blend state are submitted with
 * drawArraysInstanced, without reordering overlapping alpha decals.
 *
 * Forward material shading is an approximation: without a normal/material
 * G-buffer, decals cannot change the already-drawn receiving material or
 * reproduce its shadowing/reflections exactly. The overlay itself supports
 * normal/roughness/metalness/emissive inputs and direct scene lighting.
 */
import { mat4 } from 'gl-matrix'

export type Matrix4Like = ArrayLike<number>
export interface DecalLight {
  /** Direction TOWARD the light for directional lights, world position otherwise. */
  position: readonly [number, number, number]
  /** Negative for directional lights; radius for point/spot. */
  radius: number
  color: readonly [number, number, number]
  intensity: number
  /** LittleJS spotlight cone encoding, with [-1] meaning omni. */
  cone?: readonly [number, number, number, number]
}
export interface DecalLighting {
  ambient: readonly [number, number, number]
  sunDirection: readonly [number, number, number]
  sunColor: readonly [number, number, number]
  cameraPosition: readonly [number, number, number]
  lights?: readonly DecalLight[]
}
export interface ScreenDecal {
  /** Projector world transform; local XY spans [-.5,.5]. */
  matrix: Matrix4Like
  depth: number
  facing: number
  tint: readonly [number, number, number, number]
  blend: 'alpha' | 'additive'
  texture?: WebGLTexture | null
  normalTexture?: WebGLTexture | null
  emissiveTexture?: WebGLTexture | null
  roughnessTexture?: WebGLTexture | null
  metalnessTexture?: WebGLTexture | null
  /** Linear RGB emission; intensity is independent of alpha. */
  emissiveColor?: readonly [number, number, number]
  emissiveStrength?: number
  uvTransform?: readonly [number, number, number, number]
  roughness?: number
  metalness?: number
  normalScale?: number
  unlit?: boolean
  alphaCutoff?: number
  darkBackgroundTransparent?: boolean
  darkThreshold?: number
}

/** [umin, vmin, umax, vmax] for the conservative projector bounding rectangle. */
export type DecalRect = [number, number, number, number]
const MAX_BATCH = 64
const MAX_LIGHTS = 8
const INSTANCE_FLOATS = 48
const INSTANCE_BYTES = INSTANCE_FLOATS * 4

function invertMatrix(data: Matrix4Like): mat4 | null {
  if (data.length !== 16) return null
  const source = mat4.create()
  for (let i = 0; i < 16; i++) source[i] = data[i]
  if (![...source].every(Number.isFinite)) return null
  return mat4.invert(mat4.create(), source)
}

/**
 * Clip-box rejection handles all six homogeneous frustum planes. A projector
 * intersecting the camera's near plane falls back to full-screen coverage to
 * prevent false negatives; the fragment shader still clips to the projector.
 */
export function decalScreenRect(matrix: Matrix4Like, depth: number, viewProjection: Matrix4Like): DecalRect | null {
  if (matrix.length !== 16 || viewProjection.length !== 16 || !(depth > 0)) return null
  const m = matrix, vp = viewProjection
  const corners: number[][] = []
  for (const x of [-0.5, 0.5]) for (const y of [-0.5, 0.5]) for (const z of [-depth / 2, depth / 2]) {
    const wx = m[0]*x + m[4]*y + m[8]*z + m[12]
    const wy = m[1]*x + m[5]*y + m[9]*z + m[13]
    const wz = m[2]*x + m[6]*y + m[10]*z + m[14]
    const cx = vp[0]*wx + vp[4]*wy + vp[8]*wz + vp[12]
    const cy = vp[1]*wx + vp[5]*wy + vp[9]*wz + vp[13]
    const cz = vp[2]*wx + vp[6]*wy + vp[10]*wz + vp[14]
    const cw = vp[3]*wx + vp[7]*wy + vp[11]*wz + vp[15]
    if (![cx,cy,cz,cw].every(Number.isFinite)) return null
    corners.push([cx,cy,cz,cw])
  }
  // If all vertices are beyond any one clip plane, the entire convex box is invisible.
  for (const plane of [
    (c: number[])=> c[0]+c[3], (c: number[])=> c[3]-c[0],
    (c: number[])=> c[1]+c[3], (c: number[])=> c[3]-c[1],
    (c: number[])=> c[2]+c[3], (c: number[])=> c[3]-c[2],
  ]) if (corners.every(c=> plane(c) < 0)) return null
  if (corners.some(c=> c[3] <= 1e-5 || c[2] <= -c[3])) return [0,0,1,1]
  const xs = corners.map(c=> c[0]/c[3]*.5+.5)
  const ys = corners.map(c=> c[1]/c[3]*.5+.5)
  const u0 = Math.max(0, Math.min(...xs)), v0 = Math.max(0, Math.min(...ys))
  const u1 = Math.min(1, Math.max(...xs)), v1 = Math.min(1, Math.max(...ys))
  if (u1 <= u0 || v1 <= v0) return null
  return [u0,v0,u1,v1]
}

function sameTextures(a: ScreenDecal, b: ScreenDecal): boolean {
  return a.blend === b.blend &&
    a.texture === b.texture && a.normalTexture === b.normalTexture &&
    a.emissiveTexture === b.emissiveTexture && a.roughnessTexture === b.roughnessTexture &&
    a.metalnessTexture === b.metalnessTexture
}

export interface PreparedDecal { decal: ScreenDecal; rect: DecalRect; inverse: mat4 }
/** Groups only ADJACENT compatible decals. Sorting groups would change alpha layering. */
export function prepareDecalBatches(decals: readonly ScreenDecal[], viewProjection: Matrix4Like): PreparedDecal[][] {
  const result: PreparedDecal[][] = []
  for (const decal of decals) {
    if (decal.tint[3] <= 0 || !(decal.depth > 0)) continue
    const rect = decalScreenRect(decal.matrix, decal.depth, viewProjection)
    if (!rect) continue
    const inverse = invertMatrix(decal.matrix)
    if (!inverse) continue
    const last = result[result.length - 1]
    if (last && last.length < MAX_BATCH && sameTextures(last[0].decal, decal)) last.push({decal,rect,inverse})
    else result.push([{decal,rect,inverse}])
  }
  return result
}

const VERTEX = `#version 300 es
precision highp float;
layout(location=0) in vec4 aRect;
layout(location=1) in vec4 aInv0;
layout(location=2) in vec4 aInv1;
layout(location=3) in vec4 aInv2;
layout(location=4) in vec4 aInv3;
layout(location=5) in vec4 aAxis;
layout(location=6) in vec4 aParams;
layout(location=7) in vec4 aTint;
layout(location=8) in vec4 aUVTransform;
layout(location=9) in vec4 aEmission;
layout(location=10) in vec4 aMaterial;
layout(location=11) in vec4 aOptions;
out vec2 vScreenUV;
flat out mat4 vInverseProjector;
flat out vec4 vAxis, vParams, vTint, vUVTransform, vEmission, vMaterial, vOptions;
void main() {
  // A six-vertex screen rectangle, one per instance. No fullscreen passes.
  const vec2 V[6] = vec2[6](vec2(0,0),vec2(1,0),vec2(0,1),vec2(0,1),vec2(1,0),vec2(1,1));
  vec2 f = V[gl_VertexID];
  vScreenUV = mix(aRect.xy, aRect.zw, f);
  gl_Position = vec4(vScreenUV * 2.0 - 1.0, 0.0, 1.0);
  vInverseProjector = mat4(aInv0,aInv1,aInv2,aInv3);
  vAxis=aAxis; vParams=aParams; vTint=aTint; vUVTransform=aUVTransform;
  vEmission=aEmission; vMaterial=aMaterial; vOptions=aOptions;
}`

const FRAGMENT = `#version 300 es
precision highp float;
uniform highp sampler2D uDepth;
uniform sampler2D uBase,uNormal,uEmissive,uRoughness,uMetalness;
uniform mat4 uInverseViewProjection;
uniform vec3 uAmbient,uSunDirection,uSunColor,uCameraPosition;
uniform int uHasNormal,uHasEmissive,uHasRoughness,uHasMetalness,uLightCount;
uniform vec4 uLights[${MAX_LIGHTS}], uLightColors[${MAX_LIGHTS}], uLightCones[${MAX_LIGHTS}];
in vec2 vScreenUV;
flat in mat4 vInverseProjector;
flat in vec4 vAxis,vParams,vTint,vUVTransform,vEmission,vMaterial,vOptions;
out vec4 outColor;
const float PI=3.14159265359;

vec3 litBRDF(vec3 n,vec3 v,vec3 l,vec3 radiance,vec3 albedo,float rough,float metallic) {
  float nl=max(dot(n,l),0.0);
  if (nl<=0.0) return vec3(0.0);
  vec3 h=normalize(v+l);
  float nv=max(dot(n,v),0.001),nh=max(dot(n,h),0.0),vh=max(dot(v,h),0.0);
  float a=max(0.045,rough*rough), a2=a*a;
  float denom=nh*nh*(a2-1.0)+1.0;
  float D=a2/max(PI*denom*denom,0.0001);
  float k=(rough+1.0)*(rough+1.0)/8.0;
  float G=(nv/(nv*(1.0-k)+k))*(nl/(nl*(1.0-k)+k));
  vec3 f0=mix(vec3(0.04),albedo,metallic);
  vec3 F=f0+(1.0-f0)*pow(1.0-vh,5.0);
  vec3 spec=D*G*F/max(4.0*nv*nl,0.01);
  return (albedo*(1.0-metallic)*(1.0-F)/PI+spec)*radiance*nl;
}

void main(){
  float depth=texture(uDepth,vScreenUV).r;
  if(depth>=0.999999) discard;
  vec4 world=uInverseViewProjection*vec4(vScreenUV*2.0-1.0,depth*2.0-1.0,1.0);
  if(abs(world.w)<1e-7) discard;
  vec3 worldPos=world.xyz/world.w;
  // Derivatives are computed before the volume/face rejects, so neighboring
  // pixels do not acquire undefined normals along projector boundaries.
  vec3 dx=dFdx(worldPos),dy=dFdy(worldPos);
  vec3 p=(vInverseProjector*vec4(worldPos,1.0)).xyz;
  vec2 uv=(vec2(p.x+.5,.5-p.y)*vUVTransform.xy)+vUVTransform.zw;
  vec2 du=dFdx(uv),dv=dFdy(uv);
  if(abs(p.x)>.5||abs(p.y)>.5||abs(p.z)>vParams.x) discard;
  vec3 n=normalize(cross(dx,dy));
  if(dot(n,uCameraPosition-worldPos)<0.0) n=-n;
  if(abs(dot(n,normalize(vAxis.xyz)))<vParams.y) discard;
  vec4 sampleColor=texture(uBase,uv);
  if(vParams.w>0.5){
    float bright=max(max(sampleColor.r,sampleColor.g),sampleColor.b);
    sampleColor.a*=smoothstep(vParams.z,vParams.z+.08,bright);
  }
  vec4 c=sampleColor*vTint;
  if(c.a<max(.002,vOptions.x)) discard;
  float rough=clamp(vMaterial.x,0.035,1.0), metal=clamp(vMaterial.y,0.0,1.0);
  if(uHasRoughness>0) rough=clamp(rough*texture(uRoughness,uv).r,.035,1.0);
  if(uHasMetalness>0) metal=clamp(metal*texture(uMetalness,uv).r,0.0,1.0);
  if(vMaterial.z>0.001 && uHasNormal>0){
    vec3 t=dx*dv.y-dy*du.y,b=dy*du.x-dx*dv.x;
    if(dot(t,t)>1e-10 && dot(b,b)>1e-10){
      t=normalize(t-n*dot(n,t));b=normalize(cross(n,t))*sign(dot(cross(n,t),b));
      vec3 m=texture(uNormal,uv).xyz*2.0-1.0;
      m.xy*=vMaterial.z;
      n=normalize(t*m.x+b*m.y+n*m.z);
    }
  }
  vec3 result=c.rgb;
  if(vMaterial.w<.5){
    vec3 viewDir=normalize(uCameraPosition-worldPos);
    result=c.rgb*uAmbient*(1.0-metal);
    result+=litBRDF(n,viewDir,normalize(uSunDirection),uSunColor,c.rgb,rough,metal);
    for(int i=0;i<${MAX_LIGHTS};i++){
      if(i>=uLightCount) break;
      vec4 light=uLights[i];
      bool directional=light.w<0.0;
      vec3 toLight=directional?light.xyz:light.xyz-worldPos;
      float dist=length(toLight);
      vec3 dir=toLight/max(dist,1e-6);
      float atten=directional?1.0:pow(max(0.0,1.0-dist/max(light.w,.001)),2.0);
      vec4 cone=uLightCones[i];
      float k=clamp(dot(cone.xyz,-dir)-cone.w,0.0,1.0);
      atten*=k*k*(3.0-2.0*k);
      result+=litBRDF(n,viewDir,dir,uLightColors[i].rgb*uLightColors[i].a*atten,c.rgb,rough,metal);
    }
  }
  if(uHasEmissive>0) result+=texture(uEmissive,uv).rgb*vEmission.rgb*vEmission.a;
  else result+=vEmission.rgb*vEmission.a;
  outColor=vec4(result,c.a);
}`

function clamp01(x: number): number { return Math.max(0,Math.min(1,x)) }

export class ScreenSpaceDecals {
  private gl: WebGL2RenderingContext | null
  private program: WebGLProgram | null = null
  private vao: WebGLVertexArrayObject | null = null
  private buffer: WebGLBuffer | null = null
  private white: WebGLTexture | null = null
  private flatNormal: WebGLTexture | null = null
  private uniforms: Record<string, WebGLUniformLocation | null> = {}
  private failed = false
  private batchData = new Float32Array(MAX_BATCH*INSTANCE_FLOATS)
  /** Statistics for Scene Profiler; draws counts GPU draw calls, not projectors. */
  lastStats = {projectors:0, culled:0, batches:0, drawCalls:0}
  constructor(gl: WebGL2RenderingContext | null) { this.gl = gl }

  private init(): boolean {
    if(this.failed||!this.gl)return false
    if(this.program)return true
    const gl=this.gl
    const compile=(kind:number,source:string):WebGLShader|null=>{
      const shader=gl.createShader(kind)
      if(!shader)return null
      gl.shaderSource(shader,source)
      gl.compileShader(shader)
      if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS)){
        console.warn('Miniforge projected decal shader:',gl.getShaderInfoLog(shader))
        gl.deleteShader(shader)
        return null
      }
      return shader
    }
    const vs=compile(gl.VERTEX_SHADER,VERTEX),fs=compile(gl.FRAGMENT_SHADER,FRAGMENT)
    if(!vs||!fs){if(vs)gl.deleteShader(vs);if(fs)gl.deleteShader(fs);this.failed=true;return false}
    const program=gl.createProgram()
    if(!program){gl.deleteShader(vs);gl.deleteShader(fs);this.failed=true;return false}
    gl.attachShader(program,vs);gl.attachShader(program,fs);gl.linkProgram(program)
    gl.deleteShader(vs);gl.deleteShader(fs)
    if(!gl.getProgramParameter(program,gl.LINK_STATUS)){
      console.warn('Miniforge projected decal program:',gl.getProgramInfoLog(program))
      gl.deleteProgram(program);this.failed=true;return false
    }
    this.program=program
    this.vao=gl.createVertexArray()
    this.buffer=gl.createBuffer()
    this.white=gl.createTexture()
    this.flatNormal=gl.createTexture()
    if(!this.vao||!this.buffer||!this.white||!this.flatNormal){this.dispose();this.failed=true;return false}
    gl.bindVertexArray(this.vao)
    gl.bindBuffer(gl.ARRAY_BUFFER,this.buffer)
    gl.bufferData(gl.ARRAY_BUFFER,this.batchData.byteLength,gl.DYNAMIC_DRAW)
    let offset=0
    const fields=[4,4,4,4,4,4,4,4,4,4,4,4]
    for(let loc=0;loc<fields.length;loc++){
      gl.enableVertexAttribArray(loc)
      gl.vertexAttribPointer(loc,fields[loc],gl.FLOAT,false,INSTANCE_BYTES,offset)
      gl.vertexAttribDivisor(loc,1)
      offset+=fields[loc]*4
    }
    gl.bindVertexArray(null)
    gl.bindBuffer(gl.ARRAY_BUFFER,null)
    for(const [tex,rgba] of [[this.white,[255,255,255,255]],[this.flatNormal,[128,128,255,255]]] as const){
      gl.bindTexture(gl.TEXTURE_2D,tex)
      gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,1,1,0,gl.RGBA,gl.UNSIGNED_BYTE,new Uint8Array(rgba))
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR)
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR)
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.REPEAT)
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.REPEAT)
    }
    gl.bindTexture(gl.TEXTURE_2D,null)
    for(const name of ['uDepth','uBase','uNormal','uEmissive','uRoughness','uMetalness',
      'uInverseViewProjection','uAmbient','uSunDirection','uSunColor','uCameraPosition',
      'uHasNormal','uHasEmissive','uHasRoughness','uHasMetalness','uLightCount',
      'uLights[0]','uLightColors[0]','uLightCones[0]'])this.uniforms[name]=gl.getUniformLocation(program,name)
    return true
  }

  /** Returns submitted draw calls. Backward-compatible optional lighting argument. */
  render(depthTexture: WebGLTexture|null|undefined,viewProjection: Matrix4Like,
    decals:readonly ScreenDecal[],width:number,height:number,lighting?:DecalLighting):number{
    this.lastStats={projectors:0,culled:0,batches:0,drawCalls:0}
    if(!depthTexture||!decals.length||width<1||height<1||!this.init()||!this.gl||!this.program)return 0
    const invView=invertMatrix(viewProjection)
    if(!invView)return 0
    const batches=prepareDecalBatches(decals,viewProjection)
    const visible=batches.reduce((n,b)=>n+b.length,0)
    this.lastStats={projectors:visible,culled:decals.length-visible,batches:batches.length,drawCalls:0}
    if(!batches.length)return 0
    const gl=this.gl,u=this.uniforms, light=lighting||{
      ambient:[1,1,1],sunDirection:[0,1,0],sunColor:[0,0,0],cameraPosition:[0,0,5],lights:[],
    } as DecalLighting
    gl.bindFramebuffer(gl.FRAMEBUFFER,null)
    gl.viewport(0,0,width,height)
    gl.disable(gl.DEPTH_TEST);gl.disable(gl.CULL_FACE);gl.disable(gl.SCISSOR_TEST);gl.disable(gl.STENCIL_TEST)
    gl.depthMask(false);gl.colorMask(true,true,true,true);gl.enable(gl.BLEND)
    gl.useProgram(this.program);gl.bindVertexArray(this.vao)
    gl.uniformMatrix4fv(u.uInverseViewProjection,false,invView)
    gl.uniform3fv(u.uAmbient,new Float32Array(light.ambient))
    gl.uniform3fv(u.uSunDirection,new Float32Array(light.sunDirection))
    gl.uniform3fv(u.uSunColor,new Float32Array(light.sunColor))
    gl.uniform3fv(u.uCameraPosition,new Float32Array(light.cameraPosition))
    const dynamicLights=(light.lights||[]).slice(0,MAX_LIGHTS)
    const lp=new Float32Array(MAX_LIGHTS*4),lc=new Float32Array(MAX_LIGHTS*4),lk=new Float32Array(MAX_LIGHTS*4)
    dynamicLights.forEach((l,i)=>{
      lp.set([...l.position,l.radius],i*4)
      lc.set([...l.color,l.intensity],i*4)
      lk.set(l.cone||[0,0,0,-1],i*4)
    })
    gl.uniform1i(u.uLightCount,dynamicLights.length)
    gl.uniform4fv(u['uLights[0]'],lp)
    gl.uniform4fv(u['uLightColors[0]'],lc)
    gl.uniform4fv(u['uLightCones[0]'],lk)
    gl.activeTexture(gl.TEXTURE0);gl.bindSampler(0,null)
    gl.bindTexture(gl.TEXTURE_2D,depthTexture);gl.uniform1i(u.uDepth,0)
    const bind=(slot:number,texture:WebGLTexture|null|undefined,uniform:string)=>{
      gl.activeTexture(gl.TEXTURE0+slot)
      gl.bindSampler(slot,null)
      gl.bindTexture(gl.TEXTURE_2D,texture||this.white)
      gl.uniform1i(u[uniform],slot)
    }
    let draws=0
    try{
      for(const batch of batches){
        const first=batch[0].decal
        bind(1,first.texture,'uBase')
        bind(2,first.normalTexture||this.flatNormal,'uNormal')
        bind(3,first.emissiveTexture,'uEmissive')
        bind(4,first.roughnessTexture,'uRoughness')
        bind(5,first.metalnessTexture,'uMetalness')
        gl.uniform1i(u.uHasNormal,first.normalTexture?1:0)
        gl.uniform1i(u.uHasEmissive,first.emissiveTexture?1:0)
        gl.uniform1i(u.uHasRoughness,first.roughnessTexture?1:0)
        gl.uniform1i(u.uHasMetalness,first.metalnessTexture?1:0)
        if(first.blend==='additive')gl.blendFuncSeparate(gl.SRC_ALPHA,gl.ONE,gl.ONE,gl.ONE)
        else gl.blendFuncSeparate(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA,gl.ONE,gl.ONE_MINUS_SRC_ALPHA)
        for(let i=0;i<batch.length;i++){
          const {decal:d,rect,inverse}=batch[i]
          const at=i*INSTANCE_FLOATS
          this.batchData.set(rect,at)
          this.batchData.set(inverse,at+4)
          const m=d.matrix
          const len=Math.hypot(m[8],m[9],m[10])||1
          this.batchData.set([m[8]/len,m[9]/len,m[10]/len,0],at+20)
          this.batchData.set([d.depth/2,clamp01(d.facing),clamp01(d.darkThreshold??.08),d.darkBackgroundTransparent?1:0],at+24)
          this.batchData.set(d.tint,at+28)
          this.batchData.set(d.uvTransform||[1,1,0,0],at+32)
          const emission=d.emissiveColor||[0,0,0]
          this.batchData.set([emission[0],emission[1],emission[2],Math.max(0,d.emissiveStrength??0)],at+36)
          this.batchData.set([clamp01(d.roughness??.8),clamp01(d.metalness??0),Math.max(0,d.normalScale??1),d.unlit?1:0],at+40)
          this.batchData.set([clamp01(d.alphaCutoff??0),0,0,0],at+44)
        }
        gl.bindBuffer(gl.ARRAY_BUFFER,this.buffer)
        gl.bufferSubData(gl.ARRAY_BUFFER,0,this.batchData.subarray(0,batch.length*INSTANCE_FLOATS))
        gl.drawArraysInstanced(gl.TRIANGLES,0,6,batch.length)
        draws++
      }
    }finally{
      for(let slot=5;slot>=0;slot--){gl.activeTexture(gl.TEXTURE0+slot);gl.bindTexture(gl.TEXTURE_2D,null);gl.bindSampler(slot,null)}
      gl.activeTexture(gl.TEXTURE0)
      gl.bindBuffer(gl.ARRAY_BUFFER,null);gl.bindVertexArray(null);gl.useProgram(null)
      gl.disable(gl.BLEND);gl.depthMask(true)
    }
    this.lastStats.drawCalls=draws
    return draws
  }

  dispose(){
    const gl=this.gl
    if(!gl)return
    if(this.program)gl.deleteProgram(this.program)
    if(this.vao)gl.deleteVertexArray(this.vao)
    if(this.buffer)gl.deleteBuffer(this.buffer)
    if(this.white)gl.deleteTexture(this.white)
    if(this.flatNormal)gl.deleteTexture(this.flatNormal)
    this.program=null;this.vao=null;this.buffer=null;this.white=null;this.flatNormal=null;this.gl=null
  }
}
