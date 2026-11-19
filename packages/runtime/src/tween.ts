import { Vector3 } from '../../graphics/src/scene'

export type TweenTrans =
  | 'linear'
  | 'sine'
  | 'quad'
  | 'cubic'
  | 'quart'
  | 'quint'
  | 'expo'
  | 'circ'
  | 'back'
  | 'elastic'
  | 'bounce'

export type TweenEase = 'in' | 'out' | 'inOut' | 'outIn'

function easeOutBounce(t: number): number {
  const n1 = 7.5625,
    d1 = 2.75
  if (t < 1 / d1) return n1 * t * t
  if (t < 2 / d1) return n1 * (t -= 1.5 / d1) * t + 0.75
  if (t < 2.5 / d1) return n1 * (t -= 2.25 / d1) * t + 0.9375
  return n1 * (t -= 2.625 / d1) * t + 0.984375
}

function easeInBase(t: number, trans: TweenTrans): number {
  switch (trans) {
    case 'linear':
      return t
    case 'sine':
      return 1 - Math.cos((t * Math.PI) / 2)
    case 'quad':
      return t * t
    case 'cubic':
      return t * t * t
    case 'quart':
      return t * t * t * t
    case 'quint':
      return t * t * t * t * t
    case 'expo':
      return t === 0 ? 0 : Math.pow(2, 10 * t - 10)
    case 'circ':
      return 1 - Math.sqrt(Math.max(0, 1 - t * t))
    case 'back': {
      const c1 = 1.70158
      const c3 = c1 + 1
      return c3 * t * t * t - c1 * t * t
    }
    case 'elastic': {
      if (t === 0 || t === 1) return t
      const c4 = (2 * Math.PI) / 3
      return -Math.pow(2, 10 * t - 10) * Math.sin((t * 10 - 10.75) * c4)
    }
    case 'bounce':
      return 1 - easeOutBounce(1 - t)
  }
}

export function evaluateEase(t: number, trans: TweenTrans, ease: TweenEase): number {
  const x = Math.max(0, Math.min(1, t))
  if (trans === 'linear') return x
  switch (ease) {
    case 'in':
      return easeInBase(x, trans)
    case 'out':
      return 1 - easeInBase(1 - x, trans)
    case 'inOut':
      return x < 0.5 ? easeInBase(x * 2, trans) / 2 : 1 - easeInBase((1 - x) * 2, trans) / 2
    case 'outIn':
      return x < 0.5 ? (1 - easeInBase(1 - x * 2, trans)) / 2 : 0.5 + easeInBase((x - 0.5) * 2, trans) / 2
  }
}

function isHexColor(v: unknown): v is string {
  return typeof v === 'string' && /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(v)
}

function hexToRgb(hex: string): [number, number, number] {
  const c = hex.slice(1)
  const f = c.length === 3 ? c.split('').map((ch) => ch + ch).join('') : c
  return [parseInt(f.slice(0, 2), 16), parseInt(f.slice(2, 4), 16), parseInt(f.slice(4, 6), 16)]
}

function rgbToHex(r: number, g: number, b: number): string {
  const h = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0')
  return '#' + h(r) + h(g) + h(b)
}

function resolvePath(target: any, path: string): { holder: any; key: string } | undefined {
  const parts = path.split('.')
  let cur = target
  for (let i = 0; i < parts.length - 1; i++) {
    if (cur == null) return undefined
    cur = cur[parts[i]]
  }
  return cur != null ? { holder: cur, key: parts[parts.length - 1] } : undefined
}

function cloneValue(v: any): any {
  if (v instanceof Vector3) return v.clone()
  if (Array.isArray(v)) return [...v]
  return v
}

function addValue(a: any, b: any): any {
  if (a instanceof Vector3 && b instanceof Vector3) return new Vector3(a.x + b.x, a.y + b.y, a.z + b.z)
  if (a instanceof Vector3 && Array.isArray(b)) return new Vector3(a.x + b[0], a.y + b[1], a.z + b[2])
  if (Array.isArray(a) && Array.isArray(b)) return a.map((v, i) => Number(v) + Number(b[i] ?? 0))
  return Number(a) + Number(b)
}

