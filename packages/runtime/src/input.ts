export class Input {
  private keys = new Set<string>()
  private touch = [0, 0]
  private bindings: Record<string, string[]> = {
    left: ['KeyA', 'ArrowLeft'],
    right: ['KeyD', 'ArrowRight'],
    up: ['KeyW', 'ArrowUp'],
    down: ['KeyS', 'ArrowDown'],
    Jump: ['Space'],
    Interact: ['KeyE'],
    Attack: ['KeyF'],
    Pause: ['Escape'],
  }
  constructor(signal: AbortSignal, onPause: () => void) {
    window.addEventListener(
      'keydown',
      (e) => {
        if (Object.values(this.bindings).some((keys) => keys.includes(e.code))) e.preventDefault()
        this.keys.add(e.code)
        if (!e.repeat && this.bindings.Pause.includes(e.code)) onPause()
      },
      { signal },
    )
    window.addEventListener('keyup', (e) => this.keys.delete(e.code), { signal })
    window.addEventListener('blur', () => this.clear(), { signal })
  }
  bind(action: string, codes: string[]) {
    this.bindings[action] = codes
  }
  pressed(action: string) {
    return this.keys.has(action) || !!this.bindings[action]?.some((k) => this.keys.has(k))
  }
  get move(): [number, number] {
    const x = Number(this.pressed('right')) - Number(this.pressed('left')) + this.touch[0]
    const z = Number(this.pressed('down')) - Number(this.pressed('up')) + this.touch[1]
    const length = Math.max(1, Math.hypot(x, z))
    return [x / length, z / length]
  }
  joystick(x: number, y: number) {
    this.touch = [x, y]
  }
  clear() {
    this.keys.clear()
    this.touch = [0, 0]
  }
}
