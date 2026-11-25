/**
 * CPU diffuse global-illumination baker. It does NOT replace LittleJS's realtime direct
 * lighting; it adds indirect diffuse radiance via emissive textures. Geometry, visibility,
 * emissive/albedo maps and area-bounce rays are evaluated in world space.
 *
 * The renderer exposes only one UV set, therefore meshes with overlapping UV islands
 * cannot obtain fully independent lightmaps without introducing a second UV channel.
 */
export type GI3 = [number, number, number]
export type GI2 = [number, number]
export interface GITexture { width: number; height: number; pixels: Uint8ClampedArray }
export interface GIMaterial {
  albedo: GI3
  emissive: GI3 // emissive-map color; added by LittleJS independently of obj.emissive
  unlit?: number // LittleJS obj.emissive controls base-color unlit blending, not emissive-map brightness
  albedoMap?: GITexture
  emissiveMap?: GITexture
  opacity: number
  castShadow: boolean
  receiveShadow: boolean
}
export interface GITriangle {
  a: GI3; b: GI3; c: GI3
  uvA: GI2; uvB: GI2; uvC: GI2
  material: GIMaterial
  owner: string
}
export interface GILight {
  kind: 'point' | 'spot' | 'directional'
  position: GI3
  direction: GI3 // points FROM light TO scene for spot; TOWARDS light for directional
  color: GI3
  intensity: number
  range: number
  angle?: number
  softness?: number
}
export interface GISettings {
  resolution: number
  rays: number
  bounces: number
  strength: number
  ambient: GI3
  ambientIntensity: number
}

type Hit = { index: number; distance: number; u: number; v: number }
type Bounds = { lo: GI3; hi: GI3 }
type BVH = Bounds & { children?: [BVH, BVH]; indices?: number[] }
const EPS = 0.002
const add = (a: GI3, b: GI3): GI3 => [a[0]+b[0], a[1]+b[1], a[2]+b[2]]
const sub = (a: GI3, b: GI3): GI3 => [a[0]-b[0], a[1]-b[1], a[2]-b[2]]
const mul = (a: GI3, k: number): GI3 => [a[0]*k, a[1]*k, a[2]*k]
const had = (a: GI3, b: GI3): GI3 => [a[0]*b[0], a[1]*b[1], a[2]*b[2]]
const dot = (a: GI3, b: GI3) => a[0]*b[0]+a[1]*b[1]+a[2]*b[2]
const cross = (a: GI3, b: GI3): GI3 => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]]
const length = (a: GI3) => Math.sqrt(dot(a,a))
const norm = (a: GI3): GI3 => mul(a, 1 / Math.max(1e-10, length(a)))
const clamp = (x: number, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, x))
const weighted = (a: GI3, b: GI3, c: GI3, u: number, v: number): GI3 => [a[0]*(1-u-v)+b[0]*u+c[0]*v, a[1]*(1-u-v)+b[1]*u+c[1]*v, a[2]*(1-u-v)+b[2]*u+c[2]*v]
const frac = (n: number) => n - Math.floor(n)
const radicalInverse = (i: number) => { let r=0, p=0.5; while(i) {r+=(i&1)*p; i>>=1; p*=0.5} return r }

export function sampleGITexture(tex: GITexture | undefined, uv: GI2): GI3 {
  if (!tex || tex.width < 1 || tex.height < 1) return [1,1,1]
  const x = Math.min(tex.width-1, Math.floor(frac(uv[0]) * tex.width))
  const y = Math.min(tex.height-1, Math.floor(frac(uv[1]) * tex.height))
  const i = (y * tex.width + x) * 4
  const a = (tex.pixels[i+3] ?? 255)/255
  return [0,1,2].map(k => (tex.pixels[i+k]/255)*a) as GI3
}
export function triangleNormal(t: GITriangle): GI3 { return norm(cross(sub(t.b,t.a), sub(t.c,t.a))) }
export function triangleUV(t: GITriangle, u: number, v: number): GI2 {
  return [t.uvA[0]*(1-u-v)+t.uvB[0]*u+t.uvC[0]*v, t.uvA[1]*(1-u-v)+t.uvB[1]*u+t.uvC[1]*v]
}
export function surfaceEmission(t: GITriangle, u: number, v: number): GI3 {
  const uv = triangleUV(t,u,v)
  const mapped = t.material.emissiveMap
    ? had(t.material.emissive, sampleGITexture(t.material.emissiveMap, uv))
    : ([0,0,0] as GI3)
  return add(mapped, mul(had(t.material.albedo,sampleGITexture(t.material.albedoMap,uv)), t.material.unlit ?? 0))
}
export function surfaceAlbedo(t: GITriangle, u: number, v: number): GI3 {
  return had(t.material.albedo, sampleGITexture(t.material.albedoMap, triangleUV(t,u,v)))
}

