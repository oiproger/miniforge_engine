import type { SceneNode, Vector3 } from '../../graphics/src/scene'
import type { Component, Entity, Project, Scene, Vec3 } from '../../project-schema/src'
import type { PostProcessOptions, ProceduralSkyOptions, SkyboxFaces, RenderWorld } from '../../graphics/src'
import type { PlatformAdapter } from '../../platform-sdk/src'
import type { Events, ScriptLifecycle } from './lifecycle'
import type { Input } from './input'
import type { LanDiscoveredGame, LanServerInfo, MultiplayerMode, NetChatMessage, NetConnectOptions, NetPeer, NetStats } from './net'
import type { SteamLobby, SteamLogEntry, SteamUserInfo } from './steam'
import type { AudioBus, AudioPlayOptions } from './audio'
import type { Tween } from './tween'
import type { SaveSnapshot, SaveResult, SaveOptions, LoadOptions } from './saveSystem'
import type { TouchAPI, TouchPointerState, TouchEmulationOptions } from './touch'
import type { DialogueAPI } from './dialogue'
import type { SequencerAPI } from './sequencer'
export type { DialogueAPI } from './dialogue'
export type { SequencerAPI } from './sequencer'
export type { TouchAPI, TouchPointerState, TouchEmulationOptions } from './touch'

export type { Tween, PropertyTweener, TweenTrans, TweenEase } from './tween'
export type { SaveSnapshot, SaveResult, SaveOptions, LoadOptions } from './saveSystem'

export type { PostProcessOptions, ProceduralSkyOptions, SkyboxFaces } from '../../graphics/src'

export interface RaycastHit {
  id: string
  distance: number
  point: Vec3
  normal: Vec3
}

export interface FlashlightOptions {
  enabled: boolean
  color?: string
  intensity?: number
  range?: number
  angle?: number
}

export interface PhysicsSession {
  moveCharacter?(id: string, delta: Vec3): { delta: Vec3; grounded: boolean; contacts: string[] } | undefined
  add(entity: Entity): void
  remove(id: string): void
  setActive(id: string, active: boolean): void
  step(dt: number, contact: (a: string, b: string, enter: boolean, trigger: boolean) => void): void
  raycast(origin: Vector3, direction: Vector3, length: number): string | undefined
  raycastHit?(origin: Vector3, direction: Vector3, length: number, excludeIds?: string[]): RaycastHit | undefined
  applyImpulse?(id: string, impulse: Vec3): void
  applyForce?(id: string, force: Vec3): void
  setVelocity?(id: string, velocity: Vec3): void
  getVelocity?(id: string): Vec3 | undefined
  setGravityScale?(id: string, scale: number): void
  teleportBody?(id: string, position: Vec3): void
  dispose(): void
}

export interface CameraAPI {
  /** Current world position of the active camera. */
  readonly position: Vector3
  /** Current Euler rotation [pitch, yaw, roll] in radians. */
  readonly rotation: Vector3
  /** Normalized forward look vector in world space. */
  readonly forward: Vector3
  /** Normalized right vector in world space. */
  readonly right: Vector3
  /** Horizontal look angle (radians) for first-person controller. */
  yaw: number
  /** Vertical look angle (radians) for first-person controller. */
  pitch: number
  /** Vertical field of view in degrees. */
  fov: number
  /** Camera eye height above player pivot. */
  eyeHeight: number
  /** Point the camera at a world position. */
  lookAt(target: Vec3 | Vector3): void
  /** Directly set first-person yaw and pitch in radians. */
  setLook(yaw: number, pitch: number): void
  /** Trigger a decaying camera shake effect. */
  shake(intensity: number, duration?: number): void
  /** Project a 3D world position to 2D canvas CSS pixels and top-left-based percentages for HUD placement. */
  worldToScreen(position: Vec3 | Vector3): ScreenPoint
  /** Unproject a 2D canvas CSS pixel coordinate into a normalized 3D world ray. */
  screenToRay(x: number, y: number): WorldRay
}

export interface ScreenPoint {
  x: number
  y: number
  /** Horizontal percent of canvas width. Offscreen values are unclamped. */
  xPercent: number
  /** Vertical percent of canvas height, increasing downwards. */
  yPercent: number
  visible: boolean
  depth: number
}

export interface WorldRay {
  origin: Vec3
  direction: Vec3
}

