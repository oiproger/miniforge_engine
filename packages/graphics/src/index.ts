import type * as L from 'littlejsengine'
import { createDevice } from './device.generated'
import { SceneNode, SceneCamera, Vector3, type Triangles } from './scene'
import { terrainGeometry } from './terrain'
import { PostProcessor, defaultPostProcess, type PostProcessOptions } from './postprocess'
import { defaultParticleConfig, ensureTerrainLayers, isEligibleForStaticBatch, type Project, type Entity, type Component, type ParticleConfig, type Terrain, type Vec3 } from '../../project-schema/src'

export type { PostProcessOptions } from './postprocess'
export { defaultPostProcess } from './postprocess'
export interface ProceduralSkyOptions {
  topColor?: string
  horizonColor?: string
  bottomColor?: string
  sunColor?: string
  sunSize?: number
  cloudColor?: string
  cloudCoverage?: number
  cloudSpeed?: number
  cloudScale?: number
  starIntensity?: number
}

export interface SkyboxFace {
  texture?: string
  color?: string
}

export interface SkyboxFaces {
  px?: SkyboxFace
  nx?: SkyboxFace
  py?: SkyboxFace
  ny?: SkyboxFace
  pz?: SkyboxFace
  nz?: SkyboxFace
}

function buildProceduralSkyShader(opts: ProceduralSkyOptions) {
  const top = hexToVec3(opts.topColor || "#243b55")
  const horizon = hexToVec3(opts.horizonColor || "#9ab2c4")
  const bottom = hexToVec3(opts.bottomColor || "#232a30")
  const sunCol = hexToVec3(opts.sunColor || "#fff1cc")
  const cloudCol = hexToVec3(opts.cloudColor || "#e4ebf0")
  const sunSize = Math.max(8, Math.min(256, Number(opts.sunSize ?? 72))).toFixed(2)
  const coverage = Math.max(0, Math.min(1, Number(opts.cloudCoverage ?? 0.48))).toFixed(3)
  const speed = Number(opts.cloudSpeed ?? 0.035).toFixed(4)
  const scale = Math.max(0.2, Number(opts.cloudScale ?? 1.8)).toFixed(3)
  const stars = Math.max(0, Math.min(1, Number(opts.starIntensity ?? 0.0))).toFixed(3)
  return `float skyHash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }
float skyNoise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(skyHash(i), skyHash(i + vec2(1.0, 0.0)), u.x),
             mix(skyHash(i + vec2(0.0, 1.0)), skyHash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float skyFbm(vec2 p){
  float v = 0.0, a = 0.5;
  for(int i = 0; i < 4; i++){ v += a * skyNoise(p); p *= 2.04; a *= 0.5; }
  return v;
}
void mainImage(out vec4 color, vec2 uv) {
  vec3 dir = normalize(worldPos - cameraPos);
  float h = clamp(dir.y, -1.0, 1.0);
  vec3 sky = h >= 0.0
    ? mix(${horizon}, ${top}, pow(h, 0.52))
    : mix(${horizon}, ${bottom}, pow(-h, 0.6));
  float sunAmt = max(0.0, dot(dir, normalize(sunDirection)));
  sky += ${sunCol} * pow(sunAmt, ${sunSize}) * 0.75;
  sky += ${sunCol} * pow(sunAmt, 8.0) * 0.14;
  if (h > 0.02 && ${stars} > 0.005) {
    vec2 sp = floor((dir.xz / (h + 0.25)) * 110.0);
    float st = step(0.994, skyHash(sp)) * smoothstep(0.05, 0.4, h);
    sky += vec3(0.9, 0.95, 1.0) * st * ${stars};
  }
  if (h > 0.01 && ${coverage} > 0.005) {
    vec2 cp = (dir.xz / (h + 0.18)) * ${scale} + vec2(iTime * ${speed}, iTime * ${speed} * 0.45);
    float n = skyFbm(cp);
    float cMask = smoothstep(1.0 - ${coverage}, 1.0 - ${coverage} * 0.25, n) * smoothstep(0.01, 0.22, h);
    vec3 litCloud = mix(${cloudCol} * 0.72, ${cloudCol} + ${sunCol} * 0.22, 0.45 + 0.55 * sunAmt);
    sky = mix(sky, litCloud, clamp(cMask * 0.88, 0.0, 0.92));
  }
  color = vec4(sky, 1.0);
}`
}

export type RenderWorld = ReturnType<typeof createWorld>

function hexToVec3(hex: string): string {
  const clean = (hex || '#ffffff').replace('#', '')
  const full = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean.padEnd(6, '0')
  const r = (parseInt(full.slice(0, 2), 16) || 0) / 255
  const g = (parseInt(full.slice(2, 4), 16) || 0) / 255
  const b = (parseInt(full.slice(4, 6), 16) || 0) / 255
  return `vec3(${r.toFixed(3)},${g.toFixed(3)},${b.toFixed(3)})`
}

function buildWaterShaders(c: Component) {
  const waveHeight = Number(c.waveHeight ?? 0.14).toFixed(4)
  const waveSpeed = Number(c.waveSpeed ?? 1.4).toFixed(4)
  const waveScale = Number(c.waveScale ?? 0.7).toFixed(4)
  const opacity = Math.max(0.05, Math.min(1, Number(c.opacity ?? 0.82))).toFixed(4)
  const fresnelPower = Math.max(0.5, Number(c.fresnelPower ?? 2.6)).toFixed(4)
  const foamAmount = Math.max(0, Math.min(1, Number(c.foamAmount ?? 0.35))).toFixed(4)
  const deep = hexToVec3(c.deepColor || '#153a4a')
  const shallow = hexToVec3(c.shallowColor || '#3c8ea0')
  const vertex = `void mainVertex(inout vec3 position, inout vec3 normal) {
  float t = iTime * ${waveSpeed};
  float w1 = sin(position.x * ${waveScale} * 6.0 + t) * cos(position.z * ${waveScale} * 4.5 + t * 0.8);
  float w2 = sin((position.x + position.z) * ${waveScale} * 9.0 - t * 1.35) * 0.45;
  position.y += (w1 + w2) * ${waveHeight};
  normal = normalize(vec3(-cos(position.x * ${waveScale} * 6.0 + t) * ${waveHeight} * 2.0, 1.0, -sin(position.z * ${waveScale} * 4.5 + t * 0.8) * ${waveHeight} * 2.0));
}`
  const fragment = `void mainImage(out vec4 color, vec2 uv) {
  float t = iTime * ${waveSpeed};
  vec3 viewDir = normalize(cameraPos - worldPos);
  vec3 n = normalize(worldNormal + vec3(
    sin(worldPos.x * 3.1 + t * 1.6) * 0.08,
    0.0,
    cos(worldPos.z * 2.7 - t * 1.3) * 0.08
  ));
  float fresnel = pow(1.0 - max(0.0, dot(n, viewDir)), ${fresnelPower});
  float ripple = sin(worldPos.x * 2.4 + t) * cos(worldPos.z * 2.1 - t * 0.9);
  vec3 baseCol = mix(${deep}, ${shallow}, clamp(0.3 + 0.55 * fresnel + 0.15 * ripple, 0.0, 1.0));
  vec3 halfVec = normalize(normalize(sunDirection) + viewDir);
  float spec = pow(max(0.0, dot(n, halfVec)), 48.0) * 0.65;
  float foam = smoothstep(0.55, 0.95, ripple * 0.5 + 0.5) * ${foamAmount};
  vec3 finalCol = baseCol + vec3(spec) + vec3(foam * 0.55);
  color = vec4(finalCol, clamp(${opacity} + fresnel * 0.16, 0.0, 1.0));
}`
  return { vertex, fragment }
}

function buildVolumetricShader(c: Component) {
  const col = hexToVec3(c.color || '#ffe5b4')
  const intensity = Math.max(0.01, Math.min(2, Number(c.intensity ?? 0.42))).toFixed(4)
  const softness = Math.max(0.5, Number(c.softness ?? 2.2)).toFixed(4)
  const dustSpeed = Number(c.dustSpeed ?? 0.35).toFixed(4)
  return `void mainImage(out vec4 color, vec2 uv) {
  vec3 viewDir = normalize(cameraPos - worldPos);
  float edge = pow(abs(dot(normalize(worldNormal), viewDir)), ${softness});
  float vertical = smoothstep(0.0, 0.32, localUV.y) * smoothstep(1.0, 0.05, localUV.y);
  float dust = 0.82 + 0.18 * sin(worldPos.y * 5.0 - iTime * ${dustSpeed} * 4.0 + worldPos.x * 3.0);
  float alpha = clamp(edge * vertical * dust * ${intensity}, 0.0, 0.88);
  if (alpha < 0.008) discard;
  color = vec4(${col}, alpha);
}`
}

function buildSkyShader(topHex: string, horizonHex: string, bottomHex: string) {
  const top = hexToVec3(topHex)
  const horizon = hexToVec3(horizonHex)
  const bottom = hexToVec3(bottomHex)
  return `void mainImage(out vec4 color, vec2 uv) {
  vec3 dir = normalize(worldPos - cameraPos);
  float h = clamp(dir.y, -1.0, 1.0);
  vec3 sky = h >= 0.0
    ? mix(${horizon}, ${top}, pow(h, 0.55))
    : mix(${horizon}, ${bottom}, pow(-h, 0.6));
  float sunAmt = max(0.0, dot(dir, normalize(sunDirection)));
  sky += vec3(1.0, 0.92, 0.78) * pow(sunAmt, 64.0) * 0.45;
  color = vec4(sky, 1.0);
}`
}

