import type { TouchControlConfig, TouchSettings } from '../../project-schema/src'
import type { Input } from './input'

export interface TouchPointerState {
  id: number
  x: number
  y: number
  type: 'touch' | 'mouse' | 'pen'
  down: boolean
}

export interface TouchEmulationOptions {
  emulateTouchFromMouse?: boolean
  emulateMouseFromTouch?: boolean
}

export interface TouchAPI {
  /** Whether the current device reports touch capability. */
  isTouchDevice(): boolean
  /** Whether the virtual touch overlay is currently visible. */
  isVisible(): boolean
  /** Show or hide virtual touch controls at runtime. */
  setVisible(visible: boolean): void
  /** Read normalized [x, y] vector (-1..1) of a virtual joystick (default: 'move'). */
  getJoystick(id?: string): [number, number]
  /** Check if a virtual touch button is currently pressed. */
  isButtonPressed(id: string): boolean
  /** Add or replace a virtual joystick at runtime. */
  addJoystick(cfg: Omit<TouchControlConfig, 'kind'>): void
  /** Add or replace a virtual action button at runtime. */
  addButton(cfg: Omit<TouchControlConfig, 'kind'>): void
  /** Remove a virtual touch control by ID. */
  removeControl(id: string): void
  /** Configure Godot-style bidirectional Mouse <-> Touch emulation at runtime. */
  setEmulation(opts: TouchEmulationOptions): void
  /** Return active pointers (touches and/or emulated mouse pointers). */
  getPointers(): TouchPointerState[]
}

export const DEFAULT_TOUCH_CONTROLS: TouchControlConfig[] = [
  { id: 'move', kind: 'joystick', label: 'MOVE', action: 'move', x: 14, y: 78, size: 112, deadzone: 0.12, color: '#ffffff' },
  { id: 'jump', kind: 'button', label: 'JUMP', action: 'Jump', x: 88, y: 80, size: 64, color: '#58b8ff' },
  { id: 'interact', kind: 'button', label: 'E', action: 'Interact', x: 78, y: 68, size: 56, color: '#ffb84d' },
  { id: 'sprint', kind: 'button', label: 'RUN', action: 'Sprint', x: 88, y: 60, size: 50, color: '#7ee787' },
  { id: 'crouch', kind: 'button', label: 'C', action: 'Crouch', x: 76, y: 84, size: 48, color: '#c9d1d9' },
]

export class TouchController {
  private layer: HTMLDivElement
  private controls: TouchControlConfig[] = []
  private joysticks = new Map<string, [number, number]>()
  private buttons = new Set<string>()
  private pointers = new Map<number, TouchPointerState>()
  private lookPointerId: number | null = null
  private lastLook = { x: 0, y: 0 }
  private visible = false
  private emulateTouchFromMouse = false
  private emulateMouseFromTouch = true
  private lookSensitivity = 0.0045
  private opacity = 0.65
  private disposed = false

  constructor(
    private host: HTMLElement,
    private canvas: HTMLCanvasElement,
    private input: Input,
    private onLook: (dx: number, dy: number) => void,
    private onTap: (clientX: number, clientY: number) => void,
    private signal: AbortSignal,
    settings?: Partial<TouchSettings>,
  ) {
    if (typeof document === 'undefined' || typeof document.createElement !== 'function') {
      this.layer = { style: {}, className: '', innerHTML: '', append: () => {}, remove: () => {} } as any
      return
    }
    this.layer = document.createElement('div')
    this.layer.className = 'mf-touch-layer'
    Object.assign(this.layer.style, {
      position: 'absolute',
      inset: '0',
      pointerEvents: 'none',
      zIndex: '25',
      userSelect: 'none',
      touchAction: 'none',
      overflow: 'hidden',
    })
    this.host.append(this.layer)

    const mode = settings?.mode ?? 'auto'
    this.emulateTouchFromMouse = Boolean(settings?.emulateTouchFromMouse)
    this.emulateMouseFromTouch = settings?.emulateMouseFromTouch !== false
    this.lookSensitivity = Math.max(0.0005, Number(settings?.lookSensitivity ?? 0.0045))
    this.opacity = Math.max(0.1, Math.min(1, Number(settings?.opacity ?? 0.65)))
    this.controls =
      Array.isArray(settings?.controls) && settings.controls.length
        ? structuredClone(settings.controls)
        : structuredClone(DEFAULT_TOUCH_CONTROLS)

    const isTouch = this.isTouchDevice()
    this.visible = mode === 'always' || (mode === 'auto' && isTouch)
    this.renderControls()
    this.bindCanvasEvents()
  }

  isTouchDevice(): boolean {
    return (
      typeof window !== 'undefined' &&
      ('ontouchstart' in window || (navigator.maxTouchPoints ?? 0) > 0)
    )
  }

