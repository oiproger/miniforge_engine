import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import * as T from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { TransformControls } from 'three/addons/controls/TransformControls.js'
import { createWorld, type RenderWorld } from '../../graphics/src'
import type { Project, Transform, Vec3 } from '../../project-schema/src'

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
interface EditorView {
  world: RenderWorld
  orbit: OrbitControls
  gizmo: TransformControls
  guide: T.Mesh
  box: T.BoxHelper
  icons: T.Group
  frame: () => void
  refresh: () => void
}
const direction = new T.Vector3(13, 11, 16).normalize()
const axisStyle = {
  position: 'absolute',
  borderRadius: '100%',
  border: 0,
  padding: 0,
  width: 16,
  height: 16,
  font: 'bold 9px/16px system-ui',
  cursor: 'pointer',
} as const

function makeGrid() {
  const geo = new T.PlaneGeometry(300, 300).rotateX(-Math.PI / 2)
  const material = new T.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    vertexShader: `varying vec3 point;void main(){vec4 p=modelMatrix*vec4(position,1.0);point=p.xyz;gl_Position=projectionMatrix*viewMatrix*p;}`,
    fragmentShader: `varying vec3 point;
      void main(){
        vec2 cell=point.xz,deriv=max(fwidth(cell),vec2(.001));
        vec2 d=abs(fract(cell+.5)-.5)/deriv;
        vec2 major=abs(fract(cell/5.+.5)-.5)*5./deriv;
        float line=1.-min(1.,min(d.x,d.y));
        float accent=1.-min(1.,min(major.x,major.y));
        float fade=exp(-length(cell)*.037);
        gl_FragColor=vec4(.49,.55,.57,(.17*line+.085*accent)*fade);
      }`,
  })
  const grid = new T.Mesh(geo, material)
  grid.position.y = -1.95
  return grid
}

function releaseIcons(group: T.Group) {
  group.traverse((n) => {
    if (n instanceof T.LineSegments) {
      n.geometry.dispose()
      n.material.dispose()
    }
  })
  group.clear()
}

