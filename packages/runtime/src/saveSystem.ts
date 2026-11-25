import type { PlatformAdapter } from '../../platform-sdk/src'
import type { Scene, Vec3 } from '../../project-schema/src'
import type { RenderWorld } from '../../graphics/src'
import type { Events } from './lifecycle'
import type { CameraAPI, PlayerAPI } from './types'

export interface EntitySaveState {
  active: boolean
  position: Vec3
  rotation: Vec3
  scale: Vec3
}

export interface SaveSnapshot {
  version: 1
  slot: string
  savedAt: string
  sceneId: string
  player?: {
    position: Vec3
    yaw: number
    pitch: number
    speed: number
    crouching: boolean
  }
  vars: Record<string, any>
  worldState: Record<string, unknown>
  entities: Record<string, EntitySaveState>
  custom: Record<string, unknown>
}

export type SaveResult = SaveSnapshot & {
  localSaved: boolean
  cloudSaved: boolean
}

export interface SaveOptions {
  /** Also sync snapshot to platform cloud storage (Yandex Games / Poki / Web adapter). Default: true. */
  cloudSync?: boolean
}

export interface LoadOptions {
  /** Check platform cloud storage and merge/pick newest timestamp. Default: true. */
  cloudSync?: boolean
  /** Always prefer cloud snapshot over local when both exist. Default: false (picks newest savedAt). */
  preferCloud?: boolean
}

export interface SaveSystemContext {
  projectId: string
  platform: PlatformAdapter
  events: Pick<Events, 'emit'>
  getSceneId(): string
  getScene(): Scene
  getWorld(): RenderWorld
  getVars(): Record<string, any>
  getWorldState(): Record<string, unknown>
  setWorldState(data: Record<string, unknown>): void
  getPlayer(): PlayerAPI
  getCamera(): CameraAPI
  setActive(id: string, active: boolean): void
  loadScene(id: string): Promise<void>
}

function safeClone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v))
}

function isValidSnapshot(data: unknown): data is SaveSnapshot {
  return (
    !!data &&
    typeof data === 'object' &&
    (data as any).version === 1 &&
    typeof (data as any).sceneId === 'string' &&
    typeof (data as any).savedAt === 'string'
  )
}

/** Full game-state Save/Load manager with JSON export/import and optional Yandex/Poki cloud sync. */
export class SaveManager {
  constructor(private ctx: SaveSystemContext) {}

  private localKey(slot: string) {
    return `miniforge:${this.ctx.projectId}:save:${slot}`
  }

  private cloudKey(slot: string) {
    return `miniforge_save_${slot}`
  }

  private slotsKey() {
    return `miniforge:${this.ctx.projectId}:save_slots`
  }

  private trackSlot(slot: string, add: boolean) {
    try {
      const list = new Set<string>(JSON.parse(localStorage.getItem(this.slotsKey()) || '[]'))
      if (add) list.add(slot)
      else list.delete(slot)
      localStorage.setItem(this.slotsKey(), JSON.stringify([...list]))
    } catch {
      /* storage unavailable */
    }
  }

  listSlots(): string[] {
    try {
      return JSON.parse(localStorage.getItem(this.slotsKey()) || '[]')
    } catch {
      return []
    }
  }

  capture(slot = 'main'): SaveSnapshot {
    const scene = this.ctx.getScene()
    const world = this.ctx.getWorld()
    const player = this.ctx.getPlayer()
    const cam = this.ctx.getCamera()
    const entities: Record<string, EntitySaveState> = {}
    for (const e of scene.entities) {
      const node = world.objects.get(e.id)
      if (!node) continue
      entities[e.id] = {
        active: e.active,
        position: node.position.toArray(),
        rotation: node.rotation.toArray(),
        scale: node.scale.toArray(),
      }
    }
    const snapshot: SaveSnapshot = {
      version: 1,
      slot,
      savedAt: new Date().toISOString(),
      sceneId: this.ctx.getSceneId(),
      player: player.id
        ? {
            position: [...player.position],
            yaw: cam.yaw,
            pitch: cam.pitch,
            speed: player.speed,
            crouching: player.isCrouching,
          }
        : undefined,
      vars: safeClone(this.ctx.getVars()),
      worldState: safeClone(this.ctx.getWorldState()),
      entities,
      custom: {},
    }
    this.ctx.events.emit('save.before', snapshot)
    return snapshot
  }

