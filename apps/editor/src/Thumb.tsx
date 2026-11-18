import { useEffect, useState } from 'react'
import * as T from 'three'
import { Box, FileCode2, FileJson, Music2, Braces } from 'lucide-react'
import type { Asset, Entity, Project } from '../../../packages/project-schema/src'

let renderer: T.WebGLRenderer | undefined
const cache = new Map<string, string>()
function render(asset: Asset, project: Project) {
  const key =
    asset.id +
    asset.data +
    JSON.stringify(asset.properties) +
    project.assets
      .filter((a) => a.type === 'material')
      .map((a) => a.properties.color)
      .join()
  if (cache.has(key)) return cache.get(key)
  renderer ??= new T.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true })
  renderer.setSize(160, 104)
  renderer.setClearColor(0, 0)
  const group = new T.Group(),
    scene = new T.Scene()
  scene.add(group)
  const nodes: Entity[] = asset.type === 'prefab' ? JSON.parse(asset.data) : []
  const objects = new Map<string, T.Group>()
  const shapes: Record<string, () => T.BufferGeometry> = {
    icosahedron: () => new T.IcosahedronGeometry(0.5, 0),
    sphere: () => new T.SphereGeometry(0.5, 10, 7),
    cone: () => new T.ConeGeometry(0.5, 1, 7),
    cylinder: () => new T.CylinderGeometry(0.5, 0.5, 1, 12),
    capsule: () => new T.CapsuleGeometry(0.3, 0.4),
    plane: () => new T.BoxGeometry(1, 0.03, 1),
  }
  function mesh(shape: string, color: string) {
    return new T.Mesh(
      shapes[shape]?.() ?? new T.BoxGeometry(),
      new T.MeshStandardMaterial({ color, flatShading: true, roughness: 0.76 }),
    )
  }
  if (asset.type === 'material') group.add(mesh('sphere', asset.properties.color))
  for (const e of nodes) {
    const o = new T.Group()
    objects.set(e.id, o)
    if (e !== nodes[0]) o.position.fromArray(e.transform.position)
    o.scale.fromArray(e.transform.scale)
    o.rotation.set(...e.transform.rotation)
    for (const c of e.components.filter((c) => c.type === 'mesh'))
      o.add(mesh(c.shape, project.assets.find((a) => a.id === c.material)?.properties.color ?? '#b9c5d0'))
  }
  for (const e of nodes) (objects.get(e.parent ?? '') ?? group).add(objects.get(e.id)!)
  const bounds = new T.Box3().setFromObject(group)
  if (bounds.isEmpty()) return
  const center = bounds.getCenter(new T.Vector3()),
    cam = new T.OrthographicCamera(-1, 1, 1, -1, 0.01, 1000)
  const dir = new T.Vector3(3, 2.1, 4).normalize()
  cam.position.copy(center).addScaledVector(dir, 100)
  cam.lookAt(center)
  cam.updateMatrixWorld()
  const viewBox = new T.Box3()
  group.traverse((o) => {
    if (o instanceof T.Mesh) {
      const positions = o.geometry.attributes.position
      for (let i = 0; i < positions.count; i++)
        viewBox.expandByPoint(
          new T.Vector3()
            .fromBufferAttribute(positions, i)
            .applyMatrix4(o.matrixWorld)
            .applyMatrix4(cam.matrixWorldInverse),
        )
    }
  })
  const size = viewBox.getSize(new T.Vector3()),
    half = Math.max(size.y / 2, size.x / 3.08) * 1.15 || 1
  cam.top = half
  cam.bottom = -half
  cam.right = half * 1.54
  cam.left = -cam.right
  cam.updateProjectionMatrix()
  scene.add(new T.HemisphereLight(0xffffff, 0x858ba3, 2))
  const light = new T.DirectionalLight(0xffeccf, 2.6)
  light.position.set(3, 5, 3)
  scene.add(light)
  renderer.render(scene, cam)
  const result = renderer.domElement.toDataURL()
  scene.traverse((o) => {
    if (o instanceof T.Mesh) {
      o.geometry.dispose()
      o.material.dispose()
    }
  })
  if (cache.size > 256) cache.clear()
  cache.set(key, result)
  return result
}
export function Thumb({ asset, project }: { asset: Asset; project: Project }) {
  const [url, set] = useState<string>()
  useEffect(() => {
    if (['prefab', 'material'].includes(asset.type)) {
      try {
        set(render(asset, project))
      } catch {
        set(undefined)
      }
    } else set(undefined)
  }, [asset, project])
  const Icon =
    asset.type === 'script'
      ? FileCode2
      : asset.type === 'audio'
        ? Music2
        : asset.type === 'json'
          ? FileJson
          : asset.type === 'shader'
            ? Braces
            : Box
  return url || asset.type === 'texture' ? <img alt="" src={url || asset.data} /> : <Icon size={28} />
}
