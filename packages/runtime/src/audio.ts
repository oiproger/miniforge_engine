import type { Project, Vec3 } from '../../project-schema/src'

export type AudioBus = 'sfx' | 'ambient' | 'ui'
export interface AudioPlayOptions {
  volume?: number
  loop?: boolean
  pitch?: number
  position?: Vec3
  refDistance?: number
  maxDistance?: number
  rolloff?: number
  bus?: AudioBus
}

interface ActiveVoice {
  id: string
  gain: GainNode
  panner?: PannerNode
  filter?: BiquadFilterNode
  source?: AudioBufferSourceNode
  element?: HTMLAudioElement
  stopped: boolean
}

/** Web Audio 3D mixer with decoded buffer caching, buses, fade control, and spatial panning. */
export class AudioEngine {
  private ctx?: AudioContext
  private buses: Partial<Record<AudioBus, GainNode>> = {}
  private buffers = new Map<string, Promise<AudioBuffer | null>>()
  private voices = new Map<string, ActiveVoice>()
  private seq = 0
  private muted = false

  constructor(private project: Project) {}

  private ensureContext(): AudioContext | undefined {
    if (this.ctx) return this.ctx
    try {
      const ctx = new AudioContext()
      this.ctx = ctx
      for (const bus of ['sfx', 'ambient', 'ui'] as const) {
        const gain = ctx.createGain()
        gain.gain.value = 1
        gain.connect(ctx.destination)
        this.buses[bus] = gain
      }
      return ctx
    } catch {
      return undefined
    }
  }

  resume() {
    this.muted = false
    const ctx = this.ensureContext()
    void ctx?.resume().catch(() => {})
    for (const voice of this.voices.values()) {
      if (voice.element && !voice.stopped) void voice.element.play().catch(() => {})
    }
  }

  suspend() {
    this.muted = true
    for (const voice of this.voices.values()) {
      if (voice.element) voice.element.pause()
    }
    void this.ctx?.suspend().catch(() => {})
  }

  setBusVolume(bus: AudioBus, volume: number) {
    const ctx = this.ensureContext()
    const node = this.buses[bus]
    if (!ctx || !node) return
    node.gain.setTargetAtTime(Math.max(0, Math.min(2, volume)), ctx.currentTime, 0.03)
  }

  updateListener(pos: Vec3, forward: Vec3, up: Vec3 = [0, 1, 0]) {
    const ctx = this.ctx
    if (!ctx || ctx.state !== 'running') return
    const l = ctx.listener
    const t = ctx.currentTime
    if (l.positionX) {
      l.positionX.setValueAtTime(pos[0], t)
      l.positionY.setValueAtTime(pos[1], t)
      l.positionZ.setValueAtTime(pos[2], t)
      l.forwardX.setValueAtTime(forward[0], t)
      l.forwardY.setValueAtTime(forward[1], t)
      l.forwardZ.setValueAtTime(forward[2], t)
      l.upX.setValueAtTime(up[0], t)
      l.upY.setValueAtTime(up[1], t)
      l.upZ.setValueAtTime(up[2], t)
    } else if ('setPosition' in l) {
      ;(l as any).setPosition(pos[0], pos[1], pos[2])
      ;(l as any).setOrientation(forward[0], forward[1], forward[2], up[0], up[1], up[2])
    }
  }

  private decode(assetId: string, data: string): Promise<AudioBuffer | null> {
    let cached = this.buffers.get(assetId)
    if (cached) return cached
    const ctx = this.ensureContext()
    if (!ctx) return Promise.resolve(null)
    cached = fetch(data)
      .then((r) => r.arrayBuffer())
      .then((buf) => ctx.decodeAudioData(buf))
      .catch(() => null)
    this.buffers.set(assetId, cached)
    return cached
  }