function applyInterpolated(holder: any, key: string, start: any, end: any, k: number) {
  const cur = holder[key]
  if (cur instanceof Vector3) {
    const sx = start instanceof Vector3 ? start.x : start[0],
      sy = start instanceof Vector3 ? start.y : start[1],
      sz = start instanceof Vector3 ? start.z : start[2]
    const ex = end instanceof Vector3 ? end.x : end[0],
      ey = end instanceof Vector3 ? end.y : end[1],
      ez = end instanceof Vector3 ? end.z : end[2]
    cur.set(sx + (ex - sx) * k, sy + (ey - sy) * k, sz + (ez - sz) * k)
  } else if (Array.isArray(start) && Array.isArray(end)) {
    holder[key] = start.map((v, i) => Number(v) + (Number(end[i] ?? v) - Number(v)) * k)
  } else if (isHexColor(start) && isHexColor(end)) {
    const a = hexToRgb(start),
      b = hexToRgb(end)
    holder[key] = rgbToHex(a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k)
  } else {
    holder[key] = Number(start) + (Number(end) - Number(start)) * k
  }
}

interface TweenerStep {
  kind: 'property' | 'callback' | 'interval'
  target?: any
  property?: string
  finalValue?: any
  fromValue?: any
  relative?: boolean
  duration: number
  delay: number
  trans: TweenTrans
  ease: TweenEase
  callback?: () => void
  // Runtime state per loop
  elapsed: number
  started: boolean
  done: boolean
  startSnapshot?: any
  endSnapshot?: any
}

export class PropertyTweener {
  constructor(private step: TweenerStep) {}
  setTrans(trans: TweenTrans) {
    this.step.trans = trans
    return this
  }
  setEase(ease: TweenEase) {
    this.step.ease = ease
    return this
  }
  setDelay(seconds: number) {
    this.step.delay = Math.max(0, seconds)
    return this
  }
  from(value: any) {
    this.step.fromValue = cloneValue(value)
    return this
  }
  asRelative() {
    this.step.relative = true
    return this
  }
}

/** Godot 4-style chainable/parallel Tween with easing curves, callbacks, loops, and Promise completion. */
export class Tween {
  private groups: TweenerStep[][] = []
  private defaultTrans: TweenTrans = 'linear'
  private defaultEase: TweenEase = 'inOut'
  private parallelNext = false
  private running = true
  private killed = false
  private loopsLeft = 1
  private groupIndex = 0
  private resolveFinished?: () => void
  readonly finished: Promise<void>

  constructor(private onFinish?: () => void) {
    this.finished = new Promise<void>((resolve) => {
      this.resolveFinished = resolve
    })
  }

  /** Set default transition curve for subsequent tweenProperty calls. */
  setTrans(trans: TweenTrans) {
    this.defaultTrans = trans
    return this
  }

  /** Set default easing mode for subsequent tweenProperty calls. */
  setEase(ease: TweenEase) {
    this.defaultEase = ease
    return this
  }

  /** Run the next step in parallel with the previous step (Godot 4 style). */
  parallel() {
    this.parallelNext = true
    return this
  }

  /** Return to sequential chaining (default). */
  chain() {
    this.parallelNext = false
    return this
  }

  /** Repeat the entire tween sequence (0 or omitted = infinite loops). */
  setLoops(count = 0) {
    this.loopsLeft = count <= 0 ? Infinity : Math.max(1, Math.floor(count))
    return this
  }

  private pushStep(step: TweenerStep) {
    if (this.parallelNext && this.groups.length > 0) {
      this.groups[this.groups.length - 1].push(step)
    } else {
      this.groups.push([step])
    }
    this.parallelNext = false
  }

  /** Smoothly animate a numeric, Vector3, Vec3, or hex-color property over duration seconds. */
  tweenProperty(target: any, property: string, finalValue: any, duration: number): PropertyTweener {
    const step: TweenerStep = {
      kind: 'property',
      target,
      property,
      finalValue: cloneValue(finalValue),
      duration: Math.max(0, duration),
      delay: 0,
      trans: this.defaultTrans,
      ease: this.defaultEase,
      elapsed: 0,
      started: false,
      done: false,
    }
    this.pushStep(step)
    return new PropertyTweener(step)
  }

