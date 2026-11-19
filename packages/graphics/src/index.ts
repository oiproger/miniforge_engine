import type * as L from 'littlejsengine'
import { createDevice } from './device.generated'
import { SceneNode, SceneCamera, Vector3, type Triangles } from './scene'
import { terrainGeometry } from './terrain'
import { PostProcessor, defaultPostProcess, type PostProcessOptions } from './postprocess'
import type { Project, Entity, Component, Terrain, Vec3 } from '../../project-schema/src'

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
  let grid: L.EngineObject3D | undefined,
    skyDome: L.EngineObject3D | undefined,
    skyCube: L.EngineObject3D[] = [],
    flashlight: L.Light3D | undefined,
    flashlightEnabled = false,
    editorTime = performance.now()
  const players = new Map<string, L.GLTFObject>(),
    models = new Map<string, Promise<L.GLTFModel>>()
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
  const hidden = (o: L.EngineObject) => owner(o)?.active === false
  function primitive(c: Component) {
    const key = JSON.stringify([c.shape, c.segments, c.radiusBottom, c.radiusTop, c.material])
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
    obj.specular = 1 - (p.roughness ?? 0.86)
    obj.reflectivity = p.metalness ?? 0
    obj.emissive = p.unlit ? 1 : Number(p.emissiveIntensity ?? 0)
    obj.emissiveMapColor = color(p.emissive ?? '#ffffff')
    if (p.castShadow === false) obj.castShadow = false
    if (p.receiveShadow === false) obj.receiveShadow = false
    if (p.softShadow > 0) (obj as any).softShadow = Number(p.softShadow)
    if (p.roundLighting) (obj as any).roundLighting = true
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
  function playAnimation(id: string, clip?: string, loop = true, speed = 1) {
    const model = players.get(id),
      a = model?.model.getAnimation(clip || 0)
    if (!model || !a) return false
    model.play(a.name, loop, speed)
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
      for (const c of e.components.filter((c) => c.enabled !== false)) {
        if (c.type === 'terrain') {
          const g = terrainGeometry(c as Terrain)
          n.surfaces.push(g)
          const points = nativePoints(g.positions),
            uv = Array.from({ length: points.length }, (_, i) => d.vec2(g.uv[i * 2], g.uv[i * 2 + 1]))
          g.layers.forEach((indices, i) => {
            if (!indices.length) return
            const mesh = new d.Mesh().addTriangles(points, indices, undefined, uv).computeNormals(true)
            applySurface(mesh, i ? c.paintMaterial : c.baseMaterial)
            meshes.set(e.id + '/terrain/' + i, mesh)
            const obj = new d.EngineObject3D(d.vec3(), mesh)
            root.addChild(obj)
            list.push(obj)
            material(obj, i ? c.paintMaterial : c.baseMaterial, i ? '#a78357' : '#718753')
          })
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
              const obj = model.createObject()
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
        } else if (c.type === 'light') {
          const tint = color(c.color ?? '#ffffff')
          if (c.kind === 'ambient' || c.kind === 'directional') sceneLights.set(n.id, c)
          else {
            const light = new d.Light3D(d.vec3(), c.range ?? 12, tint, c.intensity ?? 1)
            root.addChild(light)
            if (c.kind === 'spot') light.coneAngle = c.angle ?? 0.6
            entityLights.set(e.id, light)
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
    textures.clear()
    shaders.forEach((shader) => shader.dispose())
    shaders.clear()
    pending = []
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
    for (const [id, obj] of roots) {
      const n = objects.get(id)!
      obj.pos3D.set(n.position.x, n.position.y, n.position.z)
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
    }
    sync()
    info.render.calls = d.render(
      Math.max(1, container.clientWidth),
      Math.max(1, container.clientHeight),
      ratio,
      hidden,
    )
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
    ready: () => Promise.all(pending).then(() => {}),
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
      if (light) light.intensity = Math.max(0, intensity)
    },
    setLightColor(id: string, hex: string) {
      const light = entityLights.get(id)
      if (light) light.color = color(hex)
    },
    setLightRange(id: string, range: number) {
      const light = entityLights.get(id)
      if (light) light.radius = Math.max(0.1, range)
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
    playAnimation,
    stopAnimation: (id: string) => players.get(id)?.stop(),
    updateAnimations(dt: number) {
      d.tick(dt)
      for (const [id, obj] of players)
        if (objects.get(id)?.active && obj.animationPlaying) {
          obj.update()
          if (!obj.animationPlaying && obj.animation) options.onAnimationFinished?.(id, obj.animation.name)
        }
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