export interface ParticlesAPI {
  play(id: string): void
  stop(id: string): void
  burst(id: string, count?: number): void
  setRate(id: string, rate: number): void
  setColors(id: string, startHex: string, endHex?: string): void
}

export interface BillboardsAPI {
  setFrame(id: string, frame: number): void
  setOpacity(id: string, opacity: number): void
  setSize(id: string, width: number, height: number): void
}

export interface DecalSpawnOptions {
  position: Vec3
  normal?: Vec3
  size?: [number, number]
  color?: string
  opacity?: number
  texture?: string
  lifetime?: number
  blendMode?: 'alpha' | 'additive'
}

export interface DecalsAPI {
  spawn(options: DecalSpawnOptions): void
  clear(): void
  setOpacity(id: string, opacity: number): void
}

export interface PlayerAPI {
  /** Entity ID of the active player actor, if present. */
  readonly id: string | undefined
  /** Current world position of the player. */
  readonly position: Vec3
  /** Whether the player is standing on ground. */
  readonly isGrounded: boolean
  /** Whether the player is currently crouching. */
  readonly isCrouching: boolean
  /** Whether the player is currently sprinting. */
  readonly isSprinting: boolean
  /** Base movement speed. */
  speed: number
  /** Seamlessly teleport the player and optionally rotate look yaw/pitch (ideal for non-Euclidean shifts). */
  teleport(position: Vec3, yawDelta?: number, pitchDelta?: number): void
  /** Override base walking speed. */
  setSpeed(speed: number): void
  /** Toggle crouch state programmatically. */
  setCrouch(crouching: boolean): void
}

export interface EnvironmentAPI {
  /** Dynamically adjust fog density and color (for DayCycle or anomalies). */
  setFog(density: number, color?: string): void
  /** Configure LittleJS distance fog fade and depth-fog mode. */
  setFogFade(start: number, end: number, depthMode?: boolean): void
  /** Change scene clear background color. */
  setBackground(hex: string): void
  /** Change ambient lighting intensity and optional tint color. */
  setAmbient(intensity: number, color?: string): void
  /** Configure hemisphere ground bounce color (LittleJS ambientGroundColor). */
  setAmbientGround(hex: string, intensity?: number): void
  /** Change directional sun direction, tint color, and intensity. */
  setSun(direction: Vec3, color?: string, intensity?: number): void
  /** Adjust global exposure multiplier. */
  setExposure(value: number): void
  /** Configure simple gradient Sky Dome colors. */
  setSky(topColor: string, horizonColor?: string, bottomColor?: string, enabled?: boolean): void
  /** Configure procedural sky with animated clouds, sun, and stars. */
  setProceduralSky(options: ProceduralSkyOptions): void
  /** Configure a 6-sided cubemap Skybox with per-face textures or colors. */
  setSkyboxFaces(faces: SkyboxFaces): void
  /** Apply a saved skybox asset by ID (or null to clear). */
  setSkyAsset(assetId: string | null): void
}

export interface GraphicsAPI {
  /** Configure WebGL2 post-processing (AO, DoF, Bloom, ACES, Vignette, Chromatic, Grain, Scanlines). */
  setPostProcess(options: PostProcessOptions): void
  /** Read current post-processing configuration. */
  getPostProcess(): Required<PostProcessOptions>
  /** Configure directional shadows, shadow range, and soft contact shadow height. */
  setShadows(enabled: boolean, range?: number, softShadowHeight?: number): void
  /** Toggle global smooth shading on newly built geometry. */
  setSmoothShading(enabled: boolean): void
  /** Bake static lighting & reflection probes globally or for a specific Bake Zone entity ID. */
  bakeLighting(zoneId?: string): Promise<void>
  /** Configure global cubemap reflections ('off' | 'baked' | 'realtime'). */
  setReflections(mode: 'off' | 'baked' | 'realtime', resolution?: number, interval?: number): void
  /** Force re-capture of a specific Bake Zone's reflection cubemap. */
  updateZoneProbe(zoneId: string): void
  /** Configure shadow softness, bias, and automatic shadow-center camera tracking. */
  setShadowParams(opts: { softness?: number; bias?: number; followCamera?: boolean }): void
  /** Configure anisotropy (1..16), mipmaps, frustum culling, and transparent sorting. */
  setRenderQuality(opts: { anisotropy?: number; mipmaps?: boolean; frustumCulling?: boolean; sortTransparent?: boolean }): void
  /** Scale internal WebGL render resolution (0.4 .. 1.0) for higher FPS on iGPU / HiDPI screens. */
  setResolutionScale(scale: number): void
  /** Set global runtime distance culling threshold in meters (0 = disabled). */
  setCullDistance(distance: number): void
  /** Configure runtime distance culling for lights & particles and distant glTF animation throttling. */
  setOptimization(opts: { lightCullDistance?: number; particleCullDistance?: number; animationThrottle?: boolean }): void
}

