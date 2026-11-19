import { useState } from 'react'
import {
  Boxes,
  Box,
  Layers3,
  ChevronRight,
  ChevronDown,
  Plus,
  Search,
  Eye,
  EyeOff,
  Camera,
  Lightbulb,
  Coins,
  Trees,
  UserRound,
  Folder,
  Mountain,
  Package,
  Diamond,
  MoreHorizontal,
  Waves,
  Sparkles,
} from 'lucide-react'
import { getScene, reparentEntity, type Project, type Entity } from '../../../packages/project-schema/src'
export function entityIcon(entity: Entity) {
  const n = entity.name.toLowerCase()
  if (entity.components.some((c) => c.type === 'camera')) return Camera
  if (entity.components.some((c) => c.type === 'water')) return Waves
  if (entity.components.some((c) => c.type === 'volumetric')) return Sparkles
  if (entity.components.some((c) => c.type === 'light') || n.includes('light')) return Lightbulb
  if (n.includes('coin')) return Coins
  if (n.includes('pine') || n.includes('grove') || n.includes('tree')) return Trees
  if (n.includes('player')) return UserRound
  if (n.includes('island') || n.includes('terrain')) return Mountain
  if (n.includes('crate')) return Package
  return entity.components.some((c) => c.type === 'mesh') ? Box : Boxes
}
type Props = {
  project: Project
  selection: string[]
  select: (id: string | null, add?: boolean) => void
  change: (p: Project) => void
  add: () => void
  context: (e: Entity, x: number, y: number) => void
  onDropAsset?: (assetId: string, targetId: string | undefined) => void
}
export default function Hierarchy({ project, selection, select, change, add, context, onDropAsset }: Props) {
  const [search, query] = useState(''),
    [expanded, expand] = useState<string[]>([]),
    [open, show] = useState(true)
  const scene = getScene(project)
  function drop(ev: React.DragEvent, id: string | null) {
    if (ev.dataTransfer.types.includes('miniforge/asset') && onDropAsset) {
      ev.preventDefault()
      ev.stopPropagation()
      const assetId = ev.dataTransfer.getData('miniforge/asset')
      if (assetId) onDropAsset(assetId, id ?? undefined)
      return
    }
    if (!ev.dataTransfer.types.includes('miniforge/entity')) return
    ev.preventDefault()
    ev.stopPropagation()
    const p = structuredClone(project)
    if (reparentEntity(getScene(p), ev.dataTransfer.getData('miniforge/entity'), id)) {
      change(p)
      if (id) expand([...expanded, id])
    }
  }
  function row(e: Entity, depth: number): React.ReactNode {
    const children = scene.entities.filter((x) => x.parent === e.id),
      opened = expanded.includes(e.id),
      Icon = entityIcon(e)
    return (
      <div key={e.id}>
        <div
          className={'tree-row ' + (selection.includes(e.id) ? 'selected ' : '') + (!e.active ? 'off' : '')}
          style={{ paddingLeft: 10 + depth * 13 }}
          onClick={(ev) => select(e.id, ev.ctrlKey || ev.metaKey || ev.shiftKey)}
          onContextMenu={(ev) => {
            ev.preventDefault()
            context(e, ev.clientX, ev.clientY)
          }}
          draggable
          onDragStart={(ev) => ev.dataTransfer.setData('miniforge/entity', e.id)}
          onDragOver={(ev) => ev.preventDefault()}
          onDrop={(ev) => drop(ev, e.id)}
        >
          <button
            aria-label={'Expand ' + e.name}
            className={'branch ' + (!children.length ? 'leaf' : '')}
            onClick={(ev) => {
              ev.stopPropagation()
              expand(opened ? expanded.filter((x) => x !== e.id) : [...expanded, e.id])
            }}
          >
            {opened ? <ChevronDown /> : <ChevronRight />}
          </button>
          <Icon
            size={14}
            className={
              'nodeicon ' +
              (Icon === Coins || Icon === Lightbulb
                ? 'gold'
                : Icon === Trees || Icon === Mountain
                  ? 'green'
                  : Icon === Camera
                    ? 'purple'
                    : 'blue')
            }
          />
          <span>{e.name}</span>
          <button
            className="tree-eye"
            title={'Toggle visibility of ' + e.name}
            onClick={(ev) => {
              ev.stopPropagation()
              const p = structuredClone(project)
              getScene(p).entities.find((n) => n.id === e.id)!.active = !e.active
              change(p)
            }}
          >
            {e.active ? <Eye /> : <EyeOff />}
          </button>
        </div>
        {opened && !search && children.map((c) => row(c, depth + 1))}
      </div>
    )
  }
  return (
    <aside className="hierarchy">
      <div className="panel-head">
        <Layers3 size={15} />
        <strong>Hierarchy</strong>
        <button className="icon ml" aria-label="Add entity" title="Add entity" onClick={add}>
          <Plus />
        </button>
      </div>
      <label className="searchbox">
        <Search size={13} />
        <input
          aria-label="Search hierarchy"
          placeholder="Search hierarchy..."
          value={search}
          onChange={(e) => query(e.target.value)}
        />
      </label>
      <div className="tree-scroll" onDragOver={(ev) => ev.preventDefault()} onDrop={(ev) => drop(ev, null)}>
        <button className="scene-root" onClick={() => show(!open)}>
          {open ? <ChevronDown /> : <ChevronRight />}
          <Diamond size={14} />
          {scene.name}
        </button>
        {open &&
          (search
            ? scene.entities.filter((e) => e.name.toLowerCase().includes(search.toLowerCase()))
            : scene.entities.filter((e) => !e.parent)
          ).map((e) => row(e, 0))}
      </div>
      <div className="tree-footer">
        <Folder size={12} />
        {scene.entities.length} entities{' '}
        <button className="icon ml" onClick={add} title="Create entity">
          <MoreHorizontal />
        </button>
      </div>
    </aside>
  )
}
