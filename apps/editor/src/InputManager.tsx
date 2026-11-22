import { useEffect, useState } from 'react'
import { Gamepad2, Keyboard, Smartphone, Plus, Trash2, RotateCcw, Check, X } from 'lucide-react'
import type { Project, TouchControlConfig } from '../../../packages/project-schema/src'
import { DEFAULT_TOUCH_CONTROLS } from '../../../packages/runtime/src/touch'
import { DEFAULT_INPUT_BINDINGS } from '../../../packages/runtime/src/input'

const GP_LABELS: Record<string, string> = {
  GP0: 'GP A / Cross',
  GP1: 'GP B / Circle',
  GP2: 'GP X / Square',
  GP3: 'GP Y / Triangle',
  GP4: 'GP LB / L1',
  GP5: 'GP RB / R1',
  GP6: 'GP LT / L2',
  GP7: 'GP RT / R2',
  GP8: 'GP Back / Select',
  GP9: 'GP Start',
  GP10: 'GP L3',
  GP11: 'GP R3',
  GP12: 'GP D-Up',
  GP13: 'GP D-Down',
  GP14: 'GP D-Left',
  GP15: 'GP D-Right',
  Mouse0: 'Mouse Left',
  Mouse1: 'Mouse Middle',
  Mouse2: 'Mouse Right',
}

function formatCode(code: string): string {
  if (GP_LABELS[code]) return GP_LABELS[code]
  return code.replace(/^Key/, '').replace(/^Digit/, '')
}

