import { useEffect, useRef, useState } from 'react'
import { Pipette, X, Crosshair } from 'lucide-react'
import { createWorld, type RenderWorld } from '../../../packages/graphics/src'
import { Vector3 } from '../../../packages/graphics/src/scene'
import { getScene, type Project } from '../../../packages/project-schema/src'

/**
 * Reusable 3D Scene Eyedropper (Pipette) button.
 * Clicking opens a live 3D view of the active scene where hovering highlights
 * objects under the cursor and clicking selects that entity as the target.
 */
export function SceneEntityPickerButton({
  project,
  value,
  onPick,
  title = 'Pick entity from 3D scene',
}: {
  project: Project
  value?: string
  onPick: (entityId: string) => void
  title?: string
}) {
  const [open, setOpen] = useState(false)
  const [hovered, setHovered] = useState<{ id: string; name: string; sx: number; sy: number } | null>(null)
  const hostRef = useRef<HTMLDivElement | null>(null)
  const worldRef = useRef<RenderWorld | null>(null)
  const orbitRef = useRef({ yaw: 0.65, pitch: 0.45, dist: 14, tx: 0, ty: 1, tz: 0, dragging: false, moved: false, lx: 0, ly: 0 })
  const prevHoverRef = useRef<string | null>(null)

  const scene = getScene(project)

  useEffect(() => {
    if (!open) return
    const host = hostRef.current
    if (!host) return
    let w: RenderWorld
    try {
      w = createWorld(host, structuredClone(project), undefined, { editor: true })
    } catch {
      return
    }
    worldRef.current = w
    w.setGrid(true, -0.02)

    let raf = 0
    const loop = () => {
      raf = requestAnimationFrame(loop)
      const o = orbitRef.current
      w.camera.position.set(
        o.tx + Math.sin(o.yaw) * Math.cos(o.pitch) * o.dist,
        o.ty + Math.sin(o.pitch) * o.dist,
        o.tz + Math.cos(o.yaw) * Math.cos(o.pitch) * o.dist,
      )
      w.camera.lookAt(new Vector3(o.tx, o.ty, o.tz))
      w.camera.fov = 48
      w.render()
    }
    raf = requestAnimationFrame(loop)

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      cancelAnimationFrame(raf)
      worldRef.current = null
      prevHoverRef.current = null
      w.dispose()
    }
  }, [open, project])

  const pickAt = (clientX: number, clientY: number) => {
    const host = hostRef.current
    const w = worldRef.current
    if (!host || !w) return null
    const rect = host.getBoundingClientRect()
    const x = clientX - rect.left
    const y = clientY - rect.top
    const ray = w.screenToRay(x, y)
    const hitId = w.raycast(new Vector3(ray.origin[0], ray.origin[1], ray.origin[2]), new Vector3(ray.direction[0], ray.direction[1], ray.direction[2]), 250)
    if (!hitId) return null
    const ent = scene.entities.find((e) => e.id === hitId)
    return ent ? { id: ent.id, name: ent.name, sx: x, sy: y } : null
  }

  const updateHoverVisual = (nextId: string | null) => {
    const w = worldRef.current
    if (!w) return
    if (prevHoverRef.current && prevHoverRef.current !== nextId) {
      w.setEntityEmissive(prevHoverRef.current, '#000000', 0)
    }
    if (nextId) {
      w.setEntityEmissive(nextId, '#58b8ff', 0.85)
    }
    prevHoverRef.current = nextId
  }

  return (
    <>
      <button
        type="button"
        className="mf-btn"
        title={title}
        onClick={() => setOpen(true)}
        style={{ padding: '4px 7px', flexShrink: 0, display: 'inline-flex', alignItems: 'center' }}
      >
        <Pipette size={13} />
      </button>

      {open && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 2500,
            background: 'rgba(8, 11, 16, 0.85)',
            display: 'flex',
            flexDirection: 'column',
            padding: 20,
          }}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setOpen(false)
          }}
        >
          <div
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              background: '#141920',
              border: '1px solid #303a47',
              borderRadius: 10,
              overflow: 'hidden',
              boxShadow: '0 20px 60px rgba(0,0,0,0.7)',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '10px 14px',
                background: '#1a222c',
                borderBottom: '1px solid #2b323b',
                fontSize: 13,
              }}
            >
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontWeight: 700, color: '#eef3f8' }}>
                <Crosshair size={15} color="#f3a05d" />
                Pick Target Entity in 3D Scene
                <small style={{ fontWeight: 400, color: '#9aa7b8' }}>
                  Click an object to pick · Right-drag to orbit · Scroll to zoom
                </small>
              </span>
              <button type="button" className="mf-btn" onClick={() => setOpen(false)}>
                <X size={14} /> Cancel
              </button>
            </div>

            <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
              <div
                ref={hostRef}
                style={{ width: '100%', height: '100%', cursor: hovered ? 'pointer' : 'crosshair' }}
                onContextMenu={(e) => e.preventDefault()}
                onPointerDown={(e) => {
                  orbitRef.current.dragging = e.button === 2 || e.button === 1 || e.shiftKey
                  orbitRef.current.moved = false
                  orbitRef.current.lx = e.clientX
                  orbitRef.current.ly = e.clientY
                }}
                onPointerMove={(e) => {
                  const o = orbitRef.current
                  if (o.dragging) {
                    const dx = e.clientX - o.lx
                    const dy = e.clientY - o.ly
                    if (Math.hypot(dx, dy) > 3) o.moved = true
                    o.yaw -= dx * 0.008
                    o.pitch = Math.max(-1.1, Math.min(1.4, o.pitch + dy * 0.008))
                    o.lx = e.clientX
                    o.ly = e.clientY
                    return
                  }
                  const hit = pickAt(e.clientX, e.clientY)
                  setHovered(hit)
                  updateHoverVisual(hit?.id ?? null)
                }}
                onPointerUp={(e) => {
                  const wasDrag = orbitRef.current.dragging && orbitRef.current.moved
                  orbitRef.current.dragging = false
                  if (wasDrag || e.button !== 0) return
                  const hit = pickAt(e.clientX, e.clientY)
                  if (hit) {
                    onPick(hit.id)
                    setOpen(false)
                  }
                }}
                onWheel={(e) => {
                  orbitRef.current.dist = Math.max(2, Math.min(80, orbitRef.current.dist * (1 + e.deltaY * 0.0012)))
                }}
              />

              {hovered && (
                <div
                  style={{
                    position: 'absolute',
                    left: hovered.sx + 14,
                    top: hovered.sy - 12,
                    padding: '4px 9px',
                    borderRadius: 5,
                    background: 'rgba(18, 25, 34, 0.94)',
                    border: '1px solid #58b8ff',
                    color: '#ffffff',
                    fontSize: 12,
                    fontWeight: 600,
                    pointerEvents: 'none',
                    boxShadow: '0 6px 18px rgba(0,0,0,0.5)',
                  }}
                >
                  {hovered.name} {hovered.id === value ? ' (current)' : ''}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
