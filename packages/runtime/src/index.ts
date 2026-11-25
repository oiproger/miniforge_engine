import { RuntimePluginHost } from './plugins'
import { createDialogueRuntime } from './dialogue'
import { SequencerPlayer } from './sequencer'
import { parseEventGraph } from '../../project-schema/src'
import { createEventGraphLifecycle } from './eventGraph'
import { SceneNode, Vector3 } from '../../graphics/src/scene'
import { createWorld } from '../../graphics/src'
import { bakeNavZone, findNavPath, sampleTerrainLayerAt, setNavAreaState, needsPhysics, instantiatePrefab, makePrefab, subtree, uid, type NavZone } from '../../project-schema/src'
import { bindRule } from '../../behaviors/src/rules'
import type { Component, Entity, Project, Terrain, Vec3 } from '../../project-schema/src'
import { behavior } from '../../behaviors/src'
import { AudioEngine } from './audio'
import { TweenManager } from './tween'
import { SaveManager } from './saveSystem'
import { TouchController } from './touch'
import { Input } from './input'
import { NetManager, type NetEntitySnapshot } from './net'
import { readSyncPath, writeSyncPath, safeSyncValue, syncPaths } from './networkSyncFields'
import { SteamManager } from './steam'
import { Events, Lifecycle, type ScriptLifecycle } from './lifecycle'
import { Overlay, translate, type Phase } from './overlay'
import type {
  CameraAPI,
  EnvironmentAPI,
  GameAPI,
  GraphicsAPI,
  MaterialsAPI,
  GameOptions,
  GameSession,
  LightsAPI,
  PhysicsSession,
  PlayerAPI,
  ServicesAPI,
  WorldStateAPI,
} from './types'
export type { GameAPI, GameOptions, GameSession, ScriptFactory, RaycastHit, FlashlightOptions } from './types'
export type { ScriptLifecycle } from './lifecycle'
export type { AudioBus, AudioPlayOptions } from './audio'
export { Tween, PropertyTweener, TweenManager } from './tween'
export type { TweenTrans, TweenEase } from './tween'
export { SaveManager } from './saveSystem'
export type { SaveSnapshot, SaveOptions, LoadOptions } from './saveSystem'
export type { TouchAPI, TouchPointerState, TouchEmulationOptions } from './touch'

const visible = (obj: SceneNode | null): boolean => !obj || (obj.visible && visible(obj.parent))
interface Actor {
  entity: Entity
  object: SceneNode
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
  const world = createWorld(container, project, project.activeScene, {
    onAnimationFinished: (id, clip) => emit('animation.finished', { source: id, clip }),
  })
  const events = new Events(),
    lifecycle = new Lifecycle(
      (err) => {
        console.error('Game script', err)
        options.onEvent?.('script.error', String(err))
      },
      (id) => active(id),
    )
  const signal = new AbortController(),
    vars: Record<string, any> = {},
    worldStore: Record<string, unknown> = {},
    serviceRegistry = new Map<string, unknown>(),
    audioEngine = new AudioEngine(project),
    tweens = new TweenManager()
  const point = new Vector3(),
    playerPoint = new Vector3()
  const mode = project.settings.mode === 'collectathon'
  const runner = project.settings.mode === 'runner',
    clicker = project.settings.mode === 'clicker'
  let firstPerson = false,
    yaw = 0,
    pitch = 0,
    eyeHeight = 1.0,
    currentEyeHeight = 1.0,
    crouchOverride: boolean | null = null,
    crouching = false,
    sprinting = false,
    speedOverride: number | null = null,
    shakeIntensity = 0,
    shakeRemaining = 0,
    shakeDuration = 0,
    jumpTime = 0,
    jumpHeld = false,
    verticalSpeed = 0,
    grounded = true,
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
  let player: Actor | undefined,
    coins: Actor[] = [],
    hazards: Actor[] = [],
    solids: Actor[] = [],
    volumes: Actor[] = []
  const contacts = new Set<string>()
  const activeTriggers = new Map<string, Set<string>>()
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
  const steam = new SteamManager({ localDebug: Boolean(options.preview && (project.settings as any).steam?.localDebug) })
  const steamCfg = (project.settings as any).steam
  if (steamCfg?.enabled || (project.settings as any).multiplayer?.mode === "steam-p2p") {
    void steam.init(Number(steamCfg?.appId || 480)).then(() => {
      if (steamCfg?.richPresence) void steam.setRichPresence("status", String(steamCfg.richPresence))
    })
  }
  const steamAPI = {
    init: (appId?: number) => steam.init(appId ?? Number(steamCfg?.appId || 480)),
    isAvailable: () => steam.isAvailable(),
    isNative: () => steam.isNative(),
    isDebug: () => steam.isDebug(),
    getMode: () => steam.getMode(),
    getUser: () => steam.getUser(),
    unlockAchievement: (id: string) => steam.unlockAchievement(id),
    clearAchievement: (id: string) => steam.clearAchievement(id),
    hasAchievement: (id: string) => steam.hasAchievement(id),
    listAchievements: () => steam.listAchievements(),
    setRichPresence: (key: string, value: string) => steam.setRichPresence(key, value),
    clearRichPresence: () => steam.clearRichPresence(),
    cloudWrite: (filename: string, content: string) => steam.cloudWrite(filename, content),
    cloudRead: (filename: string) => steam.cloudRead(filename),
    cloudDelete: (filename: string) => steam.cloudDelete(filename),
    cloudList: () => steam.cloudList(),
    createLobby: (opts?: any) => steam.createLobby(opts),
    listLobbies: () => steam.listLobbies(),
    joinLobby: (lobbyId: string) => steam.joinLobby(lobbyId),
    leaveLobby: () => steam.leaveLobby(),
    setLobbyData: (key: string, value: string) => steam.setLobbyData(key, value),
    getLobby: () => steam.getLobby(),
    getLogs: () => steam.getLogs(),
  }
  const net = new NetManager()
  net.attachSteam(steam)
  const mpCfg = (project.settings as any).multiplayer || { mode: "singleplayer" }
  const remoteNetTargets = new Map<string, { pos: Vec3; rot: Vec3; scale?: Vec3 }>()
  const remoteLocalProxies = new Map<string, string>()
  const peerProxies = new Map<string, Set<string>>()
  const trackedEntityVarKeys = new Map<string, Set<string>>()
  const lastSentEntityVars = new Map<string, Record<string, string>>()
  const lastSentEntityActive = new Map<string, boolean>()
  const netDestroyed = new Set<string>()
  const netSpawned = new Map<string, { prefabId: string; owner: string; pos?: Vec3; id: string }>()
  let applyingRemoteNetwork = false
  const entityVarListeners = new Map<string, Set<(value: any, prevValue: any) => void>>()
  let netSyncAccum = 0
  const REMOTE_AVATAR_COLORS = ["#f59e0b", "#22c55e", "#ec4899", "#a855f7", "#06b6d4"]

  function ensureRemoteProxy(templateEnt: Entity, fromPeerId: string, snap: NetEntitySnapshot): Entity | null {
    const key = fromPeerId + ":" + templateEnt.id
    const existingId = remoteLocalProxies.get(key)
    if (existingId) {
      const found = scene.entities.find((e) => e.id === existingId)
      if (found && world.objects.has(existingId)) return found
    }
    const proxyId = templateEnt.id + "__net_" + fromPeerId.replace(/[^a-zA-Z0-9_-]/g, "")
    let hash = 0
    for (let i = 0; i < fromPeerId.length; i++) hash = (hash * 31 + fromPeerId.charCodeAt(i)) | 0
    const colorHex = REMOTE_AVATAR_COLORS[Math.abs(hash) % REMOTE_AVATAR_COLORS.length]
    const proxyMatId = "mat-net-proxy-" + Math.abs(hash) % REMOTE_AVATAR_COLORS.length
    if (!project.assets.some((a) => a.id === proxyMatId)) {
      project.assets.push({
        id: proxyMatId,
        name: "Remote Player Material",
        type: "material",
        data: "",
        properties: { color: colorHex, roughness: 0.45, metalness: 0.1 },
      })
    }
    const visualComps = templateEnt.components
      .filter((c) => c.type === "mesh" || c.type === "model" || c.type === "light")
      .map((c) => {
        const clone = structuredClone(c)
        if (clone.type === "mesh") {
          clone.material = proxyMatId
          clone.color = colorHex
        }
        return clone
      })
    const templateSync = templateEnt.components.find(c => c.type === 'networkSync' && c.enabled !== false)
    visualComps.push({
      ...(templateSync ? structuredClone(templateSync) : {}),
      type: 'networkSync',
      owner: fromPeerId,
      syncVariables: false,
    })
    const proxy: Entity = {
      id: proxyId,
      name: templateEnt.name + " (" + fromPeerId.slice(-4) + ")",
      parent: null,
      active: true,
      transform: {
        position: [...snap.pos] as Vec3,
        rotation: [...snap.rot] as Vec3,
        scale: (snap.scale ? [...snap.scale] : [...templateEnt.transform.scale]) as Vec3,
      },
      components: visualComps,
      properties: { ...(templateEnt.properties || {}), netOwner: fromPeerId, isRemoteProxy: true },
    }
    scene.entities.push(proxy)
    try {
      world.addEntities([proxy])
    } catch {}
    remoteLocalProxies.set(key, proxyId)
    let set = peerProxies.get(fromPeerId)
    if (!set) {
      set = new Set()
      peerProxies.set(fromPeerId, set)
    }
    set.add(proxyId)
    return proxy
  }

