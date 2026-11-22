import { useMemo, useRef, useState } from 'react'
import { Plus, Trash2, Sparkles, GitBranch, Play, X, Check, ZoomIn, ZoomOut, RotateCcw } from 'lucide-react'
import type {
  AnimConditionOp,
  AnimParamDef,
  AnimStateDef,
  AnimStateMachine,
  AnimTransitionDef,
  Asset,
} from '../../../packages/project-schema/src'

export function createLocomotionPreset(availableClips: string[]): AnimStateMachine {
  const findClip = (names: string[], fallback: string) =>
    availableClips.find((c) => names.some((n) => c.toLowerCase().includes(n))) || availableClips[0] || fallback
  return {
    entryState: 'Idle',
    params: [
      { name: 'speed', type: 'float', defaultValue: 0 },
      { name: 'grounded', type: 'bool', defaultValue: true },
      { name: 'jump', type: 'trigger', defaultValue: false },
    ],
    states: [
      { id: 'st-idle', name: 'Idle', clip: findClip(['idle', 'stand', 'breath'], 'Idle'), speed: 1, loop: true, x: 70, y: 120 },
      { id: 'st-walk', name: 'Walk', clip: findClip(['walk', 'move'], 'Walk'), speed: 1, loop: true, x: 300, y: 60 },
      { id: 'st-run', name: 'Run', clip: findClip(['run', 'sprint'], 'Run'), speed: 1.15, loop: true, x: 540, y: 60 },
      { id: 'st-jump', name: 'Jump', clip: findClip(['jump', 'air', 'fall'], 'Jump'), speed: 1, loop: false, x: 300, y: 240 },
    ],
    transitions: [
      { id: 'tr-1', from: 'Idle', to: 'Walk', duration: 0.2, conditions: [{ param: 'speed', op: '>', value: 0.1 }] },
      { id: 'tr-2', from: 'Walk', to: 'Idle', duration: 0.2, conditions: [{ param: 'speed', op: '<=', value: 0.1 }] },
      { id: 'tr-3', from: 'Walk', to: 'Run', duration: 0.18, conditions: [{ param: 'speed', op: '>', value: 3.5 }] },
      { id: 'tr-4', from: 'Run', to: 'Walk', duration: 0.2, conditions: [{ param: 'speed', op: '<=', value: 3.5 }] },
      { id: 'tr-5', from: 'Idle', to: 'Jump', duration: 0.1, conditions: [{ param: 'jump', op: 'trigger', value: true }] },
      { id: 'tr-6', from: 'Walk', to: 'Jump', duration: 0.1, conditions: [{ param: 'jump', op: 'trigger', value: true }] },
      { id: 'tr-7', from: 'Run', to: 'Jump', duration: 0.1, conditions: [{ param: 'jump', op: 'trigger', value: true }] },
      { id: 'tr-8', from: 'Jump', to: 'Idle', duration: 0.15, hasExitTime: true, exitTime: 0.85, conditions: [{ param: 'grounded', op: '==', value: true }] },
    ],
  }
}

