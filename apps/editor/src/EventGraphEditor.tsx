import { useMemo, useRef, useState } from 'react'
import {
  Plus,
  Trash2,
  Search,
  GitBranch,
  Variable,
  FunctionSquare,
  Maximize2,
  X,
  Play,
  CheckCircle2,
} from 'lucide-react'
import {
  CATEGORY_COLORS,
  GRAPH_NODE_CATALOG,
  PIN_COLORS,
  getNodePins,
  parseEventGraph,
  uid,
  type Asset,
  type EventGraphData,
  type GraphEdge,
  type GraphFunction,
  type GraphNode,
  type GraphVariable,
  type PinType,
  type Project,
} from '../../../packages/project-schema/src'
import { SceneEntityPickerButton } from './SceneEntityPicker'

const VAR_TYPES: Exclude<PinType, 'exec'>[] = ['number', 'boolean', 'string', 'vec3', 'entity', 'array', 'enum', 'map', 'object', 'any']

function defaultForType(t: Exclude<PinType, 'exec'>): any {
  if (t === 'number') return 0
  if (t === 'boolean') return false
  if (t === 'vec3') return [0, 0, 0]
  if (t === 'array') return []
  if (t === 'map' || t === 'object') return {}
  if (t === 'enum') return 'Idle'
  return ''
}

function pinOffsetY(index: number) {
  return 44 + index * 26
}

const NODE_WIDTH = 228

function bezierPath(x1: number, y1: number, x2: number, y2: number) {
  const dx = Math.max(48, Math.abs(x2 - x1) * 0.55)
  return `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`
}