export interface DebugAPI {
  /** Draw a 3D debug line for one frame or durationSec seconds. */
  drawLine(from: Vec3, to: Vec3, color?: string, durationSec?: number): void
  /** Draw a 3D debug box for one frame or durationSec seconds. */
  drawBox(center: Vec3, size: Vec3, color?: string, durationSec?: number): void
}

export interface MaterialsAPI {
  /** Apply an existing material asset to an entity at runtime. */
  set(entityId: string, materialAssetId: string): void
  /** Dynamically tint or fade an entity's color and opacity. */
  setColor(entityId: string, hex: string, opacity?: number): void
  /** Dynamically adjust an entity's emissive color and glow intensity. */
  setEmissive(entityId: string, hex: string, intensity?: number): void
  /** Apply or clear a custom GLSL shader asset on an entity at runtime. */
  setShader(entityId: string, shaderAssetId: string | null): void
  /** Set a custom GLSL shader uniform at runtime (target can be an entity ID, shader asset ID, or shader name; supports float, bool, vec2/vec3/vec4 arrays, or #rrggbb hex color). */
  setShaderUniform(target: string, name: string, value: number | boolean | number[] | string): void
  /** Batch-update multiple custom GLSL shader uniforms at runtime. */
  setShaderUniforms(target: string, uniforms: Record<string, number | boolean | number[] | string>): void
  /** Create a new material asset at runtime and return its ID. */
  create(name: string, properties: Record<string, any>): string
  /** Query surface material & terrain layer under any world position (works on both Terrain and any 3D model/mesh). */
  getSurfaceAt(position: Vec3 | Vector3, direction?: Vec3, maxDist?: number): SurfaceSample | undefined
}

export interface TerrainLayerSample {
  entityId: string
  height: number
  layerIndex: number
  materialId: string
  materialName: string
  weights: number[]
}

export interface SurfaceSample {
  entityId: string
  entityName: string
  materialId: string
  materialName: string
  tags: string[]
  point: Vec3
  normal: Vec3
  isTerrain: boolean
  layerIndex?: number
}

export interface TerrainAPI {
  /** Sample the dominant terrain material layer & exact ground height at world (x, z). */
  getLayerAt(x: number, z: number): TerrainLayerSample | undefined
}

export interface LightsAPI {
  /** Set point or spot light intensity on an entity. */
  setIntensity(id: string, intensity: number): void
  /** Set point or spot light tint color on an entity. */
  setColor(id: string, hex: string): void
  /** Set point or spot light range on an entity. */
  setRange(id: string, range: number): void
  /** Set volumetric fog glow intensity & falloff on a point/spot light. */
  setGlow(id: string, glow: number, falloff?: number): void
  /** Toggle optional screen-space Sun Rays (God Rays) on any light entity. */
  setSunRays(id: string, enabled: boolean, intensity?: number, decay?: number): void
  /** Assign a Spot Light entity as the active shadow-casting light (or null for sun). */
  setShadowLight(id: string | null): void
  /** Assign a projection texture (gobo/cookie) to a Light3D (or null to clear). */
  setGel(id: string, textureAssetId: string | null): void
  /** Toggle a light entity on/off. */
  setEnabled(id: string, enabled: boolean): void
  /** Control the built-in camera-mounted flashlight spot light. */
  setFlashlight(options: FlashlightOptions): void
}

export interface ServicesAPI {
  /** Register a shared game service (e.g., WorldState, JobManager, DayCycle). */
  register<T>(name: string, service: T): T
  /** Retrieve a registered shared service by name. */
  get<T = any>(name: string): T | undefined
  /** Check if a shared service is registered. */
  has(name: string): boolean
}