  /** Invoke a callback function at this point in the tween sequence. */
  tweenCallback(fn: () => void, delay = 0) {
    this.pushStep({
      kind: 'callback',
      callback: fn,
      duration: 0,
      delay: Math.max(0, delay),
      trans: 'linear',
      ease: 'inOut',
      elapsed: 0,
      started: false,
      done: false,
    })
    return this
  }

  /** Wait for a fixed interval in seconds before continuing to the next step. */
  tweenInterval(seconds: number) {
    this.pushStep({
      kind: 'interval',
      duration: Math.max(0, seconds),
      delay: 0,
      trans: 'linear',
      ease: 'inOut',
      elapsed: 0,
      started: false,
      done: false,
    })
    return this
  }

  pause() {
    this.running = false
    return this
  }

  play() {
    if (!this.killed) this.running = true
    return this
  }

  isRunning() {
    return this.running && !this.killed
  }

  kill() {
    if (this.killed) return
    this.killed = true
    this.running = false
    this.resolveFinished?.()
    this.onFinish?.()
  }

  /** Internal frame tick called by the runtime. Returns false when complete/killed. */
  step(dt: number): boolean {
    if (this.killed) return false
    if (!this.running) return true
    if (!this.groups.length) {
      this.kill()
      return false
    }
    const group = this.groups[this.groupIndex]
    if (!group) {
      this.kill()
      return false
    }
    let allDone = true
    for (const s of group) {
      if (s.done) continue
      s.elapsed += dt
      if (s.elapsed < s.delay) {
        allDone = false
        continue
      }
      const localTime = s.elapsed - s.delay
      if (s.kind === 'callback') {
        s.done = true
        try {
          s.callback?.()
        } catch (err) {
          console.error('Tween callback error:', err)
        }
        continue
      }
      if (s.kind === 'interval') {
        if (localTime >= s.duration) s.done = true
        else allDone = false
        continue
      }
      const resolved = resolvePath(s.target, s.property!)
      if (!resolved) {
        s.done = true
        continue
      }
      if (!s.started) {
        s.started = true
        if (s.fromValue !== undefined) {
          applyInterpolated(resolved.holder, resolved.key, s.fromValue, s.fromValue, 0)
          s.startSnapshot = cloneValue(s.fromValue)
        } else {
          s.startSnapshot = cloneValue(resolved.holder[resolved.key])
        }
        s.endSnapshot = s.relative ? addValue(s.startSnapshot, s.finalValue) : cloneValue(s.finalValue)
      }
      const t = s.duration <= 0 ? 1 : Math.min(1, localTime / s.duration)
      const k = evaluateEase(t, s.trans, s.ease)
      applyInterpolated(resolved.holder, resolved.key, s.startSnapshot, s.endSnapshot, k)
      if (t >= 1) s.done = true
      else allDone = false
    }

    if (allDone) {
      this.groupIndex++
      if (this.groupIndex >= this.groups.length) {
        this.loopsLeft--
        if (this.loopsLeft > 0) {
          this.groupIndex = 0
          for (const g of this.groups) {
            for (const s of g) {
              s.elapsed = 0
              s.started = false
              s.done = false
            }
          }
        } else {
          this.kill()
          return false
        }
      }
    }
    return true
  }
}

export class TweenManager {
  private tweens = new Set<{ owner?: string; tween: Tween }>()

  create(owner?: string): Tween {
    const entry = { owner, tween: null as unknown as Tween }
    const tween = new Tween(() => this.tweens.delete(entry))
    entry.tween = tween
    this.tweens.add(entry)
    return tween
  }

  update(dt: number) {
    for (const entry of [...this.tweens]) {
      if (!entry.tween.step(dt)) this.tweens.delete(entry)
    }
  }

  killOwner(owner: string) {
    for (const entry of [...this.tweens]) {
      if (entry.owner === owner) entry.tween.kill()
    }
  }

  clear() {
    for (const entry of [...this.tweens]) entry.tween.kill()
    this.tweens.clear()
  }
}