export function EventGraphEditor({
  a,
  p,
  changeA,
}: {
  a: Asset
  p?: Project
  changeA: (fn: (asset: Asset) => void) => void
}) {
  const graph: EventGraphData = useMemo(() => parseEventGraph(a.data), [a.data])

  // Active sub-graph: 'main' or function ID
  const [activeGraphId, setActiveGraphId] = useState<string>('main')
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [pan, setPan] = useState({ x: 40, y: 30 })
  const [zoom, setZoom] = useState(1)
  const [menuOpen, setMenuOpen] = useState<{ sx: number; sy: number; gx: number; gy: number } | null>(null)
  const [nodeSearch, setNodeSearch] = useState('')
  const [wireDrag, setWireDrag] = useState<{
    fromNode: string
    fromPin: string
    pinType: PinType
    x1: number
    y1: number
    x2: number
    y2: number
  } | null>(null)
  const [editVarId, setEditVarId] = useState<string | null>(null)

  const canvasRef = useRef<HTMLDivElement | null>(null)
  const dragRef = useRef<
    | { kind: 'pan'; sx: number; sy: number; px: number; py: number }
    | { kind: 'node'; id: string; sx: number; sy: number; nx: number; ny: number }
    | null
  >(null)

  const activeFn: GraphFunction | undefined =
    activeGraphId === 'main' ? undefined : graph.functions.find((f) => f.id === activeGraphId)
  const nodes: GraphNode[] = activeFn ? activeFn.nodes : graph.nodes
  const edges: GraphEdge[] = activeFn ? activeFn.edges : graph.edges

  const commit = (fn: (g: EventGraphData) => void) => {
    const next = structuredClone(graph)
    fn(next)
    changeA((asset) => {
      asset.data = JSON.stringify(next)
    })
  }

  const mutateActive = (fn: (list: { nodes: GraphNode[]; edges: GraphEdge[] }, g: EventGraphData) => void) => {
    commit((g) => {
      if (activeGraphId === 'main') {
        fn(g, g)
      } else {
        const target = g.functions.find((f) => f.id === activeGraphId)
        if (target) fn(target, g)
      }
    })
  }

  const screenToGraph = (clientX: number, clientY: number) => {
    const rect = canvasRef.current?.getBoundingClientRect()
    if (!rect) return { x: 160, y: 120 }
    return {
      x: Math.round((clientX - rect.left - pan.x) / zoom),
      y: Math.round((clientY - rect.top - pan.y) / zoom),
    }
  }

  // Node CRUD
  const addNodeAt = (type: string, gx: number, gy: number, config?: Record<string, any>) => {
    const id = uid('node')
    mutateActive((target) => {
      target.nodes.push({ id, type, x: gx, y: gy, config, inputs: {} })
    })
    setSelectedNodeId(id)
    setMenuOpen(null)
  }

  const deleteNode = (id: string) => {
    mutateActive((target) => {
      target.nodes = target.nodes.filter((n) => n.id !== id)
      target.edges = target.edges.filter((e) => e.fromNode !== id && e.toNode !== id)
    })
    if (selectedNodeId === id) setSelectedNodeId(null)
  }

  const updateNodeInput = (nodeId: string, pinId: string, value: any) => {
    mutateActive((target) => {
      const n = target.nodes.find((x) => x.id === nodeId)
      if (!n) return
      n.inputs = { ...(n.inputs || {}), [pinId]: value }
    })
  }

  const updateNodeConfig = (nodeId: string, patch: Record<string, any>) => {
    mutateActive((target) => {
      const n = target.nodes.find((x) => x.id === nodeId)
      if (!n) return
      n.config = { ...(n.config || {}), ...patch }
    })
  }

  const disconnectInputPin = (nodeId: string, pinId: string) => {
    mutateActive((target) => {
      target.edges = target.edges.filter((e) => !(e.toNode === nodeId && e.toPin === pinId))
    })
  }

  const connectPins = (fromNode: string, fromPin: string, toNode: string, toPin: string, pinType: PinType) => {
    if (fromNode === toNode) return
    mutateActive((target) => {
      // Data input pins accept a single incoming wire; exec output pins accept a single outgoing wire
      if (pinType === 'exec') {
        target.edges = target.edges.filter((e) => !(e.fromNode === fromNode && e.fromPin === fromPin))
      } else {
        target.edges = target.edges.filter((e) => !(e.toNode === toNode && e.toPin === toPin))
      }
      const dup = target.edges.some(
        (e) => e.fromNode === fromNode && e.fromPin === fromPin && e.toNode === toNode && e.toPin === toPin,
      )
      if (!dup) {
        target.edges.push({ id: uid('edge'), fromNode, fromPin, toNode, toPin })
      }
    })
  }

  // Variable CRUD
  const addVariable = () => {
    const id = uid('var')
    commit((g) => {
      g.variables.push({
        id,
        name: `Var_${g.variables.length + 1}`,
        type: 'number',
        defaultValue: 0,
        exposed: true,
        scope: 'local',
      })
    })
    setEditVarId(id)
  }

  const updateVariable = (id: string, patch: Partial<GraphVariable>) => {
    commit((g) => {
      const v = g.variables.find((x) => x.id === id)
      if (v) Object.assign(v, patch)
    })
  }

  const deleteVariable = (id: string) => {
    commit((g) => {
      g.variables = g.variables.filter((x) => x.id !== id)
    })
    if (editVarId === id) setEditVarId(null)
  }

  // Function CRUD
  const addFunction = () => {
    const id = uid('fn')
    const fn: GraphFunction = {
      id,
      name: `MyFunction_${graph.functions.length + 1}`,
      inputs: [{ id: uid('pin'), name: 'InputA', type: 'number' }],
      outputs: [{ id: uid('pin'), name: 'Result', type: 'number' }],
      nodes: [
        { id: uid('node'), type: 'func.entry', x: 80, y: 120, config: { fnId: id } },
        { id: uid('node'), type: 'func.return', x: 460, y: 120, config: { fnId: id } },
      ],
      edges: [],
    }
    commit((g) => {
      g.functions.push(fn)
    })
    setActiveGraphId(id)
  }

  const updateFunction = (id: string, fnPatch: (f: GraphFunction) => void) => {
    commit((g) => {
      const f = g.functions.find((x) => x.id === id)
      if (f) fnPatch(f)
    })
  }

  const deleteFunction = (id: string) => {
    commit((g) => {
      g.functions = g.functions.filter((x) => x.id !== id)
    })
    if (activeGraphId === id) setActiveGraphId('main')
  }

  // Pin position lookup for SVG wires
  const pinCoords = useMemo(() => {
    const map = new Map<string, { x: number; y: number; type: PinType }>()
    for (const n of nodes) {
      const info = getNodePins(n, graph, activeFn)
      info.inputs.forEach((p, idx) => {
        map.set(`${n.id}:in:${p.id}`, { x: n.x, y: n.y + pinOffsetY(idx), type: p.type })
      })
      info.outputs.forEach((p, idx) => {
        map.set(`${n.id}:out:${p.id}`, { x: n.x + NODE_WIDTH, y: n.y + pinOffsetY(idx), type: p.type })
      })
    }
    return map
  }, [nodes, graph, activeFn])

  const filteredCatalog = useMemo(() => {
    const q = nodeSearch.trim().toLowerCase()
    return GRAPH_NODE_CATALOG.filter((s) => {
      if (s.type === 'func.entry' || s.type === 'func.return' || s.type === 'var.get' || s.type === 'var.set' || s.type === 'func.call') {
        return false
      }
      if (activeFn && s.category === 'Events') return false
      if (!q) return true
      return (
        s.title.toLowerCase().includes(q) ||
        s.category.toLowerCase().includes(q) ||
        (s.keywords || '').toLowerCase().includes(q)
      )
    })
  }, [nodeSearch, activeFn])

  return (
    <div className="mf-bp-editor">
      {/* Top Blueprint Toolbar */}
      <div className="mf-bp-toolbar">
        <div className="mf-bp-tabs">
          <button
            type="button"
            className={'mf-bp-tab' + (activeGraphId === 'main' ? ' active' : '')}
            onClick={() => setActiveGraphId('main')}
          >
            <GitBranch size={13} /> EventGraph
          </button>
          {graph.functions.map((f) => (
            <button
              key={f.id}
              type="button"
              className={'mf-bp-tab' + (activeGraphId === f.id ? ' active' : '')}
              onClick={() => setActiveGraphId(f.id)}
            >
              <FunctionSquare size={12} /> {f.name}
            </button>
          ))}
        </div>
        <div className="mf-bp-actions">
          <button
            type="button"
            className="mf-primary"
            style={{ padding: '4px 10px', fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 5 }}
            onClick={() => {
              setNodeSearch('')
              setMenuOpen({ sx: 300, sy: 90, gx: Math.round((240 - pan.x) / zoom), gy: Math.round((140 - pan.y) / zoom) })
            }}
          >
            <Plus size={13} /> Add Node
          </button>
          <button
            type="button"
            className="mf-btn"
            style={{ fontSize: 11.5 }}
            onClick={() => {
              setPan({ x: 40, y: 30 })
              setZoom(1)
            }}
            title="Reset pan & zoom"
          >
            <Maximize2 size={12} /> Reset View
          </button>
          <span className="mf-bp-status">
            <CheckCircle2 size={12} /> {nodes.length} nodes · {edges.length} wires · {Math.round(zoom * 100)}%
          </span>
        </div>
      </div>

      <div className="mf-bp-body">
        {/* Left Sidebar: My Blueprint (Variables & Custom Functions) */}
        <aside className="mf-bp-sidebar">
          <div className="mf-bp-panel">
            <div className="mf-bp-panel-head">
              <span>
                <FunctionSquare size={12} /> Functions ({graph.functions.length})
              </span>
              <button type="button" className="mf-bp-icon-btn" onClick={addFunction} title="New Function">
                <Plus size={13} />
              </button>
            </div>
            <div className="mf-bp-list">
              {graph.functions.map((f) => (
                <div key={f.id} className={'mf-bp-list-row' + (activeGraphId === f.id ? ' active' : '')}>
                  <button type="button" className="mf-bp-list-name" onClick={() => setActiveGraphId(f.id)}>
                    {f.name}()
                  </button>
                  <button
                    type="button"
                    className="mf-bp-mini-btn"
                    title="Drop Call Function node"
                    onClick={() =>
                      addNodeAt('func.call', Math.round((260 - pan.x) / zoom), Math.round((160 - pan.y) / zoom), {
                        fnId: f.id,
                      })
                    }
                  >
                    Call
                  </button>
                  <button
                    type="button"
                    className="mf-bp-icon-btn"
                    title="Delete Function"
                    onClick={() => deleteFunction(f.id)}
                  >
                    <Trash2 size={11} />
                  </button>
                </div>
              ))}
              {graph.functions.length === 0 && <div className="mf-bp-empty">No functions yet</div>}
            </div>

            {activeFn && (
              <div className="mf-bp-fn-inspector">
                <label className="mf-bp-small-label">Function Name</label>
                <input
                  value={activeFn.name}
                  onChange={(e) => updateFunction(activeFn.id, (f) => (f.name = e.target.value))}
                />
                <div className="mf-bp-subhead">
                  <span>Inputs</span>
                  <button
                    type="button"
                    className="mf-bp-icon-btn"
                    onClick={() =>
                      updateFunction(activeFn.id, (f) =>
                        f.inputs.push({ id: uid('pin'), name: `In_${f.inputs.length + 1}`, type: 'number' }),
                      )
                    }
                  >
                    <Plus size={11} />
                  </button>
                </div>
                {activeFn.inputs.map((inp) => (
                  <div key={inp.id} className="mf-bp-param-row">
                    <input
                      value={inp.name}
                      onChange={(e) =>
                        updateFunction(activeFn.id, (f) => {
                          const p = f.inputs.find((x) => x.id === inp.id)
                          if (p) p.name = e.target.value
                        })
                      }
                    />
                    <select
                      value={inp.type}
                      onChange={(e) =>
                        updateFunction(activeFn.id, (f) => {
                          const p = f.inputs.find((x) => x.id === inp.id)
                          if (p) p.type = e.target.value as any
                        })
                      }
                    >
                      {VAR_TYPES.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className="mf-bp-icon-btn"
                      onClick={() =>
                        updateFunction(activeFn.id, (f) => (f.inputs = f.inputs.filter((x) => x.id !== inp.id)))
                      }
                    >
                      <X size={11} />
                    </button>
                  </div>
                ))}
                <div className="mf-bp-subhead">
                  <span>Outputs</span>
                  <button
                    type="button"
                    className="mf-bp-icon-btn"
                    onClick={() =>
                      updateFunction(activeFn.id, (f) =>
                        f.outputs.push({ id: uid('pin'), name: `Out_${f.outputs.length + 1}`, type: 'number' }),
                      )
                    }
                  >
                    <Plus size={11} />
                  </button>
                </div>
                {activeFn.outputs.map((outp) => (
                  <div key={outp.id} className="mf-bp-param-row">
                    <input
                      value={outp.name}
                      onChange={(e) =>
                        updateFunction(activeFn.id, (f) => {
                          const p = f.outputs.find((x) => x.id === outp.id)
                          if (p) p.name = e.target.value
                        })
                      }
                    />
                    <select
                      value={outp.type}
                      onChange={(e) =>
                        updateFunction(activeFn.id, (f) => {
                          const p = f.outputs.find((x) => x.id === outp.id)
                          if (p) p.type = e.target.value as any
                        })
                      }
                    >
                      {VAR_TYPES.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className="mf-bp-icon-btn"
                      onClick={() =>
                        updateFunction(activeFn.id, (f) => (f.outputs = f.outputs.filter((x) => x.id !== outp.id)))
                      }
                    >
                      <X size={11} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Variables */}
          <div className="mf-bp-panel">
            <div className="mf-bp-panel-head">
              <span>
                <Variable size={12} /> Variables ({graph.variables.length})
              </span>
              <button type="button" className="mf-bp-icon-btn" onClick={addVariable} title="New Variable">
                <Plus size={13} />
              </button>
            </div>
            <div className="mf-bp-list">
              {graph.variables.map((v) => (
                <div key={v.id} className="mf-bp-var-block">
                  <div className={'mf-bp-list-row' + (editVarId === v.id ? ' active' : '')}>
                    <span className="mf-bp-dot" style={{ background: PIN_COLORS[v.type] }} />
                    <button
                      type="button"
                      className="mf-bp-list-name"
                      onClick={() => setEditVarId(editVarId === v.id ? null : v.id)}
                    >
                      {v.name}
                    </button>
                    <button
                      type="button"
                      className="mf-bp-mini-btn"
                      onClick={() =>
                        addNodeAt('var.get', Math.round((200 - pan.x) / zoom), Math.round((180 - pan.y) / zoom), {
                          varId: v.id,
                        })
                      }
                    >
                      Get
                    </button>
                    <button
                      type="button"
                      className="mf-bp-mini-btn"
                      onClick={() =>
                        addNodeAt('var.set', Math.round((280 - pan.x) / zoom), Math.round((180 - pan.y) / zoom), {
                          varId: v.id,
                        })
                      }
                    >
                      Set
                    </button>
                    <button type="button" className="mf-bp-icon-btn" onClick={() => deleteVariable(v.id)}>
                      <Trash2 size={11} />
                    </button>
                  </div>
                  {editVarId === v.id && (
                    <div className="mf-bp-var-edit">
                      <input
                        value={v.name}
                        placeholder="Name"
                        onChange={(e) => updateVariable(v.id, { name: e.target.value })}
                      />
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
                        <select
                          value={v.type}
                          onChange={(e) => {
                            const t = e.target.value as Exclude<PinType, 'exec'>
                            updateVariable(v.id, {
                              type: t,
                              defaultValue: defaultForType(t),
                              ...(t === 'enum' ? { enumValues: v.enumValues?.length ? v.enumValues : ['Idle', 'Patrol', 'Chase', 'Attack'] } : {}),
                            })
                          }}
                        >
                          {VAR_TYPES.map((t) => (
                            <option key={t} value={t}>
                              {t}
                            </option>
                          ))}
                        </select>
                        <select
                          value={v.scope || 'local'}
                          onChange={(e) => updateVariable(v.id, { scope: e.target.value as any })}
                        >
                          <option value="local">Local</option>
                          <option value="vars">HUD (vars)</option>
                          <option value="worldState">WorldState</option>
                        </select>
                      </div>
                      {v.type === 'boolean' ? (
                        <label className="mf-bp-check">
                          <input
                            type="checkbox"
                            checked={Boolean(v.defaultValue)}
                            onChange={(e) => updateVariable(v.id, { defaultValue: e.target.checked })}
                          />
                          Default: {String(Boolean(v.defaultValue))}
                        </label>
                      ) : v.type === 'enum' ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                          <input
                            key={v.id + ':enum:' + (v.enumValues || []).join('|')}
                            defaultValue={(v.enumValues || ['Idle', 'Patrol', 'Chase']).join(', ')}
                            placeholder="Idle, Patrol, Chase (Enter)"
                            title="Type comma-separated values, then press Enter or click outside"
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') e.currentTarget.blur()
                            }}
                            onBlur={(e) => {
                              const vals = e.target.value.split(',').map((s) => s.trim()).filter(Boolean)
                              const clean = vals.length ? [...new Set(vals)] : ['Idle']
                              updateVariable(v.id, {
                                enumValues: clean,
                                defaultValue: clean.includes(String(v.defaultValue)) ? v.defaultValue : clean[0],
                              })
                            }}
                          />
                          <select
                            value={String(v.defaultValue ?? '')}
                            onChange={(e) => updateVariable(v.id, { defaultValue: e.target.value })}
                          >
                            {(v.enumValues?.length ? v.enumValues : ['Idle', 'Patrol', 'Chase']).map((opt) => (
                              <option key={opt} value={opt}>{opt}</option>
                            ))}
                          </select>
                        </div>
                      ) : v.type === 'array' || v.type === 'map' || v.type === 'object' ? (
                        <input
                          defaultValue={JSON.stringify(v.defaultValue ?? (v.type === 'array' ? [] : {}))}
                          placeholder={v.type === 'array' ? '["a", "b"]' : '{"key": 1}'}
                          title="JSON default value"
                          onBlur={(e) => {
                            try {
                              updateVariable(v.id, { defaultValue: JSON.parse(e.target.value) })
                            } catch {}
                          }}
                        />
                      ) : (
                        <input
                          value={Array.isArray(v.defaultValue) ? v.defaultValue.join(', ') : String(v.defaultValue ?? '')}
                          placeholder="Default value"
                          onChange={(e) => {
                            const raw = e.target.value
                            if (v.type === 'number') updateVariable(v.id, { defaultValue: Number(raw) || 0 })
                            else if (v.type === 'vec3') {
                              const p = raw.split(',').map((x) => Number(x.trim()) || 0)
                              updateVariable(v.id, { defaultValue: [p[0] ?? 0, p[1] ?? 0, p[2] ?? 0] })
                            } else updateVariable(v.id, { defaultValue: raw })
                          }}
                        />
                      )}
                      <label className="mf-bp-check">
                        <input
                          type="checkbox"
                          checked={v.exposed !== false}
                          onChange={(e) => updateVariable(v.id, { exposed: e.target.checked })}
                        />
                        Editable in Inspector
                      </label>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </aside>

        {/* Center Infinite Node Canvas */}
        <div
          ref={canvasRef}
          className="mf-bp-canvas"
          style={{
            backgroundPosition: `${pan.x}px ${pan.y}px`,
            backgroundSize: `${24 * zoom}px ${24 * zoom}px`,
          }}
          onContextMenu={(e) => {
            e.preventDefault()
            const g = screenToGraph(e.clientX, e.clientY)
            const rect = canvasRef.current?.getBoundingClientRect()
            setNodeSearch('')
            setMenuOpen({
              sx: Math.min(window.innerWidth - 280, Math.max(12, e.clientX - (rect?.left ?? 0))),
              sy: Math.min(window.innerHeight - 340, Math.max(12, e.clientY - (rect?.top ?? 0))),
              gx: g.x,
              gy: g.y,
            })
          }}
          onPointerDown={(e) => {
            if ((e.target as HTMLElement).closest('.mf-bp-node, .mf-bp-add-menu')) return
            setMenuOpen(null)
            setSelectedNodeId(null)
            dragRef.current = { kind: 'pan', sx: e.clientX, sy: e.clientY, px: pan.x, py: pan.y }
          }}
          onPointerMove={(e) => {
            if (wireDrag) {
              const g = screenToGraph(e.clientX, e.clientY)
              setWireDrag((w) => (w ? { ...w, x2: g.x, y2: g.y } : null))
              return
            }
            const d = dragRef.current
            if (!d) return
            if (d.kind === 'pan') {
              setPan({ x: d.px + (e.clientX - d.sx), y: d.py + (e.clientY - d.sy) })
            } else if (d.kind === 'node') {
              const nx = Math.round(d.nx + (e.clientX - d.sx) / zoom)
              const ny = Math.round(d.ny + (e.clientY - d.sy) / zoom)
              mutateActive((target) => {
                const n = target.nodes.find((x) => x.id === d.id)
                if (n) {
                  n.x = nx
                  n.y = ny
                }
              })
            }
          }}
          onPointerUp={() => {
            dragRef.current = null
            if (wireDrag) setWireDrag(null)
          }}
          onWheel={(e) => {
            e.preventDefault()
            const next = Math.max(0.45, Math.min(1.75, zoom * (e.deltaY > 0 ? 0.92 : 1.08)))
            setZoom(Number(next.toFixed(2)))
          }}
        >
          <div className="mf-bp-stage" style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}>
            {/* SVG Bezier Wires */}
            <svg className="mf-bp-wires" width="4000" height="4000" style={{ left: -1000, top: -1000 }}>
              <g transform="translate(1000, 1000)">
                {edges.map((edge) => {
                  const aPt = pinCoords.get(`${edge.fromNode}:out:${edge.fromPin}`)
                  const bPt = pinCoords.get(`${edge.toNode}:in:${edge.toPin}`)
                  if (!aPt || !bPt) return null
                  const col = PIN_COLORS[aPt.type] || '#9aa7b8'
                  return (
                    <path
                      key={edge.id}
                      d={bezierPath(aPt.x, aPt.y, bPt.x, bPt.y)}
                      stroke={col}
                      strokeWidth={aPt.type === 'exec' ? 3 : 2.2}
                      fill="none"
                      className="mf-bp-wire"
                      onClick={(e) => {
                        e.stopPropagation()
                        mutateActive((target) => {
                          target.edges = target.edges.filter((x) => x.id !== edge.id)
                        })
                      }}
                    >
                      <title>Click wire to delete</title>
                    </path>
                  )
                })}
                {wireDrag && (
                  <path
                    d={bezierPath(wireDrag.x1, wireDrag.y1, wireDrag.x2, wireDrag.y2)}
                    stroke={PIN_COLORS[wireDrag.pinType]}
                    strokeWidth={wireDrag.pinType === 'exec' ? 3 : 2.2}
                    strokeDasharray="6 4"
                    fill="none"
                  />
                )}
              </g>
            </svg>

            {/* Nodes */}
            {nodes.map((node) => {
              const meta = getNodePins(node, graph, activeFn)
              const headerColor = CATEGORY_COLORS[meta.category] || '#3b4d63'
              const rows = Math.max(meta.inputs.length, meta.outputs.length)
              const locked = node.type === 'func.entry'
              return (
                <div
                  key={node.id}
                  className={'mf-bp-node' + (selectedNodeId === node.id ? ' selected' : '')}
                  style={{ left: node.x, top: node.y, width: NODE_WIDTH }}
                  onPointerDown={(e) => {
                    e.stopPropagation()
                    setSelectedNodeId(node.id)
                  }}
                >
                  <div
                    className="mf-bp-node-head"
                    style={{ background: headerColor }}
                    onPointerDown={(e) => {
                      if ((e.target as HTMLElement).closest('button, select')) return
                      e.stopPropagation()
                      setSelectedNodeId(node.id)
                      dragRef.current = { kind: 'node', id: node.id, sx: e.clientX, sy: e.clientY, nx: node.x, ny: node.y }
                    }}
                  >
                    <span className="mf-bp-node-title">{meta.title}</span>
                    {!locked && (
                      <button
                        type="button"
                        className="mf-bp-node-del"
                        title="Delete node"
                        onClick={() => deleteNode(node.id)}
                      >
                        <X size={11} />
                      </button>
                    )}
                  </div>

                  {/* Operator dropdown for Math / Logic / Vec3 */}
                  {(node.type === 'math.op' ||
                    node.type === 'logic.compare' ||
                    node.type === 'logic.bool' ||
                    node.type === 'vec3.math') && (
                    <div className="mf-bp-node-op">
                      <select
                        value={
                          node.config?.op ??
                          (node.type === 'math.op'
                            ? '+'
                            : node.type === 'logic.compare'
                              ? '=='
                              : node.type === 'logic.bool'
                                ? 'AND'
                                : 'add')
                        }
                        onChange={(e) => updateNodeConfig(node.id, { op: e.target.value })}
                      >
                        {(node.type === 'math.op'
                          ? ['+', '-', '*', '/', '%', 'pow', 'min', 'max']
                          : node.type === 'logic.compare'
                            ? ['==', '!=', '>', '>=', '<', '<=']
                            : node.type === 'logic.bool'
                              ? ['AND', 'OR', 'NOT', 'XOR']
                              : ['add', 'sub', 'scale', 'normalize']
                        ).map((op) => (
                          <option key={op} value={op}>
                            {op}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {node.type === 'enum.switch' && (
                    <div className="mf-bp-node-op" style={{ display: 'flex', gap: 4, justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: 10.5, color: '#a78bfa' }}>
                        Cases: {Math.max(1, Math.min(16, Number(node.config?.caseCount ?? 4)))}
                      </span>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button
                          type="button"
                          className="mf-btn"
                          style={{ fontSize: 10.5, padding: '1px 6px' }}
                          onClick={(e) => {
                            e.stopPropagation()
                            const cur = Math.max(1, Math.min(16, Number(node.config?.caseCount ?? 4)))
                            if (cur < 16) updateNodeConfig(node.id, { caseCount: cur + 1 })
                          }}
                        >
                          + Case
                        </button>
                        <button
                          type="button"
                          className="mf-btn"
                          style={{ fontSize: 10.5, padding: '1px 6px' }}
                          onClick={(e) => {
                            e.stopPropagation()
                            const cur = Math.max(1, Math.min(16, Number(node.config?.caseCount ?? 4)))
                            if (cur > 1) {
                              const nextCount = cur - 1
                              commit((g) => {
                                const fnObj = activeFn ? g.functions.find((f) => f.id === activeFn.id) : null
                                const targetNodes = fnObj ? fnObj.nodes : g.nodes
                                const targetEdges = fnObj ? fnObj.edges : g.edges
                                const nd = targetNodes.find((x) => x.id === node.id)
                                if (nd) nd.config = { ...(nd.config || {}), caseCount: nextCount }
                                for (let i = targetEdges.length - 1; i >= 0; i--) {
                                  const edg = targetEdges[i]
                                  if ((edg.toNode === node.id && edg.toPin === 'case' + nextCount) || (edg.fromNode === node.id && edg.fromPin === 'out' + nextCount)) {
                                    targetEdges.splice(i, 1)
                                  }
                                }
                              })
                            }
                          }}
                        >
                          − Case
                        </button>
                      </div>
                    </div>
                  )}

                  <div className="mf-bp-node-pins">
                    {Array.from({ length: rows }).map((_, rIdx) => {
                      const inp = meta.inputs[rIdx]
                      const out = meta.outputs[rIdx]
                      const inpConnected = inp
                        ? edges.some((e) => e.toNode === node.id && e.toPin === inp.id)
                        : false
                      const inpVal = inp
                        ? node.inputs?.[inp.id] !== undefined
                          ? node.inputs[inp.id]
                          : inp.defaultValue
                        : undefined
                      return (
                        <div key={rIdx} className="mf-bp-pin-row">
                          <div className="mf-bp-pin-left">
                            {inp && (
                              <>
                                <button
                                  type="button"
                                  className={'mf-bp-pin ' + (inp.type === 'exec' ? 'exec' : 'data') + (inpConnected ? ' wired' : '')}
                                  style={{ borderColor: PIN_COLORS[inp.type], background: inpConnected ? PIN_COLORS[inp.type] : undefined }}
                                  title={`${inp.label || 'Exec'} (${inp.type}) — right-click to disconnect`}
                                  onContextMenu={(e) => {
                                    e.preventDefault()
                                    e.stopPropagation()
                                    disconnectInputPin(node.id, inp.id)
                                  }}
                                  onPointerUp={(e) => {
                                    if (!wireDrag) return
                                    e.stopPropagation()
                                    const ok =
                                      (wireDrag.pinType === 'exec') === (inp.type === 'exec')
                                    if (ok) {
                                      connectPins(wireDrag.fromNode, wireDrag.fromPin, node.id, inp.id, wireDrag.pinType)
                                    }
                                    setWireDrag(null)
                                  }}
                                >
                                  {inp.type === 'exec' && <Play size={8} fill="currentColor" />}
                                </button>
                                {inp.label && <span className="mf-bp-pin-label">{inp.label}</span>}
                                {inp.type !== 'exec' && !inpConnected && (
                                  inp.type === 'boolean' ? (
                                    <input
                                      type="checkbox"
                                      className="mf-bp-inline-check"
                                      checked={Boolean(inpVal)}
                                      onChange={(e) => updateNodeInput(node.id, inp.id, e.target.checked)}
                                    />
                                  ) : inp.options && inp.options.length > 0 ? (
                                    <select
                                      className="mf-bp-inline-val"
                                      value={String(inpVal ?? inp.defaultValue ?? inp.options[0])}
                                      onChange={(e) => updateNodeInput(node.id, inp.id, e.target.value)}
                                    >
                                      {inp.options.map((opt) => (
                                        <option key={opt} value={opt}>
                                          {opt}
                                        </option>
                                      ))}
                                    </select>
                                  ) : (
                                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
                                      <input
                                        className="mf-bp-inline-val"
                                        value={Array.isArray(inpVal) ? inpVal.join(',') : String(inpVal ?? '')}
                                        onChange={(e) => {
                                          const raw = e.target.value
                                          if (inp.type === 'number') updateNodeInput(node.id, inp.id, Number(raw))
                                          else if (inp.type === 'vec3') {
                                            const arr = raw.split(',').map((s) => Number(s.trim()) || 0)
                                            updateNodeInput(node.id, inp.id, [arr[0] ?? 0, arr[1] ?? 0, arr[2] ?? 0])
                                          } else updateNodeInput(node.id, inp.id, raw)
                                        }}
                                      />
                                      {inp.type === 'entity' && p && (
                                        <SceneEntityPickerButton
                                          project={p}
                                          value={String(inpVal ?? '')}
                                          onPick={(id) => updateNodeInput(node.id, inp.id, id)}
                                        />
                                      )}
                                    </span>
                                  )
                                )}
                              </>
                            )}
                          </div>
                          <div className="mf-bp-pin-right">
                            {out && (
                              <>
                                {out.label && <span className="mf-bp-pin-label">{out.label}</span>}
                                <button
                                  type="button"
                                  className={'mf-bp-pin ' + (out.type === 'exec' ? 'exec' : 'data')}
                                  style={{ borderColor: PIN_COLORS[out.type] }}
                                  title={`${out.label || 'Exec'} (${out.type}) — drag to connect`}
                                  onPointerDown={(e) => {
                                    e.stopPropagation()
                                    const x1 = node.x + NODE_WIDTH
                                    const y1 = node.y + pinOffsetY(rIdx)
                                    setWireDrag({
                                      fromNode: node.id,
                                      fromPin: out.id,
                                      pinType: out.type,
                                      x1,
                                      y1,
                                      x2: x1 + 20,
                                      y2: y1,
                                    })
                                  }}
                                >
                                  {out.type === 'exec' && <Play size={8} fill="currentColor" />}
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>

          {/* Floating Add Node Palette (Right-click or + Add Node) */}
          {menuOpen && (
            <div className="mf-bp-add-menu" style={{ left: menuOpen.sx, top: menuOpen.sy }}>
              <div className="mf-comp-search">
                <Search size={13} />
                <input
                  autoFocus
                  placeholder="Search nodes (Start, Branch, Play Anim, Raycast…)"
                  value={nodeSearch}
                  onChange={(e) => setNodeSearch(e.target.value)}
                />
                <button type="button" className="mf-bp-icon-btn" onClick={() => setMenuOpen(null)}>
                  <X size={12} />
                </button>
              </div>
              <div className="mf-bp-add-list">
                {filteredCatalog.map((spec) => (
                  <button
                    key={spec.type}
                    type="button"
                    className="mf-bp-add-item"
                    onClick={() => addNodeAt(spec.type, menuOpen.gx, menuOpen.gy)}
                  >
                    <span className="mf-bp-dot" style={{ background: CATEGORY_COLORS[spec.category] }} />
                    <span className="mf-bp-add-title">{spec.title}</span>
                    <span className="mf-bp-add-cat">{spec.category}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="mf-bp-hint">
            Right-click canvas to add nodes · Drag output pin → input pin to connect · Click wire to remove · Scroll to zoom
          </div>
        </div>
      </div>
    </div>
  )
}