export interface WorldStateAPI {
  /** Read a persistent world-state value that survives scene transitions. */
  get<T = any>(key: string, fallback?: T): T
  /** Write a persistent world-state value. */
  set(key: string, value: unknown): void
  /** Return a shallow snapshot of all world-state keys. */
  all(): Record<string, unknown>
  /** Persist current world state to storage under a named slot. */
  save(slot?: string): Promise<void>
  /** Restore world state from storage under a named slot. */
  load(slot?: string): Promise<boolean>
}

export interface SaveSystemAPI {
  /** Capture and save full game state (scene, player, vars, worldState, entities) locally and optionally to platform cloud. */
  save(slot?: string, options?: SaveOptions): Promise<SaveResult>
  /** Load full game state from slot (merging/picking newest between local and platform cloud). */
  load(slot?: string, options?: LoadOptions): Promise<boolean>
  /** Capture a snapshot object without writing to storage. */
  capture(slot?: string): SaveSnapshot
  /** Export a save slot (or live state) as formatted JSON text. */
  exportJSON(slot?: string): string
  /** Download a save slot as a .json file directly from the game. */
  downloadJSON(slot?: string, filename?: string): void
  /** Import a JSON save string into a slot and optionally apply immediately. */
  importJSON(jsonText: string, slot?: string, applyNow?: boolean): Promise<boolean>
  /** Return saved slot names stored locally. */
  listSlots(): string[]
  /** Delete a save slot locally and in platform cloud. */
  deleteSlot(slot?: string): Promise<void>
}

