import { useEffect, useMemo, useRef, useState } from 'react'
import { Plus, Trash2, MessageSquare, Flag, GitBranch, Zap, Maximize2 } from 'lucide-react'
import {
  parseDialogueGraph,
  parseDbAsset,
  parseDbPathText,
  parseDbJson,
  uid,
  type Asset,
  type DialogueGraphData,
  type DialogueNode,
  type DialogueNodeType,
} from '../../../packages/project-schema/src'
import { Field } from './Fields'

const NODE_COLORS: Record<DialogueNodeType, string> = {
  start: '#256b3e',
  line: '#1e548a',
  condition: '#9a5a18',
  action: '#5e3b88',
  end: '#8f2424',
}

export function DialogueEditor({
  a,
  changeA,
  assets,
}: {
  a: Asset
  assets: readonly Asset[]
  changeA: (fn: (asset: Asset) => void) => void
}) {
  const data: DialogueGraphData = useMemo(() => parseDialogueGraph(a.data), [a.data])
  const [selectedId, setSelectedId] = useState<string>(data.nodes[1]?.id ?? data.nodes[0]?.id ?? '')
  const [pan, setPan] = useState({ x: 30, y: 24 })
  const [zoom, setZoom] = useState(1)
  const [dragMode, setDragMode] = useState<'none' | 'node' | 'pan'>('none')
  const dragRef = useRef<
    | { kind: 'node'; id: string; sx: number; sy: number; nx: number; ny: number }
    | { kind: 'pan'; sx: number; sy: number; px: number; py: number }
    | null
  >(null)
  const dataRef = useRef(data)
  dataRef.current = data

  const commit = (fn: (d: DialogueGraphData) => void) => {
    const next = structuredClone(dataRef.current)
    fn(next)
    dataRef.current = next
    changeA((asset) => {
      asset.data = JSON.stringify(next)
    })
  }

  const databases = assets.filter(asset => asset.type === 'db')

  // Reliable window-level pointer dragging for BOTH canvas pan and nodes
  useEffect(() => {
    if (dragMode === 'none') return
    const onMove = (e: PointerEvent) => {
      const d = dragRef.current
      if (!d) return
      if (d.kind === 'pan') {
        setPan({ x: d.px + (e.clientX - d.sx), y: d.py + (e.clientY - d.sy) })
        return
      }
      const nx = Math.round(d.nx + (e.clientX - d.sx) / zoom)
      const ny = Math.round(d.ny + (e.clientY - d.sy) / zoom)
      commit((g) => {
        const n = g.nodes.find((x) => x.id === d.id)
        if (n) {
          n.x = nx
          n.y = ny
        }
      })
    }
    const onUp = () => {
      dragRef.current = null
      setDragMode('none')
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
  }, [dragMode, zoom])

  const addNode = (type: DialogueNodeType) => {
    const id = uid('dlg')
    const base: DialogueNode = {
      id,
      type,
      x: 160 + (data.nodes.length % 4) * 200,
      y: 80 + Math.floor(data.nodes.length / 4) * 140,
      ...(type === 'line' ? { speaker: 'NPC', text: 'Новая реплика…', choices: [] } : {}),
      ...(type === 'condition'
        ? { conditionScope: 'quest', conditionKey: data.quests[0]?.id || 'quest_intro', conditionOp: '==', conditionValue: 'active' }
        : {}),
      ...(type === 'action'
        ? { actionKind: 'setQuest', actionKey: data.quests[0]?.id || 'quest_intro', actionValue: 'completed' }
        : {}),
    }
    commit((d) => d.nodes.push(base))
    setSelectedId(id)
  }

  const cur = data.nodes.find((n) => n.id === selectedId)

  const edges: { from: DialogueNode; to: DialogueNode; label?: string; color: string }[] = []
  for (const n of data.nodes) {
    const push = (tid?: string, label?: string, color = '#7cc7ff') => {
      if (!tid) return
      const target = data.nodes.find((x) => x.id === tid)
      if (target) edges.push({ from: n, to: target, label, color })
    }
    push(n.nextNodeId)
    push(n.trueNodeId, 'True', '#57d163')
    push(n.falseNodeId, 'False', '#e5534b')
    for (const ch of n.choices || []) push(ch.nextNodeId, ch.text.slice(0, 14), '#f3a05d')
  }

  return (
    <div className="mf-bp-editor">
      <div className="mf-bp-toolbar">
        <div className="mf-bp-tabs">
          <span style={{ fontSize: 12, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <MessageSquare size={13} /> Dialogue &amp; Quest Graph
          </span>
        </div>
        <div className="mf-bp-actions">
          <select aria-label="Jump to dialogue node" value={selectedId} onChange={(event) => {
            const node = data.nodes.find((item) => item.id === event.target.value)
            if (!node) return
            setSelectedId(node.id)
            setPan({ x: 24 - node.x * zoom, y: 24 - node.y * zoom })
          }}>
            {data.nodes.map((node) => <option key={node.id} value={node.id}>{node.speaker || node.type} · {node.text || node.id}</option>)}
          </select>
          <button type="button" className="mf-btn" onClick={() => addNode('line')}><Plus size={12} /> Line</button>
          <button type="button" className="mf-btn" onClick={() => addNode('condition')}><GitBranch size={12} /> Condition</button>
          <button type="button" className="mf-btn" onClick={() => addNode('action')}><Zap size={12} /> Quest / Action</button>
          <button type="button" className="mf-btn" onClick={() => addNode('end')}><Plus size={12} /> End</button>
          <button type="button" className="mf-btn" onClick={() => { setPan({ x: 30, y: 24 }); setZoom(1) }} title="Reset view">
            <Maximize2 size={12} /> {Math.round(zoom * 100)}%
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '210px minmax(0, 1fr) 275px', flex: 1, minHeight: 0 }}>
        {/* Left: Quests Registry */}
        <aside className="mf-bp-sidebar">
          <div className="mf-bp-panel">
            <div className="mf-bp-panel-head">
              <span><Flag size={12} /> Quests ({data.quests.length})</span>
              <button
                type="button"
                className="mf-bp-icon-btn"
                onClick={() =>
                  commit((d) =>
                    d.quests.push({
                      id: `quest_${d.quests.length + 1}`,
                      title: 'Новый квест',
                      description: '',
                      defaultStatus: 'inactive',
                    }),
                  )
                }
              >
                <Plus size={12} />
              </button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {data.quests.map((q, qi) => (
                <div key={qi} className="mf-bp-var-edit" style={{ marginTop: 0 }}>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <input
                      value={q.id}
                      placeholder="quest_id"
                      onChange={(e) => commit((d) => (d.quests[qi].id = e.target.value))}
                    />
                    <button
                      type="button"
                      className="mf-bp-icon-btn"
                      onClick={() => commit((d) => d.quests.splice(qi, 1))}
                    >
                      <Trash2 size={11} />
                    </button>
                  </div>
                  <input
                    value={q.title}
                    placeholder="Название квеста"
                    onChange={(e) => commit((d) => (d.quests[qi].title = e.target.value))}
                  />
                </div>
              ))}
            </div>
          </div>
        </aside>

        {/* Center: Visual Dialogue Canvas (Pan & Zoom) */}
        <div
          className="mf-bp-canvas"
          style={{
            backgroundPosition: `${pan.x}px ${pan.y}px`,
            backgroundSize: `${22 * zoom}px ${22 * zoom}px`,
          }}
          onPointerDown={(e) => {
            if ((e.target as HTMLElement).closest('.mf-bp-node')) return
            e.preventDefault()
            dragRef.current = { kind: 'pan', sx: e.clientX, sy: e.clientY, px: pan.x, py: pan.y }
            setDragMode('pan')
          }}
          onWheel={(e) => {
            e.preventDefault()
            setZoom((z) => Number(Math.max(0.45, Math.min(1.75, z * (e.deltaY > 0 ? 0.92 : 1.08))).toFixed(2)))
          }}
        >
          <div className="mf-bp-stage" style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}>
            <svg className="mf-bp-wires" width="4000" height="4000" style={{ left: -1000, top: -1000 }}>
              <g transform="translate(1000, 1000)">
              {edges.map((ed, idx) => {
                const x1 = ed.from.x + 190
                const y1 = ed.from.y + 36
                const x2 = ed.to.x
                const y2 = ed.to.y + 36
                const dx = Math.max(40, Math.abs(x2 - x1) * 0.5)
                return (
                  <path
                    key={idx}
                    d={`M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`}
                    stroke={ed.color}
                    strokeWidth={2.2}
                    fill="none"
                  />
                )
              })}
              </g>
            </svg>
            {data.nodes.map((n) => (
              <div
                key={n.id}
                className={'mf-bp-node' + (selectedId === n.id ? ' selected' : '')}
                style={{ left: n.x, top: n.y, width: 190 }}
                onPointerDown={(e) => {
                  setSelectedId(n.id)
                  if ((e.target as HTMLElement).closest('button')) return
                  e.preventDefault()
                  dragRef.current = { kind: 'node', id: n.id, sx: e.clientX, sy: e.clientY, nx: n.x, ny: n.y }
                  setDragMode('node')
                }}
              >
                <div className="mf-bp-node-head" style={{ background: NODE_COLORS[n.type] }}>
                  <span className="mf-bp-node-title">
                    {n.type === 'line' ? n.speaker || 'Line' : n.type.toUpperCase()}
                  </span>
                  {n.type !== 'start' && (
                    <button
                      type="button"
                      className="mf-bp-node-del"
                      onClick={(e) => {
                        e.stopPropagation()
                        commit((d) => (d.nodes = d.nodes.filter((x) => x.id !== n.id)))
                      }}
                    >
                      <Trash2 size={10} />
                    </button>
                  )}
                </div>
                <div style={{ padding: '6px 8px', fontSize: 11, color: '#cbd5e1', cursor: 'move' }}>
                  {n.type === 'line' && (n.text || '…').slice(0, 65)}
                  {n.type === 'condition' && `${n.conditionKey} ${n.conditionOp} ${n.conditionValue}`}
                  {n.type === 'action' && (n.actionKind === 'setDbValue'
                    ? `${databases.find(asset => asset.id === n.actionDbId)?.name ?? 'Database'} / ${n.actionDbRow || 'row'} / ${n.actionDbPath || 'field'}`
                    : `${n.actionKind}: ${n.actionKey} = ${n.actionValue}`)}
                  {n.type === 'start' && 'Entry point'}
                  {n.type === 'end' && 'Close dialogue'}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right: Selected Node Inspector */}
        <aside className="mf-bp-sidebar" style={{ borderRight: 'none', borderLeft: '1px solid var(--border)' }}>
          {!cur ? (
            <div className="mf-bp-empty">Select a node</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <strong style={{ fontSize: 12 }}>Node: {cur.type.toUpperCase()}</strong>
              {cur.type === 'line' && (
                <>
                  <Field label="Speaker">
                    <input
                      value={cur.speaker || ''}
                      onChange={(e) => commit((d) => (d.nodes.find((x) => x.id === cur.id)!.speaker = e.target.value))}
                    />
                  </Field>
                  <Field label="Text">
                    <textarea
                      rows={4}
                      value={cur.text || ''}
                      onChange={(e) => commit((d) => (d.nodes.find((x) => x.id === cur.id)!.text = e.target.value))}
                      style={{ width: '100%', fontSize: 11.5 }}
                    />
                  </Field>
                  <div className="mf-bp-subhead">
                    <span>Player Choices ({(cur.choices || []).length})</span>
                    <button
                      type="button"
                      className="mf-bp-icon-btn"
                      title="Add choice"
                      onClick={() =>
                        commit((d) => {
                          const x = d.nodes.find((k) => k.id === cur.id)!
                          x.choices = [...(x.choices || []), { id: uid('ch'), text: 'Ответ…', nextNodeId: '' }]
                        })
                      }
                    >
                      <Plus size={12} />
                    </button>
                  </div>
                  {(cur.choices || []).map((ch, ci) => (
                    <div key={ch.id} className="mf-bp-var-edit" style={{ marginTop: 0 }}>
                      <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                        <input
                          value={ch.text}
                          onChange={(e) =>
                            commit((d) => (d.nodes.find((x) => x.id === cur.id)!.choices![ci].text = e.target.value))
                          }
                        />
                        <button
                          type="button"
                          className="mf-bp-icon-btn"
                          title="Delete choice"
                          onClick={() =>
                            commit((d) => {
                              const node = d.nodes.find((x) => x.id === cur.id)
                              if (node?.choices) node.choices = node.choices.filter((c) => c.id !== ch.id)
                            })
                          }
                        >
                          <Trash2 size={11} />
                        </button>
                      </div>
                      <select
                        value={ch.nextNodeId}
                        onChange={(e) =>
                          commit((d) => (d.nodes.find((x) => x.id === cur.id)!.choices![ci].nextNodeId = e.target.value))
                        }
                      >
                        <option value="">→ End</option>
                        {data.nodes
                          .filter((x) => x.id !== cur.id)
                          .map((x) => (
                            <option key={x.id} value={x.id}>
                              → {x.type}: {x.speaker || x.actionKey || x.conditionKey || x.id}
                            </option>
                          ))}
                      </select>
                    </div>
                  ))}
                </>
              )}
              {(cur.type === 'start' || cur.type === 'action' || (cur.type === 'line' && !(cur.choices || []).length)) && (
                <Field label="Next Node">
                  <select
                    value={cur.nextNodeId || ''}
                    onChange={(e) => commit((d) => (d.nodes.find((x) => x.id === cur.id)!.nextNodeId = e.target.value))}
                  >
                    <option value="">(None / End)</option>
                    {data.nodes
                      .filter((x) => x.id !== cur.id)
                      .map((x) => (
                        <option key={x.id} value={x.id}>
                          {x.type}: {x.speaker || x.actionKey || x.conditionKey || x.id}
                        </option>
                      ))}
                  </select>
                </Field>
              )}
              {cur.type === 'condition' && (
                <>
                  <Field label="Scope">
                    <select
                      value={cur.conditionScope || 'quest'}
                      onChange={(e) =>
                        commit((d) => (d.nodes.find((x) => x.id === cur.id)!.conditionScope = e.target.value as any))
                      }
                    >
                      <option value="quest">Quest Status</option>
                      <option value="worldState">WorldState</option>
                      <option value="vars">HUD Vars</option>
                    </select>
                  </Field>
                  <Field label="Key / Quest ID">
                    <input
                      value={cur.conditionKey || ''}
                      onChange={(e) => commit((d) => (d.nodes.find((x) => x.id === cur.id)!.conditionKey = e.target.value))}
                    />
                  </Field>
                  <Field label="Operator">
                    <select
                      value={cur.conditionOp || '=='}
                      onChange={(e) =>
                        commit((d) => (d.nodes.find((x) => x.id === cur.id)!.conditionOp = e.target.value as any))
                      }
                    >
                      {['==', '!=', '>', '>=', '<', '<='].map((op) => (
                        <option key={op} value={op}>{op}</option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Expected Value">
                    <input
                      value={String(cur.conditionValue ?? '')}
                      onChange={(e) => commit((d) => (d.nodes.find((x) => x.id === cur.id)!.conditionValue = e.target.value))}
                    />
                  </Field>
                  <Field label="If True">
                    <select
                      value={cur.trueNodeId || ''}
                      onChange={(e) => commit((d) => (d.nodes.find((x) => x.id === cur.id)!.trueNodeId = e.target.value))}
                    >
                      <option value="">(End)</option>
                      {data.nodes.filter((x) => x.id !== cur.id).map((x) => (
                        <option key={x.id} value={x.id}>{x.type}: {x.speaker || x.id}</option>
                      ))}
                    </select>
                  </Field>
                  <Field label="If False">
                    <select
                      value={cur.falseNodeId || ''}
                      onChange={(e) => commit((d) => (d.nodes.find((x) => x.id === cur.id)!.falseNodeId = e.target.value))}
                    >
                      <option value="">(End)</option>
                      {data.nodes.filter((x) => x.id !== cur.id).map((x) => (
                        <option key={x.id} value={x.id}>{x.type}: {x.speaker || x.id}</option>
                      ))}
                    </select>
                  </Field>
                </>
              )}
              {cur.type === 'action' && (
                <>
                  <Field label="Action">
                    <select
                      aria-label="Action"
                      value={cur.actionKind || 'setQuest'}
                      onChange={(e) =>
                        commit((d) => (d.nodes.find((x) => x.id === cur.id)!.actionKind = e.target.value as any))
                      }
                    >
                      <option value="setQuest">Set Quest Status</option>
                      <option value="setDbValue">Set DB Value</option>
                      <option value="setWorldState">Set WorldState</option>
                      <option value="setVar">Set HUD Var</option>
                      <option value="addVar">Add HUD Var</option>
                      <option value="emitEvent">Emit Event</option>
                    </select>
                  </Field>
                  {cur.actionKind === 'setDbValue' ? (
                    <DialogueDbFields node={cur} databases={databases} patch={values =>
                      commit(d => Object.assign(d.nodes.find(node => node.id === cur.id)!, values))
                    } />
                  ) : (
                    <>
                      <Field label="Key / Quest ID">
                        <input
                          value={cur.actionKey || ''}
                          onChange={(e) => commit((d) => (d.nodes.find((x) => x.id === cur.id)!.actionKey = e.target.value))}
                        />
                      </Field>
                      <Field label="Value">
                        <input
                          value={String(cur.actionValue ?? '')}
                          onChange={(e) => commit((d) => (d.nodes.find((x) => x.id === cur.id)!.actionValue = e.target.value))}
                        />
                      </Field>
                    </>
                  )}
                </>
              )}
            </div>
          )}
        </aside>
      </div>
    </div>
  )
}

function DialogueDbFields({ node, databases, patch }: {
  node: DialogueNode
  databases: Asset[]
  patch: (values: Partial<DialogueNode>) => void
}) {
  const asset = databases.find(asset => asset.id === node.actionDbId)
  const data = asset && parseDbAsset(asset.data)
  return <>
    <Field label="Database">
      <select aria-label="Database" value={node.actionDbId ?? ''} onChange={e => patch({ actionDbId: e.target.value, actionDbRow: '', actionDbPath: '' })}>
        <option value="">Choose a DB Asset</option>
        {databases.map(asset => <option value={asset.id} key={asset.id}>{asset.name}</option>)}
      </select>
    </Field>
    <Field label="Row ID">
      <input value={node.actionDbRow ?? ''} list="dialogue-db-rows" onChange={e => patch({ actionDbRow: e.target.value })} />
      <datalist id="dialogue-db-rows">{data && data.rows.map(row => <option key={row.id} value={row.id} />)}</datalist>
    </Field>
    <Field label="Field path">
      <input value={node.actionDbPath ?? ''} placeholder="stats.hp" list="dialogue-db-columns" aria-invalid={Boolean(node.actionDbPath && parseDbPathText(node.actionDbPath) === undefined)} onChange={e => patch({ actionDbPath: e.target.value })} />
      <datalist id="dialogue-db-columns">{data && data.columns.map(column => (
        <option key={column} value={column.includes('.') || column.trimStart().startsWith('[') ? JSON.stringify([column]) : column} />
      ))}</datalist>
    </Field>
    <Field label="Value (JSON)">
      <textarea rows={3} aria-label="Value (JSON)" aria-invalid={parseDbJson(node.actionDbJson ?? 'null') === undefined} value={node.actionDbJson ?? 'null'} onChange={e => patch({ actionDbJson: e.target.value })} />
    </Field>
  </>
}
