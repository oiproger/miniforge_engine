import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  Anvil,
  FolderOpen,
  FilePlus2,
  ArrowLeft,
  Sparkles,
  Play,
  Layers3,
  Boxes,
  RefreshCw,
} from 'lucide-react'
import { createWorld } from '../../../packages/graphics/src'
import { Vector3 } from '../../../packages/graphics/src/scene'
import { getScene, validateProject, type Project } from '../../../packages/project-schema/src'
import { templates as STARTER_TEMPLATES, type TemplateId } from '../../../templates'

// Automatically discover every .json project placed in /examples/
const exampleModules = import.meta.glob('../../../examples/*.json', { eager: true }) as Record<
  string,
  { default?: unknown } | unknown
>

export interface DiscoveredExample {
  fileKey: string
  fileName: string
  project: Project
}

export function getDiscoveredExamples(): DiscoveredExample[] {
  const list: DiscoveredExample[] = []
  for (const [path, mod] of Object.entries(exampleModules)) {
    try {
      const raw = (mod && typeof mod === 'object' && 'default' in mod ? (mod as any).default : mod) as any
      if (!raw || typeof raw !== 'object') continue
      const project = validateProject(structuredClone(raw))
      const fileName = path.split('/').pop() || path
      list.push({ fileKey: path, fileName, project })
    } catch (e) {
      console.warn('Skipped invalid example project:', path, e)
    }
  }
  return list.sort((a, b) => a.project.name.localeCompare(b.project.name))
}

const thumbCache = new Map<string, string>()

/**
 * Automatically render a 16:9 3D screenshot of a project's active scene using the engine's WebGL2 renderer.
 * Falls back cleanly to a stylized 2D diagram if WebGL2 is unavailable.
 */
export async function captureProjectThumbnail(project: Project, width = 420, height = 236): Promise<string> {
  const scene = getScene(project)
  const host = document.createElement('div')
  host.style.cssText = `position:fixed;left:-9999px;top:-9999px;width:${width}px;height:${height}px;pointer-events:none;overflow:hidden;`
  document.body.appendChild(host)
  try {
    const w = createWorld(host, project, undefined, { editor: true })
    try {
      // Frame camera from scene camera entity if present, otherwise compute nice isometric view of entities
      const camEnt = scene.entities.find((e) => e.active && e.components.some((c) => c.type === 'camera'))
      if (camEnt) {
        const cp = camEnt.transform.position
        w.camera.position.set(cp[0], cp[1], cp[2])
        const target = scene.entities.find((e) => e.id === 'player') || scene.entities.find((e) => e.active && e.id !== camEnt.id)
        if (target) {
          const tp = target.transform.position
          w.camera.lookAt(new Vector3(tp[0], tp[1] + 0.6, tp[2]))
        } else {
          w.camera.lookAt(new Vector3(0, 0.5, 0))
        }
      } else {
        let cx = 0, cy = 0, cz = 0, count = 0
        for (const e of scene.entities) {
          if (!e.active) continue
          cx += e.transform.position[0]
          cy += e.transform.position[1]
          cz += e.transform.position[2]
          count++
        }
        if (count > 0) {
          cx /= count; cy /= count; cz /= count
        }
        w.camera.position.set(cx + 7.5, cy + 5.8, cz + 7.5)
        w.camera.lookAt(new Vector3(cx, cy + 0.5, cz))
      }
      w.camera.fov = 46
      w.setGrid(true, -0.01)
      // Give async textures/models a short tick to load, then render 2 frames
      await new Promise((r) => setTimeout(r, 120))
      w.render()
      await new Promise((r) => requestAnimationFrame(() => r(undefined)))
      w.render()
      const canvas = host.querySelector('canvas')
      if (canvas) {
        const url = canvas.toDataURL('image/jpeg', 0.86)
        if (url && url.length > 200) return url
      }
    } finally {
      w.dispose()
    }
  } catch {
    // Fallback to clean 2D preview below
  } finally {
    host.remove()
  }

  // Fallback stylized preview
  const c = document.createElement('canvas')
  c.width = width
  c.height = height
  const ctx = c.getContext('2d')!
  const bg = scene.environment?.background || '#171d26'
  const g = ctx.createLinearGradient(0, 0, 0, height)
  g.addColorStop(0, bg)
  g.addColorStop(1, '#0e131a')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, width, height)
  ctx.strokeStyle = 'rgba(255,255,255,0.08)'
  for (let x = 0; x < width; x += 28) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke()
  }
  for (let y = 0; y < height; y += 28) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke()
  }
  ctx.fillStyle = '#f3a05d'
  ctx.font = '700 18px system-ui, sans-serif'
  ctx.fillText(project.name || 'Miniforge Project', 20, height - 38)
  ctx.fillStyle = '#9aa7b8'
  ctx.font = '12px system-ui, sans-serif'
  ctx.fillText(`${scene.entities.length} objects · ${project.scenes.length} scene(s)`, 20, height - 18)
  return c.toDataURL('image/png')
}

