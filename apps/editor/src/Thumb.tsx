import { useState, useEffect } from 'react'
import { Box, FileCode2, FileJson, Music2, Braces, Flame } from 'lucide-react'
import { createWorld, type RenderWorld } from '../../../packages/graphics/src'
import { Vector3 } from '../../../packages/graphics/src/scene'
import {
  makeEntity,
  makeProject,
  type Project,
  type Asset,
  type Entity,
} from '../../../packages/project-schema/src'

let preview: RenderWorld | undefined
const cache = new Map<string, string>()
function render(asset: Asset, project: Project) {
  const key = JSON.stringify([
    asset,
    project.assets.filter((a) => a.type === 'material').map((a) => a.properties),
  ])
  if (cache.has(key)) return cache.get(key)
  const sample = makeProject('Thumbnail'),
    scene = sample.scenes[0]
  sample.assets = project.assets
  scene.environment.background = '#25292c'
  scene.environment.shadows = false
  const entities: Entity[] =
    asset.type === 'prefab' ? JSON.parse(asset.data) : [makeEntity('Material', 'sphere')]
  if (!entities.length) return
  if (asset.type === 'material') entities[0].components[0].material = asset.id
  entities[0].transform.position = [0, 0, 0]
  scene.entities = entities
  if (!preview) {
    const host = document.createElement('div')
    host.style.cssText = 'position:fixed;left:-1000px;top:0;width:160px;height:104px;pointer-events:none'
    document.body.append(host)
    preview = createWorld(host, sample, undefined, { editor: true })
  } else preview.load(sample)
  const points = [...preview.objects.values()].map((n) => ({
    p: n.getWorldPosition(new Vector3()),
    s: n.getWorldScale(new Vector3()),
  }))
  const center = new Vector3(),
    size = new Vector3()
  for (const axis of ['x', 'y', 'z'] as const) {
    const min = Math.min(...points.map((v) => v.p[axis] - Math.abs(v.s[axis]) * 0.5)),
      max = Math.max(...points.map((v) => v.p[axis] + Math.abs(v.s[axis]) * 0.5))
    center[axis] = (min + max) / 2
    size[axis] = max - min
  }
  preview.camera.height = Math.max(size.y, (size.x + size.z) * 0.65, 1) * 1.45
  preview.camera.position.copy(center).add(new Vector3(8, 6, 10))
  preview.camera.lookAt(center)
  preview.render()
  const url = preview.renderer.domElement.toDataURL()
  if (cache.size > 256) cache.clear()
  cache.set(key, url)
  return url
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
            : asset.type === 'particle'
              ? Flame
              : Box
  return url || asset.type === 'texture' ? <img alt="" src={url || asset.data} /> : <Icon size={28} />
}