  const isFiniteNetworkVec3 = (v: unknown): v is Vec3 => Array.isArray(v) && v.length === 3 && v.every(x => typeof x === 'number' && Number.isFinite(x) && Math.abs(x) < 1_000_000)
  const hostPeerId = () => net.getPeers().find(p => p.isHost)?.id
  function notifySyncedVar(id: string, key: string, value: unknown, prev: unknown, peerId: string, templateId: string) {
    const listeners = entityVarListeners.get(id + ':' + key)
    if (listeners) for (const fn of listeners) fn(value, prev)
    emit('net.entityVarChanged', { source: id, templateId, peerId, key, value, prevValue: prev })
  }
  function applySyncedComponentField(ent: Entity, path: string) {
    const match = path.match(/^components\.([a-zA-Z_-]+)(?:\[\d+\])?\.(.+)$/)
    if (!match) return
    const value = readSyncPath(ent, path)
    const prop = match[2]
    if (match[1] === 'light') {
      if (prop === 'intensity' && Number.isFinite(value)) world.setLightIntensity(ent.id, Number(value))
      if (prop === 'color' && typeof value === 'string') world.setLightColor(ent.id, value)
      if (prop === 'range' && Number.isFinite(value)) world.setLightRange(ent.id, Number(value))
    }
    if (match[1] === 'mesh') {
      if (prop === 'color' && typeof value === 'string') world.setEntityColor(ent.id, value)
      if (prop === 'material' && typeof value === 'string') world.setEntityMaterial(ent.id, value)
    }
    if (match[1] === 'decal' && prop === 'opacity' && Number.isFinite(value)) world.setDecalOpacity(ent.id, Number(value))
    if (match[1] === 'particle' && prop === 'rate' && Number.isFinite(value)) world.setParticleRate(ent.id, Number(value))
  }
  net.onSnapshot((snaps, fromPeerId) => {
    if (!net.getPeers().some(p => p.id === fromPeerId)) return
    for (const s of snaps.slice(0, 256)) {
      if (!s || typeof s.id !== 'string' || !isFiniteNetworkVec3(s.pos) || !isFiniteNetworkVec3(s.rot) || s.scale && !isFiniteNetworkVec3(s.scale)) continue
      let ent = scene.entities.find((e) => e.id === s.id)
      const nsc = ent?.components.find((c) => c.type === "networkSync" && c.enabled !== false)
      if (!ent || !nsc) continue
      // An owner-only snapshot must come from that owner, never an arbitrary peer.
      if ((nsc.owner || 'host') === 'host' && fromPeerId !== hostPeerId()) continue
      if ((nsc.owner || 'host') !== 'host' && nsc.owner !== 'local' && nsc.owner !== fromPeerId) continue
      if (nsc.owner === "local") {
        // Each peer owns its own local instance; spawn/update a dedicated remote proxy avatar for other peers
        if (!fromPeerId || fromPeerId === net.peerId) continue
        const proxy = ensureRemoteProxy(ent, fromPeerId, s)
        if (!proxy) continue
        ent = proxy
      } else {
        const isLocalOwned = ((nsc.owner || 'host') === 'host' && net.isHost) || nsc.owner === net.peerId
        if (isLocalOwned) continue
      }
      if (nsc.syncTransform !== false) {
        if (nsc.interpolate !== false) {
          remoteNetTargets.set(ent.id, { pos: s.pos, rot: s.rot, scale: s.scale })
        } else {
          const obj = world.objects.get(ent.id)
          if (obj) {
            obj.position.set(s.pos[0], s.pos[1], s.pos[2])
            obj.rotation.set(s.rot[0], s.rot[1], s.rot[2])
            if (s.scale) obj.scale.set(s.scale[0], s.scale[1], s.scale[2])
          }
        }
      }
      if (nsc.syncAnimation) {
        const st = s.animState ? animMachines.get(ent.id) : undefined
        if (st && st.currentState !== s.animState) {
          const nextSt = (st.machine.states || []).find((x: any) => x.name === s.animState)
          if (nextSt) {
            st.currentState = nextSt.name
            if (nextSt.clip) world.crossfadeAnimation(ent.id, nextSt.clip, 0.15, nextSt.loop !== false, nextSt.speed ?? 1)
          }
        } else if (s.animClip) {
          const cur = world.getAnimationState(ent.id)
          if (!cur || cur.clip !== s.animClip) world.crossfadeAnimation(ent.id, s.animClip, 0.15, true, 1)
        }
      }
      if (nsc.syncActive && typeof s.active === 'boolean') {
        applyingRemoteNetwork = true
        try {
          const prior = ent.active
          setActive(ent.id, s.active)
          if (prior !== ent.active) emit('net.activeChanged', { source: ent.id, active: ent.active, peerId: fromPeerId })
        } finally { applyingRemoteNetwork = false }
      }
      if (s.fields && typeof s.fields === 'object' && !Array.isArray(s.fields)) {
        const allowed = new Set(syncPaths(nsc))
        for (const [path, val] of Object.entries(s.fields).slice(0, 32)) {
          if (!allowed.has(path)) continue
          const prev = readSyncPath(ent, path)
          if (writeSyncPath(ent, path, val)) {
            applySyncedComponentField(ent, path)
            emit('net.fieldChanged', { source: ent.id, templateId: s.id, peerId: fromPeerId, path, value: val, prevValue: prev })
            if (path.startsWith('properties.')) notifySyncedVar(ent.id, path.slice(11), val, prev, fromPeerId, s.id)
          }
        }
      }
      if (s.vars && typeof s.vars === "object") {
        ent.properties = ent.properties || {}
        const allowedVars = new Set(syncPaths(nsc).filter(path => /^properties\.[a-zA-Z_][a-zA-Z0-9_-]{0,63}$/.test(path)).map(path => path.slice(11)))
        for (const [k, v] of Object.entries(s.vars).slice(0, 64)) {
          if (!allowedVars.has(k)) continue
          const prev = ent.properties[k]
          if (JSON.stringify(prev) !== JSON.stringify(v) && safeSyncValue(v) !== undefined) {
            ent.properties[k] = v
            notifySyncedVar(ent.id, k, v, prev, fromPeerId, s.id)
          }
        }
      }
    }
  })
  net.onWorldState((incomingVars, fromPeerId) => {
    if (fromPeerId !== hostPeerId()) return
    for (const [k, v] of Object.entries(incomingVars).slice(0, 256)) {
      if (!/^[a-zA-Z_][a-zA-Z0-9_.-]{0,63}$/.test(k) || ['__proto__', 'constructor', 'prototype'].includes(k)) continue
      if (vars[k] !== v) vars[k] = v
    }
  })
  net.onPeerJoin((pid) => {
    lastSentEntityVars.clear()
    lastSentEntityActive.clear()
    netSyncAccum = 999
    if (net.isHost && pid !== net.peerId) {
      for (const spawned of [...netSpawned.values()].slice(0, 256)) net.rpc('net:spawn', spawned, pid)
      if (netDestroyed.size) net.rpc('net:despawn-state', { ids: [...netDestroyed].slice(0, 512) }, pid)
    }
    emit("net.peerJoin", { source: "net", peerId: pid })
  })
  net.onPeerLeave((pid) => {
    const proxies = peerProxies.get(pid)
    if (proxies) {
      for (const proxyId of proxies) {
        remoteNetTargets.delete(proxyId)
        try { destroy(proxyId) } catch {}
      }
      peerProxies.delete(pid)
      for (const [k, v] of [...remoteLocalProxies.entries()]) {
        if (k.startsWith(pid + ":")) remoteLocalProxies.delete(k)
      }
    }
    emit("net.peerLeave", { source: "net", peerId: pid })
  })
  net.onRpc("*", (ev, sender) => emit("net.rpc", { source: sender, name: ev?.name, payload: ev?.payload, sender }))
  net.onRpc('net:spawn', (data, sender) => {
    if (sender !== hostPeerId() || !data || typeof data.prefabId !== 'string' || typeof data.id !== 'string') return
    if (!/^net-[a-zA-Z0-9_-]{4,80}$/.test(data.id) || scene.entities.some(e => e.id === data.id) || netDestroyed.has(data.id)) return
    if (!project.assets.some(a => a.type === 'prefab' && a.id === data.prefabId)) return
    const pos = isFiniteNetworkVec3(data.pos) ? data.pos : undefined
    try {
      const id = spawnPrefab(data.prefabId, pos, null, data.id)
      const ent = scene.entities.find(e => e.id === id)
      if (ent) {
        ent.components = ent.components.filter(c => c.type !== 'networkSync')
        const owner = typeof data.owner === 'string' && (data.owner === 'host' || net.getPeers().some(p => p.id === data.owner)) ? data.owner : 'host'
        ent.components.push({ type: 'networkSync', owner, syncTransform: true, syncActive: true, syncAnimation: true, syncLifecycle: true, interpolate: true })
      }
    } catch (err) { console.warn('Network prefab spawn rejected', err) }
  })
  net.onRpc('net:despawn', (data, sender) => {
    if (sender !== hostPeerId() || typeof data?.id !== 'string') return
    const ent = scene.entities.find(e => e.id === data.id)
    if (!ent || !ent.components.some(c => c.type === 'networkSync' && c.syncLifecycle)) return
    netDestroyed.add(ent.id)
    applyingRemoteNetwork = true
    try { destroy(ent.id) } finally { applyingRemoteNetwork = false }
  })
  const pendingPickupRequests = new Map<string, number>()
  net.onRpc('net:collect-request', (data, sender) => {
    if (!net.isHost || sender === net.peerId || !net.getPeers().some(p => p.id === sender)) return
    if (typeof data?.id !== 'string') return
    const coin = coins.find(c => c.entity.id === data.id)
    const sync = coin?.entity.components.find(c => c.type === 'networkSync' && c.enabled !== false)
    if (!coin || !sync || sync.owner !== 'host' || !sync.syncActive || !active(coin.entity.id)) return
    const key = sender + ':' + player?.entity.id
    const proxyId = remoteLocalProxies.get(key)
    const proxy = proxyId && world.objects.get(proxyId)
    if (!proxy) return
    const collector = proxy.getWorldPosition(new Vector3())
    const location = coin.object.getWorldPosition(new Vector3())
    const radius = Math.max(0.1, Math.min(5, Number(coin.params.radius ?? 0.65)))
    if (Math.hypot(location.x - collector.x, location.z - collector.z) > radius + 0.3) return
    setActive(coin.entity.id, false)
    const points = Number(coin.params.points ?? coin.params.value ?? 1)
    net.rpc('net:collect-awarded', { id: coin.entity.id, points: Number.isFinite(points) ? points : 1 }, sender)
    emit('coin.collected', coin.entity.id)
  })
  net.onRpc('net:collect-awarded', (data, sender) => {
    if (sender !== hostPeerId() || typeof data?.id !== 'string') return
    const points = Number(data.points)
    if (!Number.isFinite(points) || Math.abs(points) > 10000) return
    vars.score += points
    pendingPickupRequests.delete(data.id)
    emit('coin.collected', data.id)
  })
  net.onRpc('net:despawn-state', (data, sender) => {
    if (sender !== hostPeerId() || !Array.isArray(data?.ids)) return
    for (const id of data.ids.slice(0, 512)) {
      if (typeof id !== 'string') continue
      const ent = scene.entities.find(e => e.id === id)
      if (!ent || !ent.components.some(c => c.type === 'networkSync' && c.syncLifecycle)) continue
      netDestroyed.add(id)
      applyingRemoteNetwork = true
      try { destroy(id) } finally { applyingRemoteNetwork = false }
    }
  })