export function InputManager({
  p,
  onSave,
  onClose,
}: {
  p: Project
  onSave: (bindings: Record<string, string[]>, deadzone: number, touch: Record<string, any>) => void
  onClose: () => void
}) {
  const [tab, setTab] = useState<'bindings' | 'touch'>('bindings')
  const [bindings, setBindings] = useState<Record<string, string[]>>(() => ({
    ...structuredClone(DEFAULT_INPUT_BINDINGS),
    ...(p.settings.bindings ? structuredClone(p.settings.bindings) : {}),
  }))
  const [deadzone, setDeadzone] = useState<number>(() => Number((p.settings as any).gamepadDeadzone ?? 0.18))
  const [touch, setTouch] = useState<Record<string, any>>(() => {
    const t = p.settings.touch ? structuredClone(p.settings.touch) : {}
    if (!Array.isArray(t.controls) || !t.controls.length) {
      t.controls = structuredClone(DEFAULT_TOUCH_CONTROLS)
    }
    return t
  })
  const [listeningAction, setListeningAction] = useState<string | null>(null)
  const [newAction, setNewAction] = useState('')
  const [connectedPads, setConnectedPads] = useState<string[]>([])

  const controls: TouchControlConfig[] = Array.isArray(touch.controls) ? touch.controls : DEFAULT_TOUCH_CONTROLS
  const patchTouch = (k: string, v: unknown) => setTouch((prev) => ({ ...prev, [k]: v }))
  const setControls = (next: TouchControlConfig[]) => patchTouch('controls', next)

  // Poll connected gamepads & capture gamepad button when listening
  useEffect(() => {
    let raf = 0
    const poll = () => {
      raf = requestAnimationFrame(poll)
      const pads = typeof navigator !== 'undefined' && navigator.getGamepads ? navigator.getGamepads() : []
      const names: string[] = []
      for (const pad of pads) {
        if (!pad || !pad.connected) continue
        names.push(pad.id)
        if (listeningAction) {
          for (let i = 0; i < pad.buttons.length; i++) {
            const b = pad.buttons[i]
            if (b && (b.pressed || b.value > 0.6)) {
              const code = `GP${i}`
              setBindings((prev) => ({
                ...prev,
                [listeningAction]: [...new Set([...(prev[listeningAction] || []), code])],
              }))
              setListeningAction(null)
              return
            }
          }
        }
      }
      setConnectedPads((prev) => (prev.join('|') === names.join('|') ? prev : names))
    }
    raf = requestAnimationFrame(poll)
    return () => cancelAnimationFrame(raf)
  }, [listeningAction])

  // Capture keyboard or mouse when listening
  useEffect(() => {
    if (!listeningAction) return
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault()
      e.stopPropagation()
      if (e.code === 'Escape') {
        setListeningAction(null)
        return
      }
      setBindings((prev) => ({
        ...prev,
        [listeningAction]: [...new Set([...(prev[listeningAction] || []), e.code])],
      }))
      setListeningAction(null)
    }
    const onMouse = (e: MouseEvent) => {
      if ((e.target as HTMLElement)?.closest?.('button')) return
      e.preventDefault()
      const code = `Mouse${e.button}`
      setBindings((prev) => ({
        ...prev,
        [listeningAction]: [...new Set([...(prev[listeningAction] || []), code])],
      }))
      setListeningAction(null)
    }
    window.addEventListener('keydown', onKey, true)
    window.addEventListener('mousedown', onMouse, true)
    return () => {
      window.removeEventListener('keydown', onKey, true)
      window.removeEventListener('mousedown', onMouse, true)
    }
  }, [listeningAction])

  const removeBinding = (action: string, code: string) => {
    setBindings((prev) => ({
      ...prev,
      [action]: (prev[action] || []).filter((c) => c !== code),
    }))
  }

  const addAction = () => {
    const clean = newAction.trim()
    if (!clean || bindings[clean]) return
    setBindings((prev) => ({ ...prev, [clean]: [] }))
    setNewAction('')
    setListeningAction(clean)
  }

  const removeAction = (action: string) => {
    setBindings((prev) => {
      const next = { ...prev }
      delete next[action]
      return next
    })
  }

  return (
    <div
      className="mf-backdrop"
      style={{ zIndex: 1100 }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="mf-dialog mf-particle-dialog" role="dialog" aria-modal="true" aria-label="Input, Gamepad & Touch Manager">
        <header>
          <Gamepad2 size={17} />
          <h3>Input, Gamepad &amp; Touch Manager</h3>
          <button type="button" className="mf-close" onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </header>
        <div className="mf-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* Tab switcher */}
          <div style={{ display: 'flex', gap: 6, borderBottom: '1px solid #242c37', paddingBottom: 8 }}>
            <button
              type="button"
              className={tab === 'bindings' ? 'mf-primary' : 'mf-btn'}
              style={{ fontSize: 12, padding: '5px 12px' }}
              onClick={() => setTab('bindings')}
            >
              <Gamepad2 size={13} /> Keyboard, Mouse &amp; Gamepad
            </button>
            <button
              type="button"
              className={tab === 'touch' ? 'mf-primary' : 'mf-btn'}
              style={{ fontSize: 12, padding: '5px 12px' }}
              onClick={() => {
                setListeningAction(null)
                setTab('touch')
              }}
            >
              <Smartphone size={13} /> Touch &amp; Virtual Controls ({controls.length})
            </button>
          </div>

          {tab === 'bindings' ? (
            <>
              {/* Gamepad Status + Deadzone */}
              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 10,
                  padding: '8px 12px',
                  borderRadius: 8,
                  background: '#141a22',
                  border: '1px solid #2b323b',
                  fontSize: 12,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Gamepad2 size={15} color={connectedPads.length ? '#4ade80' : '#64748b'} />
                  {connectedPads.length ? (
                    <span style={{ color: '#86efac' }}>
                      Connected: <strong>{connectedPads[0].slice(0, 48)}</strong>
                      {connectedPads.length > 1 ? ` (+${connectedPads.length - 1})` : ''}
                    </span>
                  ) : (
                    <span style={{ color: '#94a3b8' }}>No gamepad detected — connect a controller and press any button to wake Gamepad API.</span>
                  )}
                </div>
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, color: '#cbd5e1' }}>
                  <span>Stick Deadzone ({deadzone.toFixed(2)})</span>
                  <input
                    type="range"
                    min={0.05}
                    max={0.5}
                    step={0.01}
                    value={deadzone}
                    onChange={(e) => setDeadzone(Number(e.target.value))}
                    style={{ width: 95 }}
                  />
                </label>
              </div>

              {listeningAction && (
                <div
                  style={{
                    padding: '8px 12px',
                    borderRadius: 8,
                    background: 'rgba(245, 158, 11, 0.16)',
                    border: '1px solid rgba(245, 158, 11, 0.5)',
                    color: '#fde68a',
                    fontSize: 12,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <span>
                    Listening for <strong>{listeningAction}</strong> — press any Keyboard key, Mouse button, or Gamepad button (Esc to cancel)…
                  </span>
                  <button type="button" className="mf-btn" onClick={() => setListeningAction(null)}>
                    Cancel
                  </button>
                </div>
              )}

              {/* Add new action */}
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input
                  value={newAction}
                  onChange={(e) => setNewAction(e.target.value)}
                  placeholder="New action name (e.g. Dash, Reload, Inventory)…"
                  style={{ flex: 1 }}
                  onKeyDown={(e) => e.key === 'Enter' && addAction()}
                />
                <button type="button" className="mf-btn" onClick={addAction}>
                  <Plus size={13} /> Add Action
                </button>
                <button
                  type="button"
                  className="mf-btn"
                  onClick={() => {
                    setBindings(structuredClone(DEFAULT_INPUT_BINDINGS))
                    setDeadzone(0.18)
                  }}
                >
                  <RotateCcw size={13} /> Reset Defaults
                </button>
              </div>

              {/* Action bindings table */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 360, overflowY: 'auto' }}>
                {Object.entries(bindings).map(([action, codes]) => (
                  <div
                    key={action}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '140px minmax(0, 1fr) auto',
                      gap: 10,
                      alignItems: 'center',
                      padding: '7px 10px',
                      borderRadius: 7,
                      background: '#11161d',
                      border: '1px solid ' + (listeningAction === action ? '#f59e0b' : '#242c37'),
                    }}
                  >
                    <strong style={{ fontSize: 12.5, color: '#e6edf3' }}>{action}</strong>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                      {codes.length === 0 ? (
                        <span style={{ fontSize: 11, color: '#64748b' }}>Unbound</span>
                      ) : (
                        codes.map((code) => (
                          <span
                            key={code}
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 5,
                              padding: '2px 7px',
                              borderRadius: 5,
                              fontSize: 11,
                              fontFamily: 'ui-monospace, monospace',
                              background: code.startsWith('GP') ? 'rgba(74, 222, 128, 0.14)' : 'rgba(96, 165, 250, 0.14)',
                              border: '1px solid ' + (code.startsWith('GP') ? 'rgba(74, 222, 128, 0.35)' : 'rgba(96, 165, 250, 0.35)'),
                              color: code.startsWith('GP') ? '#86efac' : '#bfdbfe',
                            }}
                          >
                            {formatCode(code)}
                            <button
                              type="button"
                              onClick={() => removeBinding(action, code)}
                              style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', padding: 0, lineHeight: 1 }}
                              title="Remove binding"
                            >
                              ×
                            </button>
                          </span>
                        ))
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: 5 }}>
                      <button
                        type="button"
                        className={listeningAction === action ? 'mf-primary' : 'mf-btn'}
                        style={{ fontSize: 11, padding: '3px 8px' }}
                        onClick={() => setListeningAction(listeningAction === action ? null : action)}
                      >
                        <Keyboard size={12} /> + Bind
                      </button>
                      {!(action in DEFAULT_INPUT_BINDINGS) && (
                        <button type="button" className="mf-btn" style={{ padding: '3px 6px' }} onClick={() => removeAction(action)}>
                          <Trash2 size={12} />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <>
              {/* Touch & Virtual Controls */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12 }}>
                  <span style={{ color: '#94a3b8' }}>Virtual controls</span>
                  <select value={touch.mode || 'auto'} onChange={(e) => patchTouch('mode', e.target.value)}>
                    <option value="auto">Auto (touch devices)</option>
                    <option value="always">Always visible (PC debug)</option>
                    <option value="never">Disabled</option>
                  </select>
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12 }}>
                  <span style={{ color: '#94a3b8' }}>Look sensitivity</span>
                  <input
                    type="number"
                    min={0.0005}
                    max={0.03}
                    step={0.0005}
                    value={Number(touch.lookSensitivity ?? 0.0045)}
                    onChange={(e) => patchTouch('lookSensitivity', Number(e.target.value) || 0.0045)}
                  />
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12 }}>
                  <span style={{ color: '#94a3b8' }}>Overlay opacity</span>
                  <input
                    type="number"
                    min={0.1}
                    max={1}
                    step={0.05}
                    value={Number(touch.opacity ?? 0.65)}
                    onChange={(e) => patchTouch('opacity', Math.max(0.1, Math.min(1, Number(e.target.value) || 0.65)))}
                  />
                </label>
              </div>
              <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', fontSize: 12 }}>
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <input
                    type="checkbox"
                    checked={Boolean(touch.emulateTouchFromMouse)}
                    onChange={(e) => patchTouch('emulateTouchFromMouse', e.target.checked)}
                  />
                  Emulate Touch from Mouse
                </label>
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <input
                    type="checkbox"
                    checked={touch.emulateMouseFromTouch !== false}
                    onChange={(e) => patchTouch('emulateMouseFromTouch', e.target.checked)}
                  />
                  Emulate Mouse from Touch
                </label>
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="mf-btn"
                  onClick={() =>
                    setControls([
                      ...controls,
                      {
                        id: 'joy-' + (controls.length + 1),
                        kind: 'joystick',
                        label: 'STICK',
                        action: 'move',
                        x: 18,
                        y: 76,
                        size: 108,
                        deadzone: 0.12,
                        color: '#ffffff',
                      },
                    ])
                  }
                >
                  <Plus size={12} /> Add Joystick
                </button>
                <button
                  type="button"
                  className="mf-btn"
                  onClick={() =>
                    setControls([
                      ...controls,
                      {
                        id: 'btn-' + (controls.length + 1),
                        kind: 'button',
                        label: 'ACT',
                        action: 'Interact',
                        x: 82,
                        y: 72,
                        size: 56,
                        color: '#ffb84d',
                      },
                    ])
                  }
                >
                  <Plus size={12} /> Add Button
                </button>
                <button
                  type="button"
                  className="mf-btn"
                  onClick={() => setControls(structuredClone(DEFAULT_TOUCH_CONTROLS))}
                >
                  <RotateCcw size={12} /> Reset defaults
                </button>
              </div>
              <div className="mf-touch-list" style={{ maxHeight: 260, overflowY: 'auto' }}>
                {controls.map((ctrl, idx) => (
                  <div className="mf-touch-row" key={ctrl.id + '-' + idx}>
                    <span className="mf-comp-cat">{ctrl.kind}</span>
                    <input
                      aria-label="Control label"
                      value={ctrl.label || ''}
                      placeholder="Label"
                      onChange={(e) => {
                        const next = structuredClone(controls)
                        next[idx].label = e.target.value
                        setControls(next)
                      }}
                    />
                    <input
                      aria-label="Control action"
                      value={ctrl.action || ''}
                      placeholder="Action (Jump, E...)"
                      onChange={(e) => {
                        const next = structuredClone(controls)
                        next[idx].action = e.target.value
                        setControls(next)
                      }}
                    />
                    <input
                      type="number"
                      aria-label="X%"
                      min={0}
                      max={100}
                      step={2}
                      value={ctrl.x}
                      onChange={(e) => {
                        const next = structuredClone(controls)
                        next[idx].x = Number(e.target.value) || 0
                        setControls(next)
                      }}
                    />
                    <input
                      type="number"
                      aria-label="Y%"
                      min={0}
                      max={100}
                      step={2}
                      value={ctrl.y}
                      onChange={(e) => {
                        const next = structuredClone(controls)
                        next[idx].y = Number(e.target.value) || 0
                        setControls(next)
                      }}
                    />
                    <button
                      type="button"
                      title="Remove control"
                      onClick={() => setControls(controls.filter((_, j) => j !== idx))}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
        <footer>
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="mf-primary"
            onClick={() => {
              onSave(bindings, deadzone, touch)
              onClose()
            }}
          >
            <Check size={14} /> Save Input Settings
          </button>
        </footer>
      </div>
    </div>
  )
}