export function SceneViewport(props: ViewportProps) {
  const container = useRef<HTMLDivElement>(null)
  const axes = useRef<(HTMLButtonElement | null)[]>([])
  const lines = useRef<(SVGLineElement | null)[]>([])
  const latest = useRef(props)
  const view = useRef<EditorView | null>(null)
  const [error, setError] = useState('')
  latest.current = props
  useLayoutEffect(() => {
    const host = container.current!
    let world: RenderWorld
    try {
      world = createWorld(host, latest.current.project, latest.current.sceneId, { editor: true })
    } catch (e) {
      setError(String(e))
      return
    }
    const canvas = world.renderer.domElement
    canvas.tabIndex = 0
    canvas.setAttribute('aria-label', '3D scene viewport')
    const camera = new T.PerspectiveCamera(33, 1, 0.05, 1000)
    const aspect = Math.max(0.6, host.clientWidth / Math.max(host.clientHeight, 1))
    const dist = Math.max(17.7, 26.5 / aspect)
    camera.position.copy(direction).multiplyScalar(dist)
    const target = new T.Vector3(0, -0.1, 0)
    camera.lookAt(target)
    world.setCamera(camera)
    const orbit = new OrbitControls(camera, canvas)
    orbit.target.copy(target)
    orbit.enableDamping = true
    orbit.dampingFactor = 0.18
    orbit.minDistance = 0.65
    orbit.maxDistance = 140
    orbit.maxPolarAngle = Math.PI * 0.92
    const gizmo = new TransformControls(camera, canvas)
    gizmo.setSize(0.72)
    const helper = gizmo.getHelper()
    world.scene.add(helper)
    const grid = makeGrid()
    world.scene.add(grid)
    const selectionBox = new T.BoxHelper(new T.Group(), 0x80deb8)
    selectionBox.material.transparent = true
    selectionBox.material.opacity = 0.86
    selectionBox.visible = false
    world.scene.add(selectionBox)
    const icons = new T.Group()
    world.scene.add(icons)
    function refresh() {
      const selected = latest.current.selectedId && world.objects.get(latest.current.selectedId)
      gizmo.detach()
      selectionBox.visible = !!selected
      if (selected) {
        selectionBox.setFromObject(selected)
        const mode = latest.current.tool
        if (mode && mode !== 'select') {
          gizmo.setMode(mode)
          gizmo.attach(selected)
        }
      }
      gizmo.setTranslationSnap(latest.current.snap ? 0.5 : null)
      gizmo.setRotationSnap(latest.current.snap ? Math.PI / 12 : null)
      gizmo.setScaleSnap(latest.current.snap ? 0.25 : null)
      grid.visible = latest.current.grid !== false
    }
    let wasTransform = false
    gizmo.addEventListener('dragging-changed', (event) => {
      orbit.enabled = !event.value
      if (event.value) wasTransform = true
      else {
        const obj = gizmo.object
        if (obj)
          latest.current.onTransform(obj.userData.entityId, {
            position: obj.position.toArray() as Vec3,
            rotation: [obj.rotation.x, obj.rotation.y, obj.rotation.z],
            scale: obj.scale.toArray() as Vec3,
          })
      }
    })
    gizmo.addEventListener('objectChange', () => selectionBox.update())
    const ray = new T.Raycaster()
    const start = new T.Vector2()
    let down = false
    const pointerDown = (e: PointerEvent) => {
      if (e.button !== 0) return
      canvas.focus({ preventScroll: true })
      down = true
      wasTransform = !!gizmo.dragging
      start.set(e.clientX, e.clientY)
    }
    function pointerUp(e: PointerEvent) {
      if (!down || e.button !== 0) return
      down = false
      if (wasTransform || start.distanceTo(new T.Vector2(e.clientX, e.clientY)) > 5) return
      const rect = canvas.getBoundingClientRect()
      ray.setFromCamera(
        new T.Vector2(
          (2 * (e.clientX - rect.left)) / rect.width - 1,
          1 - (2 * (e.clientY - rect.top)) / rect.height,
        ),
        world.camera,
      )
      const roots = [...world.objects.values()].filter((group) => !group.parent?.userData.entityId)
      const hit = ray.intersectObjects(roots, true).find((h) => {
        let node: T.Object3D | null = h.object
        while (node) {
          if (!node.visible) return false
          node = node.parent
        }
        return true
      })
      let node = hit?.object
      while (node && !node.userData.entityId) node = node.parent ?? undefined
      latest.current.onSelect(node?.userData.entityId ?? null, e.shiftKey || e.ctrlKey || e.metaKey)
    }
    function frame() {
      const id = latest.current.selectedId
      const obj = id && world.objects.get(id)
      if (!obj) return
      const box = new T.Box3().setFromObject(obj)
      const center = box.isEmpty() ? obj.getWorldPosition(new T.Vector3()) : box.getCenter(new T.Vector3())
      const radius = Math.max(1, box.getSize(new T.Vector3()).length() / 2)
      const c = world.camera
      const outward = c.position.clone().sub(orbit.target).normalize()
      orbit.target.copy(center)
      c.position.copy(center).addScaledVector(outward, radius * 3.2)
      if (c instanceof T.OrthographicCamera) {
        c.zoom = Math.min(6, Math.max(0.1, (c.top - c.bottom) / (radius * 2.6)))
        c.updateProjectionMatrix()
      }
      orbit.update()
    }
    const movement = new Set<string>()
    function keydown(e: KeyboardEvent) {
      if (e.ctrlKey || e.metaKey || e.altKey) return
      const key = e.key.toLowerCase()
      if (key === 'f') {
        frame()
        e.preventDefault()
      }
      if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'pageup', 'pagedown'].includes(key)) {
        movement.add(key)
        e.preventDefault()
      }
    }
    const keyup = (e: KeyboardEvent) => movement.delete(e.key.toLowerCase())
    const blur = () => movement.clear()
    canvas.addEventListener('pointerdown', pointerDown)
    canvas.addEventListener('pointerup', pointerUp)
    canvas.addEventListener('dblclick', frame)
    canvas.addEventListener('keydown', keydown)
    canvas.addEventListener('keyup', keyup)
    canvas.addEventListener('blur', blur)
    view.current = { world, orbit, gizmo, guide: grid, box: selectionBox, icons, frame, refresh }
    let raf = 0,
      last = performance.now()
    const xyz = [new T.Vector3(1, 0, 0), new T.Vector3(0, 1, 0), new T.Vector3(0, 0, 1)]
    const pt = new T.Vector3(),
      inverse = new T.Quaternion()
    function animate(time: number) {
      const step =
        Math.min(0.05, (time - last) / 1000) *
        Math.max(3, world.camera.position.distanceTo(orbit.target) * 0.55)
      last = time
      if (movement.size) {
        const move = new T.Vector3()
        world.camera.getWorldDirection(pt)
        if (movement.has('arrowup')) move.add(pt)
        if (movement.has('arrowdown')) move.sub(pt)
        pt.cross(world.camera.up).normalize()
        if (movement.has('arrowleft')) move.sub(pt)
        if (movement.has('arrowright')) move.add(pt)
        if (movement.has('pageup')) move.y++
        if (movement.has('pagedown')) move.y--
        move.normalize().multiplyScalar(step)
        orbit.target.add(move)
        world.camera.position.add(move)
      }
      orbit.update()
      if (latest.current.visible !== false && host.clientWidth && host.clientHeight && !document.hidden)
        world.render()
      inverse.copy(world.camera.quaternion).invert()
      xyz.forEach((axis, i) => {
        pt.copy(axis).applyQuaternion(inverse)
        const x = 26 + pt.x * 17,
          y = 26 - pt.y * 17
        const b = axes.current[i],
          line = lines.current[i]
        if (b) {
          b.style.left = x - 8 + 'px'
          b.style.top = y - 8 + 'px'
          b.style.zIndex = String(pt.z > 0 ? 2 : 1)
        }
        if (line) {
          line.setAttribute('x2', String(x))
          line.setAttribute('y2', String(y))
        }
      })
      raf = requestAnimationFrame(animate)
    }
    raf = requestAnimationFrame(animate)
    return () => {
      cancelAnimationFrame(raf)
      view.current = null
      releaseIcons(icons)
      canvas.removeEventListener('pointerdown', pointerDown)
      canvas.removeEventListener('pointerup', pointerUp)
      canvas.removeEventListener('dblclick', frame)
      canvas.removeEventListener('keydown', keydown)
      canvas.removeEventListener('keyup', keyup)
      canvas.removeEventListener('blur', blur)
      gizmo.detach()
      gizmo.dispose()
      orbit.dispose()
      selectionBox.dispose()
      grid.geometry.dispose()
      grid.material.dispose()
      world.dispose()
    }
  }, [])
  useEffect(() => {
    const v = view.current
    if (!v) return
    v.gizmo.detach()
    v.world.load(props.project, props.sceneId ?? props.project.activeScene)
    v.refresh()
    void v.world.ready().then(() => {
      if (view.current === v) v.refresh()
    })
    releaseIcons(v.icons)
    const scene = props.project.scenes.find((s) => s.id === (props.sceneId ?? props.project.activeScene))
    const terrain = scene?.entities.find((e) => e.properties.role === 'ground')
    v.guide.position.y = terrain
      ? Math.min(-0.015, terrain.transform.position[1] - terrain.transform.scale[1] / 2 - 0.02)
      : props.project.settings.mode === 'scene'
        ? -0.02
        : -1.95
    for (const entity of scene?.entities ?? []) {
      const group = v.world.objects.get(entity.id)
      if (!group) continue
      for (const c of entity.components) {
        if (!['camera', 'light', 'collider'].includes(c.type) || c.enabled === false) continue
        const shape =
          c.type === 'camera'
            ? new T.ConeGeometry(0.35, 0.55, 4).rotateX(-Math.PI / 2)
            : c.type === 'light'
              ? new T.IcosahedronGeometry(0.18, 0)
              : new T.BoxGeometry(1, 1, 1)
        const edges = new T.EdgesGeometry(shape)
        shape.dispose()
        const line = new T.LineSegments(
          edges,
          new T.LineBasicMaterial({
            color: c.type === 'collider' ? 0x78c1a0 : 0xb9afd8,
            transparent: true,
            opacity: 0.65,
          }),
        )
        line.matrix.copy(group.matrixWorld)
        line.matrixAutoUpdate = false
        v.icons.add(line)
      }
    }
    v.icons.visible = !!props.helpers
  }, [props.project, props.sceneId])
  useEffect(() => {
    view.current?.refresh()
  }, [props.selectedId, props.tool, props.snap, props.grid])
  useEffect(() => {
    if (view.current) view.current.icons.visible = !!props.helpers
  }, [props.helpers])
  useEffect(() => {
    if (props.focusToken) view.current?.frame()
  }, [props.focusToken])
  useEffect(() => {
    const v = view.current
    if (!v) return
    const old = v.world.camera
    if (!!props.orthographic === old instanceof T.OrthographicCamera) return
    const next = props.orthographic
      ? new T.OrthographicCamera(-6, 6, 6, -6, 0.05, 1000)
      : new T.PerspectiveCamera(33, 1, 0.05, 1000)
    const distance = old.position.distanceTo(v.orbit.target)
    next.userData.viewHeight = 2 * distance * Math.tan(T.MathUtils.degToRad(16.5))
    next.position.copy(old.position)
    next.quaternion.copy(old.quaternion)
    if (next instanceof T.PerspectiveCamera && old instanceof T.OrthographicCamera) {
      const scale = (old.top - old.bottom) / (old.zoom * 2 * Math.tan(T.MathUtils.degToRad(16.5)))
      next.position.sub(v.orbit.target).setLength(scale).add(v.orbit.target)
    }
    v.world.setCamera(next)
    v.orbit.object = next
    v.gizmo.camera = next
    v.orbit.update()
  }, [props.orthographic])
  function face(axis: number) {
    const v = view.current
    if (!v) return
    const direction = new T.Vector3().setComponent(axis, 1)
    if (axis === 1) direction.z = 0.0001
    const c = v.world.camera
    const distance = c.position.distanceTo(v.orbit.target) || 16
    c.position.copy(v.orbit.target).addScaledVector(direction, distance)
    v.orbit.update()
  }
  const colors = ['#db7c79', '#92c594', '#81a7df']
  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      <div ref={container} style={{ position: 'absolute', inset: 0 }} />
      {error ? (
        <div role="alert" style={{ padding: 24, position: 'relative' }}>
          WebGL2 unavailable. {error}
        </div>
      ) : (
        <div
          aria-label="View orientation"
          style={{ position: 'absolute', right: 12, bottom: 13, width: 52, height: 52 }}
        >
          <svg aria-hidden width="52" height="52" style={{ position: 'absolute', inset: 0 }}>
            {colors.map((color, i) => (
              <line
                key={color}
                ref={(el) => {
                  lines.current[i] = el
                }}
                x1="26"
                y1="26"
                stroke={color}
                strokeWidth="1.5"
              />
            ))}
          </svg>
          {colors.map((color, i) => (
            <button
              key={i}
              ref={(el) => {
                axes.current[i] = el
              }}
              type="button"
              title={'View along ' + ['X', 'Y', 'Z'][i]}
              style={{ ...axisStyle, background: color, color: '#18232b' }}
              onClick={() => face(i)}
            >
              {['X', 'Y', 'Z'][i]}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
