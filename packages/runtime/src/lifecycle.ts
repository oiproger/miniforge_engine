/** Isolate each script instance so a faulty component cannot stop the game loop. */
export interface ScriptLifecycle {
  onCreate?(): void
  onStart?(): void
  onUpdate?(deltaTime: number): void
  onFixedUpdate?(deltaTime: number): void
  onDestroy?(): void
  onCollisionEnter?(other: string): void
  onTriggerEnter?(other: string): void
  onTriggerExit?(other: string): void
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
    for (const listener of this.listeners.get(name) ?? []) {
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
  constructor(private report: (error: unknown) => void = console.error) {}
  add(id: string, construct: () => ScriptLifecycle) {
    try {
      const instance = construct()
      instance.onCreate?.()
      const group = this.instances.get(id) ?? []
      group.push(instance)
      this.instances.set(id, group)
    } catch (err) {
      this.report(err)
    }
  }
  call<K extends keyof ScriptLifecycle>(
    name: K,
    id?: string,
    ...args: Parameters<NonNullable<ScriptLifecycle[K]>>
  ) {
    const groups = id === undefined ? this.instances.values() : [this.instances.get(id) ?? []]
    for (const group of groups)
      for (const instance of group) {
        try {
          ;(instance[name] as ((...a: unknown[]) => void) | undefined)?.apply(instance, args)
        } catch (err) {
          this.report(err)
          delete instance[name]
        }
      }
  }
  clear() {
    this.call('onDestroy')
    this.instances.clear()
  }
}