  play(assetId?: string, options: AudioPlayOptions = {}): string {
    if (this.muted || this.project.settings.sound === false) return ''
    const ctx = this.ensureContext()
    const handle = 'snd-' + ++this.seq
    const key = assetId ? String(assetId).trim() : ''
    const asset = key && this.project.assets.find((a) => a.type === 'audio' && (a.id === key || a.name === key))
    if (!asset) {
      if (!ctx || ctx.state !== 'running') return ''
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      const at = ctx.currentTime
      const vol = Math.max(0.001, (options.volume ?? 1) * 0.045)
      osc.frequency.setValueAtTime(740 * (options.pitch ?? 1), at)
      osc.frequency.exponentialRampToValueAtTime(1120 * (options.pitch ?? 1), at + 0.08)
      gain.gain.setValueAtTime(vol, at)
      gain.gain.exponentialRampToValueAtTime(0.001, at + 0.13)
      osc.connect(gain)
      gain.connect(this.buses[options.bus ?? 'sfx'] ?? ctx.destination)
      osc.start(at)
      osc.stop(at + 0.15)
      osc.onended = () => {
        osc.disconnect()
        gain.disconnect()
      }
      return handle
    }

    if (!ctx) {
      const el = new Audio(asset.data)
      el.loop = !!options.loop
      el.volume = Math.max(0, Math.min(1, options.volume ?? 1))
      const voice: ActiveVoice = { id: handle, gain: null as unknown as GainNode, element: el, stopped: false }
      this.voices.set(handle, voice)
      el.onended = () => this.voices.delete(handle)
      void el.play().catch(() => this.voices.delete(handle))
      return handle
    }

    const gain = ctx.createGain()
    gain.gain.value = Math.max(0, options.volume ?? 1)
    let panner: PannerNode | undefined
    const target = this.buses[options.bus ?? 'sfx'] ?? ctx.destination
    if (options.position) {
      panner = ctx.createPanner()
      panner.panningModel = 'HRTF'
      panner.distanceModel = 'inverse'
      panner.refDistance = options.refDistance ?? 2
      panner.maxDistance = options.maxDistance ?? 40
      panner.rolloffFactor = options.rolloff ?? 1.2
      panner.positionX.value = options.position[0]
      panner.positionY.value = options.position[1]
      panner.positionZ.value = options.position[2]
      gain.connect(panner)
      panner.connect(target)
    } else {
      gain.connect(target)
    }
    const voice: ActiveVoice = { id: handle, gain, panner, stopped: false }
    this.voices.set(handle, voice)

    void this.decode(asset.id, asset.data).then((buffer) => {
      if (voice.stopped || !this.ctx) return
      if (!buffer) {
        const el = new Audio(asset.data)
        el.loop = !!options.loop
        el.volume = Math.max(0, Math.min(1, options.volume ?? 1))
        voice.element = el
        el.onended = () => this.stop(handle)
        void el.play().catch(() => this.stop(handle))
        return
      }
      const src = this.ctx.createBufferSource()
      src.buffer = buffer
      src.loop = !!options.loop
      src.playbackRate.value = Math.max(0.1, options.pitch ?? 1)
      src.connect(gain)
      src.onended = () => {
        if (!src.loop) this.stop(handle)
      }
      voice.source = src
      src.start()
    })
    return handle
  }

  setVolume(handle: string, volume: number, fadeSeconds = 0.05) {
    const voice = this.voices.get(handle)
    if (!voice) return
    if (voice.element) {
      voice.element.volume = Math.max(0, Math.min(1, volume))
      return
    }
    if (!this.ctx) return
    const v = Math.max(0, volume)
    if (fadeSeconds <= 0) voice.gain.gain.setValueAtTime(v, this.ctx.currentTime)
    else voice.gain.gain.setTargetAtTime(v, this.ctx.currentTime, fadeSeconds)
  }

  setSemitones(handle: string, semitones: number) {
    this.setPitch(handle, Math.pow(2, (Number(semitones) || 0) / 12))
  }

  setSpeed(handle: string, speed: number) {
    this.setPitch(handle, Math.max(0.1, Number(speed) || 1))
  }

  setLowpass(handle: string, frequencyHz: number) {
    const voice = this.voices.get(handle)
    if (!voice || !this.ctx) return
    const freq = Math.max(80, Math.min(20000, Number(frequencyHz) || 20000))
    if (!voice.filter && voice.source) {
      const f = this.ctx.createBiquadFilter()
      f.type = 'lowpass'
      f.frequency.setValueAtTime(freq, this.ctx.currentTime)
      try {
        voice.source.disconnect()
        voice.source.connect(f)
        f.connect(voice.panner ?? voice.gain)
        voice.filter = f
      } catch {}
    } else if (voice.filter) {
      voice.filter.frequency.setValueAtTime(freq, this.ctx.currentTime)
    }
  }

  setPitch(handle: string, pitch: number) {
    const voice = this.voices.get(handle)
    if (!voice?.source || !this.ctx) return
    voice.source.playbackRate.setValueAtTime(Math.max(0.1, pitch), this.ctx.currentTime)
  }

  setPosition(handle: string, pos: Vec3) {
    const voice = this.voices.get(handle)
    if (!voice?.panner || !this.ctx) return
    const t = this.ctx.currentTime
    voice.panner.positionX.setValueAtTime(pos[0], t)
    voice.panner.positionY.setValueAtTime(pos[1], t)
    voice.panner.positionZ.setValueAtTime(pos[2], t)
  }

  stop(handle: string) {
    const voice = this.voices.get(handle)
    if (!voice) return
    voice.stopped = true
    this.voices.delete(handle)
    try {
      voice.source?.stop()
    } catch {
      /* already stopped */
    }
    voice.source?.disconnect()
    voice.filter?.disconnect()
    voice.panner?.disconnect()
    voice.gain?.disconnect()
    if (voice.element) {
      voice.element.pause()
      voice.element.src = ''
    }
  }

  stopAll() {
    for (const id of [...this.voices.keys()]) this.stop(id)
  }

  dispose() {
    this.stopAll()
    this.buffers.clear()
    void this.ctx?.close().catch(() => {})
    this.ctx = undefined
  }
}