function triangleBounds(t: GITriangle): Bounds {
  return {lo:[Math.min(t.a[0],t.b[0],t.c[0]),Math.min(t.a[1],t.b[1],t.c[1]),Math.min(t.a[2],t.b[2],t.c[2])],
    hi:[Math.max(t.a[0],t.b[0],t.c[0]),Math.max(t.a[1],t.b[1],t.c[1]),Math.max(t.a[2],t.b[2],t.c[2])]}
}
export function buildGIBVH(tris: GITriangle[]): BVH | undefined {
  if (!tris.length) return undefined
  const bounds = tris.map(triangleBounds)
  const build = (indices: number[]): BVH => {
    const lo: GI3=[Infinity,Infinity,Infinity], hi: GI3=[-Infinity,-Infinity,-Infinity]
    for (const i of indices) for(let axis=0;axis<3;axis++) {lo[axis]=Math.min(lo[axis],bounds[i].lo[axis]);hi[axis]=Math.max(hi[axis],bounds[i].hi[axis])}
    if (indices.length<=8) return {lo,hi,indices}
    let axis=0
    if (hi[1]-lo[1]>hi[axis]-lo[axis]) axis=1
    if (hi[2]-lo[2]>hi[axis]-lo[axis]) axis=2
    indices.sort((i,j)=>(bounds[i].lo[axis]+bounds[i].hi[axis])-(bounds[j].lo[axis]+bounds[j].hi[axis]))
    const m=indices.length>>1
    return {lo,hi,children:[build(indices.slice(0,m)), build(indices.slice(m))]}
  }
  return build(tris.map((_,i)=>i))
}
function intersectTriangle(t: GITriangle, origin: GI3, dir: GI3, maxDist: number): Hit | undefined {
  const e1=sub(t.b,t.a),e2=sub(t.c,t.a),p=cross(dir,e2),det=dot(e1,p)
  if (Math.abs(det)<1e-9) return
  const inv=1/det,s=sub(origin,t.a),u=dot(s,p)*inv
  if(u<0||u>1) return
  const q=cross(s,e1),v=dot(dir,q)*inv
  if(v<0||u+v>1) return
  const distance=dot(e2,q)*inv
  if(distance<=EPS||distance>=maxDist) return
  return {index:-1,distance,u,v}
}
function boxHit(b: Bounds, o: GI3, d: GI3, maxDist: number) {
  let tmin=0, tmax=maxDist
  for(let axis=0;axis<3;axis++) {
    if(Math.abs(d[axis])<1e-10) {if(o[axis]<b.lo[axis]||o[axis]>b.hi[axis])return false;continue}
    let a=(b.lo[axis]-o[axis])/d[axis], c=(b.hi[axis]-o[axis])/d[axis]
    if(a>c) [a,c]=[c,a]
    tmin=Math.max(tmin,a); tmax=Math.min(tmax,c)
    if(tmax<tmin)return false
  }
  return true
}
export function traceGIRay(tris: GITriangle[], tree: BVH | undefined, origin: GI3, dir: GI3, distance = Infinity): Hit | undefined {
  if(!tree)return
  let best: Hit | undefined
  const stack=[tree]
  let limit=distance
  while(stack.length) {
    const node=stack.pop()!
    if(!boxHit(node,origin,dir,limit))continue
    if(node.indices) for(const i of node.indices) {
      const t=tris[i]
      if(t.material.opacity<0.95 || !t.material.castShadow)continue
      const hit=intersectTriangle(t,origin,dir,limit)
      if(hit) {hit.index=i;best=hit;limit=hit.distance}
    }
    else if(node.children)stack.push(...node.children)
  }
  return best
}
function orthonormal(normal: GI3, u: number, v: number): GI3 {
  const phi=2*Math.PI*u,r=Math.sqrt(v),z=Math.sqrt(1-v)
  const helper: GI3=Math.abs(normal[1])<0.95?[0,1,0]:[1,0,0]
  const tangent=norm(cross(helper,normal)),bitangent=cross(normal,tangent)
  return norm(add(add(mul(tangent,r*Math.cos(phi)),mul(bitangent,r*Math.sin(phi))),mul(normal,z)))
}
export class GIBaker {
  private tree: BVH | undefined
  public triangles: GITriangle[]
  public lights: GILight[]
  public settings: GISettings
  constructor(triangles: GITriangle[], lights: GILight[], settings: GISettings) {
    this.triangles = triangles
    this.lights = lights
    this.settings = settings
    this.tree = buildGIBVH(triangles)
  }
  /** Irradiance at a surface, with visibility. Realtime direct light is NOT written to the output. */
  directIrradiance(p: GI3, n: GI3): GI3 {
    let sum:GI3=[0,0,0]
    for(const light of this.lights) {
      if(light.intensity<=0)continue
      let direction:GI3, dist=Infinity, attenuation=1
      if(light.kind==='directional') direction=norm(light.direction)
      else {
        const vec=sub(light.position,p)
        dist=length(vec)
        if(dist<=EPS||dist>=light.range)continue
        direction=mul(vec,1/dist)
        attenuation=(1-dist/light.range)**2
        if(light.kind==='spot') {
          const c=dot(norm(light.direction),mul(direction,-1))
          const angle=light.angle??0.6
          const edge=Math.cos(angle)
          const fade=Math.max(0.0001, Math.cos(angle*(1-clamp(light.softness??0.25)))-edge)
          attenuation*=clamp((c-edge)/fade)
        }
      }
      const ndotl=Math.max(0,dot(n,direction))
      if(ndotl<=0||attenuation<=0)continue
      if(traceGIRay(this.triangles,this.tree,add(p,mul(n,EPS*3)),direction,dist===Infinity?Infinity:Math.max(EPS,dist-EPS*5)))continue
      sum=add(sum,mul(light.color,light.intensity*attenuation*ndotl))
    }
    return sum
  }
  private hitRadiance(hit: Hit, inbound: GI3, depth: number, seed: number): GI3 {
    const t=this.triangles[hit.index]
    const p=weighted(t.a,t.b,t.c,hit.u,hit.v)
    let n=triangleNormal(t)
    // Double-sided diffuse response, including meshes with mirrored winding.
    if(dot(n,inbound)>0)n=mul(n,-1)
    const emission=surfaceEmission(t,hit.u,hit.v)
    const direct=this.directIrradiance(p,n)
    const base=add(direct,mul(this.settings.ambient,this.settings.ambientIntensity))
    let reflected=had(surfaceAlbedo(t,hit.u,hit.v),mul(base,1/Math.PI))
    if(depth>1) {
      const dir=orthonormal(n,frac(seed*0.61803398875),frac(seed*0.75487766625+0.5))
      const next=traceGIRay(this.triangles,this.tree,add(p,mul(n,EPS*3)),dir)
      if(next) reflected=add(reflected,had(surfaceAlbedo(t,hit.u,hit.v),mul(this.hitRadiance(next,dir,depth-1,seed+13.37),0.7)))
    }
    return add(emission,reflected)
  }
  /** Returns only reflected light, so dynamic direct lights aren't counted twice. */
  indirectAt(p:GI3,n:GI3,seed=0):GI3 {
    const rays=Math.max(1,Math.floor(this.settings.rays))
    let accum:GI3=[0,0,0]
    for(let k=0;k<rays;k++) {
      const direction=orthonormal(n,frac((k+0.5)/rays+seed*0.75487766),frac(radicalInverse(k+1)+seed*0.6180339))
      const hit=traceGIRay(this.triangles,this.tree,add(p,mul(n,EPS*3)),direction)
      if(hit)accum=add(accum,this.hitRadiance(hit,direction,Math.max(1,Math.floor(this.settings.bounces)),seed+k*2.71))
    }
    return mul(accum,Math.max(0,this.settings.strength)/rays)
  }
  /** Texture-aligned GI for meshes with UVs. Source emissive is composed, not replaced. */
  bake(owner: string, resolution: number, preserveEmission = true): { pixels: Uint8ClampedArray; populated: number } {
    const size=Math.max(4,Math.min(128,Math.floor(resolution)))
    const pixels=new Uint8ClampedArray(size*size*4),weights=new Uint16Array(size*size)
    const ownerTriangles=this.triangles.filter(t=>t.owner===owner&&t.material.receiveShadow)
    let populated=0
    for(const t of ownerTriangles) {
      const ua=t.uvA,ub=t.uvB,uc=t.uvC
      const det=(ub[1]-uc[1])*(ua[0]-uc[0])+(uc[0]-ub[0])*(ua[1]-uc[1])
      if(Math.abs(det)<1e-8)continue
      const xmin=Math.max(0,Math.floor(Math.min(ua[0],ub[0],uc[0])*size)),xmax=Math.min(size-1,Math.ceil(Math.max(ua[0],ub[0],uc[0])*size))
      const ymin=Math.max(0,Math.floor(Math.min(ua[1],ub[1],uc[1])*size)),ymax=Math.min(size-1,Math.ceil(Math.max(ua[1],ub[1],uc[1])*size))
      const n=triangleNormal(t)
      for(let y=ymin;y<=ymax;y++)for(let x=xmin;x<=xmax;x++) {
        const u=(x+0.5)/size,v=(y+0.5)/size
        const wa=((ub[1]-uc[1])*(u-uc[0])+(uc[0]-ub[0])*(v-uc[1]))/det
        const wb=((uc[1]-ua[1])*(u-uc[0])+(ua[0]-uc[0])*(v-uc[1]))/det
        const wc=1-wa-wb
        if(wa< -0.0001||wb< -0.0001||wc< -0.0001)continue
        const p=add(add(mul(t.a,wa),mul(t.b,wb)),mul(t.c,wc))
        const ir=this.indirectAt(p,n,((x+1)*73+(y+1)*151)*0.001)
        const albedo=surfaceAlbedo(t,wb,wc)
        // Preserve ONLY the emissive-map term: LittleJS already renders `unlit` as
        // part of base shading, which we must not double count in the texture.
        const emit=preserveEmission && t.material.emissiveMap
          ? had(t.material.emissive, sampleGITexture(t.material.emissiveMap,triangleUV(t,wb,wc)))
          : ([0,0,0] as GI3)
        const out=add(emit,had(albedo,ir))
        const idx=y*size+x, b=idx*4, w=weights[idx]
        for(let ch=0;ch<3;ch++) pixels[b+ch]=Math.min(255,Math.round((pixels[b+ch]*w+clamp(out[ch],0,1)*255)/(w+1)))
        pixels[b+3]=255
        weights[idx]=Math.min(65535,w+1)
        if(w===0)populated++
      }
    }
    // Extend texel edges into empty UV pixels to avoid seams under bilinear filtering.
    for(let pass=0;pass<3;pass++) {
      const next=pixels.slice(),nw=weights.slice()
      for(let y=0;y<size;y++)for(let x=0;x<size;x++) {
        const i=y*size+x
        if(weights[i])continue
        for(const [ox,oy] of [[-1,0],[1,0],[0,-1],[0,1]]) {
          const xx=x+ox,yy=y+oy
          if(xx<0||xx>=size||yy<0||yy>=size||!weights[yy*size+xx])continue
          next.set(pixels.subarray((yy*size+xx)*4,(yy*size+xx)*4+4),i*4)
          nw[i]=1
          break
        }
      }
      pixels.set(next); weights.set(nw)
    }
    return {pixels,populated}
  }
}
