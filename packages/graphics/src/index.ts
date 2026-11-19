import type * as L from 'littlejsengine'
import { createDevice } from './device.generated'
import { SceneNode, SceneCamera, Vector3, type Triangles } from './scene'
import { terrainGeometry } from './terrain'
import type { Project, Entity, Component, Terrain } from '../../project-schema/src'

export type RenderWorld = ReturnType<typeof createWorld>
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
  const objects = new Map<string, SceneNode>(),
    roots = new Map<string, L.EngineObject3D>()
  const owners = new Map<L.EngineObject, SceneNode>(),
    meshes = new Map<string, L.Mesh>()
  const sceneLights = new Map<string, Component>()
  let grid: L.EngineObject3D | undefined,
    editorTime = performance.now()
  const players = new Map<string, L.GLTFObject>(),
    models = new Map<string, Promise<L.GLTFModel>>()
  const textures = new Map<string, Promise<L.TextureInfo>>(),
    shaders = new Map<string, L.Shader>()
  const camera = new SceneCamera(),
    info = { render: { calls: 0, triangles: 0 }, memory: { textures: 0 } }
  const renderer = { domElement: canvas, info }
  let exposure = 1,
    ambient = 1
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
    if (p.tiling || p.offset)
      for (const uv of new Set(mesh.uvs)) {
        uv.set(
          uv.x * (p.tiling?.[0] ?? 1) + (p.offset?.[0] ?? 0),
          uv.y * (p.tiling?.[1] ?? 1) + (p.offset?.[1] ?? 0),
        )
      }
  }
  function material(obj: L.EngineObject3D, id: string, fallback = '#a7adad') {
    const p = project.assets.find((a) => a.id === id)?.properties ?? {}
    obj.color = color(p.color ?? fallback, p.opacity ?? 1)
    obj.transparent = obj.color.a < 1
    obj.specular = 1 - (p.roughness ?? 0.86)
    obj.reflectivity = p.metalness ?? 0
    obj.emissive = p.unlit ? 1 : 0
    obj.emissiveMapColor = color(p.emissive ?? '#ffffff')
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
    }
  }
  function playAnimation(id: string, clip?: string, loop = true, speed = 1) {
    const model = players.get(id),
      a = model?.model.getAnimation(clip || 0)
    if (!model || !a) return false
    model.play(a.name, loop, speed)
    return true
  }
  function addEntities(entities: Entity[]) {
    for (const e of entities) {
      if (objects.has(e.id)) throw Error('Duplicate scene entity ' + e.id)
      const n = new SceneNode(e.id),
        root = new d.EngineObject3D()
      objects.set(e.id, n)
      roots.set(e.id, root)
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
            material(obj, i ? c.paintMaterial : c.baseMaterial, i ? '#a78357' : '#718753')
          })
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
          material(obj, c.material)
          if (e.components.some((c) => c.type === 'collider' && c.shape === 'mesh'))
            n.surfaces.push(surface(mesh))
        } else if (c.type === 'sprite') {
          const obj = new d.EngineObject3D()
          root.addChild(obj)
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
      for (const i of [0, 1]) {
        const key = n.id + '/terrain/' + i
        meshes.get(key)?.dispose()
        meshes.delete(key)
      }
      sceneLights.delete(n.id)
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
    d.background(env.background)
    r.shadows = env.shadows !== false
    r.ambientColor = color('#c8cfda').scale(ambient * 0.5 * exposure)
    r.shadowMapSize = env.shadowQuality === 'high' ? 2048 : env.shadowQuality === 'low' ? 512 : 1024
    r.setFog(0, env.fogDensity > 0 ? 1.8 / env.fogDensity : 0, color(env.fogColor || env.background))
    r.sunDirection = d.vec3(-4, 8, 6)
    r.sunColor = color('#fff3d9')
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
    r.ambientColor = color('#c8cfda').scale(ambient * 0.36 * exposure)
    r.sunColor = color('#fff3d9').scale(0.6 * exposure)
    r.sunDirection = d.vec3(-4, 8, 6)
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
      const hit = d.pick(d.vec2(x, y), (o) => o === grid || hidden(o))
      return hit && owner(hit.object)?.id
    },
    projectPoint(p: Vector3) {
      return r.worldToScreen(v(p), d.vec2(container.clientWidth, container.clientHeight))
    },
    raycast(origin: Vector3, dir: Vector3, max: number) {
      sync()
      const hit = d.pick(new d.Ray3D(v(origin), v(dir).normalize()), (o) => o === grid || hidden(o))
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
      d.dispose()
    },
  }
}
