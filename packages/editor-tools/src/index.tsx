import { useEffect, useRef, useLayoutEffect, useState } from 'react'
import { createWorld, type RenderWorld } from '../../graphics/src'
import { Vector3 } from '../../graphics/src/scene'
import type { Project, Transform } from '../../project-schema/src'

export interface ViewportProps {
  visible?: boolean
  project: Project
  sceneId?: string
  selectedId: string | null
  onSelect: (id: string | null, additive?: boolean) => void
  onTransform: (id: string, transform: Transform) => void
  tool?: 'select' | 'translate' | 'rotate' | 'scale'
  grid?: boolean
  snap?: boolean
  helpers?: boolean
  orthographic?: boolean
  focusToken?: number
}
const axes = ['x', 'y', 'z'] as const,
  colors = ['#e68177', '#9acf85', '#80acdf']
export function SceneViewport(props: ViewportProps) {
  const host = useRef<HTMLDivElement>(null),
    overlay = useRef<HTMLCanvasElement>(null),
    latest = useRef(props)
  latest.current = props
  const controller = useRef<{ world: RenderWorld; focus: () => void; face: (i: number) => void } | undefined>(
    undefined,
  )
  const [error, setError] = useState('')
  useLayoutEffect(() => {
    const el = host.current!,
      guide = overlay.current!,
      ctx = guide.getContext('2d')!
    let world: RenderWorld
    try {
      world = createWorld(el, latest.current.project, latest.current.sceneId, { editor: true })
    } catch (e) {
      setError(String(e))
      return
    }
    const canvas = world.renderer.domElement,
      target = new Vector3(),
      events = new AbortController(),
      opts = { signal: events.signal }
    canvas.setAttribute('aria-label', '3D scene viewport')
    canvas.tabIndex = 0
    let yaw = 0.69,
      pitch = 0.49,
      distance = 23,
      raf = 0
    let handles: { x: number; y: number; ax: number; ay: number; axis: number }[] = []
    let drag:
      | {
          x: number
          y: number
          lastX: number
          lastY: number
          axis: number
          mode: string
          transform?: Transform
          id?: string
          amount: number
          dx: number
          dy: number
        }
      | undefined
    const focus = () => {
      const n = world.objects.get(latest.current.selectedId ?? '')
      if (n) {
        n.getWorldPosition(target)
        const s = n.getWorldScale(new Vector3())
        distance = Math.max(3, 3 * Math.max(s.x, s.y, s.z))
      }
    }
    controller.current = {
      world,
      focus,
      face(i) {
        yaw = i === 0 ? Math.PI / 2 : 0
        pitch = i === 1 ? Math.PI / 2 - 0.001 : 0
      },
    }
    const project = (p: Vector3) => world.projectPoint(p)
    function line(a: Vector3, b: Vector3, color: string, width = 1) {
      const p = project(a),
        q = project(b)
      if (!p || !q) return
      ctx.beginPath()
      ctx.moveTo(p.x, p.y)
      ctx.lineTo(q.x, q.y)
      ctx.strokeStyle = color
      ctx.lineWidth = width
      ctx.stroke()
    }
    function frame() {
      raf = requestAnimationFrame(frame)
      if (latest.current.visible === false || !el.clientWidth || document.hidden) return
      const c = world.camera
      c.position.set(
        target.x + distance * Math.sin(yaw) * Math.cos(pitch),
        target.y + distance * Math.sin(pitch),
        target.z + distance * Math.cos(yaw) * Math.cos(pitch),
      )
      c.lookAt(target)
      c.fov = 33
      c.height = latest.current.orthographic ? distance * 0.6 : 0
      world.setGrid(!!latest.current.grid, latest.current.project.settings.mode === 'scene' ? -0.02 : -1.95)
      world.render()
      if (guide.width !== el.clientWidth || guide.height !== el.clientHeight) {
        guide.width = el.clientWidth
        guide.height = el.clientHeight
      }
      ctx.clearRect(0, 0, guide.width, guide.height)
      if (latest.current.helpers) {
        const p = latest.current.project
        for (const e of p.scenes.find((s) => s.id === (latest.current.sceneId ?? p.activeScene))?.entities ??
          []) {
          const c = e.components.find(
            (c) => ['light', 'camera', 'collider'].includes(c.type) && c.enabled !== false,
          )
          const n = world.objects.get(e.id)
          if (!c || !n?.active) continue
          const center = n.getWorldPosition(new Vector3())
          if (c.type === 'collider') {
            const scale = n.getWorldScale(new Vector3()),
              size = c.size ?? scale.toArray()
            const corners = Array.from({ length: 8 }, (_, i) =>
              n.localToWorld(
                new Vector3(
                  ...(axes.map((axis, j) => ((((i >> j) & 1) - 0.5) * size[j]) / (scale[axis] || 1)) as [
                    number,
                    number,
                    number,
                  ]),
                ),
              ),
            )
            for (let i = 0; i < 8; i++)
              for (let j = 0; j < 3; j++)
                if (!(i & (1 << j))) line(corners[i], corners[i | (1 << j)], '#80c99f66')
          } else {
            const q = project(center)
            if (!q) continue
            ctx.strokeStyle = '#d5c3ed'
            ctx.beginPath()
            if (c.type === 'light') ctx.arc(q.x, q.y, 4, 0, Math.PI * 2)
            else {
              ctx.moveTo(q.x, q.y - 4)
              ctx.lineTo(q.x + 5, q.y + 4)
              ctx.lineTo(q.x - 5, q.y + 4)
              ctx.closePath()
            }
            ctx.stroke()
          }
        }
      }
      handles = []
      const node = world.objects.get(latest.current.selectedId ?? '')
      if (!node) return
      const center = node.getWorldPosition(new Vector3()),
        p = project(center)
      if (!p) return
      ctx.strokeStyle = '#ffb57c'
      ctx.strokeRect(p.x - 5, p.y - 5, 10, 10)
      if (latest.current.tool === 'select') return
      const len = distance * 0.1
      axes.forEach((axis, i) => {
        const end = node.position.clone()
        end[axis] += len
        if (node.parent) node.parent.localToWorld(end)
        const q = project(end)
        if (!q) return
        line(center, end, colors[i], 3)
        ctx.fillStyle = colors[i]
        ctx.fillRect(q.x - 4, q.y - 4, 8, 8)
        handles.push({ x: q.x, y: q.y, ax: p.x, ay: p.y, axis: i })
      })
    }
    canvas.addEventListener('contextmenu', (e) => e.preventDefault(), opts)
    canvas.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault()
        distance = Math.max(0.5, Math.min(1000, distance * Math.exp(e.deltaY * 0.001)))
      },
      { ...opts, passive: false },
    )
    canvas.addEventListener('dblclick', focus, opts)
    canvas.addEventListener(
      'keydown',
      (e) => {
        if (e.key.toLowerCase() === 'f') focus()
        const step = distance * 0.04
        if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
          const s = e.key === 'ArrowUp' ? -step : step
          target.x += Math.sin(yaw) * s
          target.z += Math.cos(yaw) * s
        } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
          const s = e.key === 'ArrowLeft' ? -step : step
          target.x += Math.cos(yaw) * s
          target.z -= Math.sin(yaw) * s
        } else if (e.key === 'PageUp' || e.key === 'PageDown') target.y += e.key === 'PageUp' ? step : -step
        else return
        e.preventDefault()
      },
      opts,
    )
    canvas.addEventListener(
      'pointerdown',
      (e) => {
        canvas.focus()
        canvas.setPointerCapture(e.pointerId)
        const h =
          e.button === 0 && !e.altKey
            ? handles.find((h) => {
                const dx = h.x - h.ax,
                  dy = h.y - h.ay,
                  t = Math.max(
                    0.15,
                    Math.min(
                      1,
                      ((e.offsetX - h.ax) * dx + (e.offsetY - h.ay) * dy) / (dx * dx + dy * dy || 1),
                    ),
                  )
                return Math.hypot(e.offsetX - h.ax - t * dx, e.offsetY - h.ay - t * dy) < 8
              })
            : undefined
        const n = world.objects.get(latest.current.selectedId ?? '')
        drag = {
          x: e.offsetX,
          y: e.offsetY,
          lastX: e.offsetX,
          lastY: e.offsetY,
          axis: h?.axis ?? -1,
          mode: h ? latest.current.tool! : e.button === 1 || e.shiftKey ? 'pan' : 'orbit',
          amount: distance * 0.1,
          dx: h ? h.x - h.ax : 0,
          dy: h ? h.y - h.ay : 0,
        }
        if (h && n) {
          drag.id = n.id
          drag.transform = {
            position: n.position.toArray(),
            rotation: n.rotation.toArray(),
            scale: n.scale.toArray(),
          }
        }
      },
      opts,
    )
    canvas.addEventListener(
      'pointermove',
      (e) => {
        if (!drag) return
        const dx = e.offsetX - drag.lastX,
          dy = e.offsetY - drag.lastY
        drag.lastX = e.offsetX
        drag.lastY = e.offsetY
        if (drag.mode === 'orbit') {
          yaw -= dx * 0.008
          pitch = Math.min(1.56, Math.max(-1.56, pitch + dy * 0.008))
        } else if (drag.mode === 'pan') {
          target.x -= dx * distance * 0.0015 * Math.cos(yaw)
          target.z += dx * distance * 0.0015 * Math.sin(yaw)
          target.y += dy * distance * 0.0015
        } else if (drag.transform && drag.id) {
          const n = world.objects.get(drag.id)
          if (!n) return
          const key = drag.mode === 'translate' ? 'position' : drag.mode === 'rotate' ? 'rotation' : 'scale',
            axis = axes[drag.axis]
          let delta =
            ((e.offsetX - drag.x) * drag.dx + (e.offsetY - drag.y) * drag.dy) /
            (drag.dx ** 2 + drag.dy ** 2 || 1)
          if (key === 'position') delta *= drag.amount
          if (latest.current.snap) {
            const step = key === 'rotation' ? Math.PI / 12 : 0.25
            delta = Math.round(delta / step) * step
          }
          n[key][axis] = drag.transform[key][drag.axis] + delta
        }
      },
      opts,
    )
    canvas.addEventListener(
      'pointerup',
      (e) => {
        if (!drag) return
        if (drag.id) {
          const n = world.objects.get(drag.id)
          if (n)
            latest.current.onTransform(n.id, {
              position: n.position.toArray(),
              rotation: n.rotation.toArray(),
              scale: n.scale.toArray(),
            })
        } else if (e.button === 0 && Math.hypot(e.offsetX - drag.x, e.offsetY - drag.y) < 4)
          latest.current.onSelect(
            world.pick(e.offsetX, e.offsetY) ?? null,
            e.shiftKey || e.ctrlKey || e.metaKey,
          )
        drag = undefined
      },
      opts,
    )
    canvas.addEventListener(
      'pointercancel',
      () => {
        if (drag?.id && drag.transform) {
          const n = world.objects.get(drag.id)
          if (n) for (const k of ['position', 'scale', 'rotation'] as const) n[k].fromArray(drag.transform[k])
        }
        drag = undefined
      },
      opts,
    )
    raf = requestAnimationFrame(frame)
    return () => {
      events.abort()
      cancelAnimationFrame(raf)
      controller.current = undefined
      world.dispose()
    }
  }, [])
  useEffect(() => {
    const w = controller.current?.world
    if (w) {
      w.load(props.project, props.sceneId)
      void w.ready().catch((e) => setError(String(e)))
    }
  }, [props.project, props.sceneId])
  useEffect(() => {
    if (props.focusToken) controller.current?.focus()
  }, [props.focusToken])
  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      <div ref={host} style={{ position: 'absolute', inset: 0 }} />
      <canvas
        ref={overlay}
        aria-hidden
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
      />
      {error && (
        <div role="alert" style={{ position: 'absolute', top: 8 }}>
          {error}
        </div>
      )}
      <div aria-label="View orientation" style={{ position: 'absolute', right: 12, bottom: 12 }}>
        {axes.map((a, i) => (
          <button
            key={a}
            style={{ color: colors[i] }}
            title={'View along ' + a.toUpperCase()}
            onClick={() => controller.current?.face(i)}
          >
            {a.toUpperCase()}
          </button>
        ))}
      </div>
    </div>
  )
}
