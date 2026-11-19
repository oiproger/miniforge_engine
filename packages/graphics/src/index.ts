import { terrainGeometry } from './terrain'
import type { Terrain } from '../../project-schema/src/terrain'
import * as T from 'three'
import type { Project, Entity, Vec3, Component } from '../../project-schema/src'

export type ViewCamera = T.PerspectiveCamera | T.OrthographicCamera
export interface RenderWorld {
  renderer: T.WebGLRenderer
  scene: T.Scene
  camera: ViewCamera
  objects: Map<string, T.Object3D>
  load(project: Project, sceneId?: string): void
  addEntities(entities: Entity[]): void
  removeEntities(ids: string[]): void
  setEntityActive(id: string, active: boolean): void
  animationClips(id: string): string[]
  playAnimation(id: string, clip?: string, loop?: boolean, speed?: number): boolean
  stopAnimation(id: string): void
  updateAnimations(delta: number): void
  setCamera(camera: ViewCamera): void
  resize(): void
  render(): void
  dispose(): void
  ready(): Promise<void>
}

interface MaterialSettings {
  color?: string
  roughness?: number
  metalness?: number
  emissive?: string
  opacity?: number
  doubleSided?: boolean
  unlit?: boolean
  flatShading?: boolean
  map?: string
  normalMap?: string
  emissiveMap?: string
  alphaTest?: number
  tiling?: number[]
  offset?: number[]
  shader?: string
}

