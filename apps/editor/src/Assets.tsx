import { useState } from 'react'
import {
  FolderClosed,
  FolderOpen,
  ChevronRight,
  FolderTree,
  Search,
  Upload,
  PackageOpen,
  Plus,
  Grid2X2,
  List,
  File,
  HardDrive,
} from 'lucide-react'
import type { Project, Asset } from '../../../packages/project-schema/src'
import { Thumb } from './Thumb'
export default function Assets({
  project,
  onUse,
  importFiles,
  editAsset,
  manage,
}: {
  project: Project
  onUse: (a: Asset) => void
  importFiles: () => void
  editAsset: (s: string) => void
  manage: (a: Asset, x: number, y: number) => void
}) {
  const [folder, setFolder] = useState('All assets'),
    [search, query] = useState(''),
    [rows, list] = useState(false),
    [chosen, pick] = useState('')
  const groups: Record<string, string[]> = {
    'All assets': [],
    Prefabs: ['prefab'],
    Materials: ['material', 'shader'],
    Textures: ['texture'],
    Particles: ['particle'],
    'HTML UI': ['html'],
    Skyboxes: ['skybox'],
    Scripts: ['script'],
    Models: ['model'],
    Media: ['audio', 'json', 'text'],
  }
  const filtered = project.assets.filter(
    (a) =>
      (!groups[folder].length || groups[folder].includes(a.type)) &&
      a.name.toLowerCase().includes(search.toLowerCase()),
  )
  return (
    <div className="asset-area">
      <aside className="folders">
        <div className="minor">
          <FolderTree size={12} /> LIBRARY
        </div>
        {Object.keys(groups).map((g) => (
          <button key={g} onClick={() => setFolder(g)} className={g === folder ? 'active' : ''}>
            {g === folder ? <FolderOpen /> : <FolderClosed />}
            {g}
          </button>
        ))}
      </aside>
      <section className="asset-content">
        <div className="asset-nav">
          <HardDrive size={13} />
          <span>Project</span>
          <ChevronRight size={12} />
          <b>{folder === 'All assets' ? 'Assets' : folder}</b>
          <small>{filtered.length}</small>
          <label className="asset-search">
            <Search size={13} />
            <input placeholder="Find assets..." value={search} onChange={(e) => query(e.target.value)} />
          </label>
          <button className="icon" title="Toggle asset layout" onClick={() => list(!rows)}>
            {rows ? <List /> : <Grid2X2 />}
          </button>
          <button className="minor-btn" onClick={importFiles}>
            <Upload size={13} /> Import
          </button>
        </div>
        <div className={'cards ' + (rows ? 'list' : '')}>
          {filtered.map((a) => (
            <button
              draggable
              onDragStart={(ev) => ev.dataTransfer.setData('miniforge/asset', a.id)}
              className={'asset-card ' + (a.id === chosen ? 'chosen' : '')}
              key={a.id}
              title={a.name + ' · double-click to use or edit'}
              onClick={() => pick(a.id)}
              onDoubleClick={() => onUse(a)}
              onContextMenu={(ev) => {
                ev.preventDefault()
                manage(a, ev.clientX, ev.clientY)
              }}
            >
              <div className={'thumb ' + a.type}>
                <Thumb asset={a} project={project} />
              </div>
              <div className="asset-name">
                {a.type === 'prefab' ? <PackageOpen /> : <File />}
                {a.name}
              </div>
              <small>{a.type}</small>
            </button>
          ))}
          {!filtered.length && (
            <div className="empty-assets">
              <span>No matching assets</span>
              <button
                className="minor-btn"
                onClick={() =>
                  folder === 'Scripts'
                    ? editAsset('new-script')
                    : folder === 'Materials'
                      ? editAsset('new-material')
                      : folder === 'Particles'
                        ? editAsset('new-particle')
                        : folder === 'HTML UI'
                          ? editAsset('new-html')
                          : folder === 'Textures'
                            ? editAsset('new-texture')
                            : folder === 'Prefabs'
                              ? editAsset('new-prefab')
                        : importFiles()
                }
              >
                <Plus size={13} /> Add asset
              </button>
            </div>
          )}
        </div>
      </section>
    </div>
  )
}
