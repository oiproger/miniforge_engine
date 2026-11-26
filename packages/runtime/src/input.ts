export const DEFAULT_INPUT_BINDINGS: Record<string, string[]> = {
  left: ['KeyA', 'ArrowLeft', 'GP14'],
  right: ['KeyD', 'ArrowRight', 'GP15'],
  up: ['KeyW', 'ArrowUp', 'GP12'],
  down: ['KeyS', 'ArrowDown', 'GP13'],
  Jump: ['Space', 'GP0'],
  Interact: ['KeyE', 'GP2'],
  Attack: ['KeyF', 'Mouse0', 'GP7'],
  Sprint: ['ShiftLeft', 'ShiftRight', 'GP10'],
  Crouch: ['ControlLeft', 'KeyC', 'GP1'],
  Flashlight: ['KeyL', 'GP3'],
  Phone: ['Tab', 'KeyP', 'GP8'],
  Pause: ['Escape', 'GP9'],
}

export interface PointerPosition {
  x: number
  y: number
  xPercent: number
  yPercent: number
  inside: boolean
}

export class Input {
  private keys = new Set<string>()
  private gpButtons = new Set<string>()
  private gpMove: [number, number] = [0, 0]
  private gpLook: [number, number] = [0, 0]
  private deadzone = 0.18
  private virtual = new Map<string, string>()
  private modal = false
  private pointerClient?: { x: number; y: number }
  private touch = [0, 0]
  private active = new Set<string>()
  private bindings: Record<string, string[]> = structuredClone(DEFAULT_INPUT_BINDINGS)

  constructor(
    signal: AbortSignal,
    private onPause: () => void,
    private edge?: (action: string, down: boolean) => void,
    private viewport?: HTMLElement,
  ) {
    window.addEventListener(
      'keydown',
      (e) => {
        if (e.repeat && !this.keys.has(e.code)) return
        if (this.modal && !(this.bindings.Pause || []).includes(e.code)) return
        if (Object.values(this.bindings).some((keys) => keys.includes(e.code))) e.preventDefault()
        if (this.keys.has(e.code)) return
        this.keys.add(e.code)
        this.refresh()
      },
      { signal },
    )
    window.addEventListener(
      'keyup',
      (e) => {
        if (this.keys.delete(e.code)) this.refresh()
      },
      { signal },
    )
    window.addEventListener(
      'mousedown',
      (e) => {
        if (this.modal) return
        const code = `Mouse${e.button}`
        if (!Object.values(this.bindings).some((keys) => keys.includes(code))) return
        if (this.keys.has(code)) return
        this.keys.add(code)
        this.refresh()
      },
      { signal },
    )
    window.addEventListener(
      'mouseup',
      (e) => {
        const code = `Mouse${e.button}`
        if (this.keys.delete(code)) this.refresh()
      },
      { signal },
    )
    if (viewport) {
      const remember = (event: PointerEvent) => { this.pointerClient = { x: event.clientX, y: event.clientY } }
      window.addEventListener('pointermove', remember, { signal })
      window.addEventListener('pointerdown', remember, { signal })
    }
    window.addEventListener('blur', () => {
      this.pointerClient = undefined
      this.clear()
    }, { signal })
  }

  /** Pointer position in game viewport coordinates. Pointer lock uses the center. */
  pointer(): PointerPosition {
    const viewport = this.viewport
    const rect = viewport?.getBoundingClientRect()
    if (!viewport || !rect?.width || !rect?.height) return { x: 0, y: 0, xPercent: 0, yPercent: 0, inside: false }
    const locked = Boolean(document.pointerLockElement && viewport.contains(document.pointerLockElement))
    if (!locked && !this.pointerClient) return { x: 0, y: 0, xPercent: 0, yPercent: 0, inside: false }
    const x = locked ? 0.5 : (this.pointerClient!.x - rect.left) / rect.width
    const y = locked ? 0.5 : (this.pointerClient!.y - rect.top) / rect.height
    return {
      x: x * viewport.clientWidth, y: y * viewport.clientHeight,
      xPercent: x * 100, yPercent: y * 100, inside: x >= 0 && x <= 1 && y >= 0 && y <= 1,
    }
  }

  private refresh() {
    const next = new Set(this.virtual.values())
    for (const [name, codes] of Object.entries(this.bindings))
      if (codes.some((code) => this.keys.has(code) || this.gpButtons.has(code))) next.add(name)
    const previous = this.active
    this.active = next
    for (const name of previous) if (!next.has(name)) this.edge?.(name, false)
    for (const name of next)
      if (!previous.has(name)) {
        this.edge?.(name, true)
        if (name === 'Pause') this.onPause()
      }
  }

  /** Poll connected HTML5 Gamepads once per frame (standard W3C Gamepad API). */
  pollGamepads() {
    const pads = typeof navigator !== 'undefined' && navigator.getGamepads ? navigator.getGamepads() : []
    const nextGp = new Set<string>()
    let lx = 0,
      ly = 0,
      rx = 0,
      ry = 0
    const dz = this.deadzone
    const filt = (v: number) => (Math.abs(v) < dz ? 0 : (Math.sign(v) * (Math.abs(v) - dz)) / (1 - dz))
    for (const pad of pads) {
      if (!pad || !pad.connected) continue
      pad.buttons.forEach((b, idx) => {
        if (b && (b.pressed || b.value > 0.45)) nextGp.add(`GP${idx}`)
      })
      if (pad.axes.length >= 2 && lx === 0 && ly === 0) {
        lx = filt(pad.axes[0] || 0)
        ly = filt(pad.axes[1] || 0)
      }
      if (pad.axes.length >= 4 && rx === 0 && ry === 0) {
        rx = filt(pad.axes[2] || 0)
        ry = filt(pad.axes[3] || 0)
      }
    }
    this.gpMove = this.modal ? [0, 0] : [lx, ly]
    this.gpLook = this.modal ? [0, 0] : [rx, ry]
    let changed = nextGp.size !== this.gpButtons.size
    if (!changed) {
      for (const b of nextGp) if (!this.gpButtons.has(b)) { changed = true; break }
    }
    if (changed) {
      this.gpButtons = nextGp
      this.refresh()
    }
  }