  const netAPI = {
    connect: (opts?: any) => net.connect(opts),
    disconnect: () => net.disconnect(),
    rpc: (name: string, payload?: any, target: any = "all") => net.rpc(name, payload, target),
    onRpc: (name: string, handler: (payload: any, senderPeerId: string) => void) => net.onRpc(name, handler),
    onPeerJoin: (handler: (peerId: string) => void) => net.onPeerJoin(handler),
    onPeerLeave: (handler: (peerId: string) => void) => net.onPeerLeave(handler),
    getPeers: () => net.getPeers(),
    getStats: () => net.getStats(),
    isHost: () => net.isHost,
    peerId: () => net.peerId,
    room: () => net.room,
    mode: () => net.mode,
    setSimulation: (latencyMs: number, packetLossPct: number) => net.setSimulation(latencyMs, packetLossPct),
    getLocalPlayerMove: (playerIndex: number) => input.getPlayerMove(playerIndex),
    getLocalPlayerAction: (playerIndex: number, action: "jump" | "interact" | "attack") => input.getPlayerAction(playerIndex, action),
    setEntityVar: (entityId: string, key: string, value: any) => {
      if (!entityId || !key) return
      const ent = scene.entities.find((e) => e.id === entityId)
      if (!ent) return
      const sync = ent.components.find(c => c.type === 'networkSync' && c.enabled !== false)
      if (net.connected && sync?.owner === 'host' && !net.isHost) return
      if (!/^[a-zA-Z_][a-zA-Z0-9_-]{0,63}$/.test(key) || ['constructor', 'prototype', '__proto__'].includes(key) || safeSyncValue(value) === undefined) return
      ent.properties = ent.properties || {}
      const prev = ent.properties[key]
      ent.properties[key] = value
      let keySet = trackedEntityVarKeys.get(entityId)
      if (!keySet) {
        keySet = new Set()
        trackedEntityVarKeys.set(entityId, keySet)
      }
      keySet.add(key)
      if (JSON.stringify(prev) !== JSON.stringify(value)) {
        const listeners = entityVarListeners.get(entityId + ":" + key)
        if (listeners) for (const fn of listeners) fn(value, prev)
      }
    },
    getEntityVar: <T = any>(entityId: string, key: string, fallback?: T): T => {
      const ent = scene.entities.find((e) => e.id === entityId)
      if (!ent || !ent.properties || !(key in ent.properties)) return fallback as T
      return ent.properties[key] as T
    },
    setSyncedField: (entityId: string, path: string, value: unknown) => {
      const ent = scene.entities.find(e => e.id === entityId)
      const nsc = ent?.components.find(c => c.type === 'networkSync' && c.enabled !== false)
      if (!ent || !nsc || !syncPaths(nsc).includes(path) || net.connected && nsc.owner === 'host' && !net.isHost) return false
      if (!writeSyncPath(ent, path, value)) return false
      applySyncedComponentField(ent, path)
      return true
    },
    getSyncedField: (entityId: string, path: string) => {
      const ent = scene.entities.find(e => e.id === entityId)
      return ent ? readSyncPath(ent, path) : undefined
    },
    onEntityVarChange: (entityId: string, key: string, handler: (value: any, prevValue: any) => void) => {
      const mapKey = entityId + ":" + key
      let set = entityVarListeners.get(mapKey)
      if (!set) {
        set = new Set()
        entityVarListeners.set(mapKey, set)
      }
      set.add(handler)
      return () => set!.delete(handler)
    },
    hostLan: (opts?: any) => net.hostLan({ gameName: project.name, ...opts }),
    stopLan: () => net.stopLan(),
    discoverLan: (timeoutMs?: number) => net.discoverLan(timeoutMs),
    sendChat: (text: string) => net.sendChat(text),
    onChat: (handler: any) => net.onChat(handler),
    spawnNetworkPlayer: (prefabId: string, _ownerPeerId?: string, pos?: Vec3) => {
      if (!net.isHost) throw Error('Only the host may spawn authoritative network prefabs')
      const asset = project.assets.find(a => a.type === 'prefab' && a.id === prefabId)
      if (!asset) throw Error('Unknown network prefab: ' + prefabId)
      const id = 'net-' + uid().replace(/[^a-zA-Z0-9_-]/g, '').padEnd(6, 'x')
      const owner = _ownerPeerId && net.getPeers().some(p => p.id === _ownerPeerId) ? _ownerPeerId : 'host'
      const spawn = { prefabId, owner, pos, id }
      const created = spawnPrefab(prefabId, pos, null, id)
      const ent = scene.entities.find(e => e.id === created)
      if (ent) {
        ent.components = ent.components.filter(c => c.type !== 'networkSync')
        ent.components.push({ type: 'networkSync', owner, syncTransform: true, syncActive: true, syncAnimation: true, syncLifecycle: true, interpolate: true })
      }
      netSpawned.set(id, spawn)
      net.rpc('net:spawn', spawn, 'others')
      return id
    },
  }

  // Pre-assign deterministic role peerId before scripts start; connect after scene load
  const qpInitial = typeof window !== "undefined" && window.location ? new URLSearchParams(window.location.search || "") : null
  const qpInitialRole = qpInitial?.get("mpRole") || mpCfg.preferredRole
  if (qpInitialRole === "host") net.peerId = "0-host-" + Math.random().toString(36).slice(2, 6)
  if (qpInitialRole === "client") net.peerId = "1-client-" + Math.random().toString(36).slice(2, 6)

  function autoConnectMultiplayer() {
    try {
      const qp = typeof window !== "undefined" && window.location ? new URLSearchParams(window.location.search || "") : null
      const qpRoom = qp?.get("mpRoom")
      if (qpRoom || (mpCfg.mode && mpCfg.mode !== "singleplayer")) {
        if (!qpRoom && mpCfg.autoStartLanServer) {
          void net.hostLan({
            port: Number(mpCfg.lanPort || 8765),
            room: mpCfg.roomCode || "lobby-1",
            gameName: project.name,
            mode: mpCfg.mode,
          }).then(info => { if (!info) options.onEvent?.('net.error', net.lastError || 'Could not start LAN server') })
        } else {
          void net.connect({
            mode: qpRoom ? "client-server-ws" : mpCfg.mode,
            room: qpRoom || mpCfg.roomCode || "lobby-1",
            url: qpRoom ? "local" : mpCfg.serverUrl || "local",
            simulatedLatencyMs: Number(mpCfg.simulatedLatencyMs || 0),
            simulatedPacketLoss: Number(mpCfg.simulatedPacketLoss || 0),
          }).then(ok => { if (!ok) options.onEvent?.('net.error', net.lastError || 'Network connection failed') })
        }
      }
    } catch {}
  }

