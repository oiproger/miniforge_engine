export class Input {
  private keys = new Set<string>()
  private virtual = new Map<string, string>()
  private modal = false
  private touch = [0, 0]
  private active = new Set<string>()
  private bindings: Record<string, string[]> = {
    left: ['KeyA', 'ArrowLeft'],
    right: ['KeyD', 'ArrowRight'],
    up: ['KeyW', 'ArrowUp'],
    down: ['KeyS', 'ArrowDown'],
    Jump: ['Space'],
    Interact: ['KeyE'],
    Attack: ['KeyF'],
    Sprint: ['ShiftLeft', 'ShiftRight'],
    Crouch: ['ControlLeft', 'KeyC'],
    Flashlight: ['KeyL'],
    Phone: ['Tab', 'KeyP'],
    Pause: ['Escape'],
  }
  constructor(
    signal: AbortSignal,
    private onPause: () => void,
    private edge?: (action: string, down: boolean) => void,
  ) {
    window.addEventListener(
      'keydown',
      (e) => {
        if (e.repeat && !this.keys.has(e.code)) return
        if (this.modal && !this.bindings.Pause.includes(e.code)) return
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
    window.addEventListener('blur', () => this.clear(), { signal })
  }
  private refresh() {
    const next = new Set(this.virtual.values())
    for (const [name, codes] of Object.entries(this.bindings))
      if (codes.some((code) => this.keys.has(code))) next.add(name)
    const previous = this.active
    this.active = next
    for (const name of previous) if (!next.has(name)) this.edge?.(name, false)
    for (const name of next)
      if (!previous.has(name)) {
        this.edge?.(name, true)
        if (name === 'Pause') this.onPause()
      }
  }
  bind(action: string, codes: string[]) {
    this.bindings[action] = codes
    this.refresh()
  }
  pressed(action: string) {
    return this.active.has(action) || this.keys.has(action)
  }
  get move(): [number, number] {
    const x = Number(this.pressed('right')) - Number(this.pressed('left')) + this.touch[0]
    const z = Number(this.pressed('down')) - Number(this.pressed('up')) + this.touch[1]
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
    this.virtual.clear()
    this.touch = [0, 0]
    this.refresh()
  }
}