  setDeadzone(dz: number) {
    this.deadzone = Math.max(0.02, Math.min(0.8, Number(dz) || 0.18))
  }

  bind(action: string, codes: string[]) {
    this.bindings[action] = codes
    this.refresh()
  }

  rebind(action: string, codes: string[]) {
    this.bind(action, codes)
  }

  getBindings(): Record<string, string[]> {
    return structuredClone(this.bindings)
  }

  pressed(action: string) {
    return this.active.has(action) || this.keys.has(action) || this.gpButtons.has(action)
  }

  gamepadAxis(axisIndex: number, padIndex = 0): number {
    const pads = typeof navigator !== 'undefined' && navigator.getGamepads ? navigator.getGamepads() : []
    const pad = pads[padIndex]
    if (!pad || !pad.connected) return 0
    const raw = pad.axes[axisIndex] ?? 0
    return Math.abs(raw) < this.deadzone ? 0 : (Math.sign(raw) * (Math.abs(raw) - this.deadzone)) / (1 - this.deadzone)
  }

  gamepadButton(buttonIndex: number, padIndex = 0): boolean {
    const pads = typeof navigator !== 'undefined' && navigator.getGamepads ? navigator.getGamepads() : []
    const pad = pads[padIndex]
    if (!pad || !pad.connected) return false
    const b = pad.buttons[buttonIndex]
    return Boolean(b && (b.pressed || b.value > 0.45))
  }

  isGamepadConnected(padIndex = 0): boolean {
    const pads = typeof navigator !== 'undefined' && navigator.getGamepads ? navigator.getGamepads() : []
    return Boolean(pads[padIndex]?.connected)
  }

  get look(): [number, number] {
    return [this.gpLook[0], this.gpLook[1]]
  }

  /** Local 2-4 player movement vector combining shared keyboard profiles + Gamepads 0..3. */
  getPlayerMove(playerIndex: number): [number, number] {
    const idx = Math.max(0, Math.min(3, Math.floor(playerIndex)))
    const profiles: Array<[string, string, string, string]> = [
      ["KeyA", "KeyD", "KeyW", "KeyS"],
      ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"],
      ["KeyJ", "KeyL", "KeyI", "KeyK"],
      ["Numpad4", "Numpad6", "Numpad8", "Numpad5"],
    ]
    const [kL, kR, kU, kD] = profiles[idx]
    let x = Number(this.keys.has(kR)) - Number(this.keys.has(kL)) + this.gamepadAxis(0, idx)
    let z = Number(this.keys.has(kD)) - Number(this.keys.has(kU)) + this.gamepadAxis(1, idx)
    if (idx === 0) {
      x += this.touch[0]
      z += this.touch[1]
    }
    const len = Math.max(1, Math.hypot(x, z))
    return [x / len, z / len]
  }

  /** Local 2-4 player action button check combining shared keyboard + Gamepads 0..3. */
  getPlayerAction(playerIndex: number, action: "jump" | "interact" | "attack"): boolean {
    const idx = Math.max(0, Math.min(3, Math.floor(playerIndex)))
    const keyMap: Record<"jump" | "interact" | "attack", string[]> = {
      jump: ["Space", "Enter", "KeyU", "Numpad0"],
      interact: ["KeyE", "ShiftRight", "KeyO", "NumpadEnter"],
      attack: ["KeyF", "ControlRight", "KeyP", "NumpadAdd"],
    }
    const gpBtn: Record<"jump" | "interact" | "attack", number> = { jump: 0, interact: 2, attack: 7 }
    return this.keys.has(keyMap[action][idx]) || this.gamepadButton(gpBtn[action], idx)
  }

    get move(): [number, number] {
    const x = Number(this.pressed('right')) - Number(this.pressed('left')) + this.touch[0] + this.gpMove[0]
    const z = Number(this.pressed('down')) - Number(this.pressed('up')) + this.touch[1] + this.gpMove[1]
    const length = Math.max(1, Math.hypot(x, z))
    return [x / length, z / length]
  }

  setVirtual(action: string, source: string, down: boolean) {
    if (this.modal && down && action !== 'Pause') return
    if (down) {
      if (this.virtual.get(source) === action) return
      this.virtual.set(source, action)
    } else if (!this.virtual.delete(source)) return
    this.refresh()
  }

  releaseVirtual() {
    if (this.virtual.size) {
      this.virtual.clear()
      this.refresh()
    }
  }

  setModal(open: boolean) {
    if (this.modal === open) return
    this.modal = open
    this.clear()
  }

  joystick(x: number, y: number) {
    if (this.modal) return
    this.touch = [x, y]
  }

  clear() {
    this.keys.clear()
    this.gpButtons.clear()
    this.gpMove = [0, 0]
    this.gpLook = [0, 0]
    this.virtual.clear()
    this.touch = [0, 0]
    this.refresh()
  }
}
