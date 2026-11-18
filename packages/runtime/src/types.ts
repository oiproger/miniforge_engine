import type { Object3D, Vector3 } from 'three'
import type { Component, Entity, Project, Scene } from '../../project-schema/src'
import type { RenderWorld } from '../../graphics/src'
import type { PlatformAdapter } from '../../platform-sdk/src'
import type { Events, ScriptLifecycle } from './lifecycle'
import type { Input } from './input'

export interface PhysicsSession {
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
  events: Events
  platform: PlatformAdapter
  vars: Record<string, any>
  time: number
  project: Project
  find(id: string): Object3D | undefined
  component(type: string): Component | undefined
  audio: { play(assetId?: string): void }
  ui: { get(id: string): HTMLElement | undefined }
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