export interface GameAPI {
  /** Current entity metadata from the scene. */
  entity: Entity
  /** SceneNode transform of this entity. */
  object: SceneNode
  /** Alias for object. */
  transform: SceneNode
  /** Per-instance script parameters defined in Inspector. */
  params: Record<string, any>
  /** Keyboard, virtual HUD, and pointer input state. */
  input: Input
  /** Multiplayer networking, RPCs, lobbies, and local split-screen player input. */
  net: NetAPI
  /** Steamworks SDK: Lobbies, Steam P2P, Achievements, Cloud Saves, and Rich Presence. */
  steam: SteamAPI
  /** Scoped event bus for publishing and subscribing to game events. */
  events: Pick<Events, 'on' | 'emit'>
  /** Platform adapter (Web, Yandex, Poki). */
  platform: PlatformAdapter
  /** Shared mutable round variables synced to HUD bindings. */
  vars: Record<string, any>
  /** Simulation time in seconds. */
  time: number
  /** Full project definition. */
  project: Project
  /** Camera state, look vectors, FOV, and shake controls. */
  camera: CameraAPI
  /** First-person / top-down player controls and seamless teleportation. */
  player: PlayerAPI
  /** Dynamic fog, sky dome, sun, ambient, hemisphere ground, and exposure controls. */
  environment: EnvironmentAPI
  /** Post-processing (AO, DoF, Bloom, ACES, Vignette, Chromatic, Grain) and shadow controls. */
  graphics: GraphicsAPI
  /** Runtime material, color, emissive, and shader controls on scene entities. */
  materials: MaterialsAPI
  /** Runtime control over entity Light3D components and camera flashlight. */
  lights: LightsAPI
  /** 3D debug line & box overlay drawing. */
  debug: DebugAPI
  /** 3D particle emitter playback, bursts, and color controls. */
  particles: ParticlesAPI
  /** 3D billboard spritesheet frame, opacity, and size controls. */
  billboards: BillboardsAPI
  /** Dynamic 3D surface decal spawning (footprints, stains, puddles) and opacity controls. */
  decals: DecalsAPI
  /** Multi-touch virtual joysticks, buttons, and Godot-style Mouse <-> Touch emulation. */
  touch: TouchAPI
  /** Cross-script service locator for managers like DayCycle or JobManager. */
  services: ServicesAPI
  /** Persistent world state that survives scene transitions and saves to storage. */
  worldState: WorldStateAPI
  /** Create a Godot 4-style chainable Tween automatically updated by the runtime and cleaned up on destroy. */
  createTween(): Tween
  /** Find a SceneNode by entity ID. */
  find(id: string): SceneNode | undefined
  /** Instantiate a prefab asset into the live scene and return its root entity ID. */
  spawnPrefab(assetId: string, position?: Vec3, parent?: string | null): string
  /** Destroy an entity and its subtree. */
  destroy(id: string): void
  /** Enable or disable an entity subtree (invoking onEnable/onDisable). */
  setActive(id: string, active: boolean): void
  /** Return IDs of all entities carrying a given tag. */
  findByTag(tag: string): string[]
  /** Check whether an entity carries a given tag. */
  hasTag(id: string | undefined, tag: string): boolean
  /** Add a tag to an entity at runtime. */
  addTag(id: string | undefined, tag: string): void
  /** Remove a tag from an entity at runtime. */
  removeTag(id: string | undefined, tag: string): void
  /** Return all tags currently assigned to an entity. */
  getTags(id?: string): string[]
  /** Find the first entity ID matching an exact name. */
  findByName(name: string): string | undefined
  /** Return IDs of all entities carrying an enabled component of the given type. */
  findByComponent(type: string): string[]
  /** Return the parent entity ID of an entity (or null if root). */
  getParent(id?: string): string | null
  /** Return direct child entity IDs of an entity. */
  getChildren(id?: string): string[]
  /** Find a child (direct or nested) of an entity by name. */
  getChildByName(id: string, name: string): string | undefined
  /** Find an enabled component of a given type on any entity by ID. */
  getComponent(id: string, type: string): Component | undefined
  /** Find an enabled component of a given type on this entity. */
  component(type: string): Component | undefined
  /** GLTF skeletal & node animation controls (crossfade, timeline, bone world positions). */
  animation: {
    play(id: string, clip?: string, loop?: boolean, speed?: number, blendTime?: number): boolean
    crossfade(id: string, clip: string, duration?: number, loop?: boolean, speed?: number): boolean
    stop(id: string): void
    pause(id: string): void
    resume(id: string): void
    setTime(id: string, time: number): void
    clips(id: string): string[]
    bones(id: string): string[]
    getState(id: string): { clip: string; time: number; duration: number; playing: boolean; speed: number; loop: boolean } | undefined
    getBonePosition(id: string, boneName: string): Vec3 | undefined
    setParam(id: string, name: string, value: number | boolean): void
    getParam(id: string, name: string): number | boolean | undefined
    setTrigger(id: string, name: string): void
    playState(id: string, stateName: string, blendTime?: number): boolean
    getCurrentState(id: string): string | undefined
  }
  /** Terrain height & multi-material layer queries (ideal for footstep sounds). */
  terrain: TerrainAPI
  /** NavGrid A* pathfinding, dynamic obstacles, Off-Mesh Links, and NPC NavAgent steering. */
  nav: {
    findPath(start: Vec3, goal: Vec3, opts?: { smooth?: boolean; zoneId?: string }): Vec3[]
    bake(zoneId?: string): { walkableCount: number; blockedCount: number; total: number } | undefined
    setObstacle(center: Vec3, radius: number, blocked: boolean, zoneId?: string): void
    setAreaCost(center: Vec3, radius: number, cost: number, zoneId?: string): void
    setLinkEnabled(linkId: string, enabled: boolean, zoneId?: string): void
    moveAgent(entityId: string, goal: Vec3, opts?: { speed?: number; stopDistance?: number; walkClip?: string; idleClip?: string; crossfade?: number }): boolean
    stopAgent(entityId: string): void
    getAgentPath(entityId: string): Vec3[]
    isAgentMoving(entityId: string): boolean
  }
  /** 3D Web Audio mixer with buses, loops, fades, and spatial panning. */
  audio: {
    play(assetId?: string, options?: AudioPlayOptions): string
    stop(handle: string): void
    stopAll(): void
    setVolume(handle: string, volume: number, fadeSeconds?: number): void
    setPitch(handle: string, pitch: number): void
    setSemitones(handle: string, semitones: number): void
    setSpeed(handle: string, speed: number): void
    setLowpass(handle: string, frequencyHz: number): void
    setPosition(handle: string, position: Vec3): void
    setBusVolume(bus: AudioBus, volume: number): void
  }
  /** HUD screens, navigation stack, backdrop blur, and custom DOM widget mounting. */
  ui: {
    get(id: string): HTMLElement | undefined
    open(id: string): boolean
    close(): boolean
    back(): boolean
    /** ID of the active screen, including a menu or gameplay HUD. */
    current(): string | undefined
    /** Whether a widget is shown on the active screen and has no hidden parent. */
    isWidgetVisible(id: string): boolean
    /** Set backdrop blur (in px) on a HUD element or mounted widget. */
    setBlur(id: string, blurPx: number): void
    /** Dynamically patch CSS properties on a HUD element. */
    setStyle(id: string, styles: Partial<CSSStyleDeclaration>): void
    /** Mount a custom HTML string or HTMLElement inside the overlay Shadow DOM (e.g., PhoneUI). */
    mount(id: string, content: string | HTMLElement, css?: string): HTMLElement
    /** Remove a previously mounted custom widget. */
    unmount(id: string): void
    /** Dynamically create or update a UI screen (window/HUD) at runtime. */
    createScreen(
      id: string,
      opts?: {
        name?: string
        phase?: 'menu' | 'playing' | 'paused' | 'results' | 'window'
        background?: string
        modal?: boolean
        backdropBlur?: number
        open?: boolean
      },
    ): string
    /** Remove a dynamically created or authored UI screen and its widgets. */
    removeScreen(id: string): boolean
    /** List all available UI screens. */
    listScreens(): Array<{ id: string; name: string; phase: string; modal?: boolean }>
    /** Dynamically create a basic HUD widget (label, button, bar, panel, image, html) on a screen. */
    createWidget(spec: {
      id?: string
      type: string
      text?: string
      x?: number
      y?: number
      screen?: string
      anchor?: string
      action?: string
      target?: string
      color?: string
      background?: string
      width?: number
      height?: number
      value?: number
      max?: number
      html?: string
      visible?: boolean
      [key: string]: any
    }): string
    /** Move a widget in HUD percentages relative to its anchor. */
    setPosition(id: string, x: number, y: number): boolean
    setSize(id: string, width: number, height: number): boolean
    setValue(id: string, value: number): boolean
    setProgressMax(id: string, max: number): boolean
    setOpacity(id: string, opacity: number): boolean
    setColors(id: string, color: string, background: string): boolean
    /** Bind a counter or progress bar to api.vars and clear an explicit numeric override. */
    bindValue(id: string, variable: string): boolean
    /** Read the explicit or bound numeric value, including widgets on closed screens. */
    getValue(id: string): number | undefined
    hasWidget(id: string): boolean
    /** Patch widget properties. Reapplying the same values has no effect. */
    updateWidget(id: string, patch: Record<string, any>): boolean
    /** Remove a UI widget by ID and redraw. */
    removeWidget(id: string): boolean
    /** List UI widgets (optionally filtered by screen ID). */
    getWidgets(screenId?: string): Array<Record<string, any>>
    /** Update text of a UI widget or mounted DOM element. */
    setText(id: string, text: string): boolean
    /** Update innerHTML of a mounted widget or html UI element. */
    setHtml(id: string, html: string): boolean
    /** Show or hide a UI widget or mounted DOM element. */
    setVisible(id: string, visible: boolean): boolean
  }
  /** Branching NPC Dialogue & Quest state manager. */
  dialogue: DialogueAPI
  /** Keyframe Cutscene & Timeline Sequencer player. */
  sequencer: SequencerAPI
  /** Scene switching. */
  scene: { load(id: string): void }
  /** Physics raycasting and rigid-body force/impulse/gravity controls. */
  physics: {
    raycast(origin: Vector3, direction: Vector3, length: number): string | undefined
    raycastHit(
      origin: Vector3 | Vec3,
      direction: Vector3 | Vec3,
      length: number,
      excludeIds?: string[],
    ): RaycastHit | undefined
    applyImpulse(id: string, impulse: Vec3): void
    applyForce(id: string, force: Vec3): void
    setVelocity(id: string, velocity: Vec3): void
    getVelocity(id: string): Vec3 | undefined
    setGravityScale(id: string, scale: number): void
  }
  /** Full game-state Save/Load system with JSON export/import and Yandex/Poki cloud sync. */
  saveSystem: SaveSystemAPI
  /** Async key-value persistence via platform storage. */
  save: { set(key: string, value: unknown): Promise<void>; get(key: string): Promise<any> }
  /** Localized string lookup with parameter interpolation. */
  t(key: string, params?: Record<string, unknown>): string
}