  async applySnapshot(snapshot: SaveSnapshot): Promise<boolean> {
    if (!isValidSnapshot(snapshot)) return false
    if (snapshot.sceneId && snapshot.sceneId !== this.ctx.getSceneId()) {
      await this.ctx.loadScene(snapshot.sceneId)
    }
    const vars = this.ctx.getVars()
    for (const k of Object.keys(vars)) delete vars[k]
    Object.assign(vars, safeClone(snapshot.vars || {}))
    this.ctx.setWorldState(safeClone(snapshot.worldState || {}))

    const world = this.ctx.getWorld()
    const scene = this.ctx.getScene()
    for (const e of scene.entities) {
      const saved = snapshot.entities?.[e.id]
      if (!saved) continue
      const node = world.objects.get(e.id)
      if (node) {
        node.position.fromArray(saved.position)
        node.rotation.fromArray(saved.rotation)
        node.scale.fromArray(saved.scale)
      }
      if (e.active !== saved.active) this.ctx.setActive(e.id, saved.active)
    }

    if (snapshot.player) {
      const player = this.ctx.getPlayer()
      const cam = this.ctx.getCamera()
      player.setSpeed(snapshot.player.speed)
      player.setCrouch(snapshot.player.crouching)
      player.teleport(snapshot.player.position)
      cam.setLook(snapshot.player.yaw, snapshot.player.pitch)
    }

    this.ctx.events.emit('save.loaded', snapshot)
    return true
  }

  async save(slot = 'main', options: SaveOptions = {}): Promise<SaveResult> {
    const snapshot = this.capture(slot)
    let localSaved = false
    let cloudSaved = false
    try {
      localStorage.setItem(this.localKey(slot), JSON.stringify(snapshot))
      localSaved = true
      this.trackSlot(slot, true)
    } catch {
      /* Cloud may still be available when device storage is full. */
    }
    if (options.cloudSync !== false && this.ctx.platform.saveCloud) {
      try {
        await this.ctx.platform.saveCloud(this.cloudKey(slot), snapshot)
        cloudSaved = true
      } catch {
        /* A successful device write is sufficient for offline play. */
      }
    }
    this.ctx.events.emit(localSaved || cloudSaved ? 'save.completed' : 'save.failed', {
      slot, savedAt: snapshot.savedAt, localSaved, cloudSaved, cloudSync: cloudSaved,
    })
    return { ...snapshot, localSaved, cloudSaved }
  }

  private readLocal(slot: string): SaveSnapshot | null {
    try {
      const raw = localStorage.getItem(this.localKey(slot))
      if (!raw) return null
      const parsed = JSON.parse(raw)
      return isValidSnapshot(parsed) ? parsed : null
    } catch {
      return null
    }
  }

  async load(slot = 'main', options: LoadOptions = {}): Promise<boolean> {
    const local = this.readLocal(slot)
    let cloud: SaveSnapshot | null = null
    if (options.cloudSync !== false) {
      try {
        const remote = await this.ctx.platform.loadData(this.cloudKey(slot))
        if (isValidSnapshot(remote)) cloud = remote
      } catch {
        /* offline */
      }
    }
    let chosen: SaveSnapshot | null = null
    if (cloud && local) {
      if (options.preferCloud) chosen = cloud
      else chosen = Date.parse(cloud.savedAt) >= Date.parse(local.savedAt) ? cloud : local
    } else {
      chosen = cloud ?? local
    }
    if (!chosen) return false
    return this.applySnapshot(chosen)
  }

  async deleteSlot(slot = 'main'): Promise<void> {
    try {
      localStorage.removeItem(this.localKey(slot))
      this.trackSlot(slot, false)
    } catch {
      /* ignore */
    }
    try {
      await this.ctx.platform.saveData(this.cloudKey(slot), null)
    } catch {
      /* ignore */
    }
  }

  exportJSON(slot = 'main'): string {
    const snap = this.readLocal(slot) ?? this.capture(slot)
    return JSON.stringify(snap, null, 2)
  }

  downloadJSON(slot = 'main', filename?: string): void {
    const json = this.exportJSON(slot)
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename || `save_${slot}.json`
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 10000)
  }

  async importJSON(jsonText: string, slot = 'main', applyNow = true): Promise<boolean> {
    const parsed = JSON.parse(jsonText)
    if (!isValidSnapshot(parsed)) throw Error('Invalid Miniforge save JSON')
    parsed.slot = slot
    try {
      localStorage.setItem(this.localKey(slot), JSON.stringify(parsed))
      this.trackSlot(slot, true)
    } catch {
      /* ignore */
    }
    if (applyNow) return this.applySnapshot(parsed)
    return true
  }
}
