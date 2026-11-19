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
        if (this.instances.get(key) !== group || !this.active(key)) break
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
