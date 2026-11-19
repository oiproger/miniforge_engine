/** Isolate each script instance so a faulty component cannot stop the game loop. */
export interface ScriptLifecycle {
  /** Called once when the script component is attached. */
  onCreate?(): void
  /** Called once when the entity becomes active in the scene. */
  onStart?(): void
  /** Called whenever a previously disabled entity is re-enabled via setActive(id, true). */
  onEnable?(): void
  /** Called whenever an active entity is disabled via setActive(id, false). */
  onDisable?(): void
  /** Called every animation frame with frame deltaTime in seconds. */
  onUpdate?(deltaTime: number): void
  /** Called on the fixed 60 Hz simulation step. */
  onFixedUpdate?(deltaTime: number): void
  /** Called when the entity is destroyed or the scene unloads. */
  onDestroy?(): void
  /** Called when a solid collision starts with another entity. */
  onCollisionEnter?(other: string): void
  /** Called when a trigger overlap starts with another entity. */
  onTriggerEnter?(other: string): void
  /** Called every fixed step while overlapping a trigger volume. */
  onTriggerStay?(other: string, deltaTime: number): void
  /** Called when a trigger overlap ends with another entity. */
  onTriggerExit?(other: string): void
  /** Called when the entity is clicked or interacted with under the crosshair. */
  onPointerClick?(): void
}

export class Events {
  private listeners = new Map<string, Set<(payload?: unknown) => void>>()
  on(name: string, listener: (payload?: unknown) => void) {
    let group = this.listeners.get(name)
    if (!group) this.listeners.set(name, (group = new Set()))
    group.add(listener)
    return () => group.delete(listener)
  }
  emit(name: string, data?: unknown) {
    for (const listener of [...(this.listeners.get(name) ?? [])]) {
      try {
        listener(data)
      } catch (err) {
        console.error(err)
      }
    }
  }
  clear() {
    this.listeners.clear()
  }
}

export class Lifecycle {
  private instances = new Map<string, ScriptLifecycle[]>()
  constructor(
    private report: (error: unknown) => void = console.error,
    private active: (id: string) => boolean = () => true,
  ) {}
  add(id: string, construct: () => ScriptLifecycle) {
    try {
      const instance = construct()
      const group = this.instances.get(id) ?? []
      group.push(instance)
      this.instances.set(id, group)
      instance.onCreate?.()
    } catch (err) {
      this.report(err)
    }
  }
  call<K extends keyof ScriptLifecycle>(
    name: K,
    id?: string,
    ...args: Parameters<NonNullable<ScriptLifecycle[K]>>
  ) {
    const entries =
      id === undefined ? [...this.instances.entries()] : [[id, this.instances.get(id) ?? []] as const]
    for (const [key, group] of entries)
      for (const instance of [...group]) {
        if (this.instances.get(key) !== group || (name !== 'onDisable' && !this.active(key))) break
        try {
          ;(instance[name] as ((...a: unknown[]) => void) | undefined)?.apply(instance, args)
        } catch (err) {
          this.report(err)
          delete instance[name]
        }
      }
  }
  remove(id: string) {
    const group = this.instances.get(id)
    if (!group) return
    this.instances.delete(id)
    for (const instance of group) {
      try {
        instance.onDestroy?.()
      } catch (err) {
        this.report(err)
      }
    }
  }
  clear() {
    for (const id of [...this.instances.keys()]) this.remove(id)
  }
}