export interface GameOptions {
  platform: PlatformAdapter
  scripts?: Record<string, any>
  onEvent?: (name: string, data?: unknown) => void
  physics?: (view: RenderWorld, scene: Scene) => Promise<PhysicsSession>
  performance?: boolean
  /** True only for an editor preview; prevents debug-only Steam simulation in shipped games. */
  preview?: boolean
}

export interface GameSession {
  pause(): void
  resume(): void
  dispose(): void
  readonly stats: {
    fps: number
    frameTime: number
    drawCalls: number
    triangles: number
    textures: number
    width: number
    height: number
    sdkMs: number
    readyMs: number
  }
}

export type ScriptFactory = (api: GameAPI) => ScriptLifecycle

export interface NetAPI {
  connect(opts?: NetConnectOptions): Promise<boolean>
  disconnect(): void
  rpc(name: string, payload?: any, target?: "all" | "others" | "host" | string): void
  onRpc(name: string, handler: (payload: any, senderPeerId: string) => void): () => void
  onPeerJoin(handler: (peerId: string) => void): () => void
  onPeerLeave(handler: (peerId: string) => void): () => void
  getPeers(): NetPeer[]
  getStats(): NetStats
  isHost(): boolean
  peerId(): string
  room(): string
  mode(): MultiplayerMode
  setSimulation(latencyMs: number, packetLossPct: number): void
  getLocalPlayerMove(playerIndex: number): [number, number]
  getLocalPlayerAction(playerIndex: number, action: "jump" | "interact" | "attack"): boolean
  /** Set a synchronized per-entity variable (writes entity.properties[key] and syncs delta to remote peers). */
  setEntityVar(entityId: string, key: string, value: any): void
  /** Write a field selected in Network Sync's Sync Paths (e.g. components.light.intensity). */
  setSyncedField(entityId: string, path: string, value: unknown): boolean
  /** Read a configured field without modifying it. */
  getSyncedField(entityId: string, path: string): unknown
  /** Read a synchronized per-entity variable (from entity.properties[key]). */
  getEntityVar<T = any>(entityId: string, key: string, fallback?: T): T
  /** Subscribe to remote updates of a specific synced variable on an entity. */
  onEntityVarChange(entityId: string, key: string, handler: (value: any, prevValue: any) => void): () => void
  /** Start embedded Rust LAN WebSocket + UDP discovery server (Desktop Tauri) and join as host. */
  hostLan(opts?: { port?: number; room?: string; gameName?: string; mode?: MultiplayerMode }): Promise<LanServerInfo | null>
  /** Stop the embedded LAN server. */
  stopLan(): Promise<boolean>
  /** Discover active LAN games broadcasting via UDP on the local network (Desktop Tauri). */
  discoverLan(timeoutMs?: number): Promise<LanDiscoveredGame[]>
  /** Send an in-game lobby/match chat message to all peers. */
  sendChat(text: string): void
  /** Subscribe to incoming lobby/match chat messages. */
  onChat(handler: (msg: NetChatMessage) => void): () => void
  /** Host-authoritative prefab spawn with stable network ID, replicated to late joiners. */
  spawnNetworkPlayer(prefabId: string, ownerPeerId?: string, pos?: Vec3): string
}

export interface SteamAPI {
  init(appId?: number): Promise<SteamUserInfo>
  isAvailable(): boolean
  isNative(): boolean
  getUser(): SteamUserInfo
  unlockAchievement(id: string): Promise<boolean>
  clearAchievement(id: string): Promise<boolean>
  hasAchievement(id: string): boolean
  listAchievements(): string[]
  setRichPresence(key: string, value: string): Promise<boolean>
  clearRichPresence(): Promise<void>
  cloudWrite(filename: string, content: string): Promise<boolean>
  cloudRead(filename: string): Promise<string | null>
  cloudDelete(filename: string): Promise<boolean>
  cloudList(): string[]
  createLobby(opts?: { maxMembers?: number; type?: "public" | "friends" | "private"; name?: string; data?: Record<string, string> }): Promise<SteamLobby>
  listLobbies(): Promise<SteamLobby[]>
  joinLobby(lobbyId: string): Promise<SteamLobby | null>
  leaveLobby(): Promise<void>
  setLobbyData(key: string, value: string): Promise<boolean>
  getLobby(): SteamLobby | null
  getLogs(): SteamLogEntry[]
}
