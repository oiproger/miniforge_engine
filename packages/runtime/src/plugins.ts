import { parsePluginManifest, type Project } from '../../project-schema/src'
import type { ScriptLifecycle } from './lifecycle'
import type { GameAPI } from './types'

export type PluginBehaviorFactory = (api: GameAPI, params: Record<string, any>) => ScriptLifecycle

export interface RuntimePluginContext {
  pluginId: string
  onGameStart(fn: (api: GameAPI) => void): void
  onUpdate(fn: (dt: number, api: GameAPI) => void): void
  onFixedUpdate(fn: (dt: number, api: GameAPI) => void): void
  onDestroy(fn: (api: GameAPI) => void): void
  registerBehavior(kind: string, factory: PluginBehaviorFactory): void
  registerService<T>(name: string, service: T, api: GameAPI): T
}

export class RuntimePluginHost {
  private startHooks: ((api: GameAPI) => void)[] = []
  private updateHooks: ((dt: number, api: GameAPI) => void)[] = []
  private fixedHooks: ((dt: number, api: GameAPI) => void)[] = []
  private destroyHooks: ((api: GameAPI) => void)[] = []
  private behaviors = new Map<string, PluginBehaviorFactory>()
  private started = false

  constructor(project: Project) {
    const pluginAssets = project.assets.filter((a) => a.type === 'plugin')
    for (const asset of pluginAssets) {
      const manifest = parsePluginManifest(asset.data)
      if (!manifest.enabled) continue
      try {
        const exportsObj: Record<string, any> = {}
        const runner = new Function('exports', manifest.code)
        runner(exportsObj)
        if (typeof exportsObj.registerRuntime === 'function') {
          const ctx: RuntimePluginContext = {
            pluginId: manifest.id,
            onGameStart: (fn) => this.startHooks.push(fn),
            onUpdate: (fn) => this.updateHooks.push(fn),
            onFixedUpdate: (fn) => this.fixedHooks.push(fn),
            onDestroy: (fn) => this.destroyHooks.push(fn),
            registerBehavior: (kind, factory) => this.behaviors.set(kind, factory),
            registerService: (name, svc, api) => api.services.register(name, svc),
          }
          exportsObj.registerRuntime(ctx)
        }
      } catch (err) {
        console.error(`[Miniforge Plugin:${manifest.name}] Load error:`, err)
      }
    }
  }

  getBehaviorFactory(kind: string): PluginBehaviorFactory | undefined {
    return this.behaviors.get(kind)
  }

  start(api: GameAPI) {
    if (this.started) return
    this.started = true
    for (const fn of this.startHooks) {
      try {
        fn(api)
      } catch (err) {
        console.error('[Miniforge Plugin onGameStart]', err)
      }
    }
  }

  update(dt: number, api: GameAPI) {
    for (const fn of this.updateHooks) {
      try {
        fn(dt, api)
      } catch (err) {
        console.error('[Miniforge Plugin onUpdate]', err)
      }
    }
  }

  fixedUpdate(dt: number, api: GameAPI) {
    for (const fn of this.fixedHooks) {
      try {
        fn(dt, api)
      } catch (err) {
        console.error('[Miniforge Plugin onFixedUpdate]', err)
      }
    }
  }

  dispose(api?: GameAPI) {
    if (api) {
      for (const fn of this.destroyHooks) {
        try {
          fn(api)
        } catch (err) {
          console.error('[Miniforge Plugin onDestroy]', err)
        }
      }
    }
    this.startHooks = []
    this.updateHooks = []
    this.fixedHooks = []
    this.destroyHooks = []
    this.behaviors.clear()
  }
}
