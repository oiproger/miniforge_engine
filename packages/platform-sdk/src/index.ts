export type Profile = 'web' | 'yandex' | 'poki'
export interface PlatformAdapter {
  initialize(): Promise<void>
  loadingReady(): void
  gameplayStart(): void
  gameplayStop(): void
  showInterstitial(): Promise<boolean>
  showRewarded(): Promise<boolean>
  getLanguage(): string
  saveData(key: string, value: unknown): Promise<void>
  /** Write only to the platform cloud, when supported. */
  saveCloud?(key: string, value: unknown): Promise<void>
  loadData(key: string): Promise<any>
  isAvailable(): boolean
}

export interface Services {
  initialize(): Promise<void>
  available(): boolean
  ready?(): void
  gameplay?(active: boolean): void
  advertise(rewarded: boolean): Promise<boolean>
  language?(): string
  save?(key: string, value: unknown): Promise<void>
  load?(key: string): Promise<any>
}

export function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Platform timed out')), ms)
    promise.then(resolve, reject).finally(() => clearTimeout(timer))
  })
}

export function loadScript(src: string) {
  return withTimeout(
    new Promise<void>((resolve, reject) => {
      const script = document.createElement('script')
      script.async = true
      script.src = src
      script.onload = () => resolve()
      script.onerror = () => reject(new Error('SDK unavailable'))
      document.head.appendChild(script)
    }),
    4000,
  )
}

export function adapter(projectId: string, service: Services): PlatformAdapter {
  let active = false
  let requestedActive = false
  let ad = false
  let ready = false
  let startup: Promise<void> | undefined
  const memory = new Map<string, unknown>()
  const keyFor = (key: string) => 'miniforge.v1.' + projectId + '.' + key
  const safe = (action: () => void) => {
    try {
      action()
    } catch (error) {
      console.warn('Platform SDK', error)
    }
  }
  const gameplay = (value: boolean) => {
    if (active === value) return
    active = value
    safe(() => service.gameplay?.(value))
  }
  async function advertise(rewarded: boolean) {
    if (ad || !service.available()) return false
    ad = true
    gameplay(false)
    document.dispatchEvent(new CustomEvent('miniforge:ad', { detail: true }))
    try {
      return (await service.advertise(rewarded)) === true
    } catch {
      return false
    } finally {
      ad = false
      document.dispatchEvent(new CustomEvent('miniforge:ad', { detail: false }))
      if (requestedActive && !document.hidden) gameplay(true)
    }
  }
  return {
    initialize: () =>
      (startup ??= (async () => {
        performance.mark('miniforge-sdk-start')
        try {
          await withTimeout(service.initialize(), 6000)
        } catch {
          /* offline fallback */
        } finally {
          performance.mark('miniforge-sdk-ready')
        }
      })()),
    loadingReady() {
      if (!ready) {
        ready = true
        safe(() => service.ready?.())
      }
    },
    gameplayStart: () => {
      requestedActive = true
      if (!ad) gameplay(true)
    },
    gameplayStop: () => {
      requestedActive = false
      gameplay(false)
    },
    isAvailable: service.available,
    showInterstitial: () => advertise(false),
    showRewarded: () => advertise(true),
    getLanguage() {
      try {
        return service.language?.() || navigator.language.split('-')[0]
      } catch {
        return 'en'
      }
    },
    saveCloud: service.save,
    async saveData(key, value) {
      memory.set(key, value)
      try {
        localStorage.setItem(keyFor(key), JSON.stringify({ version: 1, value }))
      } catch {
        /* opaque preview origin */
      }
      try {
        await service.save?.(key, value)
      } catch {
        /* local copy retained */
      }
    },
    async loadData(key) {
      try {
        const value = await (service.load && withTimeout(service.load(key), 2500))
        if (value != null) return value
      } catch {
        /* fall back offline */
      }
      if (memory.has(key)) return memory.get(key)
      try {
        const record = JSON.parse(localStorage.getItem(keyFor(key)) || 'null')
        return record?.version === 1 ? record.value : record
      } catch {
        return null
      }
    },
  }
}