  private acceptPointer(e: PointerEvent): boolean {
    if (e.pointerType === 'touch' || e.pointerType === 'pen') return true
    if (e.pointerType === 'mouse' && this.emulateTouchFromMouse) return true
    return false
  }

  private bindCanvasEvents() {
    let tapStart: { id: number; x: number; y: number; time: number } | null = null

    this.canvas.addEventListener(
      'pointerdown',
      (e) => {
        this.pointers.set(e.pointerId, {
          id: e.pointerId,
          x: e.clientX,
          y: e.clientY,
          type: (e.pointerType as any) || 'mouse',
          down: true,
        })
        if (!this.acceptPointer(e)) return
        if (this.lookPointerId === null && (this.visible || e.pointerType === 'touch')) {
          this.lookPointerId = e.pointerId
          this.lastLook = { x: e.clientX, y: e.clientY }
          tapStart = { id: e.pointerId, x: e.clientX, y: e.clientY, time: performance.now() }
        }
      },
      { signal: this.signal },
    )

    window.addEventListener(
      'pointermove',
      (e) => {
        const pt = this.pointers.get(e.pointerId)
        if (pt) {
          pt.x = e.clientX
          pt.y = e.clientY
        }
        if (this.lookPointerId === e.pointerId) {
          const dx = e.clientX - this.lastLook.x
          const dy = e.clientY - this.lastLook.y
          this.lastLook = { x: e.clientX, y: e.clientY }
          if (Math.abs(dx) > 0.01 || Math.abs(dy) > 0.01) {
            this.onLook(dx * this.lookSensitivity, dy * this.lookSensitivity)
          }
        }
      },
      { signal: this.signal },
    )

    const release = (e: PointerEvent) => {
      this.pointers.delete(e.pointerId)
      if (this.lookPointerId === e.pointerId) {
        if (
          tapStart &&
          tapStart.id === e.pointerId &&
          this.emulateMouseFromTouch &&
          e.pointerType === 'touch'
        ) {
          const dist = Math.hypot(e.clientX - tapStart.x, e.clientY - tapStart.y)
          if (dist < 14 && performance.now() - tapStart.time < 320) {
            this.onTap(e.clientX, e.clientY)
          }
        }
        this.lookPointerId = null
        tapStart = null
      }
    }
    window.addEventListener('pointerup', release, { signal: this.signal })
    window.addEventListener('pointercancel', release, { signal: this.signal })
  }

  private renderControls() {
    this.layer.innerHTML = ''
    this.layer.style.display = this.visible ? 'block' : 'none'
    if (!this.visible) return

    for (const cfg of this.controls) {
      if (cfg.kind === 'joystick') this.mountJoystick(cfg)
      else if (cfg.kind === 'button') this.mountButton(cfg)
    }
  }

  private mountJoystick(cfg: TouchControlConfig) {
    const size = Math.max(64, cfg.size || 110)
    const knobSize = Math.round(size * 0.42)
    const maxR = (size - knobSize) * 0.5
    const deadzone = Math.max(0, Math.min(0.6, cfg.deadzone ?? 0.12))

    const base = document.createElement('div')
    Object.assign(base.style, {
      position: 'absolute',
      left: `${cfg.x}%`,
      top: `${cfg.y}%`,
      width: `${size}px`,
      height: `${size}px`,
      transform: 'translate(-50%, -50%)',
      borderRadius: '50%',
      background: 'rgba(15, 23, 34, 0.42)',
      border: `2px solid ${cfg.color || '#ffffff'}66`,
      boxShadow: 'inset 0 0 18px rgba(0,0,0,0.35)',
      opacity: String(this.opacity),
      pointerEvents: 'auto',
      touchAction: 'none',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    })

    const knob = document.createElement('div')
    Object.assign(knob.style, {
      width: `${knobSize}px`,
      height: `${knobSize}px`,
      borderRadius: '50%',
      background: `radial-gradient(circle at 35% 35%, ${cfg.color || '#ffffff'}ee, ${cfg.color || '#ffffff'}88)`,
      boxShadow: '0 2px 10px rgba(0,0,0,0.45)',
      pointerEvents: 'none',
      transition: 'transform 0.03s linear',
    })
    base.append(knob)

    let activeId: number | null = null
    const updateVec = (clientX: number, clientY: number) => {
      const rect = base.getBoundingClientRect()
      const cx = rect.left + rect.width / 2
      const cy = rect.top + rect.height / 2
      let dx = clientX - cx
      let dy = clientY - cy
      const dist = Math.hypot(dx, dy)
      if (dist > maxR && dist > 0) {
        dx = (dx / dist) * maxR
        dy = (dy / dist) * maxR
      }
      knob.style.transform = `translate(${dx}px, ${dy}px)`
      const nx = maxR > 0 ? dx / maxR : 0
      const ny = maxR > 0 ? dy / maxR : 0
      const mag = Math.hypot(nx, ny)
      const vec: [number, number] = mag < deadzone ? [0, 0] : [nx, ny]
      this.joysticks.set(cfg.id, vec)
      if (cfg.action === 'move' || cfg.id === 'move') this.input.joystick(vec[0], vec[1])
    }

    base.addEventListener('pointerdown', (e) => {
      if (!this.acceptPointer(e)) return
      e.stopPropagation()
      e.preventDefault()
      activeId = e.pointerId
      base.setPointerCapture?.(e.pointerId)
      updateVec(e.clientX, e.clientY)
    })
    base.addEventListener('pointermove', (e) => {
      if (activeId !== e.pointerId) return
      e.stopPropagation()
      updateVec(e.clientX, e.clientY)
    })
    const end = (e: PointerEvent) => {
      if (activeId !== e.pointerId) return
      activeId = null
      knob.style.transform = 'translate(0px, 0px)'
      this.joysticks.set(cfg.id, [0, 0])
      if (cfg.action === 'move' || cfg.id === 'move') this.input.joystick(0, 0)
    }
    base.addEventListener('pointerup', end)
    base.addEventListener('pointercancel', end)

    this.layer.append(base)
  }