export function AnimStateMachineEditor({
  value,
  modelAsset,
  onSave,
  onClose,
}: {
  value?: AnimStateMachine
  modelAsset?: Asset
  onSave: (machine: AnimStateMachine) => void
  onClose: () => void
}) {
  const availableClips = useMemo(() => {
    const raw = (modelAsset?.properties?.clips || modelAsset?.properties?.animations || []) as any[]
    const names = raw
      .map((c) => (typeof c === 'string' ? c : c?.name))
      .filter((n): n is string => typeof n === 'string' && n.trim().length > 0)
    return [...new Set(names)]
  }, [modelAsset])

  const [machine, setMachine] = useState<AnimStateMachine>(() =>
    value && Array.isArray(value.states) && value.states.length
      ? structuredClone(value)
      : createLocomotionPreset(availableClips),
  )
  const [selectedStateId, setSelectedStateId] = useState<string | null>(machine.states[0]?.id || null)
  const [selectedTransId, setSelectedTransId] = useState<string | null>(null)
  const [newParamName, setNewParamName] = useState('')
  const [newParamType, setNewParamType] = useState<'float' | 'bool' | 'trigger'>('float')

  // Pan & Zoom state (matches EventGraphEditor behavior)
  const [pan, setPan] = useState({ x: 20, y: 20 })
  const [zoom, setZoom] = useState(1)
  const [isPanning, setIsPanning] = useState(false)
  const canvasRef = useRef<HTMLDivElement | null>(null)
  const dragNodeRef = useRef<{ id: string; startClientX: number; startClientY: number; origX: number; origY: number } | null>(null)
  const panDragRef = useRef<{ startClientX: number; startClientY: number; origPanX: number; origPanY: number } | null>(null)

  const selState = machine.states.find((s) => s.id === selectedStateId) || null
  const selTrans = machine.transitions.find((t) => t.id === selectedTransId) || null

  const updateState = (id: string, patch: Partial<AnimStateDef>) => {
    setMachine((m) => {
      const target = m.states.find((s) => s.id === id)
      const oldName = target?.name
      const nextStates = m.states.map((s) => (s.id === id ? { ...s, ...patch } : s))
      let nextEntry = m.entryState
      let nextTransitions = m.transitions
      if (patch.name && oldName && patch.name !== oldName) {
        if (nextEntry === oldName) nextEntry = patch.name
        nextTransitions = m.transitions.map((t) => ({
          ...t,
          from: t.from === oldName ? patch.name! : t.from,
          to: t.to === oldName ? patch.name! : t.to,
        }))
      }
      return { ...m, entryState: nextEntry, states: nextStates, transitions: nextTransitions }
    })
  }

  const addState = () => {
    const idx = machine.states.length + 1
    const name = `State_${idx}`
    const st: AnimStateDef = {
      id: 'st-' + Date.now() + '-' + idx,
      name,
      clip: availableClips[0] || name,
      speed: 1,
      loop: true,
      x: Math.round((-pan.x + 160 + ((idx * 90) % 320)) / zoom),
      y: Math.round((-pan.y + 120 + ((idx * 65) % 200)) / zoom),
    }
    setMachine((m) => ({ ...m, states: [...m.states, st] }))
    setSelectedStateId(st.id)
    setSelectedTransId(null)
  }

  const removeState = (id: string) => {
    setMachine((m) => {
      const target = m.states.find((s) => s.id === id)
      if (!target || m.states.length <= 1) return m
      const nextStates = m.states.filter((s) => s.id !== id)
      const nextTransitions = m.transitions.filter((t) => t.from !== target.name && t.to !== target.name)
      const nextEntry = m.entryState === target.name ? nextStates[0].name : m.entryState
      return { ...m, entryState: nextEntry, states: nextStates, transitions: nextTransitions }
    })
    setSelectedStateId(null)
  }

  const addTransition = (fromName: string, toName: string) => {
    const firstParam = machine.params[0]
    const tr: AnimTransitionDef = {
      id: 'tr-' + Date.now(),
      from: fromName,
      to: toName,
      duration: 0.2,
      conditions: firstParam
        ? [
            {
              param: firstParam.name,
              op: firstParam.type === 'trigger' ? 'trigger' : firstParam.type === 'bool' ? '==' : '>',
              value: firstParam.type === 'float' ? 0.1 : true,
            },
          ]
        : [],
    }
    setMachine((m) => ({ ...m, transitions: [...m.transitions, tr] }))
    setSelectedTransId(tr.id)
    setSelectedStateId(null)
  }

  const updateTransition = (id: string, patch: Partial<AnimTransitionDef>) => {
    setMachine((m) => ({
      ...m,
      transitions: m.transitions.map((t) => (t.id === id ? { ...t, ...patch } : t)),
    }))
  }

  const removeTransition = (id: string) => {
    setMachine((m) => ({ ...m, transitions: m.transitions.filter((t) => t.id !== id) }))
    if (selectedTransId === id) setSelectedTransId(null)
  }

  const addParam = () => {
    const clean = newParamName.trim()
    if (!clean || machine.params.some((p) => p.name === clean)) return
    const p: AnimParamDef = {
      name: clean,
      type: newParamType,
      defaultValue: newParamType === 'float' ? 0 : false,
    }
    setMachine((m) => ({ ...m, params: [...m.params, p] }))
    setNewParamName('')
  }

  const removeParam = (name: string) => {
    setMachine((m) => ({
      ...m,
      params: m.params.filter((p) => p.name !== name),
    }))
  }

  const applyZoom = (nextZoomRaw: number, focalX?: number, focalY?: number) => {
    const nextZoom = Math.max(0.35, Math.min(2.2, Number(nextZoomRaw.toFixed(3))))
    if (focalX !== undefined && focalY !== undefined) {
      const worldX = (focalX - pan.x) / zoom
      const worldY = (focalY - pan.y) / zoom
      setPan({ x: focalX - worldX * nextZoom, y: focalY - worldY * nextZoom })
    }
    setZoom(nextZoom)
  }

  const stateByName = new Map(machine.states.map((s) => [s.name, s]))

  return (
    <div
      className="mf-backdrop"
      style={{ zIndex: 1200 }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="mf-dialog mf-hud-dialog" role="dialog" aria-modal="true" aria-label="Animation State Machine">
        <header>
          <GitBranch size={17} />
          <h3>Animation State Machine</h3>
          <button type="button" className="mf-close" onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </header>
        <div className="mf-body" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {/* Toolbar */}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <button type="button" className="mf-btn" onClick={addState}>
                <Plus size={13} /> Add State
              </button>
              {machine.states.length >= 2 && (
                <button
                  type="button"
                  className="mf-btn"
                  onClick={() => {
                    const from = selState?.name || machine.states[0].name
                    const to = machine.states.find((s) => s.name !== from)?.name || machine.states[0].name
                    addTransition(from, to)
                  }}
                >
                  <Plus size={13} /> Add Transition
                </button>
              )}
              <button
                type="button"
                className="mf-btn"
                onClick={() => {
                  const preset = createLocomotionPreset(availableClips)
                  setMachine(preset)
                  setSelectedStateId(preset.states[0]?.id || null)
                  setSelectedTransId(null)
                  setPan({ x: 20, y: 20 })
                  setZoom(1)
                }}
              >
                <Sparkles size={13} color="#f59e0b" /> Load Locomotion Preset (Idle → Walk → Run → Jump)
              </button>
            </div>
            <span style={{ fontSize: 11.5, color: '#8b9bb0' }}>
              Runtime API: <code>api.animation.setParam(id, &apos;speed&apos;, 4)</code> · <code>setTrigger(id, &apos;jump&apos;)</code>
            </span>
          </div>

          {/* 3-Column Studio: Parameters | Graph Canvas | Inspector */}
          <div style={{ display: 'grid', gridTemplateColumns: '215px minmax(0, 1fr) 280px', gap: 10, minHeight: 420 }}>
            {/* Left: Parameters */}
            <div style={{ border: '1px solid #2b323b', borderRadius: 8, padding: 10, background: '#141a22', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <strong style={{ fontSize: 11.5, color: '#cbd5e1', textTransform: 'uppercase' }}>
                Parameters ({machine.params.length})
              </strong>
              <div style={{ display: 'flex', gap: 4 }}>
                <input
                  value={newParamName}
                  onChange={(e) => setNewParamName(e.target.value)}
                  placeholder="Param name"
                  style={{ flex: 1, minWidth: 0, fontSize: 11.5 }}
                  onKeyDown={(e) => e.key === 'Enter' && addParam()}
                />
                <select value={newParamType} onChange={(e) => setNewParamType(e.target.value as any)} style={{ fontSize: 11, width: 66 }}>
                  <option value="float">float</option>
                  <option value="bool">bool</option>
                  <option value="trigger">trigger</option>
                </select>
                <button type="button" className="mf-btn" style={{ padding: '2px 6px' }} onClick={addParam} title="Add parameter">
                  <Plus size={12} />
                </button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5, overflowY: 'auto' }}>
                {machine.params.map((pr) => (
                  <div
                    key={pr.name}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 6,
                      padding: '5px 7px',
                      borderRadius: 6,
                      background: '#0d1117',
                      border: '1px solid #242c37',
                      fontSize: 11.5,
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 600, color: '#e6edf3', overflow: 'hidden', textOverflow: 'ellipsis' }}>{pr.name}</div>
                      <div style={{ fontSize: 10, color: '#7ee787' }}>{pr.type}</div>
                    </div>
                    <button type="button" className="mf-btn" style={{ padding: '2px 5px' }} onClick={() => removeParam(pr.name)}>
                      <Trash2 size={11} />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* Center: Pan & Zoom Interactive State Graph Canvas */}
            <div
              ref={canvasRef}
              style={{
                position: 'relative',
                border: '1px solid #2b323b',
                borderRadius: 8,
                backgroundColor: '#0e131a',
                backgroundImage: 'radial-gradient(rgba(255,255,255,0.1) 1px, transparent 1px)',
                backgroundPosition: `${pan.x}px ${pan.y}px`,
                backgroundSize: `${20 * zoom}px ${20 * zoom}px`,
                overflow: 'hidden',
                minHeight: 400,
                userSelect: 'none',
                cursor: isPanning ? 'grabbing' : 'grab',
              }}
              onWheel={(e) => {
                e.preventDefault()
                const rect = canvasRef.current?.getBoundingClientRect()
                const fx = rect ? e.clientX - rect.left : undefined
                const fy = rect ? e.clientY - rect.top : undefined
                const factor = e.deltaY < 0 ? 1.1 : 0.9
                applyZoom(zoom * factor, fx, fy)
              }}
              onPointerDown={(e) => {
                // Pan on empty canvas left-click, middle-click anywhere, or Alt+drag
                if (e.button === 1 || e.altKey || e.target === e.currentTarget) {
                  e.preventDefault()
                  panDragRef.current = {
                    startClientX: e.clientX,
                    startClientY: e.clientY,
                    origPanX: pan.x,
                    origPanY: pan.y,
                  }
                  setIsPanning(true)
                  ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
                }
              }}
              onPointerMove={(e) => {
                if (panDragRef.current) {
                  const dx = e.clientX - panDragRef.current.startClientX
                  const dy = e.clientY - panDragRef.current.startClientY
                  setPan({ x: panDragRef.current.origPanX + dx, y: panDragRef.current.origPanY + dy })
                  return
                }
                if (dragNodeRef.current) {
                  const dx = (e.clientX - dragNodeRef.current.startClientX) / zoom
                  const dy = (e.clientY - dragNodeRef.current.startClientY) / zoom
                  const id = dragNodeRef.current.id
                  const nx = Math.round(dragNodeRef.current.origX + dx)
                  const ny = Math.round(dragNodeRef.current.origY + dy)
                  setMachine((m) => ({
                    ...m,
                    states: m.states.map((s) => (s.id === id ? { ...s, x: nx, y: ny } : s)),
                  }))
                }
              }}
              onPointerUp={() => {
                dragNodeRef.current = null
                panDragRef.current = null
                setIsPanning(false)
              }}
            >
              {/* Transformed world stage */}
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  transformOrigin: '0 0',
                  transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                  pointerEvents: 'none',
                }}
              >
                <svg style={{ position: 'absolute', left: 0, top: 0, width: 1, height: 1, overflow: 'visible', pointerEvents: 'none' }}>
                  <defs>
                    <marker id="asm-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                      <path d="M 0 1 L 10 5 L 0 9 z" fill="#60a5fa" />
                    </marker>
                    <marker id="asm-arrow-sel" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                      <path d="M 0 1 L 10 5 L 0 9 z" fill="#f59e0b" />
                    </marker>
                  </defs>
                  {machine.transitions.map((tr) => {
                    const a = stateByName.get(tr.from)
                    const b = stateByName.get(tr.to)
                    if (!a || !b) return null
                    const ax = a.x + 74
                    const ay = a.y + 30
                    const bx = b.x + 74
                    const by = b.y + 30
                    const dx = bx - ax
                    const dy = by - ay
                    const len = Math.hypot(dx, dy) || 1
                    const ox = (-dy / len) * 10
                    const oy = (dx / len) * 10
                    const x1 = ax + (dx / len) * 44 + ox
                    const y1 = ay + (dy / len) * 26 + oy
                    const x2 = bx - (dx / len) * 48 + ox
                    const y2 = by - (dy / len) * 28 + oy
                    const isSel = tr.id === selectedTransId
                    const mx = (x1 + x2) / 2
                    const my = (y1 + y2) / 2
                    const label = tr.conditions.length
                      ? tr.conditions.map((c) => (c.op === 'trigger' ? `⚡${c.param}` : `${c.param} ${c.op} ${c.value}`)).join(' & ')
                      : tr.hasExitTime
                        ? `exit ${Math.round((tr.exitTime ?? 0.9) * 100)}%`
                        : `${tr.duration}s`
                    return (
                      <g
                        key={tr.id}
                        style={{ pointerEvents: 'auto', cursor: 'pointer' }}
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={() => {
                          setSelectedTransId(tr.id)
                          setSelectedStateId(null)
                        }}
                      >
                        <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="transparent" strokeWidth={12} />
                        <line
                          x1={x1}
                          y1={y1}
                          x2={x2}
                          y2={y2}
                          stroke={isSel ? '#f59e0b' : '#60a5fa'}
                          strokeWidth={isSel ? 2.5 : 1.7}
                          markerEnd={isSel ? 'url(#asm-arrow-sel)' : 'url(#asm-arrow)'}
                        />
                        <rect x={mx - 42} y={my - 9} width={84} height={18} rx={4} fill={isSel ? '#3b2c12' : '#141c27'} stroke={isSel ? '#f59e0b' : '#2e3c4f'} />
                        <text x={mx} y={my + 3} textAnchor="middle" fill="#dbeafe" fontSize={9.5} fontFamily="ui-monospace, monospace">
                          {label.slice(0, 16)}
                        </text>
                      </g>
                    )
                  })}
                </svg>

                {machine.states.map((st) => {
                  const isEntry = machine.entryState === st.name
                  const isSel = selectedStateId === st.id
                  return (
                    <div
                      key={st.id}
                      onPointerDown={(e) => {
                        if (e.button === 1 || e.altKey) return
                        e.stopPropagation()
                        setSelectedStateId(st.id)
                        setSelectedTransId(null)
                        dragNodeRef.current = {
                          id: st.id,
                          startClientX: e.clientX,
                          startClientY: e.clientY,
                          origX: st.x,
                          origY: st.y,
                        }
                      }}
                      style={{
                        position: 'absolute',
                        left: st.x,
                        top: st.y,
                        width: 148,
                        padding: '8px 10px',
                        borderRadius: 8,
                        background: isSel ? '#1d293a' : '#141b24',
                        border: '1.5px solid ' + (isSel ? '#f59e0b' : isEntry ? '#4ade80' : '#334155'),
                        boxShadow: '0 6px 16px rgba(0,0,0,0.35)',
                        cursor: 'grab',
                        pointerEvents: 'auto',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4 }}>
                        <strong style={{ fontSize: 12.5, color: '#f8fafc' }}>{st.name}</strong>
                        {isEntry && (
                          <span style={{ fontSize: 9.5, padding: '1px 5px', borderRadius: 4, background: 'rgba(74,222,128,0.18)', color: '#86efac' }}>
                            ENTRY
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: 10.5, color: '#94a3b8', marginTop: 3, display: 'flex', alignItems: 'center', gap: 4 }}>
                        <Play size={10} /> {st.clip || '(none)'} · {st.speed}x
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* Pan/Zoom controls overlay */}
              <div
                onPointerDown={(e) => e.stopPropagation()}
                style={{
                  position: 'absolute',
                  right: 10,
                  bottom: 10,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  background: 'rgba(15, 20, 27, 0.88)',
                  border: '1px solid #2b323b',
                  borderRadius: 6,
                  padding: '3px 5px',
                  fontSize: 11,
                }}
              >
                <button type="button" className="mf-btn" style={{ padding: '2px 5px' }} onClick={() => applyZoom(zoom * 0.85)} title="Zoom out">
                  <ZoomOut size={12} />
                </button>
                <span style={{ minWidth: 38, textAlign: 'center', color: '#cbd5e1', fontFamily: 'ui-monospace, monospace' }}>
                  {Math.round(zoom * 100)}%
                </span>
                <button type="button" className="mf-btn" style={{ padding: '2px 5px' }} onClick={() => applyZoom(zoom * 1.15)} title="Zoom in">
                  <ZoomIn size={12} />
                </button>
                <button
                  type="button"
                  className="mf-btn"
                  style={{ padding: '2px 5px' }}
                  onClick={() => {
                    setPan({ x: 20, y: 20 })
                    setZoom(1)
                  }}
                  title="Reset view"
                >
                  <RotateCcw size={12} />
                </button>
              </div>
              <span
                style={{
                  position: 'absolute',
                  left: 10,
                  bottom: 10,
                  fontSize: 10,
                  color: '#8b9bb0',
                  background: 'rgba(13,17,23,0.72)',
                  padding: '2px 6px',
                  borderRadius: 4,
                  pointerEvents: 'none',
                }}
              >
                Drag background to pan · Scroll to zoom
              </span>
            </div>

            {/* Right: Inspector for selected State or Transition */}
            <div style={{ border: '1px solid #2b323b', borderRadius: 8, padding: 10, background: '#141a22', display: 'flex', flexDirection: 'column', gap: 8, overflowY: 'auto' }}>
              {selState ? (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <strong style={{ fontSize: 12, color: '#f8fafc' }}>State: {selState.name}</strong>
                    {machine.states.length > 1 && (
                      <button type="button" className="mf-btn" style={{ padding: '2px 6px' }} onClick={() => removeState(selState.id)}>
                        <Trash2 size={12} />
                      </button>
                    )}
                  </div>
                  <label style={{ fontSize: 11.5, display: 'flex', flexDirection: 'column', gap: 3 }}>
                    State name
                    <input value={selState.name} onChange={(e) => updateState(selState.id, { name: e.target.value })} />
                  </label>
                  <label style={{ fontSize: 11.5, display: 'flex', flexDirection: 'column', gap: 3 }}>
                    Animation clip
                    {availableClips.length ? (
                      <select value={selState.clip} onChange={(e) => updateState(selState.id, { clip: e.target.value })}>
                        {!availableClips.includes(selState.clip) && <option value={selState.clip}>{selState.clip}</option>}
                        {availableClips.map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input value={selState.clip} onChange={(e) => updateState(selState.id, { clip: e.target.value })} />
                    )}
                  </label>
                  <label style={{ fontSize: 11.5, display: 'flex', flexDirection: 'column', gap: 3 }}>
                    Playback speed
                    <input
                      type="number"
                      step={0.1}
                      value={selState.speed}
                      onChange={(e) => updateState(selState.id, { speed: Number(e.target.value) || 1 })}
                    />
                  </label>
                  <label style={{ fontSize: 11.5, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <input type="checkbox" checked={selState.loop} onChange={(e) => updateState(selState.id, { loop: e.target.checked })} />
                    Loop clip
                  </label>
                  <button
                    type="button"
                    className="mf-btn"
                    disabled={machine.entryState === selState.name}
                    onClick={() => setMachine((m) => ({ ...m, entryState: selState.name }))}
                  >
                    Set as Entry State
                  </button>
                  <div style={{ marginTop: 6, borderTop: '1px solid #242c37', paddingTop: 8 }}>
                    <strong style={{ fontSize: 11, color: '#94a3b8' }}>Outgoing Transitions</strong>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 6 }}>
                      {machine.transitions
                        .filter((t) => t.from === selState.name)
                        .map((t) => (
                          <button
                            key={t.id}
                            type="button"
                            className="mf-btn"
                            style={{ justifyContent: 'space-between', fontSize: 11 }}
                            onClick={() => {
                              setSelectedTransId(t.id)
                              setSelectedStateId(null)
                            }}
                          >
                            <span>→ {t.to}</span>
                            <span style={{ color: '#94a3b8' }}>{t.duration}s</span>
                          </button>
                        ))}
                    </div>
                  </div>
                </>
              ) : selTrans ? (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <strong style={{ fontSize: 12, color: '#f8fafc' }}>Transition</strong>
                    <button type="button" className="mf-btn" style={{ padding: '2px 6px' }} onClick={() => removeTransition(selTrans.id)}>
                      <Trash2 size={12} />
                    </button>
                  </div>
                  <label style={{ fontSize: 11.5, display: 'flex', flexDirection: 'column', gap: 3 }}>
                    From state
                    <select value={selTrans.from} onChange={(e) => updateTransition(selTrans.id, { from: e.target.value })}>
                      {machine.states.map((s) => (
                        <option key={s.id} value={s.name}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label style={{ fontSize: 11.5, display: 'flex', flexDirection: 'column', gap: 3 }}>
                    To state
                    <select value={selTrans.to} onChange={(e) => updateTransition(selTrans.id, { to: e.target.value })}>
                      {machine.states.map((s) => (
                        <option key={s.id} value={s.name}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label style={{ fontSize: 11.5, display: 'flex', flexDirection: 'column', gap: 3 }}>
                    Crossfade duration (s)
                    <input
                      type="number"
                      step={0.05}
                      min={0}
                      max={2}
                      value={selTrans.duration}
                      onChange={(e) => updateTransition(selTrans.id, { duration: Math.max(0, Number(e.target.value) || 0) })}
                    />
                  </label>
                  <label style={{ fontSize: 11.5, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <input
                      type="checkbox"
                      checked={Boolean(selTrans.hasExitTime)}
                      onChange={(e) => updateTransition(selTrans.id, { hasExitTime: e.target.checked, exitTime: selTrans.exitTime ?? 0.85 })}
                    />
                    Has exit time ({Math.round((selTrans.exitTime ?? 0.85) * 100)}%)
                  </label>
                  <div style={{ marginTop: 4, borderTop: '1px solid #242c37', paddingTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <strong style={{ fontSize: 11, color: '#94a3b8' }}>Conditions ({selTrans.conditions.length})</strong>
                      <button
                        type="button"
                        className="mf-btn"
                        style={{ fontSize: 10.5, padding: '2px 6px' }}
                        onClick={() => {
                          const p0 = machine.params[0]
                          if (!p0) return
                          updateTransition(selTrans.id, {
                            conditions: [
                              ...selTrans.conditions,
                              { param: p0.name, op: p0.type === 'trigger' ? 'trigger' : '>', value: p0.type === 'float' ? 0.1 : true },
                            ],
                          })
                        }}
                      >
                        <Plus size={11} /> Add
                      </button>
                    </div>
                    {selTrans.conditions.map((cond, ci) => (
                      <div key={ci} style={{ display: 'grid', gridTemplateColumns: '1fr 64px 56px 22px', gap: 4, alignItems: 'center' }}>
                        <select
                          value={cond.param}
                          style={{ fontSize: 11 }}
                          onChange={(e) => {
                            const next = selTrans.conditions.map((c, idx) => (idx === ci ? { ...c, param: e.target.value } : c))
                            updateTransition(selTrans.id, { conditions: next })
                          }}
                        >
                          {machine.params.map((pr) => (
                            <option key={pr.name} value={pr.name}>
                              {pr.name}
                            </option>
                          ))}
                        </select>
                        <select
                          value={cond.op}
                          style={{ fontSize: 11 }}
                          onChange={(e) => {
                            const next = selTrans.conditions.map((c, idx) =>
                              idx === ci ? { ...c, op: e.target.value as AnimConditionOp } : c,
                            )
                            updateTransition(selTrans.id, { conditions: next })
                          }}
                        >
                          {(['>', '<', '>=', '<=', '==', '!=', 'trigger'] as AnimConditionOp[]).map((op) => (
                            <option key={op} value={op}>
                              {op}
                            </option>
                          ))}
                        </select>
                        {cond.op === 'trigger' ? (
                          <span style={{ fontSize: 10, color: '#f59e0b', textAlign: 'center' }}>fire</span>
                        ) : (
                          <input
                            value={String(cond.value)}
                            style={{ fontSize: 11 }}
                            onChange={(e) => {
                              const raw = e.target.value
                              const val = raw === 'true' ? true : raw === 'false' ? false : Number(raw)
                              const next = selTrans.conditions.map((c, idx) =>
                                idx === ci ? { ...c, value: Number.isNaN(val) ? raw === 'true' : val } : c,
                              )
                              updateTransition(selTrans.id, { conditions: next })
                            }}
                          />
                        )}
                        <button
                          type="button"
                          className="mf-btn"
                          style={{ padding: '2px 4px' }}
                          onClick={() => updateTransition(selTrans.id, { conditions: selTrans.conditions.filter((_, idx) => idx !== ci) })}
                        >
                          <Trash2 size={10} />
                        </button>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <p style={{ fontSize: 11.5, color: '#8b9bb0' }}>Select a state node or transition arrow to edit its clip and conditions.</p>
              )}
            </div>
          </div>
        </div>
        <footer>
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="mf-primary"
            onClick={() => {
              onSave(machine)
              onClose()
            }}
          >
            <Check size={14} /> Save State Machine
          </button>
        </footer>
      </div>
    </div>
  )
}