export function createWorld(
  container: HTMLElement,
  project: Project,
  sceneId?: string,
  options: { editor?: boolean; onAnimationFinished?: (id: string, clip: string) => void } = {},
): RenderWorld {
  const renderer = new T.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' })
  renderer.shadowMap.type = T.PCFShadowMap
  renderer.domElement.style.cssText = 'display:block;width:100%;height:100%;touch-action:none;outline:none'
  container.appendChild(renderer.domElement)
  const scene = new T.Scene()
  const content = new T.Group()
  scene.add(content)
  const objects = new Map<string, T.Object3D>()
  const geometry = new Map<string, T.BufferGeometry>()
  const materials = new Map<string, T.Material>()
  const textures = new Set<T.Texture>()
  const shadows = new Set<T.LightShadow>()
  const animatedMaterials = new Set<T.ShaderMaterial>()
  const batches = new Set<T.InstancedMesh>()
  const batchSources = new Map<T.InstancedMesh, { parent: T.Object3D; mesh: T.Mesh }[]>()
  const players = new Map<
    string,
    { mixer: T.AnimationMixer; clips: T.AnimationClip[]; root: T.Object3D; settings?: Component }
  >()
  let addEntities: (entities: Entity[]) => void = () => {}
  function releasePlayer(id: string) {
    const player = players.get(id)
    if (!player) return
    player.mixer.stopAllAction()
    player.mixer.uncacheRoot(player.root)
    players.delete(id)
  }
  function playAnimation(id: string, requestedClip?: string, loop?: boolean, speed?: number) {
    const player = players.get(id)
    if (!player) return false
    const name = requestedClip || player.settings?.clip || ''
    const repeats = loop ?? player.settings?.loop ?? true
    const rate = speed ?? player.settings?.speed ?? 1
    const clip = name ? player.clips.find((clip) => clip.name === name) : player.clips[0]
    if (!clip) return false
    player.mixer.stopAllAction()
    const action = player.mixer.clipAction(clip).reset()
    action.setLoop(repeats ? T.LoopRepeat : T.LoopOnce, repeats ? Infinity : 1)
    action.clampWhenFinished = !repeats
    action.timeScale = Number.isFinite(rate) ? rate : 1
    if (action.timeScale < 0) action.time = clip.duration
    action.play()
    return true
  }
  function restoreBatches(nodes: Set<T.Object3D>) {
    for (const [batch, sources] of batchSources) {
      if (!sources.some((source) => nodes.has(source.parent))) continue
      for (const source of sources) source.parent.add(source.mesh)
      batch.removeFromParent()
      batch.dispose()
      batches.delete(batch)
      batchSources.delete(batch)
    }
  }
  function removeEntities(ids: string[]) {
    const removal = new Set<T.Object3D>()
    for (const id of ids) objects.get(id)?.traverse((node) => removal.add(node))
    restoreBatches(removal)
    for (const node of removal) {
      if(node instanceof T.Mesh && node.userData.terrain && geometry.delete(node.geometry.uuid))node.geometry.dispose()
      if (node.userData.importedRoot) disposeTree(node)
      if (node instanceof T.DirectionalLight && shadows.delete(node.shadow)) node.shadow.dispose()
      if (node.userData.entityId && objects.get(node.userData.entityId) === node) {
        releasePlayer(node.userData.entityId)
        objects.delete(node.userData.entityId)
        node.removeFromParent()
      }
    }
  }
  const started = performance.now()
  let camera: ViewCamera = new T.PerspectiveCamera(42, 1, 0.05, 1000)
  let generation = 0
  let pending: Promise<void>[] = []
  let orthoHeight = 12
  let disposed = false
  let cachedWidth = 0,
    cachedHeight = 0
  function resize() {
    const w = Math.max(1, container.clientWidth),
      h = Math.max(1, container.clientHeight)
    if (w !== cachedWidth || h !== cachedHeight) {
      renderer.setSize(w, h, false)
      cachedWidth = w
      cachedHeight = h
    }
    if (camera instanceof T.PerspectiveCamera) camera.aspect = w / h
    else {
      const halfHeight = (camera.userData.viewHeight ?? orthoHeight) / 2
      const aspect = w / h
      const portraitScale = Math.min(1, aspect)
      camera.left = (-halfHeight * aspect) / portraitScale
      camera.right = -camera.left
      camera.top = halfHeight / portraitScale
      camera.bottom = -camera.top
    }
    camera.updateProjectionMatrix()
  }
  function disposeTree(root: T.Object3D) {
    root.traverse((o) => {
      if (!(o instanceof T.Mesh)) return
      o.geometry.dispose()
      for (const mat of Array.isArray(o.material) ? o.material : [o.material]) {
        for (const v of Object.values(mat)) if (v instanceof T.Texture) v.dispose()
        mat.dispose()
      }
    })
  }
  function clear() {
    generation++
    for (const child of content.children)
      child.traverse((n) => {
        if (n.userData.importedRoot) disposeTree(n)
      })
    batches.forEach((batch) => batch.dispose())
    batches.clear()
    batchSources.clear()
    for (const id of players.keys()) releasePlayer(id)
    content.clear()
    objects.clear()
    geometry.forEach((g) => g.dispose())
    geometry.clear()
    materials.forEach((m) => m.dispose())
    materials.clear()
    textures.forEach((t) => t.dispose())
    textures.clear()
    shadows.forEach((s) => s.dispose())
    shadows.clear()
    pending = []
    animatedMaterials.clear()
  }

  function load(next: Project, id?: string) {
    clear()
    const version = generation
    const current =
      next.scenes.find((s) => s.id === id) ??
      next.scenes.find((s) => s.id === next.activeScene) ??
      next.scenes[0]
    if (!current) return
    const env = current.environment as Record<string, unknown>
    scene.background = new T.Color(String(env.background ?? '#202731'))
    scene.fog =
      Number(env.fogDensity) > 0
        ? new T.FogExp2(String(env.fogColor ?? env.background ?? '#202731'), Number(env.fogDensity))
        : null
    renderer.shadowMap.enabled = env.shadows !== false
    renderer.toneMapping = env.toneMapping === 'none' ? T.NoToneMapping : T.ACESFilmicToneMapping
    renderer.toneMappingExposure = Number(env.exposure ?? 1.1)
    renderer.setPixelRatio(
      Math.max(
        0.25,
        Math.min(window.devicePixelRatio || 1, Number(env.pixelRatioLimit ?? 1.6)) *
          Number(env.resolutionScale ?? 1),
      ),
    )
    const assets = new Map(next.assets.map((a) => [a.id, a]))
    function texture(id: string | undefined, srgb: boolean, p: MaterialSettings) {
      const a = id && assets.get(id)
      if (!a || !a.data) return null
      const tex = new T.TextureLoader().load(a.data)
      if (srgb) tex.colorSpace = T.SRGBColorSpace
      tex.wrapS = tex.wrapT = T.RepeatWrapping
      tex.repeat.set(p.tiling?.[0] ?? 1, p.tiling?.[1] ?? 1)
      tex.offset.set(p.offset?.[0] ?? 0, p.offset?.[1] ?? 0)
      textures.add(tex)
      return tex
    }
    function material(id: string | undefined) {
      const key = id || '__default'
      if (materials.has(key)) return materials.get(key)!
      const p: MaterialSettings = (id && assets.get(id)?.properties) || {}
      const base = {
        color: p.color ?? '#a7adad',
        map: texture(p.map, true, p),
        side: p.doubleSided ? T.DoubleSide : T.FrontSide,
        opacity: p.opacity ?? 1,
        transparent: (p.opacity ?? 1) < 1,
        alphaTest: p.alphaTest ?? 0,
      }
      const shader = p.shader && assets.get(p.shader)
      if (shader && shader.type === 'shader' && shader.data && shader.properties.vertex) {
        const mat = new T.ShaderMaterial({
          vertexShader: shader.properties.vertex,
          fragmentShader: shader.data,
          uniforms: { uTime: { value: 0 }, uColor: { value: new T.Color(base.color) } },
          transparent: base.transparent,
          side: base.side,
        })
        animatedMaterials.add(mat)
        materials.set(key, mat)
        return mat
      }
      const mat = p.unlit
        ? new T.MeshBasicMaterial(base)
        : new T.MeshStandardMaterial({
            ...base,
            roughness: p.roughness ?? 0.87,
            metalness: p.metalness ?? 0,
            flatShading: p.flatShading ?? true,
            normalMap: texture(p.normalMap, false, p),
            emissive: p.emissive ?? '#000000',
            emissiveMap: texture(p.emissiveMap, true, p),
          })
      materials.set(key, mat)
      return mat
    }
    let lights = 0
    let chosenCamera:
      | { entity: Entity; target?: Vec3; projection: string; fov?: number; size?: number }
      | undefined
    addEntities = (entities) => {
      const unique = new Set(entities.map((e) => e.id))
      if (unique.size !== entities.length || entities.some((e) => objects.has(e.id)))
        throw Error('Duplicate scene entity ID')
      for (const entity of entities) {
        const group = new T.Group()
        group.userData.entityId = entity.id
        group.name = entity.name
        group.visible = entity.active
        group.position.fromArray(entity.transform.position)
        group.rotation.set(...entity.transform.rotation)
        group.scale.fromArray(entity.transform.scale)
        objects.set(entity.id, group)
        for (const c of entity.components) {
          if (c.enabled === false) continue
          if (c.type === 'terrain') {
            const ground = terrainGeometry(c as Terrain)
            geometry.set(ground.uuid, ground)
            const surface = (id: string, painted: boolean) => {
              if (id) return material(id)
              const key = painted ? '__terrainSoil' : '__terrainGrass'
              if (!materials.has(key)) materials.set(key, new T.MeshStandardMaterial({color: painted ? '#a78357' : '#718753'}))
              return materials.get(key)!
            }
            const mesh = new T.Mesh(ground, [surface(c.baseMaterial,false),surface(c.paintMaterial,true)])
            mesh.userData.terrain = true
            mesh.receiveShadow = mesh.castShadow = true
            group.add(mesh)
          } else if (c.type === 'mesh') {
            if (c.shape === 'model') {
              const asset = c.asset && assets.get(c.asset)
              if (asset?.data)
                pending.push(
                  import('three/addons/loaders/GLTFLoader.js')
                    .then(async ({ GLTFLoader }) => {
                      const result = await new GLTFLoader().loadAsync(asset.data)
                      if (generation !== version || disposed || objects.get(entity.id) !== group) {
                        disposeTree(result.scene)
                        return
                      }
                      result.scene.userData.importedRoot = true
                      result.scene.traverse((obj) => {
                        if (obj instanceof T.Mesh) obj.castShadow = obj.receiveShadow = true
                      })
                      group.add(result.scene)
                      const player = entity.components.find(
                        (comp) => comp.type === 'animation' && comp.enabled !== false,
                      )
                      if (result.animations.length && !players.has(entity.id)) {
                        const mixer = new T.AnimationMixer(result.scene)
                        mixer.addEventListener('finished', ({ action }) => {
                          const clip = action.getClip().name
                          // A completion rule can destroy the scene. Finish the mixer update first.
                          queueMicrotask(() => {
                            if (players.get(entity.id)?.mixer === mixer)
                              options.onAnimationFinished?.(entity.id, clip)
                          })
                        })
                        players.set(entity.id, {
                          root: result.scene,
                          clips: result.animations,
                          mixer,
                          settings: player,
                        })
                        if (player && player.autoplay !== false)
                          playAnimation(entity.id, player.clip, player.loop !== false, player.speed)
                      }
                    })
                    .catch((err) => {
                      console.warn('Model load failed', asset.name, err)
                    }),
                )
              continue
            }
            const n = Math.max(3, Math.min(96, Number(c.segments) || 12))
            const key = [c.shape, n, c.radiusTop, c.radiusBottom].join('|')
            let geo = geometry.get(key)
            if (!geo) {
              switch (c.shape) {
                case 'plane':
                  geo = new T.PlaneGeometry(1, 1).rotateX(-Math.PI / 2)
                  break
                case 'sphere':
                  geo = new T.SphereGeometry(0.5, n, Math.max(4, Math.floor(n / 2)))
                  break
                case 'capsule':
                  geo = new T.CapsuleGeometry(0.25, 0.5, 4, n)
                  break
                case 'icosahedron':
                  geo = new T.IcosahedronGeometry(0.5, 0)
                  break
                case 'cone':
                  geo = new T.ConeGeometry(c.radiusBottom ?? 0.5, 1, n)
                  break
                case 'cylinder':
                  geo = new T.CylinderGeometry(c.radiusTop ?? 0.5, c.radiusBottom ?? 0.5, 1, n)
                  break
                default:
                  geo = new T.BoxGeometry(1, 1, 1)
              }
              geometry.set(key, geo)
            }
            const mesh = new T.Mesh(geo, material(c.material))
            mesh.castShadow = mesh.receiveShadow = true
            group.add(mesh)
          } else if (c.type === 'sprite') {
            const key = JSON.stringify(['sprite', c.texture, c.color, c.opacity])
            let mat = materials.get(key) as T.SpriteMaterial | undefined
            if (!mat) {
              mat = new T.SpriteMaterial({
                map: texture(c.texture, true, {}),
                color: c.color ?? '#ffffff',
                opacity: c.opacity ?? 1,
                transparent: true,
                depthWrite: false,
              })
              materials.set(key, mat)
            }
            const sprite = new T.Sprite(mat)
            sprite.scale.set(c.width ?? 1, c.height ?? 1, 1)
            group.add(sprite)
          } else if (c.type === 'light') {
            let light: T.Light
            if (c.kind === 'ambient')
              light = new T.HemisphereLight(
                c.color,
                '#857962',
                c.intensity * (Number(env.ambient ?? 1.5) / 1.5),
              )
            else if (c.kind === 'point') light = new T.PointLight(c.color, c.intensity)
            else if (c.kind === 'spot') light = new T.SpotLight(c.color, c.intensity)
            else {
              const sun = new T.DirectionalLight(c.color, c.intensity)
              sun.castShadow = true
              const size = env.shadowQuality === 'low' ? 512 : env.shadowQuality === 'high' ? 2048 : 1024
              sun.shadow.mapSize.set(size, size)
              Object.assign(sun.shadow.camera, {
                left: -11,
                right: 11,
                top: 11,
                bottom: -11,
                near: 0.1,
                far: 85,
              })
              sun.shadow.normalBias = 0.018
              sun.shadow.bias = -0.0002
              shadows.add(sun.shadow)
              light = sun
            }
            group.add(light)
            lights++
          } else if (c.type === 'camera' && !chosenCamera && entity.active) {
            chosenCamera = { entity, projection: c.projection, target: c.target, fov: c.fov, size: c.size }
          }
        }
      }
      for (const entity of entities) {
        ;((entity.parent && objects.get(entity.parent)) || content).add(objects.get(entity.id)!)
      }
    }
    addEntities(current.entities)
    // Keep interactive subtrees as normal objects. Scripts can access arbitrary scene nodes.
    if (
      !options.editor &&
      !current.entities.some((e) => e.components.some((c) => c.type === 'script' || c.kind === 'spawn'))
    ) {
      const movable = new Set(
        current.entities
          .filter((e) => e.components.some((c) => c.type === 'behavior' || c.type === 'body' || (c.type === 'collider' && c.shape === 'mesh')))
          .map((e) => e.id),
      )
      const groups = new Map<string, T.Mesh<T.BufferGeometry, T.Material>[]>()
      content.updateMatrixWorld(true)
      for (const obj of objects.values()) {
        let node: T.Object3D | null = obj
        while (node && node.visible && !movable.has(node.userData.entityId)) node = node.parent
        if (node) continue
        for (const mesh of obj.children) {
          if (
            !(mesh instanceof T.Mesh) ||
            Array.isArray(mesh.material) ||
            mesh.material.transparent ||
            mesh.material instanceof T.ShaderMaterial
          )
            continue
          const key = mesh.geometry.uuid + mesh.material.uuid
          if (!groups.has(key)) groups.set(key, [])
          groups.get(key)!.push(mesh)
        }
      }
      for (const meshes of groups.values()) {
        if (meshes.length < 3) continue
        const first = meshes[0],
          batch = new T.InstancedMesh(first.geometry, first.material, meshes.length)
        batch.castShadow = batch.receiveShadow = true
        batchSources.set(
          batch,
          meshes.map((mesh) => ({ parent: mesh.parent!, mesh })),
        )
        batch.userData.entityIds = meshes.map((mesh, i) => {
          const id = mesh.parent!.userData.entityId
          batch.setMatrixAt(i, mesh.matrixWorld)
          mesh.removeFromParent()
          return id
        })
        batch.computeBoundingSphere()
        content.add(batch)
        batches.add(batch)
      }
    }
    if (!lights) {
      content.add(new T.HemisphereLight('#fff4db', '#72818c', 1.7))
      const key = new T.DirectionalLight('#fff0d3', 2.3)
      key.position.set(-5, 10, 6)
      content.add(key)
    }
    if (!options.editor) {
      const c = chosenCamera as
        | { entity: Entity; target?: Vec3; projection: string; fov?: number; size?: number }
        | undefined
      orthoHeight = c?.size ?? 12
      camera =
        c?.projection === 'perspective'
          ? new T.PerspectiveCamera(c.fov ?? 45, 1, 0.05, 2000)
          : new T.OrthographicCamera(-8, 8, 6, -6, 0.05, 2000)
      if (c) {
        const source = objects.get(c.entity.id)!
        source.getWorldPosition(camera.position)
        if (c.target) camera.lookAt(...c.target)
        else source.getWorldQuaternion(camera.quaternion)
      } else {
        camera.position.set(12, 11, 15)
        camera.lookAt(0, 0.25, 0)
      }
    }
    resize()
    scene.updateMatrixWorld(true)
  }
  load(project, sceneId)
  const observer = new ResizeObserver(resize)
  observer.observe(container)
  return {
    scene,
    renderer,
    objects,
    get camera() {
      return camera
    },
    load,
    addEntities(entities) {
      addEntities(entities)
      scene.updateMatrixWorld(true)
    },
    removeEntities,
    setEntityActive(id, active) {
      const group = objects.get(id)
      if (!group || group.visible === active) return
      const nodes = new Set<T.Object3D>()
      group.traverse((node) => nodes.add(node))
      restoreBatches(nodes)
      group.visible = active
    },
    animationClips(id) {
      return players.get(id)?.clips.map((clip) => clip.name) ?? []
    },
    playAnimation,
    stopAnimation(id) {
      players.get(id)?.mixer.stopAllAction()
    },
    updateAnimations(delta) {
      if (!Number.isFinite(delta) || delta <= 0) return
      for (const [id, player] of players) {
        let node: T.Object3D | null = objects.get(id) ?? null
        while (node?.visible) node = node.parent
        if (!node) player.mixer.update(delta)
      }
    },
    resize,
    setCamera(value) {
      camera = value
      resize()
    },
    render() {
      for (const material of animatedMaterials)
        material.uniforms.uTime.value = (performance.now() - started) / 1000
      renderer.render(scene, camera)
    },
    ready() {
      return Promise.all(pending).then(() => undefined)
    },
    dispose() {
      disposed = true
      observer.disconnect()
      clear()
      renderer.dispose()
      renderer.forceContextLoss()
      renderer.domElement.remove()
    },
  }
}
