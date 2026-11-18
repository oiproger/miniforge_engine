import { PerspectiveCamera, Object3D, Raycaster, Vector2, Vector3 } from 'three'
import { createWorld } from '../../graphics/src'
import type { Component, Entity, Project, Vec3 } from '../../project-schema/src'
import { behavior } from '../../behaviors/src'
import { Input } from './input'
import { Events, Lifecycle, type ScriptLifecycle } from './lifecycle'
import { Overlay, translate, type Phase } from './overlay'
import type { GameAPI, GameOptions, GameSession, PhysicsSession } from './types'
export type { GameAPI, GameOptions, GameSession, ScriptFactory } from './types'
export type { ScriptLifecycle } from './lifecycle'

const visible = (obj: Object3D | null): boolean => !obj || (obj.visible && visible(obj.parent))
interface Actor {
  entity: Entity
  object: Object3D
  params: Record<string, any>
}

export async function startGame(
  container: HTMLElement,
  project: Project,
  options: GameOptions,
): Promise<GameSession> {
  const started = performance.now(),
    platform = options.platform
  const sdkStart = performance.now()
  await platform.initialize()
  const initializationMs = performance.now() - sdkStart
  const world = createWorld(container, project, project.activeScene)
  const events = new Events(),
    lifecycle = new Lifecycle((err) => {
      console.error('Game script', err)
      options.onEvent?.('script.error', String(err))
    })
  const signal = new AbortController(),
    vars: Record<string, any> = {},
    ray = new Raycaster()
  const point = new Vector3(),
    playerPoint = new Vector3()
  const mode = project.settings.mode === 'collectathon'
  const runner = project.settings.mode === 'runner',
    clicker = project.settings.mode === 'clicker'
  let firstPerson = false,
    yaw = 0,
    pitch = 0,
    jumpTime = 0,
    jumpHeld = false,
    groundY = 0
  let disposed = false,
    busy = false,
    ad = false,
    adPending = false,
    elapsed = 0,
    frame = 0,
    last = 0,
    accumulator = 0
  let phase: Phase = 'menu',
    sceneId = project.activeScene,
    revision = 0,
    physics: PhysicsSession | undefined
  let sounds: AudioContext | undefined
  const clips = new Set<HTMLAudioElement>()
  let player: Actor | undefined,
    coins: Actor[] = [],
    hazards: Actor[] = [],
    solids: Actor[] = []
  const contacts = new Set<string>()
  let scene = project.scenes.find((s) => s.id === sceneId)!
  const stats = {
    fps: 0,
    frameTime: 0,
    drawCalls: 0,
    triangles: 0,
    textures: 0,
    width: 0,
    height: 0,
    sdkMs: 0,
    readyMs: 0,
  }
  let language = project.settings.language,
    best = 0
  const input = new Input(signal.signal, () =>
    phase === 'playing' ? pause() : phase === 'paused' && resume(),
  )
  for (const [action, keys] of Object.entries(project.settings.bindings || {}))
    if (Array.isArray(keys)) input.bind(action, keys)
  const t = (key: string, p?: Record<string, unknown>) => translate(project, language, key, p)
  const overlay = new Overlay(
    project,
    {
      play: resume,
      pause,
      retry: () => {
        void restart()
      },
      reward: () => {
        void reward()
      },
      language: () => {
        const langs = Object.keys(project.locales)
        language = langs[(langs.indexOf(language) + 1) % Math.max(1, langs.length)] || 'en'
        void platform.saveData('language', language)
        updateUI()
      },
      emit: (name) => events.emit(name),
    },
    input,
    t,
  )
  if (getComputedStyle(container).position === 'static') container.style.position = 'relative'
  container.append(overlay.host)

  function updateUI() {
    overlay.render(phase, vars.score, vars.time, best, language, mode)
  }
  function emit(name: string, payload?: unknown) {
    events.emit(name, payload)
    options.onEvent?.(name, payload)
  }
  function quiet() {
    input.clear()
    for (const a of clips) a.pause()
    void sounds?.suspend().catch(() => {})
  }
  function pause() {
    if (phase !== 'playing' || disposed) return
    if (document.pointerLockElement === world.renderer.domElement) document.exitPointerLock()
    phase = 'paused'
    quiet()
    platform.gameplayStop()
    updateUI()
  }
  function resume() {
    if ((phase !== 'paused' && phase !== 'menu') || disposed || ad || busy) return
    phase = 'playing'
    last = performance.now()
    platform.gameplayStart()
    if (!sounds) {
      try {
        sounds = new AudioContext()
      } catch {
        /* audio is optional */
      }
    }
    void sounds?.resume().catch(() => {})
    for (const clip of clips) void clip.play().catch(() => {})
    updateUI()
    emit('game.play')
  }
  function finish(event = 'level.completed') {
    if (phase !== 'playing') return
    phase = 'results'
    quiet()
    platform.gameplayStop()
    best = Math.max(best, Number(vars.score) || 0)
    void platform.saveData('best', best)
    updateUI()
    emit(event, { score: vars.score, best })
  }
  async function reward() {
    if (adPending || phase !== 'results' || disposed) return
    adPending = true
    try {
      if ((await platform.showRewarded()) && !disposed && phase === 'results') {
        vars.time = 15
        phase = 'paused'
        document.hidden ? updateUI() : resume()
      }
    } finally {
      adPending = false
    }
  }
  async function restart() {
    if (busy || disposed) return
    await load(project.activeScene, true)
    if (!disposed) resume()
  }
  function playSound(assetId?: string) {
    if (ad || phase !== 'playing' || project.settings.sound === false) return
    const asset = assetId && project.assets.find((a) => a.id === assetId && a.type === 'audio')
    if (asset) {
      const clip = new Audio(asset.data)
      clips.add(clip)
      clip.onended = () => clips.delete(clip)
      void clip.play().catch(() => clips.delete(clip))
      return
    }
    if (!sounds || sounds.state !== 'running') return
    const osc = sounds.createOscillator(),
      gain = sounds.createGain(),
      at = sounds.currentTime
    osc.frequency.setValueAtTime(740, at)
    osc.frequency.exponentialRampToValueAtTime(1120, at + 0.08)
    gain.gain.setValueAtTime(0.045, at)
    gain.gain.exponentialRampToValueAtTime(0.001, at + 0.13)
    osc.connect(gain)
    gain.connect(sounds.destination)
    osc.start(at)
    osc.stop(at + 0.15)
    osc.onended = () => {
      osc.disconnect()
      gain.disconnect()
    }
  }
  function register(entity: Entity, object: Object3D, c: Component) {
    const api: GameAPI = {
      entity,
      object,
      transform: object,
      params: c.params || {},
      input,
      events,
      vars,
      platform,
      project,
      get time() {
        return elapsed
      },
      find: (id) => world.objects.get(id),
      component: (type) => entity.components.find((v) => v.type === type && v.enabled !== false),
      t,
      audio: { play: playSound },
      ui: { get: (id) => overlay.get(id) },
      scene: {
        load: (id) => {
          void load(id, false).catch((err) => emit('scene.error', String(err)))
        },
      },
      physics: {
        raycast: (origin, direction, length) => {
          if (physics) return physics.raycast(origin, direction, length)
          ray.set(origin, direction)
          ray.far = length
          return hitEntity()
        },
      },
      save: { get: (key) => platform.loadData(key), set: (key, value) => platform.saveData(key, value) },
    }
    if (c.type === 'script') {
      const module = options.scripts?.[c.asset]
      if (module)
        lifecycle.add(entity.id, () => {
          const factory = module.default ?? (typeof module === 'function' ? module : null)
          if (factory) return factory(api) ?? {}
          return Object.fromEntries(
            Object.entries(module)
              .filter(([k, f]) => k.startsWith('on') && typeof f === 'function')
              .map(([k, f]) => [k, (f as Function).bind(api)]),
          ) as ScriptLifecycle
        })
    }
    if (c.type === 'behavior') {
      const actor = { entity, object, params: api.params }
      if (c.kind === 'player' || c.kind === 'first-person') {
        player = actor
        firstPerson = c.kind === 'first-person'
      } else if (c.kind === 'collectible') coins.push(actor)
      else if (c.kind === 'damage') hazards.push(actor)
      else lifecycle.add(entity.id, () => behavior(c.kind, api))
    }
    if (
      c.type === 'collider' &&
      !c.trigger &&
      !entity.properties.floor &&
      !entity.components.some((b) => b.type === 'behavior' && ['player', 'first-person'].includes(b.kind))
    )
      solids.push({ entity, object, params: c })
  }
  async function load(id: string, reset: boolean) {
    const target = project.scenes.find((s) => s.id === id)
    if (!target) throw Error('Unknown game scene ' + id)
    const generation = ++revision
    busy = true
    try {
      lifecycle.clear()
      events.clear()
      contacts.clear()
      physics?.dispose()
      physics = undefined
      player = undefined
      firstPerson = false
      yaw = 0
      pitch = 0
      coins = []
      hazards = []
      solids = []
      for (const clip of clips) clip.pause()
      clips.clear()
      if (last || id !== sceneId || reset) world.load(project, id)
      sceneId = id
      scene = target
      if (reset || vars.time === undefined) {
        for (const key of Object.keys(vars)) delete vars[key]
        Object.assign(vars, project.settings.variables || {}, {
          score: 0,
          time: Math.max(1, Number(project.settings.duration) || 60),
          health: Number(project.settings.health) || 1,
        })
        elapsed = 0
      }
      if (reset) phase = 'menu'
      await world.ready()
      if (generation !== revision || disposed) return
      if (
        scene.entities.some(
          (e) => e.active && e.components.some((c) => c.enabled !== false && c.type === 'body'),
        )
      ) {
        if (!options.physics) throw Error('A physics body requires the Rapier module in this build')
        const result = await options.physics(world, scene)
        if (generation !== revision || disposed) {
          result.dispose()
          return
        }
        physics = result
      }
      for (const entity of scene.entities) {
        const object = world.objects.get(entity.id)
        if (object && visible(object))
          for (const c of entity.components) if (c.enabled !== false) register(entity, object, c)
      }
      jumpTime = 0
      jumpHeld = false
      if (player) groundY = (player as Actor).object.getWorldPosition(point).y
      if (firstPerson) {
        world.setCamera(new PerspectiveCamera(70, 1, 0.05, 200))
        for (const child of player!.object.children) child.visible = false
      }
      if (clicker) {
        if (vars.power === undefined) {
          const progress = await platform.loadData('clicker')
          if (disposed || generation !== revision) return
          vars.score = Number(progress?.score) || 0
          vars.power = Number(progress?.power) || 1
        }
        const save = () => platform.saveData('clicker', { score: vars.score, power: vars.power })
        events.on('object.clicked', () => {
          vars.score += vars.power
          void save()
        })
        events.on('clicker.upgrade', () => {
          if (vars.score >= 5 * vars.power) {
            vars.score -= 5 * vars.power
            vars.power++
            void save()
          }
        })
      }
      events.on('game.pause', pause)
      events.on('level.finish', () => finish())
      events.on('game.retry', () => {
        void restart()
      })
      lifecycle.call('onStart')
      updateUI()
      last = performance.now()
    } finally {
      if (generation === revision) busy = false
    }
  }
  function hitEntity() {
    const hits = ray.intersectObjects(world.scene.children, true)
    for (const hit of hits) {
      if (!visible(hit.object)) continue
      if (hit.instanceId !== undefined && hit.object.userData.entityIds)
        return String(hit.object.userData.entityIds[hit.instanceId])
      let node: Object3D | null = hit.object
      while (node) {
        if (node.userData.entityId) return String(node.userData.entityId)
        node = node.parent
      }
    }
  }
  window.addEventListener(
    'mousemove',
    (e) => {
      if (!firstPerson || phase !== 'playing' || document.pointerLockElement !== world.renderer.domElement)
        return
      yaw -= e.movementX * 0.002
      pitch = Math.min(1.35, Math.max(-1.35, pitch - e.movementY * 0.002))
    },
    { signal: signal.signal },
  )
  world.renderer.domElement.addEventListener(
    'pointerdown',
    (e) => {
      if (phase !== 'playing' || ad) return
      if (firstPerson && !document.pointerLockElement) {
        try {
          void world.renderer.domElement.requestPointerLock()?.catch(() => {})
        } catch {
          /* a sandboxed preview may disallow pointer lock */
        }
      }
      const rect = world.renderer.domElement.getBoundingClientRect()
      ray.far = Infinity
      ray.setFromCamera(
        new Vector2(
          ((e.clientX - rect.left) / rect.width) * 2 - 1,
          1 - ((e.clientY - rect.top) / rect.height) * 2,
        ),
        world.camera,
      )
      const id = hitEntity()
      if (id) {
        lifecycle.call('onPointerClick', id)
        emit('pointer.click', id)
      }
    },
    { signal: signal.signal },
  )
  function blocked(x: number, z: number, actor: Actor) {
    const r = Number(actor.params.radius) || 0.24
    for (const solid of solids) {
      if (!visible(solid.object)) continue
      solid.object.getWorldPosition(point)
      const size = solid.params.size || solid.entity.transform.scale
      if (point.y + size[1] / 2 <= playerPoint.y + 0.03) continue
      if (Math.abs(x - point.x) < size[0] / 2 + r && Math.abs(z - point.z) < size[2] / 2 + r)
        return solid.entity.id
    }
  }
  function contact(a: string, b: string, enter: boolean, trigger: boolean) {
    const hook = trigger ? (enter ? 'onTriggerEnter' : 'onTriggerExit') : 'onCollisionEnter'
    if (enter || trigger) {
      lifecycle.call(hook, a, b)
      lifecycle.call(hook, b, a)
    }
  }
  function control(dt: number) {
    if (!player) return
    const actor = player,
      node = actor.object,
      move = input.move,
      step = dt * (actor.params.speed ?? 3.5)
    let [x, z] = move
    if (runner) z = -1
    if (firstPerson) {
      const cos = Math.cos(yaw),
        sin = Math.sin(yaw)
      ;[x, z] = [cos * x + sin * z, -sin * x + cos * z]
    }
    node.getWorldPosition(playerPoint)
    const jumping = input.pressed('Jump')
    if (!jumpTime && jumping && !jumpHeld) jumpTime = dt
    jumpHeld = jumping
    if (jumpTime > 0) {
      const fraction = Math.min(1, jumpTime / 0.58)
      playerPoint.y = groundY + 4 * fraction * (1 - fraction) * Number(actor.params.jumpHeight ?? 0.8)
      jumpTime = fraction === 1 ? 0 : jumpTime + dt
    }
    const bounds: Vec3 | number[] = project.settings.bounds || [-Infinity, Infinity, -Infinity, Infinity]
    const nx = Math.min(bounds[1], Math.max(bounds[0], playerPoint.x + x * step)),
      nz = Math.min(bounds[3], Math.max(bounds[2], playerPoint.z + z * step))
    const hitX = x ? blocked(nx, playerPoint.z, actor) : undefined
    if (!hitX) playerPoint.x = nx
    const hitZ = z ? blocked(playerPoint.x, nz, actor) : undefined
    if (!hitZ) playerPoint.z = nz
    const next = new Set([hitX, hitZ].filter((id): id is string => !!id))
    for (const id of next) if (!contacts.has(id)) contact(actor.entity.id, id, true, false)
    point.copy(playerPoint)
    node.parent?.worldToLocal(point)
    node.position.copy(point)
    if (firstPerson) {
      world.camera.position.copy(playerPoint)
      world.camera.position.y += 1
      world.camera.rotation.set(pitch, yaw, 0, 'YXZ')
    }
    if (runner) {
      world.camera.position.set(playerPoint.x, playerPoint.y + 6, playerPoint.z + 7)
      world.camera.lookAt(playerPoint.x, 0, playerPoint.z - 2)
    }
    if (!firstPerson && (x || z)) node.rotation.y = Math.atan2(x, z)
    for (const coin of coins) {
      if (!visible(coin.object)) continue
      coin.object.getWorldPosition(point)
      if (Math.hypot(playerPoint.x - point.x, playerPoint.z - point.z) > (coin.params.radius ?? 0.65))
        continue
      vars.score += Number(coin.params.points ?? coin.params.value ?? 1)
      coin.object.visible = false
      contact(actor.entity.id, coin.entity.id, true, true)
      playSound()
      emit('coin.collected', coin.entity.id)
      if ((mode || runner) && coins.every((c) => !visible(c.object))) finish()
    }
    for (const hazard of hazards) {
      if (!visible(hazard.object)) continue
      hazard.object.getWorldPosition(point)
      if (Math.hypot(playerPoint.x - point.x, playerPoint.z - point.z) > (hazard.params.radius ?? 0.7))
        continue
      next.add(hazard.entity.id)
      if (!contacts.has(hazard.entity.id)) {
        vars.health -= hazard.params.amount ?? 1
        contact(actor.entity.id, hazard.entity.id, true, true)
        if (vars.health <= 0) finish('player.dead')
      }
    }
    for (const id of contacts)
      if (!next.has(id) && hazards.some((h) => h.entity.id === id)) contact(actor.entity.id, id, false, true)
    if (runner && [...next].some((id) => hazards.some((h) => h.entity.id === id))) finish('player.dead')
    contacts.clear()
    for (const id of next) contacts.add(id)
  }
  let sample = 0,
    frames = 0,
    hudTime = -1,
    lastScore = -1
  function loop(now: number) {
    if (disposed) return
    frame = requestAnimationFrame(loop)
    const frameMs = now - last
    if (project.settings.maxFPS && frameMs < 1000 / project.settings.maxFPS - 0.1) return
    const dt = Math.min(0.1, Math.max(0, frameMs / 1000))
    last = now
    if (!busy && !ad && phase === 'playing') {
      elapsed += dt
      accumulator += dt
      while (accumulator >= 1 / 60 && phase === 'playing' && !busy) {
        accumulator -= 1 / 60
        control(1 / 60)
        physics?.step(1 / 60, contact)
        lifecycle.call('onFixedUpdate', undefined, 1 / 60)
      }
      if (phase === 'playing' && !busy) {
        lifecycle.call('onUpdate', undefined, dt)
        if (mode) {
          vars.time = Math.max(0, vars.time - Math.max(0, frameMs) / 1000)
          if (!vars.time) finish('time.up')
        }
        if (hudTime !== Math.ceil(vars.time) || lastScore !== vars.score || project.ui.length) {
          hudTime = Math.ceil(vars.time)
          lastScore = vars.score
          overlay.update(vars.score, vars.time, { ...vars, best })
        }
      }
    }
    world.render()
    sample += Math.max(0, frameMs)
    frames++
    if (sample >= 500) {
      const info = world.renderer.info,
        canvas = world.renderer.domElement
      Object.assign(stats, {
        fps: Math.round((frames * 1000) / sample),
        frameTime: sample / frames,
        drawCalls: info.render.calls,
        triangles: info.render.triangles,
        textures: info.memory.textures,
        width: canvas.width,
        height: canvas.height,
      })
      if (options.performance || project.settings.showPerformance)
        overlay.performance(
          `${stats.fps} FPS · ${stats.frameTime.toFixed(1)} ms · ${stats.drawCalls} draws · ${stats.triangles} tris · ${stats.textures} tex · ${stats.width}×${stats.height}`,
        )
      sample = 0
      frames = 0
    }
  }
  document.addEventListener(
    'visibilitychange',
    () => {
      if (document.hidden) pause()
    },
    { signal: signal.signal },
  )
  document.addEventListener(
    'miniforge:ad',
    (e) => {
      ad = (e as CustomEvent<boolean>).detail
      if (ad) quiet()
      else if (phase === 'playing' && !document.hidden) {
        last = performance.now()
        void sounds?.resume().catch(() => {})
        for (const clip of clips) void clip.play().catch(() => {})
      }
    },
    { signal: signal.signal },
  )
  function dispose() {
    if (disposed) return
    disposed = true
    revision++
    cancelAnimationFrame(frame)
    signal.abort()
    platform.gameplayStop()
    quiet()
    void sounds?.close().catch(() => {})
    clips.clear()
    lifecycle.clear()
    events.clear()
    physics?.dispose()
    overlay.dispose()
    world.dispose()
  }
  try {
    stats.sdkMs = initializationMs
    const [storedLang, storedBest] = await Promise.all([
      platform.loadData('language'),
      platform.loadData('best'),
    ])
    const preferred = String(storedLang || platform.getLanguage()).split('-')[0]
    language = Object.hasOwn(project.locales, preferred) ? preferred : project.settings.language || 'en'
    best = Number(storedBest) || 0
    await load(project.activeScene, false)
    world.render()
    platform.loadingReady()
    stats.readyMs = performance.now() - started
    frame = requestAnimationFrame(loop)
    if (!mode) resume()
    return {
      pause,
      resume,
      dispose,
      get stats() {
        return stats
      },
    }
  } catch (e) {
    dispose()
    throw e
  }
}
export const launchGame = startGame
