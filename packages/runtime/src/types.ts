import type { Object3D, Vector3 } from 'three'
import type { Component, Entity, Project, Scene, Vec3 } from '../../project-schema/src'
import type { RenderWorld } from '../../graphics/src'
import type { PlatformAdapter } from '../../platform-sdk/src'
import type { Events, ScriptLifecycle } from './lifecycle'
import type { Input } from './input'

export interface PhysicsSession {
  add(entity: Entity): void
  remove(id: string): void
  setActive(id: string, active: boolean): void
  step(dt: number, contact: (a: string, b: string, enter: boolean, trigger: boolean) => void): void
  raycast(origin: Vector3, direction: Vector3, length: number): string | undefined
  dispose(): void
}
export interface GameAPI {
  entity: Entity
  object: Object3D
  transform: Object3D
  params: Record<string, any>
  input: Input
  events: Pick<Events, 'on' | 'emit'>
  platform: PlatformAdapter
  vars: Record<string, any>
  time: number
  project: Project
  find(id: string): Object3D | undefined
  spawnPrefab(assetId: string, position?: Vec3, parent?: string | null): string
  destroy(id: string): void
  setActive(id: string, active: boolean): void
  findByTag(tag: string): string[]
  component(type: string): Component | undefined
  animation: {
    play(id: string, clip?: string, loop?: boolean, speed?: number): boolean
    stop(id: string): void
    clips(id: string): string[]
  }
  audio: { play(assetId?: string): void }
  ui: {
    get(id: string): HTMLElement | undefined
    open(id: string): boolean
    close(): boolean
    back(): boolean
    current(): string | undefined
  }
  scene: { load(id: string): void }
  physics: { raycast(origin: Vector3, direction: Vector3, length: number): string | undefined }
  save: { set(key: string, value: unknown): Promise<void>; get(key: string): Promise<any> }
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
