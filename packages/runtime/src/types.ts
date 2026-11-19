import type { SceneNode, Vector3 } from '../../graphics/src/scene'
import type { Component, Entity, Project, Scene, Vec3 } from '../../project-schema/src'
import type { PostProcessOptions, ProceduralSkyOptions, SkyboxFaces, RenderWorld } from '../../graphics/src'
import type { PlatformAdapter } from '../../platform-sdk/src'
import type { Events, ScriptLifecycle } from './lifecycle'
import type { Input } from './input'
import type { AudioBus, AudioPlayOptions } from './audio'
import type { Tween } from './tween'

export type { Tween, PropertyTweener, TweenTrans, TweenEase } from './tween'

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
  /** Create a new material asset at runtime and return its ID. */
  create(name: string, properties: Record<string, any>): string
}

export interface LightsAPI {
  /** Set point or spot light intensity on an entity. */
  setIntensity(id: string, intensity: number): void
  /** Set point or spot light tint color on an entity. */
  setColor(id: string, hex: string): void
  /** Set point or spot light range on an entity. */
  setRange(id: string, range: number): void
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
  /** Find an enabled component of a given type on this entity. */
  component(type: string): Component | undefined
  /** GLTF animation playback controls. */
  animation: {
    play(id: string, clip?: string, loop?: boolean, speed?: number): boolean
    stop(id: string): void
    clips(id: string): string[]
  }
  /** 3D Web Audio mixer with buses, loops, fades, and spatial panning. */
  audio: {
    play(assetId?: string, options?: AudioPlayOptions): string
    stop(handle: string): void
    stopAll(): void
    setVolume(handle: string, volume: number, fadeSeconds?: number): void
    setPitch(handle: string, pitch: number): void
    setPosition(handle: string, position: Vec3): void
    setBusVolume(bus: AudioBus, volume: number): void
  }
  /** HUD screens, navigation stack, backdrop blur, and custom DOM widget mounting. */
  ui: {
    get(id: string): HTMLElement | undefined
    open(id: string): boolean
    close(): boolean
    back(): boolean
    current(): string | undefined
    /** Set backdrop blur (in px) on a HUD element or mounted widget. */
    setBlur(id: string, blurPx: number): void
    /** Dynamically patch CSS properties on a HUD element. */
    setStyle(id: string, styles: Partial<CSSStyleDeclaration>): void
    /** Mount a custom HTML string or HTMLElement inside the overlay Shadow DOM (e.g., PhoneUI). */
    mount(id: string, content: string | HTMLElement, css?: string): HTMLElement
    /** Remove a previously mounted custom widget. */
    unmount(id: string): void
  }
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