  private mountButton(cfg: TouchControlConfig) {
    const size = Math.max(38, cfg.size || 56)
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.textContent = cfg.label || cfg.action || cfg.id
    Object.assign(btn.style, {
      position: 'absolute',
      left: `${cfg.x}%`,
      top: `${cfg.y}%`,
      width: `${size}px`,
      height: `${size}px`,
      transform: 'translate(-50%, -50%)',
      borderRadius: '50%',
      background: 'rgba(15, 23, 34, 0.52)',
      border: `2px solid ${cfg.color || '#ffffff'}99`,
      color: '#ffffff',
      font: '700 11px/1 system-ui, sans-serif',
      letterSpacing: '0.04em',
      opacity: String(this.opacity),
      pointerEvents: 'auto',
      touchAction: 'none',
      cursor: 'pointer',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      boxShadow: '0 3px 10px rgba(0,0,0,0.35)',
    })

    const setDown = (down: boolean) => {
      if (down) this.buttons.add(cfg.id)
      else this.buttons.delete(cfg.id)
      btn.style.transform = down ? 'translate(-50%, -50%) scale(0.91)' : 'translate(-50%, -50%)'
      btn.style.background = down ? `${cfg.color || '#58b8ff'}66` : 'rgba(15, 23, 34, 0.52)'
      if (cfg.action) this.input.setVirtual(cfg.action, 'touch:' + cfg.id, down)
    }

    btn.addEventListener('pointerdown', (e) => {
      if (!this.acceptPointer(e)) return
      e.stopPropagation()
      e.preventDefault()
      btn.setPointerCapture?.(e.pointerId)
      setDown(true)
    })
    const up = (e: PointerEvent) => {
      e.stopPropagation()
      if (this.buttons.has(cfg.id)) setDown(false)
    }
    btn.addEventListener('pointerup', up)
    btn.addEventListener('pointercancel', up)
    btn.addEventListener('lostpointercapture', up)

    this.layer.append(btn)
  }

  api(): TouchAPI {
    return {
      isTouchDevice: () => this.isTouchDevice(),
      isVisible: () => this.visible,
      setVisible: (v: boolean) => {
        this.visible = Boolean(v)
        this.renderControls()
      },
      getJoystick: (id = 'move') => this.joysticks.get(id) ?? [0, 0],
      isButtonPressed: (id: string) => this.buttons.has(id),
      addJoystick: (cfg) => {
        this.controls = this.controls.filter((c) => c.id !== cfg.id)
        this.controls.push({ ...cfg, kind: 'joystick' })
        this.renderControls()
      },
      addButton: (cfg) => {
        this.controls = this.controls.filter((c) => c.id !== cfg.id)
        this.controls.push({ ...cfg, kind: 'button' })
        this.renderControls()
      },
      removeControl: (id: string) => {
        this.controls = this.controls.filter((c) => c.id !== id)
        this.joysticks.delete(id)
        this.buttons.delete(id)
        this.renderControls()
      },
      setEmulation: (opts: TouchEmulationOptions) => {
        if (opts.emulateTouchFromMouse !== undefined)
          this.emulateTouchFromMouse = Boolean(opts.emulateTouchFromMouse)
        if (opts.emulateMouseFromTouch !== undefined)
          this.emulateMouseFromTouch = Boolean(opts.emulateMouseFromTouch)
      },
      getPointers: () => [...this.pointers.values()],
    }
  }

  dispose() {
    if (this.disposed) return
    this.disposed = true
    this.layer.remove()
  }
}