export function createWorld(
  container: HTMLElement,
  initial: Project,
  sceneId?: string,
  options: { editor?: boolean; onAnimationFinished?: (id: string, clip: string) => void } = {},
) {
  const d = createDevice(container),
    r = d.r,
    canvas = d.canvas
  canvas.style.cssText = 'display:block;width:100%;height:100%;touch-action:none;outline:none'
  canvas.dataset.renderer = 'littlejs-render3d'
  if (getComputedStyle(container).position === 'static') container.style.position = 'relative'
  const post = new PostProcessor(container)
  const objects = new Map<string, SceneNode>(),
    roots = new Map<string, L.EngineObject3D>(),
    renderables = new Map<string, L.EngineObject3D[]>()
  const owners = new Map<L.EngineObject, SceneNode>(),
    meshes = new Map<string, L.Mesh>()
  const sceneLights = new Map<string, Component>()
  const entityLights = new Map<string, L.Light3D>()
  const activeFlares: any[] = []
  interface SunRaySource {
    id: string
    directional: boolean
    intensity: number
    decay: number
    color: [number, number, number]
    enabled: boolean
  }
  const sunRaySources = new Map<string, SunRaySource>()
  interface ProbeRecord {
    id: string
    cube: { size: number; capturePos: L.Vector3 }
    mode: 'baked' | 'realtime'
    interval: number
    bounds?: { center: Vec3; half: Vec3 }
    bakeLight: boolean
    lightBounce: number
  }
  const zoneProbes = new Map<string, ProbeRecord>()
  let globalProbe: ProbeRecord | undefined
  let globalReflectionMode: 'off' | 'baked' | 'realtime' = 'off'
  let globalReflectionRes = 128
  let globalReflectionInterval = 4
  let globalBakedLighting = false
  let shadowFollowCamera = false
  let renderFrameCount = 0
  let resolutionScale = 1
  let lightCullDist = 45
  let particleCullDist = 40
  let animationThrottle = true
  let staticBatching = false
  let globalCullDist = 0
  const entityCullDist = new Map<string, number>()
  const distanceCulled = new Set<string>()
  const entityLightBaseIntensity = new Map<string, number>()
  const batchedMeshes: L.EngineObject3D[] = []
  const _tmpV1 = new Vector3()
  const _tmpV2 = new Vector3()
  const _tmpV3 = new Vector3()
  const debugQueue: { kind: 'line' | 'box'; a: Vec3; b: Vec3; color: string; until: number }[] = []
  interface ParticleInstance {
    obj: L.EngineObject3D
    alive: boolean
    age: number
    life: number
    pos: Vec3
    vel: Vec3
  }
  interface EmitterState {
    id: string
    config: ParticleConfig
    pool: ParticleInstance[]
    accum: number
    playing: boolean
    startCol: [number, number, number]
    endCol: [number, number, number]
  }
  interface BillboardState {
    id: string
    obj: L.EngineObject3D
    lockY: boolean
    width: number
    height: number
    atlasCols: number
    atlasRows: number
    frame: number
    fps: number
    accum: number
  }
  interface DecalState {
    id: string
    obj: L.EngineObject3D
    width: number
    height: number
    normalOffset: number
    opacity: number
  }
  interface DynamicDecal {
    obj: L.EngineObject3D
    age: number
    lifetime: number
    opacity: number
  }
  const emitters = new Map<string, EmitterState>()
  const billboards = new Map<string, BillboardState>()
  const decals = new Map<string, DecalState>()
  const dynamicDecals: DynamicDecal[] = []
  let softPtcTex: L.TextureInfo | undefined
  let lastParticleTick = performance.now()

  let grid: L.EngineObject3D | undefined,
    skyDome: L.EngineObject3D | undefined,
    skyCube: L.EngineObject3D[] = [],
    flashlight: L.Light3D | undefined,
    flashlightEnabled = false,
    editorTime = performance.now()
  const players = new Map<string, L.GLTFObject>(),
    models = new Map<string, Promise<L.GLTFModel>>()
  const liveCanvasTextures = new Map<string, L.TextureInfo>()
  const textures = new Map<string, Promise<L.TextureInfo>>(),
    shaders = new Map<string, L.Shader>()
  const camera = new SceneCamera(),
    info = { render: { calls: 0, triangles: 0 }, memory: { textures: 0 } }
  const renderer = { domElement: canvas, info }
  let exposure = 1,
    ambient = 1,
    ambientTint = '#c8cfda',
    ambientGroundTint = '',
    ambientGroundIntensity = 0.5,
    sunTint = '#fff3d9',
    sunIntensity = 1,
    sunDir: Vec3 = [-4, 8, 6],
    runtimeEnvOverride = false
    zoneProbes.clear()
    globalProbe = undefined
    ;(r as any).environment = undefined
    ;(r as any).shadowLight = undefined
    debugQueue.length = 0
  let project = initial,
    pending: Promise<unknown>[] = [],
    generation = 0,
    ratio = 1,
    disposed = false
  const v = (p: { x: number; y: number; z: number }) => d.vec3(p.x, p.y, p.z)
  const color = (hex: string, alpha = 1) => {
    const c = new d.Color().setHex(hex)
    c.a = alpha
    return c
  }
  function owner(o: L.EngineObject): SceneNode | undefined {
    for (let p: L.EngineObject | undefined = o; p; p = p.parent) {
      const n = owners.get(p)
      if (n) return n
    }
  }
  const hidden = (o: L.EngineObject) => { const ow = owner(o); return !ow ? false : ow.active === false || distanceCulled.has(ow.id) }
  function hexToRgbTuple(hex: string): [number, number, number] {
    const clean = (hex || '#ffffff').replace('#', '')
    const full = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean.padEnd(6, 'f')
    const n = parseInt(full.slice(0, 6), 16)
    return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
  }
  function unitQuadMesh(): L.Mesh {
    let q = meshes.get('__unitQuadXY')
    if (!q) {
      const pts = [
        d.vec3(-0.5, -0.5, 0),
        d.vec3(0.5, -0.5, 0),
        d.vec3(0.5, 0.5, 0),
        d.vec3(-0.5, 0.5, 0),
      ]
      const uvs = [d.vec2(0, 1), d.vec2(1, 1), d.vec2(1, 0), d.vec2(0, 0)]
      q = new d.Mesh().addTriangles(pts, [0, 1, 2, 0, 2, 3], undefined, uvs).computeNormals(false)
      q.doubleSided = true
      meshes.set('__unitQuadXY', q)
    }
    return q
  }
  function softParticleTexture(): L.TextureInfo {
    if (!softPtcTex) {
      const c = document.createElement('canvas')
      c.width = 64
      c.height = 64
      const ctx = c.getContext('2d')!
      const grad = ctx.createRadialGradient(32, 32, 2, 32, 32, 30)
      grad.addColorStop(0, 'rgba(255,255,255,1)')
      grad.addColorStop(0.45, 'rgba(255,255,255,0.65)')
      grad.addColorStop(1, 'rgba(255,255,255,0)')
      ctx.fillStyle = grad
      ctx.fillRect(0, 0, 64, 64)
      softPtcTex = new d.TextureInfo(c, true, true, false)
    }
    return softPtcTex
  }
  function resolveParticleConfig(c: Component): ParticleConfig {
    const asset = c.assetId
      ? project.assets.find((a) => a.id === c.assetId && a.type === 'particle')
      : undefined
    const base = defaultParticleConfig(c.preset)
    return {
      ...base,
      ...(asset?.properties ?? {}),
      ...(c.overrides ?? {}),
      rate: c.rate ?? asset?.properties?.rate ?? base.rate,
      maxParticles: Math.max(1, Math.min(250, Number(c.maxParticles ?? asset?.properties?.maxParticles ?? base.maxParticles))),
      playing: c.playing !== undefined ? Boolean(c.playing) : (asset?.properties?.playing ?? base.playing),
    }
  }
  function buildAtlasShader(cols: number, rows: number, frame: number): L.Shader {
    const c = Math.max(1, Math.floor(cols))
    const rCount = Math.max(1, Math.floor(rows))
    const f = ((Math.floor(frame) % (c * rCount)) + c * rCount) % (c * rCount)
    const key = `atlas:${c}:${rCount}:${f}`
    if (!shaders.has(key)) {
      const col = f % c
      const row = Math.floor(f / c)
      const sx = (1 / c).toFixed(5)
      const sy = (1 / rCount).toFixed(5)
      const ox = (col / c).toFixed(5)
      const oy = (row / rCount).toFixed(5)
      shaders.set(
        key,
        new d.Shader(
          `void mainImage(out vec4 c,vec2 uv){vec2 auv=vec2(uv.x*${sx}+${ox},uv.y*${sy}+${oy});c=texture(iChannel0,auv);if(c.a<0.02)discard;}`,
        ),
      )
    }
    return shaders.get(key)!
  }
  function spawnOneParticle(em: EmitterState, origin: Vec3) {
    const slot = em.pool.find((p) => !p.alive)
    if (!slot) return
    const cfg = em.config
    let ox = origin[0], oy = origin[1], oz = origin[2]
    const ss = cfg.shapeSize || [0.2, 0.2, 0.2]
    if (cfg.shape === 'box') {
      ox += (Math.random() - 0.5) * ss[0]
      oy += (Math.random() - 0.5) * ss[1]
      oz += (Math.random() - 0.5) * ss[2]
    } else if (cfg.shape === 'sphere') {
      const th = Math.random() * Math.PI * 2
      const ph = Math.acos(2 * Math.random() - 1)
      const rad = Math.cbrt(Math.random())
      ox += Math.sin(ph) * Math.cos(th) * ss[0] * 0.5 * rad
      oy += Math.cos(ph) * ss[1] * 0.5 * rad
      oz += Math.sin(ph) * Math.sin(th) * ss[2] * 0.5 * rad
    }
    const dir = cfg.direction || [0, 1, 0]
    const dl = Math.hypot(dir[0], dir[1], dir[2]) || 1
    let dx = dir[0] / dl, dy = dir[1] / dl, dz = dir[2] / dl
    const spreadRad = ((cfg.spread ?? 25) * Math.PI) / 180
    if (spreadRad > 0.001) {
      const ang = Math.random() * Math.PI * 2
      const tilt = Math.random() * spreadRad
      const s = Math.sin(tilt)
      dx += Math.cos(ang) * s
      dy += (Math.random() - 0.5) * s * 0.5
      dz += Math.sin(ang) * s
      const nl = Math.hypot(dx, dy, dz) || 1
      dx /= nl; dy /= nl; dz /= nl
    }
    const spd = cfg.speedMin + Math.random() * Math.max(0, cfg.speedMax - cfg.speedMin)
    slot.alive = true
    slot.age = 0
    slot.life = Math.max(0.05, cfg.lifeMin + Math.random() * Math.max(0, cfg.lifeMax - cfg.lifeMin))
    slot.pos = [ox, oy, oz]
    slot.vel = [dx * spd, dy * spd, dz * spd]
    slot.obj.pos3D.set(ox, oy, oz)
    slot.obj.scale3D.set(cfg.startSize, cfg.startSize, cfg.startSize)
    slot.obj.color = new d.Color(em.startCol[0], em.startCol[1], em.startCol[2], cfg.startAlpha)
  }
  function stepVisualEffects(dt: number) {
    const camPos = camera.position
    for (const em of emitters.values()) {
      const node = objects.get(em.id)
      const activeNode = Boolean(node?.active)
      const wp = node ? node.getWorldPosition(_tmpV1) : _tmpV1.set(0, 0, 0)
      if (particleCullDist > 0) {
        const dSq = (wp.x - camPos.x) ** 2 + (wp.y - camPos.y) ** 2 + (wp.z - camPos.z) ** 2
        if (dSq > particleCullDist * particleCullDist) {
          for (const p of em.pool) { if (p.alive) { p.alive = false; p.obj.color.a = 0 } }
          continue
        }
      }
      const origin: Vec3 = [wp.x, wp.y, wp.z]
      if (activeNode && em.playing && em.config.rate > 0) {
        em.accum += em.config.rate * dt
        const count = Math.min(12, Math.floor(em.accum))
        em.accum -= count
        for (let i = 0; i < count; i++) spawnOneParticle(em, origin)
      }
      const g = em.config.gravity || [0, 0, 0]
      for (const p of em.pool) {
        if (!p.alive) {
          p.obj.color.a = 0
          continue
        }
        p.age += dt
        if (p.age >= p.life) {
          p.alive = false
          p.obj.color.a = 0
          continue
        }
        const t = p.age / p.life
        p.vel[0] += g[0] * dt
        p.vel[1] += g[1] * dt
        p.vel[2] += g[2] * dt
        p.pos[0] += p.vel[0] * dt
        p.pos[1] += p.vel[1] * dt
        p.pos[2] += p.vel[2] * dt
        p.obj.pos3D.set(p.pos[0], p.pos[1], p.pos[2])
        const sz = em.config.startSize + (em.config.endSize - em.config.startSize) * t
        p.obj.scale3D.set(sz, sz, sz)
        const rCol = em.startCol[0] + (em.endCol[0] - em.startCol[0]) * t
        const gCol = em.startCol[1] + (em.endCol[1] - em.startCol[1]) * t
        const bCol = em.startCol[2] + (em.endCol[2] - em.startCol[2]) * t
        const aCol = Math.max(0, Math.min(1, em.config.startAlpha + (em.config.endAlpha - em.config.startAlpha) * t))
        p.obj.color = new d.Color(rCol, gCol, bCol, aCol)
        const dx = camPos.x - p.pos[0]
        const dy = camPos.y - p.pos[1]
        const dz = camPos.z - p.pos[2]
        const yawB = Math.atan2(dx, dz)
        const pitchB = -Math.atan2(dy, Math.hypot(dx, dz) || 1e-5)
        p.obj.rotation3D.set(pitchB, yawB, 0)
      }
    }
    for (const bb of billboards.values()) {
      const node = objects.get(bb.id)
      if (!node?.active) continue
      const wp = node.getWorldPosition(_tmpV1)
      const dx = camPos.x - wp.x
      const dy = camPos.y - wp.y
      const dz = camPos.z - wp.z
      const yawB = Math.atan2(dx, dz)
      const pitchB = bb.lockY ? 0 : -Math.atan2(dy, Math.hypot(dx, dz) || 1e-5)
      bb.obj.pos3D.set(wp.x, wp.y, wp.z)
      const ws = node.getWorldScale(_tmpV2)
      bb.obj.scale3D.set(bb.width * ws.x, bb.height * ws.y, 1)
      bb.obj.rotation3D.set(pitchB, yawB, 0)
      if (bb.fps > 0 && (bb.atlasCols > 1 || bb.atlasRows > 1)) {
        bb.accum += dt * bb.fps
        const nextFrame = Math.floor(bb.accum) % (bb.atlasCols * bb.atlasRows)
        if (nextFrame !== bb.frame) {
          bb.frame = nextFrame
          bb.obj.shader = buildAtlasShader(bb.atlasCols, bb.atlasRows, bb.frame)
        }
      }
    }
    for (let i = dynamicDecals.length - 1; i >= 0; i--) {
      const dec = dynamicDecals[i]
      if (dec.lifetime > 0) {
        dec.age += dt
        if (dec.age >= dec.lifetime) {
          dec.obj.destroy()
          dynamicDecals.splice(i, 1)
        } else if (dec.age > dec.lifetime * 0.75) {
          const fade = 1 - (dec.age - dec.lifetime * 0.75) / (dec.lifetime * 0.25)
          dec.obj.color.a = dec.opacity * Math.max(0, fade)
        }
      }
    }
  }

  function primitive(c: Component) {
    const matProps = project.assets.find((a) => a.id === c.material)?.properties
    const geoMatKey =
      matProps && (matProps.doubleSided || matProps.flatShading || matProps.tiling || matProps.offset)
        ? [Boolean(matProps.doubleSided), Boolean(matProps.flatShading), matProps.tiling ?? null, matProps.offset ?? null]
        : null
    const key = JSON.stringify([c.shape, c.segments, c.radiusBottom, c.radiusTop, geoMatKey])
    let mesh = meshes.get(key)
    if (mesh) return mesh
    const n = Math.max(3, Math.min(96, c.segments ?? 12))
    switch (c.shape) {
      case 'plane':
        mesh = d.buildGrid(d.vec2(1), 1)
        break
      case 'sphere':
        mesh = d.buildSphere(1, n, Math.max(4, n >> 1), true)
        break
      case 'icosahedron':
        mesh = d.buildSphere(1, 5, 3, false)
        break
      case 'capsule':
        mesh = d.buildCapsule(0.5, 1, n)
        break
      case 'cone':
      case 'cylinder':
        mesh = d.buildLathe(
          [
            [c.radiusBottom ?? 0.5, -0.5],
            [c.shape === 'cone' ? 0 : (c.radiusTop ?? 0.5), 0.5],
          ],
          n,
          false,
        )
        break
      default:
        mesh = d.buildBox()
    }
    applySurface(mesh, c.material)
    meshes.set(key, mesh)
    return mesh
  }
  function surface(mesh: L.Mesh): Triangles {
    const positions: number[] = [],
      indices: number[] = []
    if (mesh.vertexData) {
      for (let i = 0; i < mesh.vertexCount; i++) {
        const k = i * 9
        positions.push(mesh.vertexData[k], mesh.vertexData[k + 1], mesh.vertexData[k + 2])
      }
      const packed = mesh.vertexIndices
      if (packed)
        for (let i = 0; i < packed.length; i += 3) indices.push(packed[i], packed[i + 2], packed[i + 1])
    } else {
      for (const p of mesh.points) positions.push(p.x, p.y, p.z)
      const tri = mesh.getTriangles()
      for (let i = 0; i < tri.indices.length; i += 3)
        indices.push(
          tri.vertices[tri.indices[i]],
          tri.vertices[tri.indices[i + 2]],
          tri.vertices[tri.indices[i + 1]],
        )
    }
    return { positions, indices }
  }
  function texture(id: string) {
    const asset = project.assets.find((a) => a.id === id && a.type === 'texture')
    if (!asset) return
    let promise = textures.get(id)
    if (!promise) {
      const gen = generation
      promise = (async () => {
        const img = new Image()
        img.src = asset.data
        await img.decode()
        return new d.TextureInfo(img, gen === generation, true, false)
      })()
      textures.set(id, promise)
    }
    return promise
  }
  function applySurface(mesh: L.Mesh, id: string) {
    const p = project.assets.find((a) => a.id === id)?.properties
    if (!p) return
    if (p.doubleSided) mesh.doubleSided = true
    if (p.flatShading) mesh.computeNormals(false)
    if (p.tiling || p.offset) {
      const tx = p.tiling?.[0] ?? 1,
        ty = p.tiling?.[1] ?? 1,
        ox = p.offset?.[0] ?? 0,
        oy = p.offset?.[1] ?? 0
      mesh.uvs = mesh.uvs.map((uv) => d.vec2(uv.x * tx + ox, uv.y * ty + oy))
    }
  }
  function material(obj: L.EngineObject3D, id: string, fallback = '#a7adad') {
    const p = project.assets.find((a) => a.id === id)?.properties ?? {}
    obj.color = color(p.color ?? fallback, p.opacity ?? 1)
    obj.transparent = obj.color.a < 1
    const rough = Math.max(0, Math.min(1, Number(p.roughness ?? 0.86)))
    obj.specular = 1 - rough
    ;(obj as any).shininess = Math.max(2, Math.pow(2, (1 - rough) * 8))
    obj.reflectivity = Number(p.metalness ?? 0)
    obj.emissive = p.unlit ? 1 : Number(p.emissiveIntensity ?? 0)
    obj.emissiveMapColor = color(p.emissive ?? '#ffffff')
    if (p.castShadow === false) obj.castShadow = false
    if (p.receiveShadow === false) obj.receiveShadow = false
    if (p.softShadow > 0) (obj as any).softShadow = Number(p.softShadow)
    if (p.roundLighting) (obj as any).roundLighting = true
    if (p.normalScale != null) (obj as any).normalScale = Number(p.normalScale)
    if (p.pixelated) (obj as any).pixelated = true
    if (p.additive) {
      ;(obj as any).additive = true
      obj.transparent = true
    }
    if (p.depthWrite === false) (obj as any).depthWrite = false
    if (p.depthTest === false) (obj as any).depthTest = false
    if (p.emissive && p.emissive !== '#000000' && !p.emissiveMap) obj.emissiveMap = d.whiteTexture()
    for (const key of ['map', 'normalMap', 'emissiveMap'] as const) {
      const promise = texture(p[key])
      if (promise)
        pending.push(
          promise.then((t) => {
            if (!obj.destroyed) {
              if (key === 'map') d.setTexture(obj, t)
              else obj[key] = t
            }
          }),
        )
    }
    const shader = project.assets.find((a) => a.type === 'shader' && a.id === p.shader)
    if (shader) {
      if (!shaders.has(shader.id)) shaders.set(shader.id, new d.Shader(shader.data, shader.properties.vertex))
      obj.shader = shaders.get(shader.id)
    } else if (p.alphaTest > 0) {
      const cutoff = Math.min(1, Number(p.alphaTest)).toFixed(5),
        key = 'cutoff:' + cutoff
      if (!shaders.has(key))
        shaders.set(
          key,
          new d.Shader(
            'void mainImage(out vec4 c,vec2 uv){c=texture(iChannel0,uv);if(c.a<' + cutoff + ')discard;}',
          ),
        )
      obj.shader = shaders.get(key)
    } else {
      obj.shader = undefined
    }
  }
  
function sampleAnimChannel(
  ch: { times: Float32Array; values: Float32Array; components: number; interpolation: string },
  t: number,
): number[] {
  const { times, values, components: c, interpolation } = ch
  const last = times.length - 1
  if (last < 0) return c === 4 ? [0, 0, 0, 1] : [0, 0, 0]
  const isCubic = interpolation === 'CUBICSPLINE'
  const stride = isCubic ? 3 * c : c
  const valOff = isCubic ? c : 0
  if (t <= times[0] || last === 0) {
    const out: number[] = []
    for (let i = 0; i < c; i++) out.push(values[valOff + i])
    return out
  }
  if (t >= times[last]) {
    const out: number[] = []
    for (let i = 0; i < c; i++) out.push(values[last * stride + valOff + i])
    return out
  }
  let lo = 0,
    hi = last
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (times[mid] <= t) lo = mid
    else hi = mid - 1
  }
  if (interpolation === 'STEP') {
    const out: number[] = []
    for (let i = 0; i < c; i++) out.push(values[lo * stride + valOff + i])
    return out
  }
  const dt = times[lo + 1] - times[lo] || 1e-6
  const u = Math.max(0, Math.min(1, (t - times[lo]) / dt))
  const o0 = lo * stride
  const o1 = (lo + 1) * stride
  const out = new Array<number>(c)
  if (isCubic) {
    const u2 = u * u,
      u3 = u2 * u
    const h00 = 2 * u3 - 3 * u2 + 1
    const h10 = u3 - 2 * u2 + u
    const h01 = -2 * u3 + 3 * u2
    const h11 = u3 - u2
    for (let i = 0; i < c; i++) {
      out[i] =
        h00 * values[o0 + c + i] +
        h10 * dt * values[o0 + 2 * c + i] +
        h01 * values[o1 + c + i] +
        h11 * dt * values[o1 + i]
    }
  } else if (c === 4) {
    let dot = 0
    for (let i = 0; i < 4; i++) dot += values[o0 + i] * values[o1 + i]
    const sign = dot < 0 ? -1 : 1
    dot *= sign
    let s0 = 1 - u,
      s1 = u * sign
    if (dot < 0.9995) {
      const ang = Math.acos(Math.min(1, dot))
      const s = Math.sin(ang) || 1
      s0 = Math.sin((1 - u) * ang) / s
      s1 = (Math.sin(u * ang) / s) * sign
    }
    for (let i = 0; i < 4; i++) out[i] = s0 * values[o0 + i] + s1 * values[o1 + i]
  } else {
    for (let i = 0; i < c; i++) out[i] = values[o0 + i] + (values[o1 + i] - values[o0 + i]) * u
  }
  if (c === 4) {
    const len = Math.hypot(out[0], out[1], out[2], out[3]) || 1
    for (let i = 0; i < 4; i++) out[i] /= len
  }
  return out
}

