import { useEffect, useRef, useLayoutEffect, useState } from 'react'
import { createWorld, type RenderWorld } from '../../graphics/src'
import { Vector3 } from '../../graphics/src/scene'
import {
  brushTerrain,
  ensureTerrainLayers,
  raycastTerrain,
  sampleTerrainGridHeight,
  terrainTools,
  type Project,
  navCellToWorld,
  type NavZone,
  type Terrain,
  type TerrainTool,
  type Transform,
  type Vec3,
} from '../../project-schema/src'

export interface TerrainBrushConfig {
  enabled: boolean
  tool: TerrainTool
  radius: number
  strength: number
  falloff: number
  hardness: number
  level: number
  activeLayer: number
  scatterAssets?: string[]
  scatterDensity?: number
  scatterScaleMin?: number
  scatterScaleMax?: number
  scatterSpacing?: number
}

export interface ViewportProps {
  visible?: boolean
  project: Project
  sceneId?: string
  selectedId: string | null
  onSelect: (id: string | null, additive?: boolean) => void
  onTransform: (id: string, transform: Transform) => void
  onDropAsset?: (assetId: string, hitEntityId: string | undefined, worldPos: Vec3) => void
  tool?: 'select' | 'translate' | 'rotate' | 'scale'
  grid?: boolean
  snap?: boolean
  helpers?: boolean
  orthographic?: boolean
  focusToken?: number
  terrainBrush?: TerrainBrushConfig
  onTerrainBrushChange?: (patch: Partial<TerrainBrushConfig>) => void
  onTerrainEdit?: (entityId: string, patch: Partial<Terrain>, commit: boolean) => void
  onTerrainScatter?: (entityId: string, worldPos: Vec3, radiusMeters: number, erase: boolean) => void
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
  const [dragOver, setDragOver] = useState(false)
  const [navMode, setNavMode] = useState<'orbit' | 'fly'>('orbit')
  const navModeRef = useRef<'orbit' | 'fly'>('orbit')
  navModeRef.current = navMode
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
      raf = 0,
      lastFrame = performance.now(),
      flySpeed = 10,
      flyActive = false,
      flyYaw = -0.69,
      flyPitch = -0.49
    const flyPos = new Vector3(
      target.x + distance * Math.sin(yaw) * Math.cos(pitch),
      target.y + distance * Math.sin(pitch),
      target.z + distance * Math.cos(yaw) * Math.cos(pitch),
    )
    const heldKeys = new Set<string>()
    const syncFlyFromOrbit = () => {
      flyPos.set(
        target.x + distance * Math.sin(yaw) * Math.cos(pitch),
        target.y + distance * Math.sin(pitch),
        target.z + distance * Math.cos(yaw) * Math.cos(pitch),
      )
      flyYaw = yaw
      flyPitch = -pitch
    }
    const syncOrbitFromFly = () => {
      const cp = Math.cos(flyPitch),
        sp = Math.sin(flyPitch)
      const fwdX = -Math.sin(flyYaw) * cp,
        fwdY = sp,
        fwdZ = -Math.cos(flyYaw) * cp
      target.set(flyPos.x + fwdX * distance, flyPos.y + fwdY * distance, flyPos.z + fwdZ * distance)
      yaw = flyYaw
      pitch = -flyPitch
    }
    let handles: { x: number; y: number; ax: number; ay: number; axis: number }[] = []
    let hoveredAxis = -1
    const pickGizmoHandle = (px: number, py: number) => {
      let best: (typeof handles)[number] | undefined
      let bestDist = 18
      for (const h of handles) {
        const dx = h.x - h.ax
        const dy = h.y - h.ay
        const lenSq = dx * dx + dy * dy || 1
        const t = Math.max(0.08, Math.min(1.08, ((px - h.ax) * dx + (py - h.ay) * dy) / lenSq))
        const segDist = Math.hypot(px - (h.ax + t * dx), py - (h.ay + t * dy))
        const tipDist = Math.hypot(px - h.x, py - h.y)
        const d = Math.min(segDist, tipDist * 0.85)
        if (d < bestDist) {
          bestDist = d
          best = h
        }
      }
      return best
    }
    let terrainHover: { worldPos: Vec3; gx: number; gz: number } | null = null
    let terrainStroke: {
      entityId: string
      data: Terrain
      lastGx: number
      lastGz: number
      lastPush: number
    } | null = null
    const getSelectedTerrain = () => {
      const p = latest.current.project
      const scene = p.scenes.find((s) => s.id === (latest.current.sceneId ?? p.activeScene))
      const entity = scene?.entities.find((e) => e.id === latest.current.selectedId)
      const comp = entity?.components.find((c) => c.type === 'terrain' && c.enabled !== false) as Terrain | undefined
      return entity && comp ? { entity, terrain: comp } : null
    }
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
      const now = performance.now()
      const dt = Math.min(0.05, Math.max(0.001, (now - lastFrame) / 1000))
      lastFrame = now
      const wantFly = navModeRef.current === 'fly' || drag?.mode === 'fly'
      if (wantFly && !flyActive) {
        syncFlyFromOrbit()
        flyActive = true
      } else if (!wantFly && flyActive) {
        syncOrbitFromFly()
        flyActive = false
      }
      const c = world.camera
      if (flyActive) {
        const cp = Math.cos(flyPitch),
          sp = Math.sin(flyPitch)
        const fwdX = -Math.sin(flyYaw) * cp,
          fwdY = sp,
          fwdZ = -Math.cos(flyYaw) * cp
        const rightX = Math.cos(flyYaw),
          rightZ = -Math.sin(flyYaw)
        let mx = 0,
          my = 0,
          mz = 0
        if (heldKeys.has('KeyW')) { mx += fwdX; my += fwdY; mz += fwdZ }
        if (heldKeys.has('KeyS')) { mx -= fwdX; my -= fwdY; mz -= fwdZ }
        if (heldKeys.has('KeyD')) { mx += rightX; mz += rightZ }
        if (heldKeys.has('KeyA')) { mx -= rightX; mz -= rightZ }
        if (heldKeys.has('KeyE') || heldKeys.has('Space')) my += 1
        if (heldKeys.has('KeyQ') || heldKeys.has('ControlLeft')) my -= 1
        const len = Math.hypot(mx, my, mz)
        if (len > 0) {
          const mult = heldKeys.has('ShiftLeft') || heldKeys.has('ShiftRight') ? 2.5 : 1
          const step = (flySpeed * mult * dt) / len
          flyPos.x += mx * step
          flyPos.y += my * step
          flyPos.z += mz * step
        }
        c.position.copy(flyPos)
        c.rotation.set(flyPitch, flyYaw, 0)
      } else {
        c.position.set(
          target.x + distance * Math.sin(yaw) * Math.cos(pitch),
          target.y + distance * Math.sin(pitch),
          target.z + distance * Math.cos(yaw) * Math.cos(pitch),
        )
        c.lookAt(target)
      }
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
            (c) => ['light', 'camera', 'collider', 'bakeZone', 'navZone'].includes(c.type) && c.enabled !== false,
          )
          const n = world.objects.get(e.id)
          if (!c || !n?.active) continue
          const center = n.getWorldPosition(new Vector3())
          if (c.type === 'navZone') {
            const nz = c as NavZone
            if (nz.showOverlay === false) continue
            const step = Math.max(1, Math.ceil(Math.max(nz.cols || 1, nz.rows || 1) / 36))
            for (let r = 0; r < (nz.rows || 0); r += step) {
              for (let col = 0; col < (nz.cols || 0); col += step) {
                const val = nz.walkable[r * nz.cols + col]
                const wp = navCellToWorld(nz, e.transform, col, r)
                const q = project(new Vector3(wp[0], wp[1] + 0.06, wp[2]))
                if (!q) continue
                ctx.fillStyle = val === 0 ? 'rgba(235, 92, 92, 0.52)' : val > 1 ? 'rgba(255, 196, 86, 0.65)' : 'rgba(92, 224, 152, 0.55)'
                ctx.fillRect(q.x - 2, q.y - 2, 4, 4)
              }
            }
            for (const lnk of nz.links ?? []) {
              const a = new Vector3(lnk.from[0], lnk.from[1] + 0.15, lnk.from[2])
              const b = new Vector3(lnk.to[0], lnk.to[1] + 0.15, lnk.to[2])
              line(a, b, lnk.enabled === false ? '#88888888' : '#ffb84d', 2.2)
            }
          } else if (c.type === 'collider') {
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
      const tb = latest.current.terrainBrush
      const selTerrain = getSelectedTerrain()
      if (tb?.enabled && selTerrain && terrainHover) {
        const t = terrainStroke?.entityId === selTerrain.entity.id ? terrainStroke.data : selTerrain.terrain
        const tr = selTerrain.entity.transform
        const px = tr.position[0], py = tr.position[1], pz = tr.position[2]
        const sx = tr.scale[0] || 1, sy = tr.scale[1] || 1, sz = tr.scale[2] || 1
        const cellW = (t.size / t.segments) * sx
        const cellD = (t.size / t.segments) * sz
        const isPaint = tb.tool === 'Paint' || tb.tool === 'Erase paint'
        const ringColor = isPaint ? '#ffb84d' : '#58d8ff'
        const drawRing = (radCells: number, strokeCol: string, width: number, dashed = false) => {
          const segs = 36
          ctx.save()
          ctx.beginPath()
          if (dashed) ctx.setLineDash([4, 4])
          let started = false
          for (let i = 0; i <= segs; i++) {
            const ang = (i / segs) * Math.PI * 2
            const gx = terrainHover!.gx + Math.cos(ang) * radCells
            const gz = terrainHover!.gz + Math.sin(ang) * radCells
            const lx = (gx / t.segments - 0.5) * t.size
            const lz = (gz / t.segments - 0.5) * t.size
            const ly = sampleTerrainGridHeight(t, gx, gz)
            const wp = new Vector3(px + lx * sx, py + ly * sy + 0.04, pz + lz * sz)
            const q = project(wp)
            if (!q) { started = false; continue }
            if (!started) { ctx.moveTo(q.x, q.y); started = true }
            else ctx.lineTo(q.x, q.y)
          }
          ctx.strokeStyle = strokeCol
          ctx.lineWidth = width
          ctx.stroke()
          ctx.restore()
        }
        drawRing(tb.radius, ringColor, 2.2, false)
        const innerRatio = isPaint
          ? Math.max(0.08, Math.min(0.95, tb.hardness))
          : Math.max(0.12, Math.min(0.9, 1 / (1 + Math.max(0.1, tb.falloff) * 0.6)))
        drawRing(tb.radius * innerRatio, ringColor + '99', 1.25, true)
        const cp = project(new Vector3(terrainHover.worldPos[0], terrainHover.worldPos[1] + 0.05, terrainHover.worldPos[2]))
        if (cp) {
          ctx.fillStyle = ringColor
          ctx.beginPath()
          ctx.arc(cp.x, cp.y, 3.2, 0, Math.PI * 2)
          ctx.fill()
          const worldR = (tb.radius * (cellW + cellD) * 0.5).toFixed(1)
          const label = isPaint
            ? `${tb.tool} L${tb.activeLayer} · R ${tb.radius.toFixed(1)} (${worldR}m)`
            : `${tb.tool} · R ${tb.radius.toFixed(1)} (${worldR}m) · H ${terrainHover.worldPos[1].toFixed(2)}`
          ctx.font = '600 11px system-ui, sans-serif'
          const tw = ctx.measureText(label).width
          ctx.fillStyle = 'rgba(13, 18, 25, 0.78)'
          ctx.fillRect(cp.x + 10, cp.y - 22, tw + 12, 18)
          ctx.fillStyle = '#eef4fa'
          ctx.fillText(label, cp.x + 16, cp.y - 9)
        }
      }
      handles = []
      const node = world.objects.get(latest.current.selectedId ?? '')
      if (tb?.enabled && selTerrain) return
      if (!node) return
      const center = node.getWorldPosition(new Vector3()),
        p = project(center)
      if (!p) return
      ctx.strokeStyle = '#ffb57c'
      ctx.lineWidth = 1.8
      ctx.strokeRect(p.x - 6, p.y - 6, 12, 12)
      if (latest.current.tool === 'select') return
      const len = distance * 0.135
      const activeAxis = drag?.id ? drag.axis : hoveredAxis
      axes.forEach((axis, i) => {
        const end = node.position.clone()
        end[axis] += len
        if (node.parent) node.parent.localToWorld(end)
        const q = project(end)
        if (!q) return
        const hot = activeAxis === i
        const col = hot ? '#ffffff' : colors[i]
        // Dark halo under axis for crisp visibility on bright surfaces
        line(center, end, 'rgba(0,0,0,0.55)', hot ? 9 : 7)
        line(center, end, colors[i], hot ? 6.5 : 4.6)
        if (hot) line(center, end, '#ffffffaa', 2)
        const ang = Math.atan2(q.y - p.y, q.x - p.x)
        ctx.save()
        ctx.translate(q.x, q.y)
        ctx.fillStyle = col
        ctx.strokeStyle = 'rgba(0,0,0,0.65)'
        ctx.lineWidth = 1.6
        if (latest.current.tool === 'translate') {
          ctx.rotate(ang)
          ctx.beginPath()
          ctx.moveTo(9, 0)
          ctx.lineTo(-6, -6.5)
          ctx.lineTo(-6, 6.5)
          ctx.closePath()
          ctx.fill()
          ctx.stroke()
        } else if (latest.current.tool === 'rotate') {
          ctx.beginPath()
          ctx.arc(0, 0, hot ? 7.5 : 6, 0, Math.PI * 2)
          ctx.fill()
          ctx.stroke()
        } else {
          const s = hot ? 7 : 5.5
          ctx.fillRect(-s, -s, s * 2, s * 2)
          ctx.strokeRect(-s, -s, s * 2, s * 2)
        }
        ctx.restore()
        ctx.font = '700 11px system-ui, sans-serif'
        ctx.fillStyle = hot ? '#ffffff' : colors[i]
        ctx.fillText(axis.toUpperCase(), q.x + Math.cos(ang) * 14 - 4, q.y + Math.sin(ang) * 14 + 4)
        handles.push({ x: q.x, y: q.y, ax: p.x, ay: p.y, axis: i })
      })
    }
    canvas.addEventListener('contextmenu', (e) => e.preventDefault(), opts)
    canvas.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault()
        if (flyActive) {
          flySpeed = Math.max(1, Math.min(80, flySpeed * Math.exp(-e.deltaY * 0.001)))
        } else {
          distance = Math.max(0.5, Math.min(1000, distance * Math.exp(e.deltaY * 0.001)))
        }
      },
      { ...opts, passive: false },
    )
    canvas.addEventListener('dblclick', focus, opts)
    window.addEventListener('keyup', (e) => heldKeys.delete(e.code), opts)
    window.addEventListener('blur', () => heldKeys.clear(), opts)
    canvas.addEventListener(
      'keydown',
      (e) => {
        if (flyActive && ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE', 'Space', 'ShiftLeft', 'ShiftRight', 'ControlLeft'].includes(e.code)) {
          heldKeys.add(e.code)
          e.preventDefault()
          e.stopPropagation()
          return
        }
        if (latest.current.terrainBrush?.enabled && (e.key === '[' || e.key === ']')) {
          const cur = latest.current.terrainBrush.radius
          const next = Math.max(0.5, Math.min(32, cur + (e.key === ']' ? 0.5 : -0.5)))
          latest.current.onTerrainBrushChange?.({ radius: next })
          e.preventDefault()
          return
        }
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
        const h = e.button === 0 && !e.altKey ? pickGizmoHandle(e.offsetX, e.offsetY) : undefined
        const tbNow = latest.current.terrainBrush
        const selT = getSelectedTerrain()
        if (tbNow?.enabled && selT && e.button === 0 && !e.altKey && !e.shiftKey && navModeRef.current !== 'fly') {
          const ray = world.screenToRay(e.offsetX, e.offsetY)
          const hit = raycastTerrain(selT.terrain, ray.origin, ray.direction, selT.entity.transform)
          if (hit) {
            terrainHover = hit
            if (tbNow.tool === 'Scatter' || tbNow.tool === 'Erase scatter') {
              const cellW = (selT.terrain.size / selT.terrain.segments) * (selT.entity.transform.scale[0] || 1)
              latest.current.onTerrainScatter?.(selT.entity.id, hit.worldPos, tbNow.radius * cellW, tbNow.tool === 'Erase scatter')
              drag = { x: e.offsetX, y: e.offsetY, lastX: e.offsetX, lastY: e.offsetY, axis: -1, mode: 'scatter', amount: 0, dx: 0, dy: 0 }
              return
            }
            const data = structuredClone(selT.terrain)
            brushTerrain(data, tbNow.tool, hit.gx, hit.gz, tbNow.radius, tbNow.strength, tbNow.level, tbNow.falloff, tbNow.activeLayer, tbNow.hardness)
            terrainStroke = { entityId: selT.entity.id, data, lastGx: hit.gx, lastGz: hit.gz, lastPush: performance.now() }
            latest.current.onTerrainEdit?.(selT.entity.id, { heights: data.heights, layers: data.layers, splatWeights: data.splatWeights }, false)
            drag = { x: e.offsetX, y: e.offsetY, lastX: e.offsetX, lastY: e.offsetY, axis: -1, mode: 'terrain', amount: 0, dx: 0, dy: 0 }
            return
          }
        }
        const n = world.objects.get(latest.current.selectedId ?? '')
        drag = {
          x: e.offsetX,
          y: e.offsetY,
          lastX: e.offsetX,
          lastY: e.offsetY,
          axis: h?.axis ?? -1,
          mode: h ? latest.current.tool! : e.button === 2 || (navModeRef.current === 'fly' && e.button === 0) ? 'fly' : e.button === 1 || e.shiftKey ? 'pan' : 'orbit',
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
        const tbMove = latest.current.terrainBrush
        const selTMove = getSelectedTerrain()
        if (tbMove?.enabled && selTMove) {
          const ray = world.screenToRay(e.offsetX, e.offsetY)
          const activeT = terrainStroke?.entityId === selTMove.entity.id ? terrainStroke.data : selTMove.terrain
          const hit = raycastTerrain(activeT, ray.origin, ray.direction, selTMove.entity.transform)
          terrainHover = hit
          if (drag?.mode === 'scatter' && hit) {
            if (Math.hypot(e.offsetX - drag.lastX, e.offsetY - drag.lastY) > 18) {
              drag.lastX = e.offsetX
              drag.lastY = e.offsetY
              const cellW = (selTMove.terrain.size / selTMove.terrain.segments) * (selTMove.entity.transform.scale[0] || 1)
              latest.current.onTerrainScatter?.(selTMove.entity.id, hit.worldPos, tbMove.radius * cellW, tbMove.tool === 'Erase scatter')
            }
            return
          }
          if (drag?.mode === 'terrain' && terrainStroke && hit) {
            const dist = Math.hypot(hit.gx - terrainStroke.lastGx, hit.gz - terrainStroke.lastGz)
            const steps = Math.max(1, Math.ceil(dist / Math.max(0.35, tbMove.radius * 0.35)))
            for (let s = 1; s <= steps; s++) {
              const f = s / steps
              brushTerrain(
                terrainStroke.data,
                tbMove.tool,
                terrainStroke.lastGx + (hit.gx - terrainStroke.lastGx) * f,
                terrainStroke.lastGz + (hit.gz - terrainStroke.lastGz) * f,
                tbMove.radius,
                tbMove.strength,
                tbMove.level,
                tbMove.falloff,
                tbMove.activeLayer,
                tbMove.hardness,
              )
            }
            terrainStroke.lastGx = hit.gx
            terrainStroke.lastGz = hit.gz
            const nowMs = performance.now()
            if (nowMs - terrainStroke.lastPush > 55) {
              terrainStroke.lastPush = nowMs
              latest.current.onTerrainEdit?.(
                terrainStroke.entityId,
                {
                  heights: terrainStroke.data.heights.slice(),
                  layers: terrainStroke.data.layers.slice(),
                  splatWeights: terrainStroke.data.splatWeights?.map((w) => w.slice()),
                },
                false,
              )
            }
            return
          }
        } else {
          terrainHover = null
        }
        if (!drag) {
          const hh = pickGizmoHandle(e.offsetX, e.offsetY)
          hoveredAxis = hh ? hh.axis : -1
          canvas.style.cursor = hh ? 'pointer' : ''
          return
        }
        const dx = e.offsetX - drag.lastX,
          dy = e.offsetY - drag.lastY
        drag.lastX = e.offsetX
        drag.lastY = e.offsetY
        if (drag.mode === 'fly') {
          flyYaw -= dx * 0.005
          flyPitch = Math.min(1.52, Math.max(-1.52, flyPitch - dy * 0.005))
        } else if (drag.mode === 'orbit') {
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
        if (drag.mode === 'terrain' && terrainStroke) {
          const finished = terrainStroke
          terrainStroke = null
          latest.current.onTerrainEdit?.(
            finished.entityId,
            {
              heights: finished.data.heights,
              layers: finished.data.layers,
              splatWeights: finished.data.splatWeights,
            },
            true,
          )
          drag = undefined
          return
        }
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
    <div
      style={{
        position: 'absolute',
        inset: 0,
        outline: dragOver ? '2px dashed #80acdf' : undefined,
        outlineOffset: -2,
      }}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes('miniforge/asset')) {
          e.preventDefault()
          e.stopPropagation()
          if (!dragOver) setDragOver(true)
        }
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        setDragOver(false)
        const assetId = e.dataTransfer.getData('miniforge/asset')
        if (!assetId || !latest.current.onDropAsset) return
        e.preventDefault()
        e.stopPropagation()
        const w = controller.current?.world
        const rect = e.currentTarget.getBoundingClientRect()
        const x = e.clientX - rect.left,
          y = e.clientY - rect.top
        const hitId = w?.pick(x, y)
        const pos = w ? w.screenToGround(x, y, 0) : ([0, 0, 0] as Vec3)
        latest.current.onDropAsset(assetId, hitId, pos)
      }}
    >
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
      {(() => {
        const scene = props.project.scenes.find((s) => s.id === (props.sceneId ?? props.project.activeScene))
        const ent = scene?.entities.find((e) => e.id === props.selectedId)
        const terr = ent?.components.find((c) => c.type === 'terrain' && c.enabled !== false) as Terrain | undefined
        const tb = props.terrainBrush
        if (!terr || !tb || !props.onTerrainBrushChange) return null
        const { materials } = ensureTerrainLayers(terr)
        const isPaint = tb.tool === 'Paint' || tb.tool === 'Erase paint'
        return (
          <div
            aria-label="Terrain viewport tools"
            style={{
              position: 'absolute',
              top: 10,
              left: '50%',
              transform: 'translateX(-50%)',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '5px 10px',
              borderRadius: 8,
              background: 'rgba(18, 24, 32, 0.88)',
              border: '1px solid rgba(255,255,255,0.14)',
              backdropFilter: 'blur(8px)',
              color: '#e6edf3',
              fontSize: 11.5,
              zIndex: 12,
              flexWrap: 'wrap',
              maxWidth: '94%',
            }}
          >
            <button
              type="button"
              onClick={() => props.onTerrainBrushChange?.({ enabled: !tb.enabled })}
              style={{
                padding: '3px 9px',
                borderRadius: 6,
                border: '1px solid ' + (tb.enabled ? '#58d8ff' : 'rgba(255,255,255,0.18)'),
                background: tb.enabled ? 'rgba(88, 216, 255, 0.22)' : 'rgba(255,255,255,0.06)',
                color: tb.enabled ? '#8ee6ff' : '#c9d1d9',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              {tb.enabled ? 'Terrain Brush: ON' : 'Terrain Brush: OFF'}
            </button>
            {tb.enabled && (
              <>
                <select
                  aria-label="Viewport terrain tool"
                  value={tb.tool}
                  onChange={(e) => props.onTerrainBrushChange?.({ tool: e.target.value as TerrainTool })}
                  style={{ background: '#11161e', color: '#eef4fa', border: '1px solid rgba(255,255,255,0.16)', borderRadius: 5, padding: '2px 6px', fontSize: 11.5 }}
                >
                  {terrainTools.map((k) => (
                    <option key={k} value={k}>
                      {k}
                    </option>
                  ))}
                </select>
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <span>R</span>
                  <input
                    type="range"
                    min={0.5}
                    max={Math.min(24, terr.segments)}
                    step={0.5}
                    value={tb.radius}
                    onChange={(e) => props.onTerrainBrushChange?.({ radius: Number(e.target.value) })}
                    style={{ width: 62 }}
                  />
                  <span style={{ minWidth: 22 }}>{tb.radius.toFixed(1)}</span>
                </label>
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <span>Str</span>
                  <input
                    type="range"
                    min={0.05}
                    max={1}
                    step={0.05}
                    value={tb.strength}
                    onChange={(e) => props.onTerrainBrushChange?.({ strength: Number(e.target.value) })}
                    style={{ width: 54 }}
                  />
                </label>
                {isPaint && (
                  <>
                    <label style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      <span>Hard</span>
                      <input
                        type="range"
                        min={0}
                        max={1}
                        step={0.05}
                        value={tb.hardness}
                        onChange={(e) => props.onTerrainBrushChange?.({ hardness: Number(e.target.value) })}
                        style={{ width: 54 }}
                      />
                    </label>
                    <select
                      aria-label="Paint material layer"
                      value={Math.min(tb.activeLayer, materials.length - 1)}
                      onChange={(e) => props.onTerrainBrushChange?.({ activeLayer: Number(e.target.value) })}
                      style={{ background: '#11161e', color: '#ffd280', border: '1px solid rgba(255,184,77,0.4)', borderRadius: 5, padding: '2px 6px', fontSize: 11.5 }}
                    >
                      {materials.map((matId, idx) => {
                        const matName = props.project.assets.find((a) => a.id === matId)?.name || (idx === 0 ? 'Base' : `Layer ${idx}`)
                        return (
                          <option key={idx} value={idx}>
                            L{idx}: {matName}
                          </option>
                        )
                      })}
                    </select>
                  </>
                )}
              </>
            )}
          </div>
        )
      })()}
      <div aria-label="View orientation" style={{ position: 'absolute', right: 12, bottom: 12, display: 'flex', gap: 4 }}>
        <button
          type="button"
          title="Switch between Orbit and Fly (WASD + RMB) camera"
          onClick={() => setNavMode((m) => (m === 'orbit' ? 'fly' : 'orbit'))}
          style={{ fontWeight: 600 }}
        >
          {navMode === 'fly' ? 'Fly (WASD)' : 'Orbit'}
        </button>
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