    const input = new Input(
    signal.signal,
    () => {
      if (!overlay.back()) {
        if (phase === 'playing') pause()
        else if (phase === 'paused') resume()
      }
    },
    (action, down) => emit('input.' + action + (down ? '' : '.released'), { source: 'input', action }),
  )
  for (const [action, keys] of Object.entries(project.settings.bindings || {}))
    if (Array.isArray(keys)) input.bind(action, keys)
  if (Number.isFinite((project.settings as any).gamepadDeadzone)) input.setDeadzone((project.settings as any).gamepadDeadzone)
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
      emit: (name, source?: unknown) => emit(name, source),
    },
    input,
    t,
  )
  if (getComputedStyle(container).position === 'static') container.style.position = 'relative'
  container.append(overlay.host)
  const touchCtrl = new TouchController(
    container,
    world.renderer.domElement,
    input,
    (dx, dy) => {
      if (!firstPerson || phase !== 'playing' || ad) return
      yaw -= dx
      pitch = Math.min(1.45, Math.max(-1.45, pitch - dy))
    },
    (clientX, clientY) => {
      if (phase !== 'playing' || ad) return
      const rect = world.renderer.domElement.getBoundingClientRect()
      const id = world.pick(clientX - rect.left, clientY - rect.top)
      if (id) {
        lifecycle.call('onPointerClick', id)
        emit('pointer.click', id)
      }
    },
    signal.signal,
    project.settings?.touch,
  )
  const touchAPI = touchCtrl.api()

  function cameraForward(): Vector3 {
    const p = world.camera.rotation.x,
      y = world.camera.rotation.y
    const cp = Math.cos(p)
    return new Vector3(-Math.sin(y) * cp, Math.sin(p), -Math.cos(y) * cp)
  }
  function cameraRight(): Vector3 {
    const y = world.camera.rotation.y
    return new Vector3(Math.cos(y), 0, -Math.sin(y))
  }

  const cameraAPI: CameraAPI = {
    get position() {
      return world.camera.position
    },
    get rotation() {
      return world.camera.rotation
    },
    get forward() {
      return cameraForward()
    },
    get right() {
      return cameraRight()
    },
    get yaw() {
      return yaw
    },
    set yaw(v: number) {
      yaw = v
      if (firstPerson) world.camera.rotation.y = v
    },
    get pitch() {
      return pitch
    },
    set pitch(v: number) {
      pitch = Math.min(1.45, Math.max(-1.45, v))
      if (firstPerson) world.camera.rotation.x = pitch
    },
    get fov() {
      return world.camera.fov
    },
    set fov(v: number) {
      world.camera.fov = Math.min(150, Math.max(15, v))
    },
    get eyeHeight() {
      return eyeHeight
    },
    set eyeHeight(v: number) {
      eyeHeight = Math.max(0.2, v)
    },
    lookAt(target: Vec3 | Vector3) {
      const vec = Array.isArray(target) ? new Vector3().fromArray(target) : target
      world.camera.lookAt(vec)
      pitch = world.camera.rotation.x
      yaw = world.camera.rotation.y
    },
    setLook(nextYaw: number, nextPitch: number) {
      yaw = nextYaw
      pitch = Math.min(1.45, Math.max(-1.45, nextPitch))
      world.camera.rotation.set(pitch, yaw, 0)
    },
    shake(intensity: number, duration = 0.25) {
      shakeIntensity = Math.max(shakeIntensity, Math.max(0, intensity))
      shakeDuration = Math.max(0.01, duration)
      shakeRemaining = Math.max(shakeRemaining, duration)
    },
    worldToScreen(position: Vec3 | Vector3) {
      return world.worldToScreen(position)
    },
    screenToRay(x: number, y: number) {
      return world.screenToRay(x, y)
    },
  }

  const playerAPI: PlayerAPI = {
    get id() {
      return player?.entity.id
    },
    get position(): Vec3 {
      if (!player) return [0, 0, 0]
      return player.object.getWorldPosition(new Vector3()).toArray()
    },
    get isGrounded() {
      return grounded
    },
    get isCrouching() {
      return crouching
    },
    get isSprinting() {
      return sprinting
    },
    get speed() {
      return speedOverride ?? Number(player?.params.speed ?? 3.5)
    },
    set speed(v: number) {
      speedOverride = Math.max(0, v)
    },
    teleport(position: Vec3, yawDelta = 0, pitchDelta = 0) {
      if (!player) return
      const target = new Vector3().fromArray(position)
      const local = target.clone()
      player.object.parent?.worldToLocal(local)
      player.object.position.copy(local)
      physics?.teleportBody?.(player.entity.id, position)
      verticalSpeed = 0
      if (yawDelta) yaw += yawDelta
      if (pitchDelta) pitch = Math.min(1.45, Math.max(-1.45, pitch + pitchDelta))
      if (firstPerson) {
        world.camera.position.set(position[0], position[1] + currentEyeHeight, position[2])
        world.camera.rotation.set(pitch, yaw, 0)
      }
      contacts.clear()
    },
    setSpeed(speed: number) {
      speedOverride = Math.max(0, speed)
    },
    setCrouch(enabled: boolean) {
      crouchOverride = enabled
    },
  }

  const environmentAPI: EnvironmentAPI = {
    setFog: (density, fogColor) => world.setFog(density, fogColor),
    setFogFade: (start, end, depthMode) => world.setFogFade(start, end, depthMode),
    setBackground: (hex) => world.setBackground(hex),
    setAmbient: (intensity, tint) => world.setAmbient(intensity, tint),
    setAmbientGround: (hex, intensity) => world.setAmbientGround(hex, intensity),
    setSun: (direction, tint, intensity) => world.setSun(direction, tint, intensity),
    setExposure: (value) => world.setExposure(value),
    setSky: (topColor, horizonColor, bottomColor, enabled = true) =>
      world.setSky(topColor, horizonColor, bottomColor, enabled),
    setProceduralSky: (opts) => world.setProceduralSky(opts),
    setSkyboxFaces: (faces) => world.setSkyboxFaces(faces),
    setSkyAsset: (assetId) => world.setSkyAsset(assetId),
  }

  const graphicsAPI: GraphicsAPI = {
    setPostProcess: (opts) => world.setPostProcess(opts),
    getPostProcess: () => world.getPostProcess(),
    setShadows: (enabled, range, softShadowHeight) => world.setShadows(enabled, range, softShadowHeight),
    setSmoothShading: (enabled) => world.setSmoothShading(enabled),
    bakeLighting: (zoneId) => world.bakeLighting(zoneId),
    setReflections: (mode, resolution, interval) => world.setReflections(mode, resolution, interval),
    updateZoneProbe: (zoneId) => world.updateZoneProbe(zoneId),
    setShadowParams: (opts) => world.setShadowParams(opts),
    setRenderQuality: (opts) => world.setRenderQuality(opts),
    setResolutionScale: (scale) => world.setResolutionScale(scale),
    setCullDistance: (dist) => world.setCullDistance(dist),
    setOptimization: (opts) => world.setOptimization(opts),
  }

  /** Keep declarative component values in step with the rendering API when the
   * corresponding path is selected for replication. Do not let non-owners
   * overwrite authoritative state while the network is connected. */
  function recordLiveSyncField(id: string, path: string, value: unknown): boolean {
    const ent = scene.entities.find(e => e.id === id)
    const nsc = ent?.components.find(c => c.type === 'networkSync' && c.enabled !== false)
    if (!ent || !nsc || !syncPaths(nsc).includes(path)) return true
    if (net.connected && (nsc.owner || 'host') === 'host' && !net.isHost) return false
    writeSyncPath(ent, path, value)
    return true
  }
  const materialsAPI: MaterialsAPI = {
    set: (entityId, materialAssetId) => {
      if (recordLiveSyncField(entityId, 'components.mesh.material', materialAssetId)) world.setEntityMaterial(entityId, materialAssetId)
    },
    setColor: (entityId, hex, opacity) => {
      if (recordLiveSyncField(entityId, 'components.mesh.color', hex)) world.setEntityColor(entityId, hex, opacity)
    },
    setEmissive: (entityId, hex, intensity) => world.setEntityEmissive(entityId, hex, intensity),
    setShader: (entityId, shaderAssetId) => world.setEntityShader(entityId, shaderAssetId),
    setShaderUniform: (target, name, value) => world.setShaderUniform(target, name, value),
    setShaderUniforms: (target, uniforms) => world.setShaderUniforms(target, uniforms),
    getSurfaceAt: (position, direction = [0, -1, 0], maxDist = 4) => {
      const orig = Array.isArray(position) ? new Vector3().fromArray(position) : position
      const dir = new Vector3().fromArray(direction)
      const hit = physics?.raycastHit?.(orig, dir, maxDist)
      if (hit) {
        const ent = scene.entities.find((e) => e.id === hit.id)
        if (ent) {
          const tc = ent.components.find((c) => c.type === 'terrain' && c.enabled !== false) as Terrain | undefined
          if (tc) {
            const sample = sampleTerrainLayerAt(tc, hit.point[0], hit.point[2], ent.transform)
            const matName = project.assets.find((a) => a.id === sample.materialId)?.name ?? ''
            return {
              entityId: ent.id,
              entityName: ent.name,
              materialId: sample.materialId,
              materialName: matName,
              tags: Array.isArray(ent.properties.tags) ? ent.properties.tags : [],
              point: hit.point,
              normal: hit.normal,
              isTerrain: true,
              layerIndex: sample.layerIndex,
            }
          }
          const mc = ent.components.find((c) => c.type === 'mesh' && c.enabled !== false)
          const matId = String(mc?.material || '')
          const matName = project.assets.find((a) => a.id === matId)?.name ?? ''
          return {
            entityId: ent.id,
            entityName: ent.name,
            materialId: matId,
            materialName: matName,
            tags: Array.isArray(ent.properties.tags) ? ent.properties.tags : [],
            point: hit.point,
            normal: hit.normal,
            isTerrain: false,
          }
        }
      }
      const tSample = terrainAPI.getLayerAt(orig.x, orig.z)
      if (tSample && Math.abs(orig.y - tSample.height) <= maxDist) {
        const ent = scene.entities.find((e) => e.id === tSample.entityId)
        return {
          entityId: tSample.entityId,
          entityName: ent?.name ?? 'Terrain',
          materialId: tSample.materialId,
          materialName: tSample.materialName,
          tags: Array.isArray(ent?.properties.tags) ? ent!.properties.tags : [],
          point: [orig.x, tSample.height, orig.z] as Vec3,
          normal: [0, 1, 0] as Vec3,
          isTerrain: true,
          layerIndex: tSample.layerIndex,
        }
      }
      return undefined
    },
    create: (name, properties) => {
      const id = uid('mat')
      project.assets.push({ id, name, type: 'material', data: '', properties: { ...properties } })
      return id
    },
  }

  const lightsAPI: LightsAPI = {
    setIntensity: (id, intensity) => {
      if (recordLiveSyncField(id, 'components.light.intensity', intensity)) world.setLightIntensity(id, intensity)
    },
    setColor: (id, hex) => {
      if (recordLiveSyncField(id, 'components.light.color', hex)) world.setLightColor(id, hex)
    },
    setRange: (id, range) => {
      if (recordLiveSyncField(id, 'components.light.range', range)) world.setLightRange(id, range)
    },
    setGlow: (id, glow, falloff) => world.setLightGlow(id, glow, falloff),
    setSunRays: (id, enabled, intensity, decay) => world.setLightSunRays(id, enabled, intensity, decay),
    setShadowLight: (id) => world.setShadowLight(id),
    setGel: (id, texId) => world.setLightGel(id, texId),
    setEnabled: (id, enabled) => setActive(id, enabled),
    setFlashlight: (opts) => world.setFlashlight(opts),
  }

  const servicesAPI: ServicesAPI = {
    register<T>(name: string, service: T): T {
      serviceRegistry.set(name, service)
      return service
    },
    get<T = any>(name: string): T | undefined {
      return serviceRegistry.get(name) as T | undefined
    },
    has(name: string): boolean {
      return serviceRegistry.has(name)
    },
  }

  const worldStateAPI: WorldStateAPI = {
    get<T = any>(key: string, fallback?: T): T {
      return (Object.hasOwn(worldStore, key) ? worldStore[key] : fallback) as T
    },
    set(key: string, value: unknown) {
      worldStore[key] = value
      emit('worldState.changed', { key, value })
    },
    all() {
      return { ...worldStore }
    },
    async save(slot = 'default') {
      await platform.saveData('worldState:' + slot, worldStore)
    },
    async load(slot = 'default') {
      const data = await platform.loadData('worldState:' + slot)
      if (!data || typeof data !== 'object') return false
      for (const key of Object.keys(worldStore)) delete worldStore[key]
      Object.assign(worldStore, data)
      emit('worldState.loaded', { slot })
      return true
    },
  }

  let lastApi: GameAPI | undefined
  const dialogueRuntime = createDialogueRuntime(project, () => lastApi!)
  const sequencerPlayer = new SequencerPlayer(project, () => lastApi!)
  const pluginHost = new RuntimePluginHost(project)
  const saveManager = new SaveManager({
    projectId: project.id,
    platform,
    events: { emit },
    getSceneId: () => sceneId,
    getScene: () => scene,
    getWorld: () => world,
    getVars: () => vars,
    getWorldState: () => worldStore,
    setWorldState: (data) => {
      for (const k of Object.keys(worldStore)) delete worldStore[k]
      Object.assign(worldStore, data)
    },
    getPlayer: () => playerAPI,
    getCamera: () => cameraAPI,
    setActive,
    loadScene: async (id) => {
      await load(id, false)
    },
  })

  function updateUI() {
    overlay.render(phase, vars.score, vars.time, best, language, mode)
  }
  function emit(name: string, payload?: unknown) {
    events.emit(name, payload)
    options.onEvent?.(name, payload)
    overlay.dispatchEvent?.(name, payload)
  }
  function quiet() {
    input.clear()
    audioEngine.suspend()
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
    audioEngine.resume()
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
  function playSound(assetId?: string, opts?: Parameters<AudioEngine['play']>[1]) {
    if (ad || phase !== 'playing') return ''
    return audioEngine.play(assetId, opts)
  }
  const registered = new Set<string>(),
    toStart = new Set<string>(),
    destroying = new Set<string>()
  const subscriptions = new Map<string, Set<() => void>>()
  let unloading = false,
    sessionStarted = false,
    startingScene = false,
    queuedScene: string | undefined
  const animMachines = new Map<
    string,
    {
      machine: any
      currentState: string
      stateTime: number
      params: Record<string, number | boolean>
      triggers: Set<string>
    }
  >()
  function initAnimMachineFor(entId: string) {
    const ent = scene.entities.find((e) => e.id === entId)
    if (!ent) return
    const ac = ent.components.find((c) => c.type === "animation" && c.enabled !== false)
    const sm = ac?.stateMachine
    if (!sm || !Array.isArray(sm.states) || !sm.states.length) return
    const params: Record<string, number | boolean> = {}
    for (const pr of sm.params || []) params[pr.name] = pr.defaultValue ?? (pr.type === "float" ? 0 : false)
    const entry = sm.states.find((s: any) => s.name === sm.entryState) || sm.states[0]
    animMachines.set(ent.id, { machine: sm, currentState: entry.name, stateTime: 0, params, triggers: new Set() })
    if (entry.clip) world.playAnimation(ent.id, entry.clip, entry.loop !== false, entry.speed ?? 1, 0)
  }
  function evalAnimCondition(cond: any, st: { params: Record<string, number | boolean>; triggers: Set<string> }): boolean {
    if (cond.op === "trigger") return st.triggers.has(cond.param)
    const cur = st.params[cond.param]
    if (cur === undefined) return false
    const val = cond.value
    if (cond.op === ">") return Number(cur) > Number(val)
    if (cond.op === "<") return Number(cur) < Number(val)
    if (cond.op === ">=") return Number(cur) >= Number(val)
    if (cond.op === "<=") return Number(cur) <= Number(val)
    if (cond.op === "==") return cur === val || String(cur) === String(val)
    if (cond.op === "!=") return cur !== val && String(cur) !== String(val)
    return false
  }
  function stepAnimMachines(dt: number) {
    for (const [entId, st] of animMachines.entries()) {
      st.stateTime += dt
      const animInfo = world.getAnimationState(entId)
      const normTime = animInfo && animInfo.duration > 0 ? animInfo.time / animInfo.duration : st.stateTime
      const transitions = (st.machine.transitions || []).filter((t: any) => t.from === st.currentState || t.from === "Any")
      for (const tr of transitions) {
        if (tr.to === st.currentState) continue
        if (tr.hasExitTime && normTime < (tr.exitTime ?? 0.85)) continue
        const conds = Array.isArray(tr.conditions) ? tr.conditions : []
        if (conds.length === 0 && !tr.hasExitTime) continue
        if (conds.every((c: any) => evalAnimCondition(c, st))) {
          const nextState = (st.machine.states || []).find((s: any) => s.name === tr.to)
          if (!nextState) continue
          for (const c of conds) if (c.op === "trigger") st.triggers.delete(c.param)
          const prev = st.currentState
          st.currentState = nextState.name
          st.stateTime = 0
          if (nextState.clip) {
            world.crossfadeAnimation(entId, nextState.clip, tr.duration ?? 0.2, nextState.loop !== false, nextState.speed ?? 1)
          }
          emit("animation.stateChanged", { source: entId, from: prev, to: nextState.name })
          break
        }
      }
      st.triggers.clear()
    }
  }
  function active(id: string) {
    const object = world.objects.get(id)
    return !!object && visible(object) && !destroying.has(id)
  }
  function install(entity: Entity) {
    if (registered.has(entity.id) || !active(entity.id)) return
    registered.add(entity.id)
    toStart.add(entity.id)
    const object = world.objects.get(entity.id)!
    for (const component of entity.components) {
      if (!registered.has(entity.id)) break
      if (component.enabled !== false) register(entity, object, component)
    }
  }
  function startEntities(ids: Iterable<string>) {
    for (const id of [...ids]) if (active(id) && toStart.delete(id)) { initAnimMachineFor(id); lifecycle.call('onStart', id) }
  }
  function spawnPrefab(assetId: string, position?: Vec3, parent: string | null = null, networkId?: string): string {
    if (disposed || unloading) throw Error('Scene is unloading')
    const asset =
      project.assets.find((a) => a.type === 'prefab' && (a.id === assetId || a.name === assetId)) ?? makePrefab(scene, assetId)
    const offset = scene.entities.length
    const root = instantiatePrefab(scene, asset, parent)
    if (networkId) {
      if (scene.entities.some(e => e !== root && e.id === networkId)) throw Error('Network entity ID is already in use')
      const oldId = root.id
      root.id = networkId
      for (const e of scene.entities.slice(offset)) if (e.parent === oldId) e.parent = networkId
    }
    if (position) root.transform.position = [...position]
    const nodes = scene.entities.slice(offset)
    try {
      world.addEntities(nodes)
      for (const e of nodes) {
        physics?.add(e)
        if (physics && e.components.some((c) => c.type === 'collider' && c.shape === 'mesh')) {
          const sim = physics
          void world.ready().then(() => {
            if (!disposed && sim === physics && scene.entities.includes(e)) sim.add(e)
          })
        }
      }
      for (const e of nodes) install(e)
      startEntities(nodes.map((e) => e.id))
      return root.id
    } catch (err) {
      destroy(root.id)
      throw err
    }
  }
  function clearTriggerPairsFor(id: string) {
    activeTriggers.delete(id)
    for (const set of activeTriggers.values()) set.delete(id)
  }
  function destroy(id: string) {
    if (destroying.has(id) || unloading) return
    const nodes = subtree(scene, id),
      ids = new Set(nodes.map((e) => e.id))
    if (!ids.size) return
    const rootSync = nodes[0]?.components.find(c => c.type === 'networkSync' && c.enabled !== false)
    if (net.connected && !net.isHost && !applyingRemoteNetwork && rootSync?.owner === 'host' && rootSync?.syncLifecycle) return
    if (!applyingRemoteNetwork && net.isHost) {
      for (const ent of nodes) {
        const sync = ent.components.find(c => c.type === 'networkSync' && c.enabled !== false)
        if (sync?.syncLifecycle) {
          netDestroyed.add(ent.id)
          netSpawned.delete(ent.id)
          if (net.connected) net.rpc('net:despawn', { id: ent.id }, 'others')
        }
      }
    }
    for (const key of ids) destroying.add(key)
    for (const e of nodes.reverse()) {
      const key = e.id
      lifecycle.remove(key)
      for (const off of subscriptions.get(key) ?? []) off()
      subscriptions.delete(key)
      registered.delete(key)
      toStart.delete(key)
      contacts.delete(key)
      clearTriggerPairsFor(key)
      tweens.killOwner(key)
      navAgents.delete(key)
      lastSentEntityActive.delete(key)
      lastSentEntityVars.delete(key)
      trackedEntityVarKeys.delete(key)
      physics?.remove(key)
    }
    scene.entities = scene.entities.filter((e) => !ids.has(e.id))
    coins = coins.filter((a) => !ids.has(a.entity.id))
    hazards = hazards.filter((a) => !ids.has(a.entity.id))
    solids = solids.filter((a) => !ids.has(a.entity.id))
    volumes = volumes.filter((a) => !ids.has(a.entity.id))
    if (player && ids.has(player.entity.id)) {
      player = undefined
      firstPerson = false
    }
    world.removeEntities([...ids])
    for (const key of ids) destroying.delete(key)
  }
  function setActive(id: string, enabled: boolean) {
    const nodes = subtree(scene, id)
    if (!nodes.length || destroying.has(id) || unloading) return
    const sync = nodes[0].components.find(c => c.type === 'networkSync' && c.enabled !== false)
    if (net.connected && !net.isHost && !applyingRemoteNetwork && sync?.owner === 'host' && sync?.syncActive) return
    const prevActive = new Map(nodes.map((e) => [e.id, active(e.id)]))
    nodes[0].active = enabled
    world.setEntityActive(id, enabled)
    for (const entity of nodes) {
      const nowActive = active(entity.id)
      const wasActive = prevActive.get(entity.id) ?? false
      physics?.setActive(entity.id, nowActive)
      if (nowActive) {
        const alreadyRegistered = registered.has(entity.id)
        install(entity)
        if (alreadyRegistered && !wasActive) lifecycle.call('onEnable', entity.id)
      } else {
        contacts.delete(entity.id)
        clearTriggerPairsFor(entity.id)
        if (wasActive && registered.has(entity.id)) lifecycle.call('onDisable', entity.id)
      }
    }
    if (enabled) startEntities(nodes.map((e) => e.id))
  }
  function tags(id: string): string[] {
    const value = scene.entities.find((e) => e.id === id)?.properties.tags
    return Array.isArray(value) ? value : []
  }
  function requestScene(id: string) {
    if (unloading || disposed || (startingScene && sceneId === id)) return
    if (queuedScene !== undefined) return
    queuedScene = id
    const generation = revision
    queueMicrotask(() => {
      if (queuedScene !== id) return
      queuedScene = undefined
      if (!disposed && generation === revision)
        void load(id, false).catch((err) => emit('scene.error', String(err)))
    })
  }
  interface NavAgentState {
    id: string
    path: Vec3[]
    index: number
    speed: number
    turnSpeed: number
    stopDistance: number
    walkClip?: string
    idleClip?: string
    crossfade: number
    moving: boolean
  }
  const navAgents = new Map<string, NavAgentState>()
  function getNavZone(zoneId?: string): { entity: Entity; zone: NavZone } | undefined {
    for (const e of scene.entities) {
      if (!e.active) continue
      if (zoneId && e.id !== zoneId) continue
      const z = e.components.find((c) => c.type === 'navZone' && c.enabled !== false) as NavZone | undefined
      if (z) return { entity: e, zone: z }
    }
    return undefined
  }
  const _navWp = new Vector3()
  const _navLocal = new Vector3()
  function stepNavAgents(dt: number) {
    for (const ag of navAgents.values()) {
      if (!ag.moving || !ag.path.length) continue
      const node = world.objects.get(ag.id)
      if (!node || !active(ag.id)) { ag.moving = false; continue }
      const target = ag.path[ag.index]
      if (!target) { ag.moving = false; continue }
      const wp = node.getWorldPosition(_navWp)
      const dx = target[0] - wp.x
      const dz = target[2] - wp.z
      const dist = Math.hypot(dx, dz)
      const isLast = ag.index >= ag.path.length - 1
      const thresh = isLast ? ag.stopDistance : Math.max(0.22, ag.speed * dt * 1.4)
      if (dist <= thresh) {
        if (isLast) {
          ag.moving = false
          ag.path = []
          if (ag.idleClip) world.crossfadeAnimation(ag.id, ag.idleClip, ag.crossfade, true, 1)
          emit('nav.arrived', { id: ag.id })
          continue
        }
        ag.index++
        continue
      }
      const step = Math.min(dist, ag.speed * dt)
      const nx = wp.x + (dx / dist) * step
      const nz = wp.z + (dz / dist) * step
      const ny = wp.y + (target[1] - wp.y) * Math.min(1, dt * 8)
      _navLocal.set(nx, ny, nz)
      node.parent?.worldToLocal(_navLocal)
      node.position.copy(_navLocal)
      physics?.teleportBody?.(ag.id, [nx, ny, nz])
      const desiredYaw = Math.atan2(dx, dz)
      let diff = desiredYaw - node.rotation.y
      while (diff > Math.PI) diff -= Math.PI * 2
      while (diff < -Math.PI) diff += Math.PI * 2
      node.rotation.y += diff * Math.min(1, dt * ag.turnSpeed)
    }
  }
  const terrainAPI: GameAPI['terrain'] = {
    getLayerAt(x: number, z: number) {
      for (const e of scene.entities) {
        if (!e.active) continue
        const tc = e.components.find((c) => c.type === 'terrain' && c.enabled !== false) as Terrain | undefined
        if (!tc) continue
        const s = sampleTerrainLayerAt(tc, x, z, e.transform)
        if (!s.inside) continue
        const matName = project.assets.find((a) => a.id === s.materialId)?.name ?? ''
        return { entityId: e.id, height: s.height, layerIndex: s.layerIndex, materialId: s.materialId, materialName: matName, weights: s.weights }
      }
      return undefined
    },
  }
  const navAPI: GameAPI['nav'] = {
    findPath(start, goal, opts) {
      const found = getNavZone(opts?.zoneId)
      if (!found) return []
      return findNavPath(found.zone, found.entity.transform, start, goal, { smooth: opts?.smooth })
    },
    bake(zoneId) {
      const found = getNavZone(zoneId)
      if (!found) return undefined
      return bakeNavZone(found.zone, found.entity.transform, scene)
    },
    setObstacle(center, radius, blocked, zoneId) {
      const found = getNavZone(zoneId)
      if (found) setNavAreaState(found.zone, found.entity.transform, center, radius, blocked ? 0 : 1)
    },
    setAreaCost(center, radius, cost, zoneId) {
      const found = getNavZone(zoneId)
      if (found) setNavAreaState(found.zone, found.entity.transform, center, radius, Math.max(1, cost))
    },
    setLinkEnabled(linkId, enabled, zoneId) {
      const found = getNavZone(zoneId)
      const lnk = found?.zone.links?.find((l) => l.id === linkId)
      if (lnk) lnk.enabled = enabled
    },
    moveAgent(entityId, goal, opts) {
      const node = world.objects.get(entityId)
      const ent = scene.entities.find((e) => e.id === entityId)
      const found = getNavZone()
      if (!node || !found) return false
      const wp = node.getWorldPosition(new Vector3())
      const path = findNavPath(found.zone, found.entity.transform, [wp.x, wp.y, wp.z], goal, { smooth: true })
      if (!path.length) return false
      const comp = ent?.components.find((c) => c.type === 'navAgent' && c.enabled !== false)
      const crossfade = opts?.crossfade ?? Number(comp?.crossfade ?? 0.2)
      const walkClip = opts?.walkClip ?? comp?.walkClip ?? ''
      const idleClip = opts?.idleClip ?? comp?.idleClip ?? ''
      navAgents.set(entityId, {
        id: entityId,
        path,
        index: 0,
        speed: Math.max(0.1, opts?.speed ?? Number(comp?.speed ?? 2.8)),
        turnSpeed: Math.max(1, Number(comp?.turnSpeed ?? 8)),
        stopDistance: Math.max(0.05, opts?.stopDistance ?? Number(comp?.stopDistance ?? 0.35)),
        walkClip: walkClip || undefined,
        idleClip: idleClip || undefined,
        crossfade,
        moving: true,
      })
      if (walkClip) world.crossfadeAnimation(entityId, walkClip, crossfade, true, 1)
      return true
    },
    stopAgent(entityId) {
      const ag = navAgents.get(entityId)
      if (!ag) return
      ag.moving = false
      ag.path = []
      if (ag.idleClip) world.crossfadeAnimation(entityId, ag.idleClip, ag.crossfade, true, 1)
    },
    getAgentPath(entityId) {
      return navAgents.get(entityId)?.path ?? []
    },
    isAgentMoving(entityId) {
      return Boolean(navAgents.get(entityId)?.moving)
    },
  }
  function register(entity: Entity, object: SceneNode, c: Component) {
    const generation = revision
    const alive = () =>
      !disposed &&
      !unloading &&
      revision === generation &&
      registered.has(entity.id) &&
      !destroying.has(entity.id)
    const scopedEvents: GameAPI['events'] = {
      on(name, handler) {
        const off = events.on(name, (payload) => {
          if (alive() && active(entity.id)) handler(payload)
        })
        let group = subscriptions.get(entity.id)
        if (!group) subscriptions.set(entity.id, (group = new Set()))
        group.add(off)
        return () => {
          group.delete(off)
          return off()
        }
      },
      emit,
    }

    const api: GameAPI = {
      entity,
      object,
      transform: object,
      params: c.params || {},
      input,
      net: netAPI,
      steam: steamAPI,
      events: scopedEvents,
      vars,
      platform,
      project,
      camera: cameraAPI,
      player: playerAPI,
      environment: environmentAPI,
      graphics: graphicsAPI,
      materials: materialsAPI,
      lights: lightsAPI,
      debug: {
        drawLine: (a, b, hex, dur) => world.drawDebugLine(a, b, hex, dur),
        drawBox: (c, sz, hex, dur) => world.drawDebugBox(c, sz, hex, dur),
      },
      particles: {
        play: (id) => world.playParticles(id),
        stop: (id) => world.stopParticles(id),
        burst: (id, count) => world.burstParticles(id, count),
        setRate: (id, rate) => world.setParticleRate(id, rate),
        setColors: (id, s, e) => world.setParticleColors(id, s, e),
      },
      billboards: {
        setFrame: (id, frame) => world.setBillboardFrame(id, frame),
        setOpacity: (id, op) => world.setBillboardOpacity(id, op),
        setSize: (id, w, h) => world.setBillboardSize(id, w, h),
      },
      decals: {
        spawn: (opts) => world.spawnDecal(opts),
        clear: () => world.clearDecals(),
        setOpacity: (id, op) => world.setDecalOpacity(id, op),
      },
      touch: touchAPI,
      services: servicesAPI,
      worldState: worldStateAPI,
      createTween: () => tweens.create(entity.id),
      get time() {
        return elapsed
      },
      find: (id) => world.objects.get(id),
      spawnPrefab: (asset, position, parent) => {
        if (!alive()) throw Error('Object expired')
        return spawnPrefab(asset, position, parent)
      },
      destroy: (id) => {
        if (alive()) destroy(id)
      },
      setActive: (id, enabled) => {
        if (alive()) setActive(id, enabled)
      },
      findByTag: (tag) =>
        scene.entities
          .filter((e) => Array.isArray(e.properties.tags) && e.properties.tags.includes(tag))
          .map((e) => e.id),
      hasTag: (id, tag) => {
        const target = scene.entities.find((e) => e.id === (id || entity.id))
        return Boolean(target && Array.isArray(target.properties.tags) && target.properties.tags.includes(tag))
      },
      addTag: (id, tag) => {
        const clean = String(tag || '').trim()
        if (!clean) return
        const target = scene.entities.find((e) => e.id === (id || entity.id))
        if (!target) return
        const list = Array.isArray(target.properties.tags) ? target.properties.tags : []
        if (!list.includes(clean)) target.properties.tags = [...list, clean]
      },
      removeTag: (id, tag) => {
        const target = scene.entities.find((e) => e.id === (id || entity.id))
        if (!target || !Array.isArray(target.properties.tags)) return
        target.properties.tags = target.properties.tags.filter((t: string) => t !== tag)
      },
      getTags: (id) => {
        const target = scene.entities.find((e) => e.id === (id || entity.id))
        return target && Array.isArray(target.properties.tags) ? [...target.properties.tags] : []
      },
      findByName: (name) => scene.entities.find((e) => e.name === name)?.id,
      findByComponent: (type) =>
        scene.entities
          .filter((e) => e.components.some((c) => c.type === type && c.enabled !== false))
          .map((e) => e.id),
      getParent: (id) => {
        const target = scene.entities.find((e) => e.id === (id || entity.id))
        return target?.parent ?? null
      },
      getChildren: (id) => {
        const pid = id || entity.id
        return scene.entities.filter((e) => e.parent === pid).map((e) => e.id)
      },
      getChildByName: (id, name) => {
        const pid = id || entity.id
        const queue = scene.entities.filter((e) => e.parent === pid)
        while (queue.length) {
          const cur = queue.shift()!
          if (cur.name === name) return cur.id
          for (const ch of scene.entities) {
            if (ch.parent === cur.id) queue.push(ch)
          }
        }
        return undefined
      },
      getComponent: (id, type) => {
        const target = scene.entities.find((e) => e.id === (id || entity.id))
        return target?.components.find((c) => c.type === type && c.enabled !== false)
      },
      component: (type) => entity.components.find((v) => v.type === type && v.enabled !== false),
      t,
      audio: {
        play: (assetId, opts) => playSound(assetId, opts),
        stop: (handle) => audioEngine.stop(handle),
        stopAll: () => audioEngine.stopAll(),
        setVolume: (handle, vol, fade) => audioEngine.setVolume(handle, vol, fade),
        setPitch: (handle, pitchVal) => audioEngine.setPitch(handle, pitchVal),
        setSemitones: (handle, st) => audioEngine.setSemitones(handle, st),
        setSpeed: (handle, sp) => audioEngine.setSpeed(handle, sp),
        setLowpass: (handle, hz) => audioEngine.setLowpass(handle, hz),
        setPosition: (handle, pos) => audioEngine.setPosition(handle, pos),
        setBusVolume: (bus, vol) => audioEngine.setBusVolume(bus, vol),
      },
      animation: {
        play: (id, clip, loop = true, speed = 1, blendTime = 0) => world.playAnimation(id, clip, loop, speed, blendTime),
        crossfade: (id, clip, duration = 0.25, loop = true, speed = 1) => world.crossfadeAnimation(id, clip, duration, loop, speed),
        stop: (id) => world.stopAnimation(id),
        pause: (id) => world.pauseAnimation(id),
        resume: (id) => world.resumeAnimation(id),
        setTime: (id, time) => world.setAnimationTime(id, time),
        clips: (id) => world.animationClips(id),
        bones: (id) => world.animationBones(id),
        getState: (id) => world.getAnimationState(id),
        getBonePosition: (id, boneName) => world.getBoneWorldPosition(id, boneName),
        setParam: (id, name, value) => {
          const st = animMachines.get(id)
          if (st) st.params[name] = value
        },
        getParam: (id, name) => animMachines.get(id)?.params[name],
        setTrigger: (id, name) => {
          const st = animMachines.get(id)
          if (st) st.triggers.add(name)
        },
        playState: (id, stateName, blendTime = 0.2) => {
          const st = animMachines.get(id)
          if (!st) return false
          const nextState = (st.machine.states || []).find((s: any) => s.name === stateName)
          if (!nextState) return false
          const prev = st.currentState
          st.currentState = nextState.name
          st.stateTime = 0
          if (nextState.clip) world.crossfadeAnimation(id, nextState.clip, blendTime, nextState.loop !== false, nextState.speed ?? 1)
          emit("animation.stateChanged", { source: id, from: prev, to: nextState.name })
          return true
        },
        getCurrentState: (id) => animMachines.get(id)?.currentState,
      },
      terrain: terrainAPI,
      nav: navAPI,
      ui: {
        get: (id) => overlay.get(id),
        open: (id) => overlay.open(id),
        close: () => overlay.close(),
        back: () => overlay.back(),
        current: () => overlay.current(),
        setBlur: (id, blurPx) => overlay.setBlur(id, blurPx),
        setStyle: (id, styles) => overlay.setStyle(id, styles),
        mount: (id, content, css) => overlay.mount(id, content, css),
        unmount: (id) => overlay.unmount(id),
        createScreen: (id, opts) => overlay.createScreen(id, opts),
        removeScreen: (id) => overlay.removeScreen(id),
        listScreens: () => overlay.listScreens(),
        createWidget: (spec) => overlay.createWidget(spec),
        updateWidget: (id, patch) => overlay.updateWidget(id, patch),
        removeWidget: (id) => overlay.removeWidget(id),
        getWidgets: (screenId) => overlay.getWidgets(screenId),
        setText: (id, text) => overlay.setText(id, text),
        setHtml: (id, html) => overlay.setHtml(id, html),
        setVisible: (id, visible) => overlay.setVisible(id, visible),
      },
      scene: {
        load: (id) => {
          if (alive()) requestScene(id)
        },
      },
      physics: {
        raycast: (origin, direction, length) => {
          if (physics) return physics.raycast(origin, direction, length)
          return world.raycast(origin, direction, length)
        },
        raycastHit: (origin, direction, length, excludeIds) => {
          const o = Array.isArray(origin) ? new Vector3().fromArray(origin) : origin
          const d = Array.isArray(direction) ? new Vector3().fromArray(direction) : direction
          if (physics?.raycastHit) return physics.raycastHit(o, d, length, excludeIds)
          const id = world.raycast(o, d, length)
          if (!id || excludeIds?.includes(id)) return undefined
          return { id, distance: length, point: [o.x, o.y, o.z], normal: [0, 1, 0] }
        },
        applyImpulse: (id, impulse) => physics?.applyImpulse?.(id, impulse),
        applyForce: (id, force) => physics?.applyForce?.(id, force),
        setVelocity: (id, velocity) => physics?.setVelocity?.(id, velocity),
        getVelocity: (id) => physics?.getVelocity?.(id),
        setGravityScale: (id, scale) => physics?.setGravityScale?.(id, scale),
      },
      saveSystem: {
        save: (slot, opts) => saveManager.save(slot, opts),
        load: (slot, opts) => saveManager.load(slot, opts),
        capture: (slot) => saveManager.capture(slot),
        exportJSON: (slot) => saveManager.exportJSON(slot),
        downloadJSON: (slot, filename) => saveManager.downloadJSON(slot, filename),
        importJSON: (json, slot, applyNow) => saveManager.importJSON(json, slot, applyNow),
        listSlots: () => saveManager.listSlots(),
        deleteSlot: (slot) => saveManager.deleteSlot(slot),
      },
      dialogue: dialogueRuntime,
      sequencer: {
        play: (id, opts) => sequencerPlayer.play(id, opts),
        stop: (id) => sequencerPlayer.stop(id),
        isPlaying: (id) => sequencerPlayer.isPlaying(id),
      },
      save: { get: (key) => platform.loadData(key), set: (key, value) => platform.saveData(key, value) },
    }
    lastApi = api
    if (c.type === 'eventGraph' || (c.type === 'rule' && c.asset)) {
      const graphAsset = project.assets.find((a) => a.id === c.asset && a.type === 'graph')
      if (graphAsset) {
        const graphData = parseEventGraph(graphAsset.data)
        lifecycle.add(entity.id, () => createEventGraphLifecycle(graphData, api, c.overrides || {}))
      }
    } else if (c.type === 'rule')
      lifecycle.add(entity.id, () => ({
        onDestroy: bindRule(c, {
          events: scopedEvents,
          vars,
          selfId: entity.id,
          sourceTags: tags,
          setActive,
          screen: (id: string, open: boolean) => {
            if (open) overlay.open(id)
            else if (overlay.current() === id) overlay.back()
          },
          loadScene: api.scene.load,
          playSound: (asset) => {
            playSound(asset)
          },
          playAnimation: (id: string, clip: string) => {
            const animation = scene.entities
              .find((e) => e.id === id)
              ?.components.find((c) => c.type === 'animation' && c.enabled !== false)
            world.playAnimation(id, clip || animation?.clip, animation?.loop ?? false, animation?.speed)
          },
          spawnPrefab: (prefab: string, at: string) => {
            const anchor = world.objects.get(at || entity.id)
            if (anchor) spawnPrefab(prefab, anchor.getWorldPosition(new Vector3()).toArray())
          },
        }),
      }))
    if (c.type === 'animation' && c.event)
      scopedEvents.on(c.event, () => world.playAnimation(entity.id, c.clip, c.loop, c.speed))
    if (c.type === 'collider' && c.trigger) volumes.push({ entity, object, params: c })
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
        eyeHeight = Number(actor.params.eyeHeight ?? 1.0)
        currentEyeHeight = eyeHeight
      } else if (c.kind === 'collectible') coins.push(actor)
      else if (c.kind === 'damage') hazards.push(actor)
      else {
        const pluginBeh = pluginHost.getBehaviorFactory(c.kind)
        lifecycle.add(entity.id, () => (pluginBeh ? pluginBeh(api, api.params) : behavior(c.kind, api)))
      }
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
      unloading = true
      lifecycle.clear()
      events.clear()
      subscriptions.clear()
      registered.clear()
      toStart.clear()
      destroying.clear()
      activeTriggers.clear()
      volumes = []
      overlay.close()
      unloading = false
      contacts.clear()
      physics?.dispose()
      physics = undefined
      player = undefined
      firstPerson = false
      yaw = 0
      pitch = 0
      speedOverride = null
      crouchOverride = null
      crouching = false
      sprinting = false
      coins = []
      hazards = []
      solids = []
      audioEngine.stopAll()
      tweens.clear()
      remoteLocalProxies.clear()
      peerProxies.clear()
      remoteNetTargets.clear()
      pendingPickupRequests.clear()
      lastSentEntityVars.clear()
      lastSentEntityActive.clear()
      netDestroyed.clear()
      netSpawned.clear()
      if (last || id !== sceneId || reset) world.load(project, id)
      sceneId = id
      scene = structuredClone(target)
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
      if (options.physics || needsPhysics(scene.entities)) {
        if (!options.physics) throw Error('This scene requires the Rapier module in this build')
        const result = await options.physics(world, scene)
        if (generation !== revision || disposed) {
          result.dispose()
          return
        }
        physics = result
      }
      for (const entity of [...scene.entities]) install(entity)
      if (!lastApi) {
        const hostEnt: Entity = scene.entities[0] ?? {
          id: '__plugin_host__',
          name: 'PluginHost',
          active: true,
          transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
          components: [],
          properties: {},
        }
        const hostObj = world.objects.get(hostEnt.id) ?? world.camera
        registered.add(hostEnt.id)
        register(hostEnt, hostObj, { type: '__plugin_bootstrap__', enabled: true } as any)
      }
      grounded = true
      verticalSpeed = 0
      jumpTime = 0
      jumpHeld = false
      if (player) groundY = (player as Actor).object.getWorldPosition(point).y
      if (firstPerson) {
        world.camera.height = 0
        world.camera.fov = Number((player as Actor | undefined)?.params.fov ?? 70)
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
      startingScene = true
      try {
        startEntities(toStart)
        emit('scene.start', sceneId)
        if (!sessionStarted || reset) {
          sessionStarted = true
          emit('game.start', sceneId)
        }
      } finally {
        startingScene = false
      }
      updateUI()
      last = performance.now()
    } finally {
      if (generation === revision) busy = false
    }
  }
  window.addEventListener(
    'mousemove',
    (e) => {
      if (!firstPerson || phase !== 'playing' || document.pointerLockElement !== world.renderer.domElement)
        return
      yaw -= e.movementX * 0.002
      pitch = Math.min(1.45, Math.max(-1.45, pitch - e.movementY * 0.002))
    },
    { signal: signal.signal },
  )
  world.renderer.domElement.addEventListener(
    'pointerdown',
    (e) => {
      if (phase !== 'playing' || ad) return
      const locked = document.pointerLockElement === world.renderer.domElement
      if (firstPerson && !locked) {
        try {
          void world.renderer.domElement.requestPointerLock()?.catch(() => {})
        } catch {
          /* a sandboxed preview may disallow pointer lock */
        }
      }
      const rect = world.renderer.domElement.getBoundingClientRect()
      const pickX = firstPerson && locked ? rect.width / 2 : e.clientX - rect.left
      const pickY = firstPerson && locked ? rect.height / 2 : e.clientY - rect.top
      const id = world.pick(pickX, pickY)
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
    if (trigger) {
      if (enter) {
        let sa = activeTriggers.get(a)
        if (!sa) activeTriggers.set(a, (sa = new Set()))
        sa.add(b)
        let sb = activeTriggers.get(b)
        if (!sb) activeTriggers.set(b, (sb = new Set()))
        sb.add(a)
      } else {
        activeTriggers.get(a)?.delete(b)
        activeTriggers.get(b)?.delete(a)
      }
    }
    const hook = trigger ? (enter ? 'onTriggerEnter' : 'onTriggerExit') : 'onCollisionEnter'
    if (enter || trigger) {
      lifecycle.call(hook, a, b)
      lifecycle.call(hook, b, a)
      const name = trigger ? (enter ? 'trigger.enter' : 'trigger.exit') : 'collision.enter'
      emit(name, { source: a, other: b })
      emit(name, { source: b, other: a })
    }
  }
  function control(dt: number) {
    if (!player || !active(player.entity.id)) return
    const actor = player,
      node = actor.object,
      move = input.move
    crouching = crouchOverride ?? (firstPerson && input.pressed('Crouch'))
    sprinting = firstPerson && !crouching && input.pressed('Sprint') && (move[0] !== 0 || move[1] !== 0)
    const baseSpeed = speedOverride ?? Number(actor.params.speed ?? 3.5)
    const mult = crouching
      ? Number(actor.params.crouchMultiplier ?? 0.55)
      : sprinting
        ? Number(actor.params.sprintMultiplier ?? 1.55)
        : 1
    const step = dt * baseSpeed * mult
    let [x, z] = move
    if (runner) z = -1
    if (firstPerson) {
      const cos = Math.cos(yaw),
        sin = Math.sin(yaw)
      ;[x, z] = [cos * x + sin * z, -sin * x + cos * z]
    }
    node.getWorldPosition(playerPoint)
    const jumping = input.pressed('Jump')
    const pressedJump = jumping && !jumpHeld
    jumpHeld = jumping
    const bounds = project.settings.bounds || [-Infinity, Infinity, -Infinity, Infinity]
    const nx = Math.min(bounds[1], Math.max(bounds[0], playerPoint.x + x * step))
    const nz = Math.min(bounds[3], Math.max(bounds[2], playerPoint.z + z * step))
    if (grounded && pressedJump)
      verticalSpeed = Math.sqrt(2 * 16 * Math.max(0, actor.params.jumpHeight ?? 0.8))
    verticalSpeed = Math.max(-40, verticalSpeed - 16 * dt)
    const movement = physics?.moveCharacter?.(actor.entity.id, [
      nx - playerPoint.x,
      verticalSpeed * dt,
      nz - playerPoint.z,
    ])
    let next: Set<string>
    if (movement) {
      playerPoint.add(point.fromArray(movement.delta))
      grounded = movement.grounded
      if (grounded || (verticalSpeed > 0 && movement.delta[1] + 0.001 < verticalSpeed * dt)) verticalSpeed = 0
      next = new Set(movement.contacts)
    } else {
      if (!jumpTime && pressedJump) jumpTime = dt
      if (jumpTime > 0) {
        const fraction = Math.min(1, jumpTime / 0.58)
        playerPoint.y = groundY + 4 * fraction * (1 - fraction) * Number(actor.params.jumpHeight ?? 0.8)
        jumpTime = fraction === 1 ? 0 : jumpTime + dt
      }
      const hitX = x ? blocked(nx, playerPoint.z, actor) : undefined
      if (!hitX) playerPoint.x = nx
      const hitZ = z ? blocked(playerPoint.x, nz, actor) : undefined
      if (!hitZ) playerPoint.z = nz
      next = new Set([hitX, hitZ].filter((id): id is string => !!id))
    }
    for (const id of next) if (!contacts.has(id)) contact(actor.entity.id, id, true, false)
    point.copy(playerPoint)
    node.parent?.worldToLocal(point)
    node.position.copy(point)
    if (firstPerson) {
      const targetEye = crouching ? eyeHeight * 0.62 : eyeHeight
      currentEyeHeight += (targetEye - currentEyeHeight) * Math.min(1, dt * 12)
      let sx = 0,
        sy = 0
      if (shakeRemaining > 0) {
        shakeRemaining = Math.max(0, shakeRemaining - dt)
        const falloff = shakeDuration > 0 ? shakeRemaining / shakeDuration : 0
        const mag = shakeIntensity * falloff
        sx = (Math.random() - 0.5) * 2 * mag
        sy = (Math.random() - 0.5) * 2 * mag
        if (shakeRemaining === 0) shakeIntensity = 0
      }
      world.camera.position.set(playerPoint.x + sx, playerPoint.y + currentEyeHeight + sy, playerPoint.z)
      world.camera.rotation.set(pitch, yaw, 0)
    }
    if (runner) {
      world.camera.position.set(playerPoint.x, playerPoint.y + 6, playerPoint.z + 7)
      world.camera.lookAt(new Vector3(playerPoint.x, 0, playerPoint.z - 2))
    }
    if (!firstPerson && (x || z)) node.rotation.y = Math.atan2(x, z)
    if (!physics)
      for (const volume of volumes) {
        if (!active(volume.entity.id) || volume.entity.id === actor.entity.id) continue
        volume.object.getWorldPosition(point)
        const size = volume.params.size ?? volume.entity.transform.scale
        if (
          Math.abs(playerPoint.x - point.x) > size[0] / 2 + 0.22 ||
          Math.abs(playerPoint.y - point.y) > size[1] / 2 + 0.45 ||
          Math.abs(playerPoint.z - point.z) > size[2] / 2 + 0.22
        )
          continue
        next.add(volume.entity.id)
        if (!contacts.has(volume.entity.id)) contact(actor.entity.id, volume.entity.id, true, true)
      }
    for (const coin of coins) {
      if (!visible(coin.object)) continue
      coin.object.getWorldPosition(point)
      if (Math.hypot(playerPoint.x - point.x, playerPoint.z - point.z) > (coin.params.radius ?? 0.65))
        continue
      const sync = coin.entity.components.find(c => c.type === 'networkSync' && c.enabled !== false)
      if (net.connected && sync?.owner === 'host' && sync.syncActive && !net.isHost) {
        if (performance.now() - (pendingPickupRequests.get(coin.entity.id) ?? -Infinity) > 650) {
          pendingPickupRequests.set(coin.entity.id, performance.now())
          net.rpc('net:collect-request', { id: coin.entity.id }, 'host')
        }
        continue
      }
      if (!active(coin.entity.id)) continue
      vars.score += Number(coin.params.points ?? coin.params.value ?? 1)
      contact(actor.entity.id, coin.entity.id, true, true)
      setActive(coin.entity.id, false)
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
      if (
        !next.has(id) &&
        (hazards.some((h) => h.entity.id === id) || volumes.some((v) => v.entity.id === id))
      )
        contact(actor.entity.id, id, false, true)
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
        for (const [id, others] of activeTriggers) {
          for (const other of others) lifecycle.call('onTriggerStay', id, other, 1 / 60)
        }
        if (lastApi) { pluginHost.start(lastApi); pluginHost.fixedUpdate(1 / 60, lastApi) }
        lifecycle.call('onFixedUpdate', undefined, 1 / 60)
      }
      if (phase === 'playing' && !busy) {
        const fwd = cameraForward()
        audioEngine.updateListener(world.camera.position.toArray(), fwd.toArray())
        tweens.update(dt)
        sequencerPlayer.update(dt)
      if (lastApi) { pluginHost.start(lastApi); pluginHost.update(dt, lastApi) }
      input.pollGamepads()
      // Smoothly interpolate remote NetworkSync entities
      const interpAlpha = Math.min(1, dt * 14)
      for (const [eid, tgt] of remoteNetTargets.entries()) {
        const obj = world.objects.get(eid)
        if (!obj) continue
        obj.position.x += (tgt.pos[0] - obj.position.x) * interpAlpha
        obj.position.y += (tgt.pos[1] - obj.position.y) * interpAlpha
        obj.position.z += (tgt.pos[2] - obj.position.z) * interpAlpha
        const lerpAng = (a: number, b: number, t: number) => a + ((((b - a) % (Math.PI * 2)) + Math.PI * 3) % (Math.PI * 2) - Math.PI) * t
        obj.rotation.x = lerpAng(obj.rotation.x, tgt.rot[0], interpAlpha)
        obj.rotation.y = lerpAng(obj.rotation.y, tgt.rot[1], interpAlpha)
        obj.rotation.z = lerpAng(obj.rotation.z, tgt.rot[2], interpAlpha)
        if (tgt.scale) {
          obj.scale.x += (tgt.scale[0] - obj.scale.x) * interpAlpha
          obj.scale.y += (tgt.scale[1] - obj.scale.y) * interpAlpha
          obj.scale.z += (tgt.scale[2] - obj.scale.z) * interpAlpha
        }
      }
      if (net.connected && (net.mode === "client-server-ws" || net.mode === "p2p-webrtc" || net.mode === "steam-p2p")) {
        const tickInterval = 1 / Math.max(5, Math.min(60, Number(mpCfg.tickRate || 20)))
        netSyncAccum += dt
        if (netSyncAccum >= tickInterval) {
          netSyncAccum = 0
          const snaps: NetEntitySnapshot[] = []
          let syncVars = false
          for (const ent of scene.entities) {
            const nsc = ent.components.find((c) => c.type === "networkSync" && c.enabled !== false)
            if (!nsc) continue
            const owned = ((nsc.owner || 'host') === 'host' && net.isHost) || nsc.owner === 'local' || nsc.owner === net.peerId
            if (!owned) continue
            const obj = world.objects.get(ent.id)
            if (!obj || !Number.isFinite(obj.position.x) || !Number.isFinite(obj.position.y) || !Number.isFinite(obj.position.z)) continue
            const snap: NetEntitySnapshot = {
              id: ent.id,
              pos: [obj.position.x, obj.position.y, obj.position.z],
              rot: [obj.rotation.x, obj.rotation.y, obj.rotation.z],
              scale: [obj.scale.x, obj.scale.y, obj.scale.z],
            }
            if (nsc.syncActive) {
              const prev = lastSentEntityActive.get(ent.id)
              if (prev !== ent.active) {
                snap.active = ent.active
                lastSentEntityActive.set(ent.id, ent.active)
              }
            }
            const requested = syncPaths(nsc)
            if (requested.length) {
              let cache = lastSentEntityVars.get(ent.id)
              if (!cache) lastSentEntityVars.set(ent.id, (cache = {}))
              const fields: Record<string, unknown> = {}
              let fieldBytes = 0
              for (const path of requested) {
                const safe = safeSyncValue(readSyncPath(ent, path))
                if (safe === undefined) continue
                const serialized = JSON.stringify(safe)
                if (cache[path] !== serialized && fieldBytes + serialized.length + path.length < 24000) {
                  fields[path] = safe
                  fieldBytes += serialized.length + path.length
                  cache[path] = serialized
                }
              }
              if (Object.keys(fields).length) snap.fields = fields
            }
            if (nsc.syncAnimation) {
              const sm = animMachines.get(ent.id)
              if (sm) snap.animState = sm.currentState
              const curClip = world.getAnimationState(ent.id)?.clip
              if (curClip) snap.animClip = curClip
            }
            if (nsc.syncVariables && net.isHost) syncVars = true
            const keyList = new Set<string>()
            for (const path of syncPaths(nsc)) if (path.startsWith('properties.') && !path.slice(11).includes('.')) keyList.add(path.slice(11))
            if (keyList.size > 0 && ent.properties) {
              let sentCache = lastSentEntityVars.get(ent.id)
              if (!sentCache) {
                sentCache = {}
                lastSentEntityVars.set(ent.id, sentCache)
              }
              const delta: Record<string, any> = {}
              let hasDelta = false, legacyBytes = 0
              for (const k of keyList) {
                if (!(k in ent.properties)) continue
                const val = safeSyncValue(ent.properties[k])
                if (val === undefined) continue
                const ser = JSON.stringify(val)
                if (sentCache[k] !== ser && legacyBytes + ser.length + k.length < 16000) {
                  sentCache[k] = ser
                  delta[k] = val
                  legacyBytes += ser.length + k.length
                  hasDelta = true
                }
              }
              if (hasDelta) snap.vars = delta
            }
            snaps.push(snap)
          }
          if (snaps.length) net.sendSnapshot(snaps)
          if (syncVars) net.sendWorldState(vars)
        }
      }
      stepAnimMachines(dt)
      lifecycle.call('onUpdate', undefined, dt)
        world.updateAnimations(dt)
        stepNavAgents(dt)
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
        audioEngine.resume()
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
    tweens.clear()
    audioEngine.dispose()
    pluginHost.dispose(lastApi)
    lifecycle.clear()
    events.clear()
    physics?.dispose()
    touchCtrl.dispose()
    net.disconnect()
    steam.dispose()
    overlay.dispose?.()
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
    if (!mode && !project.screens?.some((s) => s.phase === 'menu')) resume()
    autoConnectMultiplayer()
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