function sliceGltfAnimation(source: any, startTime: number, endTime: number, name: string) {
  const s = Math.max(0, Number(startTime) || 0)
  const e = Math.max(s + 0.001, Number(endTime) || s + 0.001)
  const duration = e - s
  const channels = (source.channels || []).map((ch: any) => {
    const c: number = ch.components || (ch.path === 'rotation' ? 4 : 3)
    const isCubic = ch.interpolation === 'CUBICSPLINE'
    const stride = isCubic ? 3 * c : c
    const valOff = isCubic ? c : 0
    const outTimes: number[] = []
    const outVals: number[] = []
    const pushSample = (relT: number, vals: number[]) => {
      outTimes.push(relT)
      for (let i = 0; i < c; i++) outVals.push(vals[i])
    }
    pushSample(0, sampleAnimChannel(ch, s))
    const srcTimes: Float32Array = ch.times
    for (let i = 0; i < srcTimes.length; i++) {
      const kt = srcTimes[i]
      if (kt > s + 1e-5 && kt < e - 1e-5) {
        const vals: number[] = []
        for (let j = 0; j < c; j++) vals.push(ch.values[i * stride + valOff + j])
        pushSample(kt - s, vals)
      }
    }
    pushSample(duration, sampleAnimChannel(ch, e))
    return {
      node: ch.node,
      path: ch.path,
      interpolation: ch.interpolation === 'STEP' ? 'STEP' : 'LINEAR',
      times: new Float32Array(outTimes),
      values: new Float32Array(outVals),
      components: c,
    }
  })
  return { name, channels, duration }
}