export function ProjectHub({
  currentProject,
  canResume,
  onResume,
  onCreateBlank,
  onOpenExample,
  onOpenFromFile,
}: {
  currentProject: Project | null
  canResume: boolean
  onResume: () => void
  onCreateBlank: (templateId: TemplateId, name: string, description: string) => void
  onOpenExample: (project: Project) => void
  onOpenFromFile: () => void
}) {
  const examples = useMemo(() => getDiscoveredExamples(), [])
  const [thumbs, setThumbs] = useState<Record<string, string>>({})
  const [currentThumb, setCurrentThumb] = useState<string>('')
  const [creating, setCreating] = useState(false)
  const [selectedTpl, setSelectedTpl] = useState<TemplateId>('empty')
  const [newName, setNewName] = useState('My 3D Game')
  const [newDesc, setNewDesc] = useState('')
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    ;(async () => {
      // Generate current project thumbnail if needed
      if (canResume && currentProject) {
        if (currentProject.thumbnail) {
          setCurrentThumb(currentProject.thumbnail)
        } else {
          const url = await captureProjectThumbnail(currentProject)
          if (mountedRef.current) setCurrentThumb(url)
        }
      }
      // Sequentially generate screenshots for examples that don't have an embedded thumbnail
      for (const ex of examples) {
        if (!mountedRef.current) break
        if (ex.project.thumbnail) {
          setThumbs((prev) => ({ ...prev, [ex.fileKey]: ex.project.thumbnail! }))
          continue
        }
        const cached = thumbCache.get(ex.fileKey)
        if (cached) {
          setThumbs((prev) => ({ ...prev, [ex.fileKey]: cached }))
          continue
        }
        const url = await captureProjectThumbnail(ex.project)
        thumbCache.set(ex.fileKey, url)
        if (mountedRef.current) {
          setThumbs((prev) => ({ ...prev, [ex.fileKey]: url }))
        }
      }
    })()
    return () => {
      mountedRef.current = false
    }
  }, [examples, canResume, currentProject?.id, currentProject?.thumbnail])

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 2000,
        background: 'radial-gradient(circle at 20% 0%, #1c2432 0%, #0d1117 65%)',
        color: '#e6edf3',
        display: 'flex',
        flexDirection: 'column',
        overflowY: 'auto',
        fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
      }}
    >
      {/* Top Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '16px 28px',
          borderBottom: '1px solid rgba(255,255,255,0.08)',
          background: 'rgba(13,17,23,0.85)',
          backdropFilter: 'blur(8px)',
          position: 'sticky',
          top: 0,
          zIndex: 10,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: 9,
              background: 'linear-gradient(135deg, #f59e0b, #d97706)',
              display: 'grid',
              placeItems: 'center',
              color: '#0d1117',
            }}
          >
            <Anvil size={20} strokeWidth={2.4} />
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 16, letterSpacing: '0.02em' }}>
              Miniforge Engine <span style={{ fontSize: 11, color: '#f59e0b', marginLeft: 4 }}>v3.0.0</span>
            </div>
            <div style={{ fontSize: 12, color: '#8b9bb0' }}>Project Hub · Select, create or explore an example</div>
          </div>
        </div>
        {canResume && (
          <button
            type="button"
            onClick={onResume}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 7,
              padding: '8px 14px',
              borderRadius: 7,
              border: '1px solid rgba(245,158,11,0.45)',
              background: 'rgba(245,158,11,0.12)',
              color: '#fbbf24',
              fontWeight: 600,
              fontSize: 13,
              cursor: 'pointer',
            }}
          >
            <ArrowLeft size={14} /> Back to Editor
          </button>
        )}
      </div>

      {/* Main Content */}
      <div style={{ maxWidth: 1120, width: '100%', margin: '0 auto', padding: '28px 28px 48px', display: 'flex', flexDirection: 'column', gap: 28 }}>
        {/* Action Bar & Current Project */}
        <div style={{ display: 'grid', gridTemplateColumns: canResume && currentProject ? '1.35fr 1fr' : '1fr', gap: 18 }}>
          {canResume && currentProject && (
            <div
              style={{
                border: '1px solid rgba(245,158,11,0.35)',
                borderRadius: 12,
                background: '#151c26',
                overflow: 'hidden',
                display: 'grid',
                gridTemplateColumns: '210px 1fr',
              }}
            >
              <div style={{ background: '#0e131a', position: 'relative', minHeight: 132 }}>
                {currentThumb ? (
                  <img src={currentThumb} alt={currentProject.name} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                ) : (
                  <div style={{ width: '100%', height: '100%', display: 'grid', placeItems: 'center', color: '#5b6b80', fontSize: 12 }}>
                    Rendering preview…
                  </div>
                )}
              </div>
              <div style={{ padding: 16, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: 10 }}>
                <div>
                  <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#f59e0b', fontWeight: 700 }}>
                    Active / Saved Project
                  </div>
                  <div style={{ fontSize: 17, fontWeight: 700, marginTop: 3 }}>{currentProject.name}</div>
                  <div style={{ fontSize: 12.5, color: '#9aa7b8', marginTop: 4, lineHeight: 1.4 }}>
                    {currentProject.description || 'Your current workspace project stored in browser memory.'}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                  <span style={{ fontSize: 11.5, color: '#7d8fa4' }}>
                    {currentProject.scenes.length} scene(s) · {getScene(currentProject).entities.length} objects
                  </span>
                  <button
                    type="button"
                    onClick={onResume}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: '7px 14px',
                      borderRadius: 7,
                      border: 'none',
                      background: '#d97706',
                      color: '#fff',
                      fontWeight: 600,
                      fontSize: 12.5,
                      cursor: 'pointer',
                    }}
                  >
                    <Play size={13} fill="currentColor" /> Continue Editing
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Create / Open Card */}
          <div
            style={{
              border: '1px solid #26303d',
              borderRadius: 12,
              background: '#151c26',
              padding: 18,
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              gap: 12,
            }}
          >
            {!creating ? (
              <>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 700 }}>Start a Project</div>
                  <div style={{ fontSize: 12.5, color: '#8b9bb0', marginTop: 4 }}>
                    Create a blank 3D project or open an existing <code>.json</code> project file from your computer.
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    onClick={() => setCreating(true)}
                    style={{
                      flex: 1,
                      minWidth: 150,
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 7,
                      padding: '10px 14px',
                      borderRadius: 8,
                      border: 'none',
                      background: '#2563eb',
                      color: '#fff',
                      fontWeight: 600,
                      fontSize: 13,
                      cursor: 'pointer',
                    }}
                  >
                    <FilePlus2 size={15} /> New Project
                  </button>
                  <button
                    type="button"
                    onClick={onOpenFromFile}
                    style={{
                      flex: 1,
                      minWidth: 150,
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 7,
                      padding: '10px 14px',
                      borderRadius: 8,
                      border: '1px solid #334155',
                      background: '#1e2736',
                      color: '#e6edf3',
                      fontWeight: 600,
                      fontSize: 13,
                      cursor: 'pointer',
                    }}
                  >
                    <FolderOpen size={15} /> Open File (.json)
                  </button>
                </div>
              </>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ fontSize: 14, fontWeight: 700 }}>Create Project from Template</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(135px, 1fr))', gap: 6, maxHeight: 170, overflowY: 'auto', paddingRight: 2 }}>
                  {STARTER_TEMPLATES.map((tpl) => {
                    const active = selectedTpl === tpl.id
                    return (
                      <button
                        key={tpl.id}
                        type="button"
                        onClick={() => {
                          setSelectedTpl(tpl.id)
                          if (!newName.trim() || STARTER_TEMPLATES.some((t) => t.name === newName) || newName === 'My 3D Game') {
                            setNewName(tpl.id === 'empty' ? 'My 3D Game' : tpl.name)
                          }
                        }}
                        style={{
                          textAlign: 'left',
                          padding: '7px 8px',
                          borderRadius: 7,
                          border: active ? '1px solid #f59e0b' : '1px solid #2b3646',
                          background: active ? 'rgba(245,158,11,0.14)' : '#0e131a',
                          color: '#e6edf3',
                          cursor: 'pointer',
                        }}
                      >
                        <div style={{ fontSize: 10, fontWeight: 700, color: active ? '#fbbf24' : '#60a5fa', textTransform: 'uppercase' }}>{tpl.tag}</div>
                        <div style={{ fontSize: 12, fontWeight: 600, marginTop: 2 }}>{tpl.name}</div>
                      </button>
                    )
                  })}
                </div>
                <div style={{ fontSize: 11.5, color: '#9aa7b8' }}>
                  {STARTER_TEMPLATES.find((t) => t.id === selectedTpl)?.description}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                  <input
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="Project name"
                    style={{
                      padding: '7px 10px',
                      borderRadius: 6,
                      border: '1px solid #334155',
                      background: '#0e131a',
                      color: '#e6edf3',
                      fontSize: 12.5,
                    }}
                  />
                  <input
                    value={newDesc}
                    onChange={(e) => setNewDesc(e.target.value)}
                    placeholder="Short description (optional)"
                    style={{
                      padding: '7px 10px',
                      borderRadius: 6,
                      border: '1px solid #334155',
                      background: '#0e131a',
                      color: '#e6edf3',
                      fontSize: 12.5,
                    }}
                  />
                </div>
                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 2 }}>
                  <button
                    type="button"
                    onClick={() => setCreating(false)}
                    style={{
                      padding: '6px 12px',
                      borderRadius: 6,
                      border: '1px solid #334155',
                      background: 'transparent',
                      color: '#9aa7b8',
                      cursor: 'pointer',
                      fontSize: 12.5,
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onCreateBlank(selectedTpl, newName.trim() || 'Untitled Project', newDesc.trim())
                      setCreating(false)
                    }}
                    style={{
                      padding: '6px 14px',
                      borderRadius: 6,
                      border: 'none',
                      background: '#2563eb',
                      color: '#fff',
                      fontWeight: 600,
                      cursor: 'pointer',
                      fontSize: 12.5,
                    }}
                  >
                    Create Project
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Auto-discovered Examples Section */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Sparkles size={17} color="#f59e0b" />
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>Example Projects</h2>
              <span style={{ fontSize: 12, color: '#8b9bb0', background: '#1b2430', padding: '2px 8px', borderRadius: 99 }}>
                {examples.length} loaded from /examples
              </span>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 18 }}>
            {examples.map((ex) => {
              const sc = getScene(ex.project)
              const thumb = thumbs[ex.fileKey]
              return (
                <div
                  key={ex.fileKey}
                  style={{
                    border: '1px solid #26303d',
                    borderRadius: 12,
                    background: '#151c26',
                    overflow: 'hidden',
                    display: 'flex',
                    flexDirection: 'column',
                    transition: 'border-color 0.15s ease, transform 0.15s ease',
                  }}
                >
                  <div style={{ position: 'relative', aspectRatio: '16 / 9', background: '#0e131a', overflow: 'hidden' }}>
                    {thumb ? (
                      <img src={thumb} alt={ex.project.name} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                    ) : (
                      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, color: '#6b7d94', fontSize: 12 }}>
                        <RefreshCw size={13} /> Generating 3D preview…
                      </div>
                    )}
                    <div
                      style={{
                        position: 'absolute',
                        bottom: 8,
                        right: 8,
                        display: 'flex',
                        gap: 6,
                        fontSize: 11,
                        background: 'rgba(13,17,23,0.78)',
                        padding: '3px 8px',
                        borderRadius: 99,
                        color: '#cbd5e1',
                      }}
                    >
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                        <Layers3 size={11} /> {ex.project.scenes.length}
                      </span>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                        <Boxes size={11} /> {sc.entities.length}
                      </span>
                    </div>
                  </div>
                  <div style={{ padding: 15, display: 'flex', flexDirection: 'column', flex: 1, justifyContent: 'space-between', gap: 12 }}>
                    <div>
                      <div style={{ fontSize: 15.5, fontWeight: 700, color: '#f1f5f9' }}>{ex.project.name}</div>
                      <div style={{ fontSize: 12.5, color: '#9aa7b8', marginTop: 5, lineHeight: 1.45 }}>
                        {ex.project.description || `Example project loaded from examples/${ex.fileName}`}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => onOpenExample(structuredClone(ex.project))}
                      style={{
                        width: '100%',
                        padding: '8px 12px',
                        borderRadius: 7,
                        border: '1px solid rgba(245,158,11,0.4)',
                        background: 'rgba(245,158,11,0.12)',
                        color: '#fbbf24',
                        fontWeight: 600,
                        fontSize: 12.5,
                        cursor: 'pointer',
                      }}
                    >
                      Open Example
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