function applyModelAssetClips(model: any, asset: { properties?: Record<string, any> }) {
  if (!model) return
  if (!model.__baseAnimations) {
    model.__baseAnimations = [...(model.animations || [])]
  }
  const base: any[] = model.__baseAnimations
  const customDefs = Array.isArray(asset.properties?.clips) ? asset.properties.clips : []
  const sliced: any[] = []
  for (const def of customDefs) {
    if (!def?.name) continue
    const src =
      base.find((a) => a.name === def.sourceClip) ??
      (base.length ? base[0] : undefined)
    if (!src) continue
    sliced.push(sliceGltfAnimation(src, def.startTime, def.endTime, String(def.name)))
  }
  const customNames = new Set(sliced.map((s) => s.name))
  model.animations = [...base.filter((b) => !customNames.has(b.name)), ...sliced]
}

  function playAnimation(id: string, clip?: string, loop = true, speed = 1, blendTime = 0) {
    const model = players.get(id),
      a = model?.model.getAnimation(clip || 0)
    if (!model || !a) return false
    ;(model as any).play(a.name, loop, speed, Math.max(0, blendTime))
    return true
  }
  function clearSky() {
    if (skyDome) {
      skyDome.destroy()
      skyDome = undefined
    }
    for (const face of skyCube) face.destroy()
    skyCube = []
  }
  function ensureSkyDome() {
    for (const face of skyCube) face.destroy()
    skyCube = []
    if (!skyDome) {
      const mesh = d.buildSphere(1, 24, 14, true)
      mesh.doubleSided = true
      meshes.set('__skyDome', mesh)
      skyDome = new d.EngineObject3D(d.vec3(), mesh)
      skyDome.scale3D.set(220, 220, 220)
      skyDome.emissive = 1
      skyDome.castShadow = false
      skyDome.receiveShadow = false
    }
    return skyDome
  }
  function setSky(topColor: string, horizonColor = '#9ab2c4', bottomColor = '#283038', enabled = true) {
    if (!enabled) {
      clearSky()
      return
    }
    const dome = ensureSkyDome()
    const key = `sky:${topColor}:${horizonColor}:${bottomColor}`
    if (!shaders.has(key)) shaders.set(key, new d.Shader(buildSkyShader(topColor, horizonColor, bottomColor)))
    dome.shader = shaders.get(key)
  }
  function setProceduralSky(opts: ProceduralSkyOptions) {
    const dome = ensureSkyDome()
    const key = 'procSky:' + JSON.stringify(opts)
    if (!shaders.has(key)) shaders.set(key, new d.Shader(buildProceduralSkyShader(opts)))
    dome.shader = shaders.get(key)
  }
  function setSkyboxFaces(faces: SkyboxFaces) {
    clearSky()
    const S = 220
    const half = S / 2
    let planeMesh = meshes.get('__skyPlane')
    if (!planeMesh) {
      planeMesh = d.buildGrid(d.vec2(1), 1)
      planeMesh.doubleSided = true
      meshes.set('__skyPlane', planeMesh)
    }
    const defs: [keyof SkyboxFaces, Vec3, Vec3][] = [
      ['py', [0, half, 0], [Math.PI, 0, 0]],
      ['ny', [0, -half, 0], [0, 0, 0]],
      ['pz', [0, 0, half], [-Math.PI / 2, 0, 0]],
      ['nz', [0, 0, -half], [Math.PI / 2, 0, 0]],
      ['px', [half, 0, 0], [0, 0, Math.PI / 2]],
      ['nx', [-half, 0, 0], [0, 0, -Math.PI / 2]],
    ]
    for (const [key, offset, rot] of defs) {
      const cfg = faces[key] || {}
      const obj = new d.EngineObject3D(d.vec3(offset[0], offset[1], offset[2]), planeMesh)
      obj.scale3D.set(S, 1, S)
      obj.rotation3D.set(rot[0], rot[1], rot[2])
      obj.emissive = 1
      obj.castShadow = false
      obj.receiveShadow = false
      obj.color = color(cfg.color || '#8fa6b8', 1)
      ;(obj as any).__skyOffset = offset
      if (cfg.texture) {
        const promise = texture(cfg.texture)
        if (promise) {
          pending.push(
            promise.then((t) => {
              if (!obj.destroyed) d.setTexture(obj, t)
            }),
          )
        }
      }
      skyCube.push(obj)
    }
  }
  function setSkyAsset(assetId: string | null) {
    if (!assetId) {
      clearSky()
      return
    }
    const asset = project.assets.find((a) => a.id === assetId && a.type === 'skybox')
    if (!asset) return
    const p = asset.properties || {}
    if (p.mode === 'cubemap') setSkyboxFaces(p.faces || {})
    else if (p.mode === 'procedural') setProceduralSky(p)
    else setSky(p.topColor || '#3a536b', p.horizonColor || '#8c99a3', p.bottomColor || '#262b30', true)
  }
  const defaultLayerPalette = ['#6b8352', '#9e7d54', '#6d737a', '#d5dde3', '#524b44', '#8e6243', '#495a47', '#b59d78']
  function buildTerrainSplatCanvas(t: Terrain, loadedImgs: (HTMLImageElement | null)[], res = 512): HTMLCanvasElement {
    const { materials, splatWeights, layerSoftness } = ensureTerrainLayers(t)
    const canvasOut = document.createElement('canvas')
    canvasOut.width = res
    canvasOut.height = res
    const ctx = canvasOut.getContext('2d')!
    const imgData = ctx.createImageData(res, res)
    const out = imgData.data
    const n = t.segments
    const tile = Math.max(0.1, Number(t.tiling || 4))
    const layerCount = materials.length

    // Pre-sample each material's base RGB and optional texture pixel buffer
    const layerMeta = materials.map((matId, idx) => {
      const mat = project.assets.find((a) => a.id === matId && a.type === 'material')?.properties ?? {}
      const hex = mat.color || defaultLayerPalette[idx % defaultLayerPalette.length]
      const rgb = hexToRgbTuple(hex)
      const img = loadedImgs[idx]
      let texData: Uint8ClampedArray | null = null
      let tw = 0, th = 0
      if (img && img.naturalWidth > 0) {
        const tc = document.createElement('canvas')
        tw = Math.min(256, img.naturalWidth)
        th = Math.min(256, img.naturalHeight)
        tc.width = tw
        tc.height = th
        const tctx = tc.getContext('2d')!
        tctx.drawImage(img, 0, 0, tw, th)
        texData = tctx.getImageData(0, 0, tw, th).data
      }
      const soft = Math.max(0, Math.min(1, layerSoftness[idx] ?? 0.5))
      return { rgb, texData, tw, th, soft }
    })

    const wBuf = new Float32Array(layerCount)
    for (let py = 0; py < res; py++) {
      const v = py / (res - 1)
      const gz = v * n
      const z0 = Math.min(n - 1, Math.floor(gz))
      const fz = gz - z0
      const row0 = z0 * (n + 1)
      const row1 = (z0 + 1) * (n + 1)

      for (let px = 0; px < res; px++) {
        const u = px / (res - 1)
        const gx = u * n
        const x0 = Math.min(n - 1, Math.floor(gx))
        const fx = gx - x0
        const i00 = row0 + x0
        const i10 = i00 + 1
        const i01 = row1 + x0
        const i11 = i01 + 1

        // Compute shaped weights per layer using each layer's softness (0 = hard edge, 1 = smooth blend)
        let sum = 0
        for (let l = 0; l < layerCount; l++) {
          const arr = splatWeights[l]
          const raw =
            arr[i00] * (1 - fx) * (1 - fz) +
            arr[i10] * fx * (1 - fz) +
            arr[i01] * (1 - fx) * fz +
            arr[i11] * fx * fz
          const soft = layerMeta[l].soft
          let shaped = raw
          if (l > 0 && soft < 0.98) {
            // Smoothstep width controlled by softness: soft=0 -> sharp cutoff around 0.45, soft=1 -> linear
            const halfW = 0.02 + soft * 0.48
            const e0 = Math.max(0, 0.45 - halfW)
            const e1 = Math.min(1, 0.45 + halfW)
            const x = Math.max(0, Math.min(1, (raw - e0) / Math.max(1e-4, e1 - e0)))
            shaped = x * x * (3 - 2 * x)
          }
          wBuf[l] = shaped
          sum += shaped
        }
        if (sum <= 1e-5) {
          wBuf[0] = 1
          sum = 1
        }

        let rSum = 0, gSum = 0, bSum = 0
        const tu = (u * tile) % 1
        const tv = (v * tile) % 1
        for (let l = 0; l < layerCount; l++) {
          const w = wBuf[l] / sum
          if (w < 0.002) continue
          const meta = layerMeta[l]
          let mr = meta.rgb[0] * 255
          let mg = meta.rgb[1] * 255
          let mb = meta.rgb[2] * 255
          if (meta.texData) {
            const tx = Math.floor((tu < 0 ? tu + 1 : tu) * meta.tw) % meta.tw
            const ty = Math.floor((tv < 0 ? tv + 1 : tv) * meta.th) % meta.th
            const ti = (ty * meta.tw + tx) * 4
            mr = (meta.texData[ti] * meta.rgb[0])
            mg = (meta.texData[ti + 1] * meta.rgb[1])
            mb = (meta.texData[ti + 2] * meta.rgb[2])
          }
          rSum += mr * w
          gSum += mg * w
          bSum += mb * w
        }
        const oi = (py * res + px) * 4
        out[oi] = Math.min(255, Math.round(rSum))
        out[oi + 1] = Math.min(255, Math.round(gSum))
        out[oi + 2] = Math.min(255, Math.round(bSum))
        out[oi + 3] = 255
      }
    }
    ctx.putImageData(imgData, 0, 0)
    return canvasOut
  }
  function addEntities(entities: Entity[]) {
    for (const e of entities) {
      if (objects.has(e.id)) throw Error('Duplicate scene entity ' + e.id)
      const n = new SceneNode(e.id),
        root = new d.EngineObject3D()
      const list: L.EngineObject3D[] = []
      objects.set(e.id, n)
      roots.set(e.id, root)
      renderables.set(e.id, list)
      owners.set(root, n)
      n.position.fromArray(e.transform.position)
      n.rotation.fromArray(e.transform.rotation)
      n.scale.fromArray(e.transform.scale)
      n.visible = e.active
      const cd = Number(e.properties?.cullDistance ?? 0)
      if (cd > 0) entityCullDist.set(e.id, cd)
      for (const c of e.components.filter((c) => c.enabled !== false)) {
        if (c.type === 'terrain') {
          const tData = c as Terrain
          const { materials } = ensureTerrainLayers(tData)
          const g = terrainGeometry(tData)
          n.surfaces.push(g)
          const points = nativePoints(g.positions),
            splatUv = Array.from({ length: points.length }, (_, i) => d.vec2(g.splatUv[i * 2], g.splatUv[i * 2 + 1]))
          const mesh = new d.Mesh().addTriangles(points, g.indices, undefined, splatUv).computeNormals(true)
          meshes.set(e.id + '/terrain/0', mesh)
          const obj = new d.EngineObject3D(d.vec3(), mesh)
          root.addChild(obj)
          list.push(obj)
          // Base material properties (roughness/metalness/shadows) from layer 0
          const baseMatProps = project.assets.find((a) => a.id === materials[0] && a.type === 'material')?.properties ?? {}
          obj.color = color('#ffffff', 1)
          const rough = Math.max(0, Math.min(1, Number(baseMatProps.roughness ?? 0.9)))
          obj.specular = 1 - rough
          ;(obj as any).shininess = Math.max(2, Math.pow(2, (1 - rough) * 8))
          obj.reflectivity = Number(baseMatProps.metalness ?? 0)
          // Immediate initial splat canvas (solid colors), then upgrade once layer textures decode
          const initialCanvas = buildTerrainSplatCanvas(tData, materials.map(() => null), 256)
          d.setTexture(obj, new d.TextureInfo(initialCanvas, true, true, false))
          const genNow = generation
          const imgPromises = materials.map((matId) => {
            const mat = project.assets.find((a) => a.id === matId && a.type === 'material')?.properties
            const texAsset = mat?.map ? project.assets.find((a) => a.id === mat.map && a.type === 'texture') : undefined
            if (!texAsset?.data) return Promise.resolve(null)
            return new Promise<HTMLImageElement | null>((resolve) => {
              const img = new Image()
              img.onload = () => resolve(img)
              img.onerror = () => resolve(null)
              img.src = texAsset.data
            })
          })
          if (imgPromises.some(Boolean)) {
            pending.push(
              Promise.all(imgPromises).then((imgs) => {
                if (genNow !== generation || obj.destroyed) return
                if (imgs.some((im) => im !== null)) {
                  const hiCanvas = buildTerrainSplatCanvas(tData, imgs, 512)
                  d.setTexture(obj, new d.TextureInfo(hiCanvas, true, true, false))
                }
              }),
            )
          }
        } else if (c.type === 'water') {
          const size = Math.max(0.5, Number(c.size ?? 16))
          const segs = Math.max(4, Math.min(64, Number(c.segments ?? 24)))
          const mesh = d.buildGrid(d.vec2(size), segs)
          mesh.doubleSided = true
          meshes.set(e.id + '/water', mesh)
          const obj = new d.EngineObject3D(d.vec3(), mesh)
          obj.transparent = true
          obj.castShadow = false
          obj.receiveShadow = true
          obj.specular = 0.85
          const { vertex, fragment } = buildWaterShaders(c)
          const skey =
            'water:' +
            e.id +
            ':' +
            JSON.stringify([
              c.deepColor,
              c.shallowColor,
              c.waveHeight,
              c.waveSpeed,
              c.waveScale,
              c.opacity,
              c.fresnelPower,
              c.foamAmount,
            ])
          if (!shaders.has(skey)) shaders.set(skey, new d.Shader(fragment, vertex))
          obj.shader = shaders.get(skey)
          root.addChild(obj)
          list.push(obj)
        } else if (c.type === 'volumetric') {
          const shape = c.shape || 'cone'
          const mesh =
            shape === 'box'
              ? d.buildBox()
              : d.buildLathe(
                  [
                    [Number(c.bottomRadius ?? 1.6), -0.5],
                    [Number(c.topRadius ?? 0.2), 0.5],
                  ],
                  20,
                  false,
                )
          mesh.doubleSided = true
          meshes.set(e.id + '/volumetric', mesh)
          const obj = new d.EngineObject3D(d.vec3(), mesh)
          obj.transparent = true
          obj.emissive = 1
          obj.castShadow = false
          obj.receiveShadow = false
          const skey = 'vol:' + JSON.stringify([c.color, c.intensity, c.softness, c.dustSpeed])
          if (!shaders.has(skey)) shaders.set(skey, new d.Shader(buildVolumetricShader(c)))
          obj.shader = shaders.get(skey)
          root.addChild(obj)
          list.push(obj)
        } else if (c.type === 'mesh' && c.shape === 'model') {
          const a = project.assets.find((a) => a.id === c.asset)
          if (!a) continue
          const gen = generation
          if (!models.has(a.id)) models.set(a.id, d.loadGLTF(a.data))
          pending.push(
            models.get(a.id)!.then((model) => {
              if (gen !== generation || objects.get(e.id) !== n) return
              applyModelAssetClips(model, a)
              const obj = model.createObject()
              const partMats = (a.properties?.partMaterials || {}) as Record<string, string>
              const partOvr = (a.properties?.partOverrides || {}) as Record<string, Record<string, any>>
              const parts: L.EngineObject3D[] = (obj as any).parts || []
              for (let pi = 0; pi < parts.length; pi++) {
                const po = parts[pi]
                const matId = partMats[String(pi)]
                if (matId) {
                  material(po, matId)
                } else if (partOvr[String(pi)]) {
                  const ov = partOvr[String(pi)]
                  if (ov.color || ov.opacity != null) {
                    const prevA = po.color?.a ?? 1
                    const col = color(ov.color || '#ffffff', ov.opacity ?? prevA)
                    po.color = col
                    po.transparent = col.a < 1
                  }
                  if (ov.roughness != null) {
                    const rough = Math.max(0, Math.min(1, Number(ov.roughness)))
                    po.specular = 1 - rough
                    ;(po as any).shininess = Math.max(2, Math.pow(2, (1 - rough) * 8))
                  }
                  if (ov.metalness != null) po.reflectivity = Number(ov.metalness)
                  if (ov.unlit != null) po.emissive = ov.unlit ? 1 : Number(ov.emissiveIntensity ?? 0)
                  else if (ov.emissiveIntensity != null) po.emissive = Number(ov.emissiveIntensity)
                  if (ov.emissive) {
                    po.emissiveMapColor = color(ov.emissive)
                    if (!po.emissiveMap && ov.emissive !== '#000000') po.emissiveMap = d.whiteTexture()
                  }
                  if (ov.pixelated != null) (po as any).pixelated = Boolean(ov.pixelated)
                  if (ov.doubleSided != null && po.mesh) po.mesh.doubleSided = Boolean(ov.doubleSided)
                }
              }
              root.addChild(obj)
              list.push(obj)
              players.set(e.id, obj)
              if (e.components.some((c) => c.type === 'collider' && c.shape === 'mesh'))
                n.surfaces.push(surface(model.mesh))
              const anim = e.components.find((c) => c.type === 'animation' && c.enabled !== false)
              if (anim && anim.autoplay !== false)
                playAnimation(e.id, anim.clip, anim.loop !== false, anim.speed)
            }),
          )
        } else if (c.type === 'mesh') {
          const mesh = primitive(c),
            obj = new d.EngineObject3D(d.vec3(), mesh)
          root.addChild(obj)
          list.push(obj)
          material(obj, c.material)
          if (e.components.some((c) => c.type === 'collider' && c.shape === 'mesh'))
            n.surfaces.push(surface(mesh))
        } else if (c.type === 'sprite') {
          const obj = new d.EngineObject3D()
          root.addChild(obj)
          list.push(obj)
          obj.size3D = d.vec3(c.width ?? 1, c.height ?? 1, 1)
          obj.transparent = true
          obj.emissive = 1
          obj.color = color(c.color ?? '#ffffff', c.opacity ?? 1)
          const tex = texture(c.texture)
          if (tex)
            pending.push(
              tex.then((t) => {
                if (!obj.destroyed) d.setTexture(obj, t)
              }),
            )
          else d.setWhiteSprite(obj)
        } else if (c.type === 'particle') {
          const cfg = resolveParticleConfig(c)
          const qMesh = unitQuadMesh()
          const pool: ParticleInstance[] = []
          const maxP = Math.max(1, Math.min(250, Math.floor(cfg.maxParticles || 80)))
          const customTex = cfg.texture ? texture(cfg.texture) : undefined
          const fallbackTex = softParticleTexture()
          for (let i = 0; i < maxP; i++) {
            const pObj = new d.EngineObject3D(d.vec3(), qMesh)
            pObj.transparent = true
            pObj.emissive = 1
            pObj.castShadow = false
            pObj.receiveShadow = false
            ;(pObj as any).depthWrite = false
            if (cfg.additive) (pObj as any).additive = true
            pObj.color = new d.Color(1, 1, 1, 0)
            if (customTex) {
              pending.push(
                customTex.then((t) => {
                  if (!pObj.destroyed) d.setTexture(pObj, t)
                }),
              )
            } else {
              d.setTexture(pObj, fallbackTex)
            }
            pool.push({ obj: pObj, alive: false, age: 0, life: 1, pos: [0, 0, 0], vel: [0, 0, 0] })
          }
          const emState: EmitterState = {
            id: e.id,
            config: cfg,
            pool,
            accum: 0,
            playing: cfg.playing !== false,
            startCol: hexToRgbTuple(cfg.startColor),
            endCol: hexToRgbTuple(cfg.endColor),
          }
          emitters.set(e.id, emState)
          if (cfg.burstCount > 0 && emState.playing) {
            const bCount = Math.min(maxP, Math.floor(cfg.burstCount))
            for (let i = 0; i < bCount; i++) spawnOneParticle(emState, e.transform.position)
          }
        } else if (c.type === 'billboard') {
          const qMesh = unitQuadMesh()
          const obj = new d.EngineObject3D(d.vec3(), qMesh)
          obj.transparent = true
          obj.castShadow = false
          obj.receiveShadow = c.unlit === false
          obj.emissive = c.unlit === false ? 0 : 1
          ;(obj as any).depthWrite = false
          if (c.additive) (obj as any).additive = true
          if (c.pixelated) (obj as any).pixelated = true
          obj.color = color(c.color ?? '#ffffff', c.opacity ?? 1)
          const tex = c.texture ? texture(c.texture) : undefined
          if (tex) {
            pending.push(
              tex.then((t) => {
                if (!obj.destroyed) d.setTexture(obj, t)
              }),
            )
          } else {
            d.setTexture(obj, softParticleTexture())
          }
          const cols = Math.max(1, Math.floor(Number(c.atlasCols ?? 1)))
          const rows = Math.max(1, Math.floor(Number(c.atlasRows ?? 1)))
          const frame = Math.max(0, Math.floor(Number(c.atlasFrame ?? 0)))
          if (cols > 1 || rows > 1) obj.shader = buildAtlasShader(cols, rows, frame)
          owners.set(obj, n)
          list.push(obj)
          billboards.set(e.id, {
            id: e.id,
            obj,
            lockY: Boolean(c.lockY),
            width: Math.max(0.05, Number(c.width ?? 1)),
            height: Math.max(0.05, Number(c.height ?? 1)),
            atlasCols: cols,
            atlasRows: rows,
            frame,
            fps: Math.max(0, Number(c.fps ?? 0)),
            accum: frame,
          })
        } else if (c.type === 'decal') {
          const qMesh = unitQuadMesh()
          const obj = new d.EngineObject3D(d.vec3(0, 0, Number(c.normalOffset ?? 0.008)), qMesh)
          const w = Math.max(0.05, Number(c.width ?? 1))
          const h = Math.max(0.05, Number(c.height ?? 1))
          obj.scale3D.set(w, h, 1)
          obj.transparent = true
          obj.castShadow = false
          obj.receiveShadow = true
          ;(obj as any).depthWrite = false
          if (c.blendMode === 'additive') (obj as any).additive = true
          if (c.pixelated) (obj as any).pixelated = true
          const op = Math.max(0, Math.min(1, Number(c.opacity ?? 0.9)))
          obj.color = color(c.color ?? '#ffffff', op)
          const tex = c.texture ? texture(c.texture) : undefined
          if (tex) {
            pending.push(
              tex.then((t) => {
                if (!obj.destroyed) d.setTexture(obj, t)
              }),
            )
          } else {
            d.setWhiteSprite(obj)
          }
          root.addChild(obj)
          list.push(obj)
          decals.set(e.id, { id: e.id, obj, width: w, height: h, normalOffset: Number(c.normalOffset ?? 0.008), opacity: op })
        } else if (c.type === 'bakeZone') {
          const pos = e.transform.position
          const sz = Array.isArray(c.size) ? c.size : [e.transform.scale[0] * 6, e.transform.scale[1] * 4, e.transform.scale[2] * 6]
          const res = Math.max(32, Math.min(256, Number(c.reflectionResolution ?? 128)))
          const probe: ProbeRecord = {
            id: e.id,
            cube: { size: res, capturePos: d.vec3(pos[0], pos[1], pos[2]) },
            mode: c.reflectionMode === 'realtime' ? 'realtime' : 'baked',
            interval: Math.max(1, Math.floor(Number(c.updateInterval ?? 4))),
            bounds: { center: [...pos], half: [Math.abs(sz[0]) / 2, Math.abs(sz[1]) / 2, Math.abs(sz[2]) / 2] },
            bakeLight: c.bakeLight !== false,
            lightBounce: Number(c.lightBounce ?? 0.65),
          }
          zoneProbes.set(e.id, probe)
          if (c.bakeReflections !== false) {
            ;(r as any).cubeCaptures?.add(probe.cube)
          }
        } else if (c.type === 'light') {
          const tint = color(c.color ?? '#ffffff')
          if (c.sunRays) {
            sunRaySources.set(e.id, {
              id: e.id,
              directional: c.kind === 'directional',
              intensity: Math.max(0.05, Number(c.sunRayIntensity ?? 0.75)),
              decay: Math.max(0.8, Math.min(0.99, Number(c.sunRayDecay ?? 0.94))),
              color: hexToRgbTuple(c.color ?? '#ffe8bd'),
              enabled: true,
            })
          }
          if (c.kind === 'ambient' || c.kind === 'directional') {
            sceneLights.set(n.id, c)
            if (c.kind === 'directional' && Number(c.flare ?? 0) > 0) {
              const dirLight = new d.Light3D(d.vec3(), 100, tint, c.intensity ?? 1)
              ;(dirLight as any).directional = true
              root.addChild(dirLight)
              if (typeof (dirLight as any).addFlare === 'function') {
                const fl = (dirLight as any).addFlare(Number(c.flare), 7, 1.15, 0.85, tint)
                if (fl) {
                  fl.occlusion = false
                  fl.fadeTime = 0
                  fl.visible = 1
                  fl.visibleFound = true
                  activeFlares.push(fl)
                }
              }
              entityLights.set(e.id, dirLight)
            }
          } else {
            const light = new d.Light3D(d.vec3(), c.range ?? 12, tint, c.intensity ?? 1)
            root.addChild(light)
            if (c.kind === 'spot') {
              light.coneAngle = c.angle ?? 0.6
              ;(light as any).coneSoftness = Number(c.coneSoftness ?? 0.25)
            }
            ;(light as any).glow = Number(c.glow ?? 0)
            ;(light as any).glowFalloff = Number(c.glowFalloff ?? 1)
            if (Number(c.flare ?? 0) > 0 && typeof (light as any).addFlare === 'function') {
              const fl = (light as any).addFlare(Number(c.flare), 7, 1.15, 0.85, tint)
              if (fl) {
                fl.occlusion = false
                fl.fadeTime = 0
                fl.visible = 1
                fl.visibleFound = true
                activeFlares.push(fl)
              }
            }
            if (c.gel && c.kind === 'spot') {
              ;(r as any).shadowLight = light
              const gelTex = texture(c.gel)
              if (gelTex) {
                pending.push(
                  gelTex.then((t) => {
                    if (!light.destroyed) (light as any).gel = t
                  }),
                )
              }
            }
            if (c.castShadow && c.kind === 'spot') {
              ;(r as any).shadowLight = light
            }
            entityLights.set(e.id, light)
            entityLightBaseIntensity.set(e.id, light.intensity)
          }
        }
      }
    }
    for (const e of entities) if (e.parent) objects.get(e.parent)?.add(objects.get(e.id)!)
  }
  function nativePoints(positions: number[]) {
    const pts: L.Vector3[] = []
    for (let i = 0; i < positions.length; i += 3) pts.push(d.vec3(...positions.slice(i, i + 3)))
    return pts
  }
  function removeEntities(ids: string[]) {
    function remove(n: SceneNode) {
      for (const child of [...n.children]) remove(child)
      const root = roots.get(n.id)
      if (root) {
        root.destroy()
        owners.delete(root)
      }
      for (const suffix of ['/terrain/0', '/terrain/1', '/water', '/volumetric']) {
        const key = n.id + suffix
        meshes.get(key)?.dispose()
        meshes.delete(key)
      }
      sceneLights.delete(n.id)
      entityLights.delete(n.id)
      entityCullDist.delete(n.id)
      sunRaySources.delete(n.id)
      zoneProbes.delete(n.id)
      const em = emitters.get(n.id)
      if (em) {
        for (const p of em.pool) p.obj.destroy()
        emitters.delete(n.id)
      }
      const bb = billboards.get(n.id)
      if (bb) {
        bb.obj.destroy()
        owners.delete(bb.obj)
        billboards.delete(n.id)
      }
      decals.delete(n.id)
      renderables.delete(n.id)
      players.delete(n.id)
      roots.delete(n.id)
      objects.delete(n.id)
      n.detach()
    }
    for (const id of ids) {
      const n = objects.get(id)
      if (n) remove(n)
    }
  }
  function clear() {
    generation++
    grid?.destroy()
    grid = undefined
    clearSky()
    for (const em of emitters.values()) for (const p of em.pool) p.obj.destroy()
    emitters.clear()
    for (const bb of billboards.values()) {
      bb.obj.destroy()
      owners.delete(bb.obj)
    }
    billboards.clear()
    decals.clear()
    for (const dd of dynamicDecals) dd.obj.destroy()
    dynamicDecals.length = 0
    for (const bm of batchedMeshes) bm.destroy()
    batchedMeshes.length = 0
    entityLightBaseIntensity.clear()
    entityCullDist.clear()
    distanceCulled.clear()
    activeFlares.length = 0
    sunRaySources.clear()
    flashlight?.destroy()
    flashlight = undefined
    flashlightEnabled = false
    runtimeEnvOverride = false
    removeEntities([...objects.keys()])
    meshes.forEach((m) => m.dispose())
    meshes.clear()
    models.forEach(
      (p) =>
        void p.then(
          (m) => m.dispose(),
          () => {},
        ),
    )
    models.clear()
    textures.forEach(
      (p) =>
        void p.then(
          (t) => t.destroyWebGLTexture(),
          () => {},
        ),
    )
    liveCanvasTextures.forEach((t) => { try { t.destroyWebGLTexture() } catch {} })
    liveCanvasTextures.clear()
    textures.clear()
    shaders.forEach((shader) => shader.dispose())
    shaders.clear()
    pending = []
  }
  function pointInBounds(p: Vector3, b: { center: Vec3; half: Vec3 }) {
    return (
      Math.abs(p.x - b.center[0]) <= b.half[0] &&
      Math.abs(p.y - b.center[1]) <= b.half[1] &&
      Math.abs(p.z - b.center[2]) <= b.half[2]
    )
  }
  function assignReflectionMaps() {
    const tmp = new Vector3()
    for (const [id, objs] of renderables) {
      const node = objects.get(id)
      if (!node) continue
      node.getWorldPosition(tmp)
      let matched: any = globalProbe?.cube
      for (const probe of zoneProbes.values()) {
        if (probe.bounds && pointInBounds(tmp, probe.bounds)) {
          matched = probe.cube
          break
        }
      }
      for (const obj of objs) (obj as any).environment = matched
    }
  }
  function setReflections(mode: 'off' | 'baked' | 'realtime', resolution = 128, interval = 4) {
    globalReflectionMode = mode
    globalReflectionRes = Math.max(32, Math.min(256, resolution))
    globalReflectionInterval = Math.max(1, Math.floor(interval))
    if (mode === 'off') {
      globalProbe = undefined
      ;(r as any).environment = undefined
      assignReflectionMaps()
      return
    }
    globalProbe = {
      id: '__global__',
      cube: { size: globalReflectionRes, capturePos: d.vec3(camera.position.x, Math.max(1.5, camera.position.y), camera.position.z) },
      mode,
      interval: globalReflectionInterval,
      bakeLight: false,
      lightBounce: 0,
    }
    ;(r as any).environment = globalProbe.cube
    ;(r as any).cubeCaptures?.add(globalProbe.cube)
    assignReflectionMaps()
  }
  function bakeLighting(zoneId?: string) {
    const scene = project.scenes.find((sc) => sc.id === project.activeScene) ?? project.scenes[0]
    const lights: { pos: Vec3; color: [number, number, number]; intensity: number; range: number; sourceId?: string }[] = []
    const emissiveOwners = new Set<string>()
    for (const e of scene.entities) {
      if (!e.active) continue
      const node = objects.get(e.id)
      const wp = node ? node.getWorldPosition(new Vector3()).toArray() : e.transform.position
      for (const c of e.components) {
        if (c.enabled === false) continue
        if (c.type === 'light' && c.kind !== 'ambient' && c.kind !== 'directional') {
          const col = color(c.color || '#ffffff')
          lights.push({
            pos: wp,
            color: [col.r, col.g, col.b],
            intensity: Number(c.intensity ?? 1),
            range: Math.max(1, Number(c.range ?? 12)),
            sourceId: e.id,
          })
        } else if (c.type === 'mesh' && c.material) {
          const mp = project.assets.find((a) => a.id === c.material && a.type === 'material')?.properties
          if (!mp) continue
          const emStrength = mp.unlit ? Math.max(0.6, Number(mp.emissiveIntensity ?? 1)) : Number(mp.emissiveIntensity ?? 0)
          const emHex = mp.emissive && mp.emissive !== '#000000' ? mp.emissive : mp.unlit ? mp.color : ''
          if (emStrength > 0.05 && emHex) {
            emissiveOwners.add(e.id)
            const col = color(emHex)
            const sc = node ? node.getWorldScale(new Vector3()).toArray() : e.transform.scale
            const sizeFactor = Math.max(0.5, Math.max(Math.abs(sc[0]), Math.abs(sc[1]), Math.abs(sc[2])))
            lights.push({
              pos: wp,
              color: [col.r, col.g, col.b],
              intensity: emStrength * Math.min(2.5, 0.7 + sizeFactor * 0.35),
              range: Math.max(3, sizeFactor * 3.5 + emStrength * 4.5),
              sourceId: e.id,
            })
          }
        }
      }
    }
    const targetZones = zoneId ? (zoneProbes.has(zoneId) ? [zoneProbes.get(zoneId)!] : []) : [...zoneProbes.values()]
    const useGlobal = !zoneId && (globalBakedLighting || targetZones.length === 0)
    const tmp = new Vector3()
    const ambCol = color(ambientTint)
    for (const [id, objs] of renderables) {
      if (emissiveOwners.has(id)) continue
      const node = objects.get(id)
      if (!node) continue
      node.getWorldPosition(tmp)
      let bounce = useGlobal ? 0.55 : 0
      for (const z of targetZones) {
        if (z.bakeLight && z.bounds && pointInBounds(tmp, z.bounds)) {
          bounce = Math.max(bounce, z.lightBounce)
        }
      }
      if (bounce <= 0) continue
      let lr = ambCol.r * ambient * 0.22 * bounce,
        lg = ambCol.g * ambient * 0.22 * bounce,
        lb = ambCol.b * ambient * 0.22 * bounce
      for (const l of lights) {
        const dist = Math.hypot(tmp.x - l.pos[0], tmp.y - l.pos[1], tmp.z - l.pos[2])
        if (dist >= l.range) continue
        const atten = Math.pow(1 - dist / l.range, 2) * l.intensity * bounce * 0.6
        lr += l.color[0] * atten
        lg += l.color[1] * atten
        lb += l.color[2] * atten
      }
      const mag = Math.max(lr, lg, lb)
      if (mag > 0.005) {
        for (const obj of objs) {
          // Physically multiply baked irradiance by the object's albedo color and keep it subtle (never normalize to 1.0 white!)
          const br = Math.min(0.75, lr * obj.color.r * 0.45)
          const bg = Math.min(0.75, lg * obj.color.g * 0.45)
          const bb = Math.min(0.75, lb * obj.color.b * 0.45)
          if (br + bg + bb > 0.01) {
            obj.emissiveMapColor = new d.Color(br, bg, bb, 1)
            if (!obj.emissiveMap) obj.emissiveMap = d.whiteTexture()
          }
        }
      }
    }
    if (globalProbe) { (r as any).cubeCaptures?.add(globalProbe.cube) }
    for (const z of targetZones) { (r as any).cubeCaptures?.add(z.cube) }
    assignReflectionMaps()
  }
  function buildStaticBatches(entities: Entity[]) {
    if (options.editor || !staticBatching) return
    const groups = new Map<string, { matId: string; items: { entity: Entity; mesh: L.Mesh; node: SceneNode }[] }>()
    for (const e of entities) {
      if (!e.active) continue
      const wantBatch = e.properties.staticBatch === true
      if (!wantBatch || !isEligibleForStaticBatch(e)) continue
      const mc = e.components.find((c) => c.enabled !== false && c.type === 'mesh' && c.shape !== 'model')
      const node = objects.get(e.id)
      if (!mc || !node) continue
      const matId = String(mc.material || '')
      const matProps = project.assets.find((a) => a.id === matId)?.properties
      // Skip transparent/additive/custom-shader materials from opaque static batching
      if (matProps && ((matProps.opacity ?? 1) < 1 || matProps.additive || matProps.shader)) continue
      const mesh = primitive(mc)
      if (!mesh.points?.length) continue
      let grp = groups.get(matId)
      if (!grp) {
        grp = { matId, items: [] }
        groups.set(matId, grp)
      }
      grp.items.push({ entity: e, mesh, node })
    }
    for (const grp of groups.values()) {
      if (grp.items.length < 2) continue
      const allPts: L.Vector3[] = []
      const allUvs: L.Vector2[] = []
      const allIdx: number[] = []
      let baseVertex = 0
      for (const { entity, mesh, node } of grp.items) {
        const tri = mesh.getTriangles()
        const pts = mesh.points
        const uvs = mesh.uvs
        for (let i = 0; i < pts.length; i++) {
          _tmpV1.set(pts[i].x, pts[i].y, pts[i].z)
          node.localToWorld(_tmpV1)
          allPts.push(d.vec3(_tmpV1.x, _tmpV1.y, _tmpV1.z))
          const uv = uvs?.[i]
          allUvs.push(uv ? d.vec2(uv.x, uv.y) : d.vec2(0, 0))
        }
        for (let i = 0; i < tri.indices.length; i++) {
          allIdx.push(baseVertex + tri.vertices[tri.indices[i]])
        }
        baseVertex += pts.length
        // Hide individual renderables since they are now drawn in 1 batched call
        const objs = renderables.get(entity.id)
        if (objs) {
          for (const o of objs) {
            o.destroy()
          }
          objs.length = 0
        }
      }
      if (!allIdx.length) continue
      const combined = new d.Mesh().addTriangles(allPts, allIdx, undefined, allUvs).computeNormals(false)
      const key = '__batch:' + grp.matId + ':' + batchedMeshes.length
      meshes.set(key, combined)
      const bObj = new d.EngineObject3D(d.vec3(), combined)
      material(bObj, grp.matId)
      batchedMeshes.push(bObj)
    }
  }
  function load(p: Project, id?: string) {
    clear()
    project = p
    const scene = p.scenes.find((s) => s.id === (id ?? p.activeScene)) ?? p.scenes[0],
      env = scene.environment
    exposure = env.exposure ?? 1
    ambient = env.ambient ?? 1
    ambientTint = env.ambientColor || '#c8cfda'
    ambientGroundTint = env.ambientGroundColor || ''
    ambientGroundIntensity = Number(env.ambientGroundIntensity ?? 0.5)
    sunTint = env.sunColor || '#fff3d9'
    sunIntensity = env.sunIntensity ?? 1
    sunDir =
      Array.isArray(env.sunDirection) && env.sunDirection.length >= 3
        ? [Number(env.sunDirection[0]), Number(env.sunDirection[1]), Number(env.sunDirection[2])]
        : [-4, 8, 6]
    d.background(env.background)
    r.shadows = env.shadows !== false
    r.shadowRange = Number(env.shadowRange ?? 40)
    ;(r as any).shadowSoftness = Number(env.shadowSoftness ?? 1)
    ;(r as any).shadowBias = Number(env.shadowBias ?? 0.003)
    shadowFollowCamera = Boolean(env.shadowFollowCamera)
    ;(r as any).shadowCenter = shadowFollowCamera ? v(camera.position) : undefined
    ;(r as any).anisotropy = Math.max(1, Math.min(16, Number(env.anisotropy ?? 4)))
    ;(r as any).mipmaps = env.mipmaps !== false
    ;(r as any).frustumCulling = env.frustumCulling !== false
    const perf = p.settings?.performance || {}
    resolutionScale = Math.max(0.4, Math.min(1, Number(perf.resolutionScale ?? 1)))
    ratio = Math.min(window.devicePixelRatio || 1, 2) * resolutionScale
    lightCullDist = Math.max(0, Number(perf.lightCullDistance ?? 45))
    particleCullDist = Math.max(0, Number(perf.particleCullDistance ?? 40))
    animationThrottle = perf.animationThrottle !== false
    staticBatching = Boolean(perf.staticBatching)
    globalCullDist = Math.max(0, Number(perf.cullDistance ?? 0))
    ;(r as any).sortTransparent = env.sortTransparent !== false
    ;(r as any).softShadowHeight = Number(env.softShadowHeight ?? 0)
    ;(r as any).smoothShading = Boolean(env.smoothShading)
    ;(r as any).fogDepth = Boolean(env.fogDepth)
    ;(r as any).fogFadeStart = Number(env.fogFadeStart ?? 0)
    ;(r as any).fogFadeEnd = Number(env.fogFadeEnd ?? 0)
    r.ambientColor = color(ambientTint).scale(ambient * 0.5 * exposure)
    ;(r as any).ambientGroundColor = ambientGroundTint
      ? color(ambientGroundTint).scale(ambientGroundIntensity * exposure)
      : undefined
    r.shadowMapSize = env.shadowQuality === 'high' ? 2048 : env.shadowQuality === 'low' ? 512 : 1024
    r.setFog(0, env.fogDensity > 0 ? 1.8 / env.fogDensity : 0, color(env.fogColor || env.background))
    r.sunDirection = d.vec3(sunDir[0], sunDir[1], sunDir[2])
    r.sunColor = color(sunTint)
    if (env.skyAsset) {
      setSkyAsset(env.skyAsset)
    } else if (env.skyEnabled) {
      if (env.skyMode === 'cubemap') {
        setSkyboxFaces(env.skyFaces || {})
      } else if (env.skyMode === 'procedural') {
        setProceduralSky({
          topColor: env.skyTopColor,
          horizonColor: env.skyHorizonColor,
          bottomColor: env.skyBottomColor,
          sunColor: env.sunColor,
          sunSize: env.skySunSize,
          cloudColor: env.skyCloudColor,
          cloudCoverage: env.skyCloudCoverage,
          cloudSpeed: env.skyCloudSpeed,
          cloudScale: env.skyCloudScale,
          starIntensity: env.skyStarIntensity,
        })
      } else {
        setSky(
          env.skyTopColor || '#3a536b',
          env.skyHorizonColor || '#8c99a3',
          env.skyBottomColor || '#262b30',
          true,
        )
      }
    }
    post.setOptions({
      ...defaultPostProcess,
      ao: Number(env.ao ?? 0),
      aoRadius: Number(env.aoRadius ?? 2.5),
      dof: Number(env.dof ?? 0),
      dofFocus: Number(env.dofFocus ?? 0.5),
      dofAperture: Number(env.dofAperture ?? 0.22),
      bloom: Number(env.bloom ?? 0),
      bloomThreshold: Number(env.bloomThreshold ?? 0.72),
      vignette: Number(env.vignette ?? 0),
      chromatic: Number(env.chromatic ?? 0),
      grain: Number(env.grain ?? 0),
      scanlines: Number(env.scanlines ?? 0),
      contrast: Number(env.contrast ?? 1),
      saturation: Number(env.saturation ?? 1),
      toneMapping: env.toneMapping === 'aces' ? 'aces' : 'none',
    })
    ratio = Math.min(window.devicePixelRatio || 1, env.pixelRatioLimit ?? 1.6) * (env.resolutionScale ?? 1)
    addEntities(scene.entities)
    buildStaticBatches(scene.entities)
    globalBakedLighting = Boolean(env.bakedLighting)
    const refMode = env.reflectionMode === 'realtime' || env.reflectionMode === 'baked' ? env.reflectionMode : 'off'
    setReflections(refMode, Number(env.reflectionResolution ?? 128), Number(env.reflectionInterval ?? 4))
    if (globalBakedLighting || zoneProbes.size > 0) bakeLighting()
    if (!options.editor) {
      const entity = scene.entities.find(
        (e) => e.active && e.components.some((c) => c.type === 'camera' && c.enabled !== false),
      )
      const c = entity?.components.find((c) => c.type === 'camera' && c.enabled !== false)
      camera.height = c?.projection === 'perspective' ? 0 : (c?.size ?? 12) / (c?.zoom ?? 1)
      camera.fov = c?.fov ?? 45
      if (entity) {
        objects.get(entity.id)!.getWorldPosition(camera.position)
        const [x, y, z, w] = objects.get(entity.id)!.worldRotation()
        camera.setWorldRotation({ x, y, z, w })
      } else camera.position.set(12, 11, 15)
      if (c?.target || !entity) camera.lookAt(new Vector3().fromArray(c?.target ?? [0, 0.25, 0]))
    }
  }
  function sync() {
    distanceCulled.clear()
    for (const [id, obj] of roots) {
      const n = objects.get(id)!
      obj.pos3D.set(n.position.x, n.position.y, n.position.z)
      if (!options.editor) {
        const limit = entityCullDist.get(id) ?? globalCullDist
        if (limit > 0 && !meshes.has(id + '/terrain/0') && !meshes.has(id + '/water')) {
          const wp = n.getWorldPosition(_tmpV3)
          const dSq = (wp.x - camera.position.x) ** 2 + (wp.y - camera.position.y) ** 2 + (wp.z - camera.position.z) ** 2
          if (dSq > limit * limit) distanceCulled.add(id)
        }
      }
      obj.rotation3D.set(n.rotation.x, n.rotation.y, n.rotation.z)
      obj.scale3D.set(n.scale.x, n.scale.y, n.scale.z)
      const parent = n.parent && roots.get(n.parent.id)
      if (parent && obj.parent !== parent) parent.addChild(obj)
    }
    r.ambientColor = color(ambientTint).scale(ambient * 0.36 * exposure)
    ;(r as any).ambientGroundColor = ambientGroundTint
      ? color(ambientGroundTint).scale(ambientGroundIntensity * exposure)
      : undefined
    r.sunColor = color(sunTint).scale(0.6 * sunIntensity * exposure)
    r.sunDirection = d.vec3(sunDir[0], sunDir[1], sunDir[2])
    if (!runtimeEnvOverride) {
      for (const [id, light] of sceneLights) {
        const n = objects.get(id)!
        if (!n.active) continue
        const tint = color(light.color ?? '#ffffff')
        if (light.kind === 'ambient')
          r.ambientColor = tint.scale((light.intensity ?? 1) * 0.26 * ambient * exposure)
        else {
          const pos = n.getWorldPosition(new Vector3())
          r.sunColor = tint.scale((light.intensity ?? 1) * 0.29 * exposure)
          if (pos.x || pos.y || pos.z) r.sunDirection = v(pos)
        }
      }
    }
    if (lightCullDist > 0 && entityLights.size) {
      const shLight = (r as any).shadowLight
      for (const [id, light] of entityLights) {
        const baseI = entityLightBaseIntensity.get(id)
        if (baseI === undefined) continue
        if (light === shLight) {
          light.intensity = baseI
          continue
        }
        const n = objects.get(id)
        if (!n?.active) { light.intensity = 0; continue }
        const wp = n.getWorldPosition(_tmpV3)
        const maxD = (light.radius || 12) + lightCullDist
        const dSq = (wp.x - camera.position.x) ** 2 + (wp.y - camera.position.y) ** 2 + (wp.z - camera.position.z) ** 2
        light.intensity = dSq <= maxD * maxD ? baseI : 0
      }
    }
    if (shadowFollowCamera) { (r as any).shadowCenter = d.vec3(camera.position.x, 0, camera.position.z) }
    if (skyDome) skyDome.pos3D.set(camera.position.x, camera.position.y, camera.position.z)
    for (const face of skyCube) {
      const off = (face as any).__skyOffset as Vec3
      face.pos3D.set(camera.position.x + off[0], camera.position.y + off[1], camera.position.z + off[2])
    }
    if (flashlight) {
      flashlight.pos3D.set(camera.position.x, camera.position.y, camera.position.z)
      flashlight.rotation3D.set(camera.rotation.x, camera.rotation.y, camera.rotation.z)
      if (!flashlightEnabled) flashlight.intensity = 0
    }
    r.camera.pos = v(camera.position)
    r.camera.rotation = v(camera.rotation)
    r.camera.fov = (camera.fov * Math.PI) / 180
    r.camera.orthographic =
      camera.height / Math.min(1, (container.clientWidth || 1) / (container.clientHeight || 1))
  }
  function render() {
    if (disposed) return
    if (options.editor) {
      const now = performance.now()
      d.tick(Math.min(0.1, (now - editorTime) / 1000))
      editorTime = now
      for (const [id, obj] of players) {
        if (objects.get(id)?.active && (obj.animationPlaying || (obj as any).blendFrom)) obj.update()
      }
    }
    sync()
    const nowPtc = performance.now()
    const dtPtc = Math.min(0.05, Math.max(0.001, (nowPtc - lastParticleTick) / 1000))
    lastParticleTick = nowPtc
    stepVisualEffects(dtPtc)
    renderFrameCount++
    if (globalProbe && globalProbe.mode === 'realtime' && renderFrameCount % globalProbe.interval === 0) {
      globalProbe.cube.capturePos.set(camera.position.x, Math.max(1.0, camera.position.y), camera.position.z)
      ;(r as any).cubeCaptures?.add(globalProbe.cube)
    }
    for (const probe of zoneProbes.values()) {
      if (probe.mode === 'realtime' && renderFrameCount % probe.interval === 0) {
        const node = objects.get(probe.id)
        if (node?.active) {
          const wp = node.getWorldPosition(new Vector3())
          probe.cube.capturePos.set(wp.x, wp.y, wp.z)
          ;(r as any).cubeCaptures?.add(probe.cube)
        }
      }
    }
    if (debugQueue.length) {
      const nowMs = performance.now()
      ;(r as any).onRenderTransparent = () => {
        for (let i = debugQueue.length - 1; i >= 0; i--) {
          const item = debugQueue[i]
          const col = color(item.color)
          if (item.kind === 'line' && typeof (r as any).drawLine === 'function') {
            ;(r as any).drawLine(d.vec3(...item.a), d.vec3(...item.b), col)
          } else if (item.kind === 'box' && typeof (r as any).drawBox === 'function') {
            ;(r as any).drawBox(d.vec3(...item.a), d.vec3(...item.b), col)
          }
          if (nowMs >= item.until) debugQueue.splice(i, 1)
        }
      }
    } else {
      ;(r as any).onRenderTransparent = undefined
    }
    info.render.calls = d.render(
      Math.max(1, container.clientWidth),
      Math.max(1, container.clientHeight),
      ratio,
      hidden,
    )
    for (const fl of activeFlares) {
      if (!fl.destroyed) {
        fl.visible = 1
        fl.visibleFound = true
        if (typeof fl.update === 'function') fl.update()
      }
    }
    let bestRay: { uv: [number, number]; intensity: number; color: [number, number, number]; decay: number } | null = null
    if (sunRaySources.size) {
      const wPx = Math.max(1, container.clientWidth)
      const hPx = Math.max(1, container.clientHeight)
      const cy = Math.cos(camera.rotation.y), sy = Math.sin(camera.rotation.y)
      const cp = Math.cos(camera.rotation.x), sp = Math.sin(camera.rotation.x)
      const fwd = [-sy * cp, sp, -cy * cp]
      const right = [cy, 0, -sy]
      const up = [
        right[1] * fwd[2] - right[2] * fwd[1],
        right[2] * fwd[0] - right[0] * fwd[2],
        right[0] * fwd[1] - right[1] * fwd[0],
      ]
      const tanHalf = Math.tan(((camera.fov * Math.PI) / 180) * 0.5)
      const aspect = wPx / hPx
      for (const src of sunRaySources.values()) {
        if (!src.enabled || src.intensity <= 0) continue
        const node = objects.get(src.id)
        if (!node?.active) continue
        const wp = node.getWorldPosition(_tmpV1)
        let relX: number, relY: number, relZ: number
        if (src.directional) {
          const len = Math.hypot(wp.x, wp.y, wp.z) || 1
          relX = (wp.x / len) * 100
          relY = (wp.y / len) * 100
          relZ = (wp.z / len) * 100
        } else {
          relX = wp.x - camera.position.x
          relY = wp.y - camera.position.y
          relZ = wp.z - camera.position.z
        }
        const depth = relX * fwd[0] + relY * fwd[1] + relZ * fwd[2]
        if (depth <= 0.1) continue
        const rx = relX * right[0] + relY * right[1] + relZ * right[2]
        const ry = relX * up[0] + relY * up[1] + relZ * up[2]
        const ndcX = rx / (depth * tanHalf * aspect)
        const ndcY = ry / (depth * tanHalf)
        const margin = Math.max(Math.abs(ndcX), Math.abs(ndcY))
        if (margin > 1.75) continue
        const fade = Math.max(0, Math.min(1, 1 - Math.max(0, margin - 0.85) / 0.9))
        const eff = src.intensity * fade
        if (!bestRay || eff > bestRay.intensity) {
          bestRay = {
            uv: [ndcX * 0.5 + 0.5, ndcY * 0.5 + 0.5],
            intensity: eff,
            color: src.color,
            decay: src.decay,
          }
        }
      }
    }
    if (bestRay) post.setSunRay(bestRay.uv, bestRay.intensity, bestRay.color, bestRay.decay)
    else post.setSunRay([0.5, 0.5], 0)
    post.render(canvas)
    info.memory.textures = textures.size
    info.render.triangles = d.triangles()
  }
  load(initial, sceneId)
  return {
    renderer,
    objects,
    camera,
    load,
    render,
    addEntities,
    removeEntities,
    ready: () =>
      Promise.all(pending).then(() => {
        if (globalProbe) { (r as any).cubeCaptures?.add(globalProbe.cube) }
        for (const z of zoneProbes.values()) { (r as any).cubeCaptures?.add(z.cube) }
        assignReflectionMaps()
      }),
    setFog(density: number, fogColor?: string) {
      const scene = project.scenes.find((s) => s.id === project.activeScene) ?? project.scenes[0]
      const col = fogColor ?? scene.environment.fogColor ?? scene.environment.background
      r.setFog(0, density > 0 ? 1.8 / density : 0, color(col))
    },
    setFogFade(start: number, end: number, depthMode?: boolean) {
      ;(r as any).fogFadeStart = Math.max(0, start)
      ;(r as any).fogFadeEnd = Math.max(0, end)
      if (depthMode !== undefined) (r as any).fogDepth = depthMode
    },
    setBackground(hex: string) {
      d.background(hex)
    },
    setAmbient(intensity: number, tint?: string) {
      runtimeEnvOverride = true
      ambient = Math.max(0, intensity)
      if (tint) ambientTint = tint
    },
    setAmbientGround(hex: string, intensity = 0.5) {
      ambientGroundTint = hex
      ambientGroundIntensity = Math.max(0, intensity)
    },
    setSun(direction: Vec3, tint?: string, intensity?: number) {
      runtimeEnvOverride = true
      sunDir = [...direction]
      if (tint) sunTint = tint
      if (intensity !== undefined) sunIntensity = Math.max(0, intensity)
    },
    setExposure(value: number) {
      exposure = Math.max(0.05, value)
    },
    setShadows(enabled: boolean, range?: number, softShadowHeight?: number) {
      r.shadows = enabled
      if (range !== undefined) r.shadowRange = Math.max(1, range)
      if (softShadowHeight !== undefined) (r as any).softShadowHeight = softShadowHeight
    },
    setSmoothShading(enabled: boolean) {
      ;(r as any).smoothShading = enabled
    },
    bakeLighting,
    setReflections,
    updateZoneProbe(zoneId: string) {
      const probe = zoneProbes.get(zoneId)
      if (probe) { (r as any).cubeCaptures?.add(probe.cube) }
    },
    setPostProcess(opts: PostProcessOptions) {
      post.setOptions(opts)
    },
    getPostProcess(): Required<PostProcessOptions> {
      return post.getOptions()
    },
    setSky,
    setProceduralSky,
    setSkyboxFaces,
    setSkyAsset,
    setLightIntensity(id: string, intensity: number) {
      const light = entityLights.get(id)
      const val = Math.max(0, intensity)
      entityLightBaseIntensity.set(id, val)
      if (light) light.intensity = val
    },
    setLightColor(id: string, hex: string) {
      const light = entityLights.get(id)
      if (light) light.color = color(hex)
    },
    setLightRange(id: string, range: number) {
      const light = entityLights.get(id)
      if (light) light.radius = Math.max(0.1, range)
    },
    setLightSunRays(id: string, enabled: boolean, intensity = 0.75, decay = 0.94) {
      if (!enabled) { sunRaySources.delete(id); return }
      const existing = sunRaySources.get(id)
      const sceneLight = sceneLights.get(id)
      sunRaySources.set(id, {
        id,
        directional: existing?.directional ?? sceneLight?.kind === 'directional',
        intensity: Math.max(0.05, intensity),
        decay: Math.max(0.8, Math.min(0.99, decay)),
        color: existing?.color ?? hexToRgbTuple(sceneLight?.color ?? '#ffe8bd'),
        enabled: true,
      })
    },
    setLightGlow(id: string, glow: number, falloff?: number) {
      const light = entityLights.get(id)
      if (!light) return
      ;(light as any).glow = Math.max(0, glow)
      if (falloff !== undefined) (light as any).glowFalloff = Math.max(0.1, falloff)
    },
    setShadowLight(id: string | null) {
      ;(r as any).shadowLight = id ? entityLights.get(id) : undefined
    },
    setLightGel(id: string, textureAssetId: string | null) {
      const light = entityLights.get(id)
      if (!light) return
      if (!textureAssetId) {
        ;(light as any).gel = undefined
        return
      }
      if (light.coneAngle > 0) (r as any).shadowLight = light
      const p = texture(textureAssetId)
      if (p) {
        void p.then((t) => {
          if (!light.destroyed) (light as any).gel = t
        })
      }
    },
    setShadowParams(opts: { softness?: number; bias?: number; followCamera?: boolean }) {
      if (opts.softness !== undefined) (r as any).shadowSoftness = Math.max(0, opts.softness)
      if (opts.bias !== undefined) (r as any).shadowBias = Math.max(0, opts.bias)
      if (opts.followCamera !== undefined) {
        shadowFollowCamera = opts.followCamera
        if (!shadowFollowCamera) (r as any).shadowCenter = undefined
      }
    },
    setCullDistance(dist: number) {
      globalCullDist = Math.max(0, Number(dist || 0))
    },
    setResolutionScale(scale: number) {
      resolutionScale = Math.max(0.4, Math.min(1, Number(scale || 1)))
      ratio = Math.min(window.devicePixelRatio || 1, 2) * resolutionScale
    },
    setOptimization(opts: { lightCullDistance?: number; particleCullDistance?: number; animationThrottle?: boolean }) {
      if (opts.lightCullDistance !== undefined) lightCullDist = Math.max(0, opts.lightCullDistance)
      if (opts.particleCullDistance !== undefined) particleCullDist = Math.max(0, opts.particleCullDistance)
      if (opts.animationThrottle !== undefined) animationThrottle = Boolean(opts.animationThrottle)
    },
    setRenderQuality(opts: { anisotropy?: number; mipmaps?: boolean; frustumCulling?: boolean; sortTransparent?: boolean }) {
      if (opts.anisotropy !== undefined) (r as any).anisotropy = Math.max(1, Math.min(16, opts.anisotropy))
      if (opts.mipmaps !== undefined) (r as any).mipmaps = opts.mipmaps
      if (opts.frustumCulling !== undefined) (r as any).frustumCulling = opts.frustumCulling
      if (opts.sortTransparent !== undefined) (r as any).sortTransparent = opts.sortTransparent
    },
    drawDebugLine(a: Vec3, b: Vec3, hex = '#00ff88', durationSec = 0) {
      debugQueue.push({ kind: 'line', a: [...a], b: [...b], color: hex, until: performance.now() + durationSec * 1000 })
    },
    drawDebugBox(center: Vec3, size: Vec3, hex = '#ffaa00', durationSec = 0) {
      debugQueue.push({ kind: 'box', a: [...center], b: [...size], color: hex, until: performance.now() + durationSec * 1000 })
    },
    setFlashlight(opts: { enabled: boolean; color?: string; intensity?: number; range?: number; angle?: number }) {
      flashlightEnabled = opts.enabled
      if (!flashlight && opts.enabled) {
        flashlight = new d.Light3D(
          v(camera.position),
          opts.range ?? 18,
          color(opts.color ?? '#fff5dc'),
          opts.intensity ?? 2.4,
        )
        flashlight.coneAngle = opts.angle ?? 0.52
      }
      if (flashlight) {
        if (opts.color) flashlight.color = color(opts.color)
        if (opts.range !== undefined) flashlight.radius = Math.max(0.5, opts.range)
        if (opts.angle !== undefined) flashlight.coneAngle = opts.angle
        flashlight.intensity = opts.enabled ? (opts.intensity ?? 2.4) : 0
      }
    },
    setEntityMaterial(id: string, materialAssetId: string) {
      const objs = renderables.get(id)
      if (!objs) return
      for (const obj of objs) material(obj, materialAssetId)
    },
    setEntityColor(id: string, hex: string, opacity?: number) {
      const objs = renderables.get(id)
      if (!objs) return
      for (const obj of objs) {
        obj.color = color(hex, opacity ?? obj.color.a)
        obj.transparent = obj.color.a < 1
      }
    },
    setEntityEmissive(id: string, hex: string, intensity = 1) {
      const objs = renderables.get(id)
      if (!objs) return
      for (const obj of objs) {
        obj.emissive = Math.max(0, intensity)
        obj.emissiveMapColor = color(hex)
        if (intensity > 0 && !obj.emissiveMap) obj.emissiveMap = d.whiteTexture()
      }
    },
    setEntityShader(id: string, shaderAssetId: string | null) {
      const objs = renderables.get(id)
      if (!objs) return
      if (!shaderAssetId) {
        for (const obj of objs) obj.shader = undefined
        return
      }
      const shader = project.assets.find((a) => a.type === 'shader' && a.id === shaderAssetId)
      if (!shader) return
      if (!shaders.has(shader.id)) shaders.set(shader.id, new d.Shader(shader.data, shader.properties.vertex))
      const compiled = shaders.get(shader.id)
      for (const obj of objs) obj.shader = compiled
    },
    setGrid(enabled: boolean, height: number) {
      if (!enabled) {
        if (grid) grid.color.a = 0
        return
      }
      if (!grid) {
        const mesh = d.buildGrid(d.vec2(140), 1)
        meshes.set('__editorGrid', mesh)
        grid = new d.EngineObject3D(d.vec3(), mesh)
        grid.transparent = true
        grid.emissive = 1
        grid.castShadow = false
        grid.receiveShadow = false
        const shader = new d.Shader(
          'void mainImage(out vec4 c,vec2 uv){vec2 p=worldPos.xz;vec2 g=abs(fract(p+.5)-.5)/max(fwidth(p),vec2(.001));float a=(1.-min(1.,min(g.x,g.y)))*exp(-length(p)*.04);if(a<.015)discard;c=vec4(.52,.60,.64,a*.38);}',
        )
        shaders.set('__editorGrid', shader)
        grid.shader = shader
      }
      grid.color.a = 1
      grid.pos3D.y = height
    },
    setEntityActive(id: string, on: boolean) {
      const n = objects.get(id)
      if (n) n.visible = on
    },
    pick(x: number, y: number) {
      sync()
      const hit = d.pick(d.vec2(x, y), (o) => o === grid || (o === skyDome || skyCube.includes(o as L.EngineObject3D)) || hidden(o))
      return hit && owner(hit.object)?.id
    },
    screenToGround(x: number, y: number, planeY = 0): Vec3 {
      sync()
      const w = Math.max(1, container.clientWidth),
        h = Math.max(1, container.clientHeight)
      const hit = d.pick(d.vec2(x, y), (o) => o === grid || (o === skyDome || skyCube.includes(o as L.EngineObject3D)) || hidden(o))
      if (hit && 'point' in hit && (hit as any).point) {
        const pt = (hit as any).point
        return [Math.round(pt.x * 100) / 100, Math.round(pt.y * 100) / 100, Math.round(pt.z * 100) / 100]
      }
      const ndcX = (x / w) * 2 - 1,
        ndcY = 1 - (y / h) * 2
      const fovRad = (camera.fov * Math.PI) / 180
      const tanHalf = Math.tan(fovRad / 2)
      const aspect = w / h
      const cy = Math.cos(camera.rotation.y),
        sy = Math.sin(camera.rotation.y)
      const cp = Math.cos(camera.rotation.x),
        sp = Math.sin(camera.rotation.x)
      const fwd = [-sy * cp, sp, -cy * cp]
      const right = [cy, 0, -sy]
      const up = [
        right[1] * fwd[2] - right[2] * fwd[1],
        right[2] * fwd[0] - right[0] * fwd[2],
        right[0] * fwd[1] - right[1] * fwd[0],
      ]
      const dx = fwd[0] + right[0] * ndcX * aspect * tanHalf + up[0] * ndcY * tanHalf
      const dy = fwd[1] + right[1] * ndcX * aspect * tanHalf + up[1] * ndcY * tanHalf
      const dz = fwd[2] + right[2] * ndcX * aspect * tanHalf + up[2] * ndcY * tanHalf
      if (Math.abs(dy) < 1e-4) return [0, planeY, 0]
      const t = (planeY - camera.position.y) / dy
      if (t <= 0 || t > 200) return [0, planeY, 0]
      return [
        Math.round((camera.position.x + dx * t) * 100) / 100,
        planeY,
        Math.round((camera.position.z + dz * t) * 100) / 100,
      ]
    },
    playParticles(id: string) {
      const em = emitters.get(id)
      if (em) em.playing = true
    },
    stopParticles(id: string) {
      const em = emitters.get(id)
      if (em) em.playing = false
    },
    burstParticles(id: string, count = 20) {
      const em = emitters.get(id)
      const node = objects.get(id)
      if (!em || !node) return
      const wp = node.getWorldPosition(new Vector3())
      const n = Math.min(em.pool.length, Math.max(1, Math.floor(count)))
      for (let i = 0; i < n; i++) spawnOneParticle(em, [wp.x, wp.y, wp.z])
    },
    setParticleRate(id: string, rate: number) {
      const em = emitters.get(id)
      if (em) em.config.rate = Math.max(0, rate)
    },
    setParticleColors(id: string, startHex: string, endHex?: string) {
      const em = emitters.get(id)
      if (!em) return
      em.config.startColor = startHex
      em.startCol = hexToRgbTuple(startHex)
      if (endHex) {
        em.config.endColor = endHex
        em.endCol = hexToRgbTuple(endHex)
      }
    },
    setBillboardFrame(id: string, frame: number) {
      const bb = billboards.get(id)
      if (!bb) return
      bb.frame = Math.max(0, Math.floor(frame))
      if (bb.atlasCols > 1 || bb.atlasRows > 1) {
        bb.obj.shader = buildAtlasShader(bb.atlasCols, bb.atlasRows, bb.frame)
      }
    },
    setBillboardOpacity(id: string, opacity: number) {
      const bb = billboards.get(id)
      if (bb) bb.obj.color.a = Math.max(0, Math.min(1, opacity))
    },
    setBillboardSize(id: string, width: number, height: number) {
      const bb = billboards.get(id)
      if (!bb) return
      bb.width = Math.max(0.05, width)
      bb.height = Math.max(0.05, height)
    },
    spawnDecal(opts: {
      position: Vec3
      normal?: Vec3
      size?: [number, number]
      color?: string
      opacity?: number
      texture?: string
      lifetime?: number
      blendMode?: 'alpha' | 'additive'
    }) {
      const qMesh = unitQuadMesh()
      const nrm = opts.normal ?? [0, 1, 0]
      const nl = Math.hypot(nrm[0], nrm[1], nrm[2]) || 1
      const nx = nrm[0] / nl, ny = nrm[1] / nl, nz = nrm[2] / nl
      const offset = 0.012
      const pos = d.vec3(opts.position[0] + nx * offset, opts.position[1] + ny * offset, opts.position[2] + nz * offset)
      const obj = new d.EngineObject3D(pos, qMesh)
      const sz = opts.size ?? [0.6, 0.6]
      obj.scale3D.set(sz[0], sz[1], 1)
      const yawD = Math.atan2(nx, nz)
      const pitchD = -Math.atan2(ny, Math.hypot(nx, nz) || 1e-5)
      obj.rotation3D.set(pitchD, yawD, 0)
      obj.transparent = true
      obj.castShadow = false
      obj.receiveShadow = true
      ;(obj as any).depthWrite = false
      if (opts.blendMode === 'additive') (obj as any).additive = true
      const op = Math.max(0, Math.min(1, opts.opacity ?? 0.85))
      obj.color = color(opts.color ?? '#222222', op)
      if (opts.texture) {
        const tex = texture(opts.texture)
        if (tex) void tex.then((t) => { if (!obj.destroyed) d.setTexture(obj, t) })
      } else {
        d.setTexture(obj, softParticleTexture())
      }
      if (dynamicDecals.length >= 120) {
        const oldest = dynamicDecals.shift()
        oldest?.obj.destroy()
      }
      dynamicDecals.push({ obj, age: 0, lifetime: Math.max(0, opts.lifetime ?? 0), opacity: op })
    },
    clearDecals() {
      for (const dd of dynamicDecals) dd.obj.destroy()
      dynamicDecals.length = 0
    },
    setDecalOpacity(id: string, opacity: number) {
      const dec = decals.get(id)
      if (!dec) return
      dec.opacity = Math.max(0, Math.min(1, opacity))
      dec.obj.color.a = dec.opacity
    },
    worldToScreen(pos: Vec3 | Vector3): { x: number; y: number; visible: boolean; depth: number } {
      const w = Math.max(1, container.clientWidth)
      const h = Math.max(1, container.clientHeight)
      const px = Array.isArray(pos) ? pos[0] : pos.x
      const py = Array.isArray(pos) ? pos[1] : pos.y
      const pz = Array.isArray(pos) ? pos[2] : pos.z
      const relX = px - camera.position.x
      const relY = py - camera.position.y
      const relZ = pz - camera.position.z
      const cy = Math.cos(camera.rotation.y), sy = Math.sin(camera.rotation.y)
      const cp = Math.cos(camera.rotation.x), sp = Math.sin(camera.rotation.x)
      const fwd = [-sy * cp, sp, -cy * cp]
      const right = [cy, 0, -sy]
      const up = [
        right[1] * fwd[2] - right[2] * fwd[1],
        right[2] * fwd[0] - right[0] * fwd[2],
        right[0] * fwd[1] - right[1] * fwd[0],
      ]
      const depth = relX * fwd[0] + relY * fwd[1] + relZ * fwd[2]
      if (depth <= 0.05) return { x: -9999, y: -9999, visible: false, depth }
      const rx = relX * right[0] + relY * right[1] + relZ * right[2]
      const ry = relX * up[0] + relY * up[1] + relZ * up[2]
      const tanHalf = Math.tan(((camera.fov * Math.PI) / 180) * 0.5)
      const aspect = w / h
      const ndcX = rx / (depth * tanHalf * aspect)
      const ndcY = ry / (depth * tanHalf)
      const sx = (ndcX * 0.5 + 0.5) * w
      const syPx = (0.5 - ndcY * 0.5) * h
      const visible = ndcX >= -1.05 && ndcX <= 1.05 && ndcY >= -1.05 && ndcY <= 1.05
      return { x: sx, y: syPx, visible, depth }
    },
    screenToRay(x: number, y: number): { origin: Vec3; direction: Vec3 } {
      const w = Math.max(1, container.clientWidth)
      const h = Math.max(1, container.clientHeight)
      const ndcX = (x / w) * 2 - 1
      const ndcY = 1 - (y / h) * 2
      const tanHalf = Math.tan(((camera.fov * Math.PI) / 180) * 0.5)
      const aspect = w / h
      const cy = Math.cos(camera.rotation.y), sy = Math.sin(camera.rotation.y)
      const cp = Math.cos(camera.rotation.x), sp = Math.sin(camera.rotation.x)
      const fwd = [-sy * cp, sp, -cy * cp]
      const right = [cy, 0, -sy]
      const up = [
        right[1] * fwd[2] - right[2] * fwd[1],
        right[2] * fwd[0] - right[0] * fwd[2],
        right[0] * fwd[1] - right[1] * fwd[0],
      ]
      const dx = fwd[0] + right[0] * ndcX * aspect * tanHalf + up[0] * ndcY * tanHalf
      const dy = fwd[1] + right[1] * ndcX * aspect * tanHalf + up[1] * ndcY * tanHalf
      const dz = fwd[2] + right[2] * ndcX * aspect * tanHalf + up[2] * ndcY * tanHalf
      const len = Math.hypot(dx, dy, dz) || 1
      return {
        origin: [camera.position.x, camera.position.y, camera.position.z],
        direction: [dx / len, dy / len, dz / len],
      }
    },
    projectPoint(p: Vector3) {
      return r.worldToScreen(v(p), d.vec2(container.clientWidth, container.clientHeight))
    },
    raycast(origin: Vector3, dir: Vector3, max: number) {
      sync()
      const hit = d.pick(
        new d.Ray3D(v(origin), v(dir).normalize()),
        (o) => o === grid || (o === skyDome || skyCube.includes(o as L.EngineObject3D)) || hidden(o),
      )
      return hit && hit.distance <= max ? owner(hit.object)?.id : undefined
    },
    animationClips: (id: string) => players.get(id)?.model.animations.map((a) => a.name) ?? [],
    inspectModel: (id: string) => {
      const player = players.get(id) as any
      const m = player?.model
      if (!m) return undefined
      const toHex = (c: any) => {
        if (!c) return '#ffffff'
        const h = (x: number) => Math.max(0, Math.min(255, Math.round(x * 255))).toString(16).padStart(2, '0')
        return `#${h(c.r ?? 1)}${h(c.g ?? 1)}${h(c.b ?? 1)}`
      }
      const parts = (m.parts || []).map((pt: any, index: number) => {
        const mesh = pt.mesh
        const verts = mesh?.points?.length ?? mesh?.vertexDataCount ?? 0
        const idxCount = mesh?.indices?.length ?? mesh?.vertexIndices?.length ?? 0
        const tris = idxCount ? Math.floor(idxCount / 3) : Math.max(0, verts - 2)
        return {
          index,
          name: String(pt.name || `Part ${index}`),
          vertices: verts,
          triangles: tris,
          color: toHex(pt.color),
          hasTexture: Boolean(pt.textureInfo),
          roughness: Number(pt.roughness ?? 1),
          unlit: Boolean(pt.unlit),
          pixelated: Boolean(pt.pixelated),
          doubleSided: Boolean(mesh?.doubleSided),
        }
      })
      const baseAnims: any[] = m.__baseAnimations || m.animations || []
      const nativeClips = baseAnims.map((a: any) => ({ name: String(a.name), duration: Number(a.duration || 0) }))
      const allClips = (m.animations || []).map((a: any) => ({ name: String(a.name), duration: Number(a.duration || 0) }))
      const nt = m.nodeTree
      const bones = Array.isArray(nt?.nodes) ? nt.nodes.map((nd: any, i: number) => String(nd?.name || `Bone_${i}`)) : []
      const b = typeof m.getBounds === 'function' ? m.getBounds() : { min: { x: -1, y: 0, z: -1 }, max: { x: 1, y: 2, z: 1 } }
      return {
        parts,
        nativeClips,
        allClips,
        bones,
        bounds: {
          min: [b.min.x, b.min.y, b.min.z] as Vec3,
          max: [b.max.x, b.max.y, b.max.z] as Vec3,
        },
      }
    },
    animationBones: (id: string): string[] => {
      const nt = (players.get(id)?.model as any)?.nodeTree
      return Array.isArray(nt?.nodes) ? nt.nodes.map((n: any, i: number) => String(n?.name || `Bone_${i}`)) : []
    },
    playAnimation,
    crossfadeAnimation: (id: string, clip: string, duration = 0.25, loop = true, speed = 1) =>
      playAnimation(id, clip, loop, speed, duration),
    stopAnimation: (id: string) => players.get(id)?.stop(),
    pauseAnimation: (id: string) => {
      const m = players.get(id)
      if (m) m.animationPlaying = false
    },
    resumeAnimation: (id: string) => {
      const m = players.get(id)
      if (m && m.animation) m.animationPlaying = true
    },
    setAnimationTime: (id: string, time: number) => {
      const m = players.get(id) as any
      if (m && typeof m.setAnimationTime === 'function') m.setAnimationTime(Math.max(0, time))
    },
    getAnimationState: (id: string) => {
      const m = players.get(id) as any
      if (!m) return undefined
      return {
        clip: m.animation?.name ?? '',
        time: Number(m.animationTime ?? 0),
        duration: Number(m.animation?.duration ?? 0),
        playing: Boolean(m.animationPlaying),
        speed: Number(m.animationSpeed ?? 1),
        loop: Boolean(m.animationLoop),
      }
    },
    getBoneWorldPosition: (id: string, boneName: string): Vec3 | undefined => {
      const m = players.get(id) as any
      const node = objects.get(id)
      if (!m || !node) return undefined
      const nt = m.model?.nodeTree
      if (!nt?.nodes) return undefined
      const idx = nt.nodes.findIndex((bn: any) => bn?.name === boneName)
      if (idx < 0) return undefined
      const mat = m.poseWorldOf?.[idx] ?? nt.restPose?.[idx]
      if (!mat) return undefined
      const mm = m.model?.modelMatrix
      const combined = mm ? mm.copy().multiply(mat) : mat
      const t = typeof combined.getTranslation === 'function' ? combined.getTranslation() : { x: 0, y: 0, z: 0 }
      const local = new Vector3(t.x, t.y, t.z)
      node.localToWorld(local)
      return [local.x, local.y, local.z]
    },
    updateAnimations(dt: number) {
      d.tick(dt)
      for (const [id, obj] of players) {
        const node = objects.get(id)
        if (!node?.active || !obj.animationPlaying) continue
        if (animationThrottle) {
          const wp = node.getWorldPosition(_tmpV1)
          const dSq = (wp.x - camera.position.x) ** 2 + (wp.y - camera.position.y) ** 2 + (wp.z - camera.position.z) ** 2
          if (dSq > 1600 && renderFrameCount % 4 !== 0) continue
          if (dSq > 400 && renderFrameCount % 2 !== 0) continue
        }
        obj.update()
        if (!obj.animationPlaying && obj.animation) options.onAnimationFinished?.(id, obj.animation.name)
      }
    },
    setEntityLiveCanvasTexture(id: string, canvas: HTMLCanvasElement): boolean {
      const player = players.get(id) as any
      if (!player) return false
      const parts: L.EngineObject3D[] = player.parts || []
      if (!parts.length) return false
      let tex = liveCanvasTextures.get(id)
      if (!tex || !tex.hasWebGL()) {
        if (tex) {
          try { tex.destroyWebGLTexture() } catch {}
        }
        tex = new d.TextureInfo(canvas, true, true, false)
        liveCanvasTextures.set(id, tex)
      } else {
        tex.updateData(canvas)
      }
      for (const po of parts) {
        if (!po.destroyed) d.setTexture(po, tex)
      }
      return true
    },
    dispose() {
      if (disposed) return
      disposed = true
      clear()
      post.dispose()
      d.dispose()
    },
  }
}
