import { containerStyle, gridItemStyle } from '../../../packages/project-schema/src/hud-layout'
import { makeHtmlAsset } from '../../../packages/project-schema/src'
import { buildHtmlWidgetSrcdoc } from '../../../packages/runtime/src/overlay'
import { useRef, useState, type PointerEvent, type CSSProperties } from 'react'
import {
  AppWindow,
  Copy,
  Gamepad2,
  Layers,
  LayoutGrid,
  Monitor,
  PanelTop,
  Plus,
  Smartphone,
  Trash2,
} from 'lucide-react'
import {
  anchorStyle,
  anchors,
  buttonActions,
  inputActions,
  DEFAULT_DIALOGUE_SCREEN_ID,
  makeDialogueControls,
  makeDialogueScreen,
  makeScreen,
  makeScreenControls,
  removeScreen,
  uid,
  type Anchor,
  type ButtonAction,
  type Project,
  type ScreenPhase,
  type UIElement,
  type UIScreen,
} from '../../../packages/project-schema/src'
import { AssetSelect } from './Inspector'
import { Color, Field, Numeric } from './Fields'
import './hud.css'

type Edit = (change: (draft: Project) => void) => void
const phases: Exclude<ScreenPhase, 'window'>[] = ['playing', 'menu', 'paused', 'results']
const names = { playing: 'Game HUD', menu: 'Main menu', paused: 'Pause', results: 'Results' }
const actions: Record<ButtonAction, string> = {
  event: 'Emit event',
  open: 'Open window',
  back: 'Go back',
  close: 'Close windows',
  input: 'Input action',
  play: 'Play / resume',
  pause: 'Pause game',
  retry: 'Restart game',
  reward: 'Rewarded ad',
  language: 'Switch language',
}
const types = ['text', 'button', 'panel', 'blur', 'image', 'html', 'progress', 'counter', 'container']
const labels: Record<string, string> = {
  text: 'Text',
  button: 'Button',
  panel: 'Panel',
  blur: 'Background blur',
  container: 'Container',
  image: 'Image',
  html: 'HTML Frame',
  progress: 'Progress bar',
  counter: 'Counter',
}
const translation = (p: Project, key: string) =>
  p.locales[p.settings.language]?.[key] || p.locales.en?.[key] || key
const round = (n: number) => Math.round(n * 100) / 100

function starter(screen: UIScreen): UIElement[] {
  if (screen.id === DEFAULT_DIALOGUE_SCREEN_ID) return makeDialogueControls(screen.id)
  return makeScreenControls(screen).map((el, i) => ({ ...el, id: screen.id + '-control-' + i }))
}
function createElement(screen: string, type: string, index: number): UIElement {
  const el: UIElement = {
    id: uid('ui'),
    screen,
    type,
    text: type === 'button' ? 'Continue' : labels[type],
    x: 6,
    y: 12 + (index % 6) * 8,
    anchor: 'top-left',
    color: '#ffffff',
    fontSize: 18,
    visible: true,
  }
  if (type === 'button') Object.assign(el, { action: 'event', event: 'button.clicked' })
  if (type === 'counter') el.variable = 'score'
  if (type === 'progress') Object.assign(el, { variable: 'health', max: 100, width: 26 })
  if (type === 'panel') Object.assign(el, { width: 32, height: 25, background: '#29383c', text: '' })
  if (type === 'blur') Object.assign(el, { width: 36, height: 28, background: 'rgba(18, 26, 32, 0.35)', backdropBlur: 12, borderRadius: 12, borderColor: 'rgba(255,255,255,0.18)', text: '' })
  if (type === 'container')
    Object.assign(el, {
      width: 65,
      height: 50,
      text: '',
      layout: 'grid',
      scroll: true,
      background: '#29383c',
    })
  if (type === 'image') Object.assign(el, { width: 16, text: '' })
  if (type === 'html') Object.assign(el, { width: 34, height: 40, text: '', interactive: true, asset: '' })
  return el
}
function ensureScreen(p: Project, s: UIScreen) {
  p.screens ??= []
  if (p.screens.some((item) => item.id === s.id)) return
  p.screens.push({ ...s })
  p.ui.push(...starter(s))
  if (s.phase === 'playing') for (const el of p.ui) if (!el.screen) el.screen = s.id
}

function ElementProperties({
  p,
  el,
  patch,
  windows,
  items,
  edit,
  onEditAsset,
}: {
  p: Project
  el: UIElement
  patch: (changes: Partial<UIElement>) => void
  items: UIElement[]
  windows: UIScreen[]
  edit?: (fn: (p: Project) => void) => void
  onEditAsset?: (id: string) => void
}) {
  function number(key: string, label: string, fallback: number, min?: number, max?: number) {
    return (
      <Field label={label}>
        <Numeric
          label={label}
          value={el[key] ?? fallback}
          min={min}
          max={max}
          change={(v) => patch({ [key]: v })}
        />
      </Field>
    )
  }
  function actionChange(value: ButtonAction) {
    patch({
      action: value,
      target: value === 'open' ? windows[0]?.id : value === 'input' ? 'Interact' : undefined,
    })
  }
  return (
    <div className="hud-props">
      <h4>Content</h4>
      <Field label="Element ID">
        <input
          key={el.id}
          defaultValue={el.id}
          onBlur={(e) => {
            const nextId = e.target.value.trim()
            if (nextId && nextId !== el.id && !p.ui.some((u) => u.id === nextId)) {
              patch({ id: nextId })
            } else {
              e.target.value = el.id
            }
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur()
          }}
        />
      </Field>
      <Field label="Text / locale key">
        <input value={el.text} onChange={(e) => patch({ text: e.target.value })} />
      </Field>
      {el.type === 'html' && (
        <>
          <Field label="HTML asset">
            <select
              aria-label="HTML asset"
              value={el.asset || ''}
              onChange={(e) => patch({ asset: e.target.value })}
            >
              <option value="">Select HTML widget…</option>
              {p.assets
                .filter((a) => a.type === 'html' || a.type === 'text')
                .map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
            </select>
          </Field>
          <Field label="Interactive">
            <input
              type="checkbox"
              checked={el.interactive !== false}
              onChange={(e) => patch({ interactive: e.target.checked })}
            />
          </Field>
          <div className="mf-row" style={{ gap: 6, marginBottom: 6 }}>
            {el.asset ? (
              <button
                type="button"
                className="mf-btn"
                onClick={() => onEditAsset?.(el.asset)}
              >
                Open HTML Editor
              </button>
            ) : (
              <button
                type="button"
                className="mf-btn"
                onClick={() => {
                  const created = makeHtmlAsset('HUD Widget.html', 'phone')
                  edit?.((proj) => {
                    proj.assets.push(created)
                    const item = proj.ui.find((u) => u.id === el.id)
                    if (item) item.asset = created.id
                  })
                  onEditAsset?.(created.id)
                }}
              >
                + Create & Edit HTML Widget
              </button>
            )}
          </div>
        </>
      )}
      {el.type === 'image' && (
        <Field label="Image">
          <AssetSelect
            assets={p.assets}
            type="texture"
            value={el.asset || ''}
            label="Image"
            change={(asset) => patch({ asset })}
          />
        </Field>
      )}
      {['progress', 'counter'].includes(el.type) && (
        <Field label="Variable">
          <input value={el.variable || ''} onChange={(e) => patch({ variable: e.target.value })} />
        </Field>
      )}
      {el.type === 'progress' && number('max', 'Maximum', 100, 1)}
      {el.type === 'button' && (
        <>
          <Field label="Button action">
            <select
              aria-label="Button action"
              value={el.action || 'event'}
              onChange={(e) => actionChange(e.target.value as ButtonAction)}
            >
              {buttonActions.map((k) => (
                <option key={k} value={k} disabled={k === 'open' && !windows.length}>
                  {actions[k]}
                </option>
              ))}
            </select>
          </Field>
          {(!el.action || el.action === 'event') && (
            <Field label="Click event">
              <input value={el.event || ''} onChange={(e) => patch({ event: e.target.value })} />
            </Field>
          )}
          {el.action === 'open' && (
            <Field label="Target window">
              <select
                aria-label="Target window"
                value={el.target || ''}
                onChange={(e) => patch({ target: e.target.value })}
              >
                {windows.map((s) => (
                  <option value={s.id} key={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </Field>
          )}
          {el.action === 'input' && (
            <Field label="Input action">
              <select
                aria-label="Input action"
                value={el.target || 'Interact'}
                onChange={(e) => patch({ target: e.target.value })}
              >
                {inputActions.map((k) => (
                  <option key={k}>{k}</option>
                ))}
              </select>
            </Field>
          )}
        </>
      )}
      <h4>Layout</h4>
      {el.type === 'container' ? (
        <>
          <Field label="Arrangement">
            <select value={el.layout ?? 'grid'} onChange={(e) => patch({ layout: e.target.value })}>
              <option value="grid">Grid</option>
              <option value="list">List</option>
            </select>
          </Field>
          {el.layout !== 'list' && number('cellWidth', 'Minimum cell width', 96, 12, 1000)}
          {number('rowHeight', 'Minimum row height', 40, 8, 500)}
          {number('gap', 'Spacing', 6, 0, 64)}
          <Field label="Scroll">
            <input
              type="checkbox"
              checked={el.scroll !== false}
              onChange={(e) => patch({ scroll: e.target.checked })}
            />
          </Field>
          <Field label="Items variable">
            <input
              value={el.itemsVariable ?? ''}
              onChange={(e) => patch({ itemsVariable: e.target.value })}
            />
          </Field>
        </>
      ) : (
        <Field label="Parent container">
          <select
            value={el.parentId ?? ''}
            onChange={(e) => patch({ parentId: e.target.value || undefined })}
          >
            <option value="">Screen</option>
            {items
              .filter((i) => i.type === 'container')
              .map((i) => (
                <option key={i.id} value={i.id}>
                  {i.text || i.id}
                </option>
              ))}
          </select>
        </Field>
      )}
      {!el.parentId && (
        <>
          <Field label="Anchor">
            <select
              aria-label="Anchor"
              value={el.anchor || 'top-left'}
              onChange={(e) => patch({ anchor: e.target.value as Anchor, x: 0, y: 0 })}
            >
              {anchors.map((k) => (
                <option key={k} value={k}>
                  {k.replace('-', ' ')}
                </option>
              ))}
            </select>
          </Field>
          <div className="hud-double">
            {number('x', 'X (%)', 0, -100, 100)}
            {number('y', 'Y (%)', 0, -100, 100)}
          </div>
          <div className="hud-double">
            {(['width', 'height'] as const).map((k) => (
              <Field label={k === 'width' ? 'Width (%)' : 'Height (%)'} key={k}>
                <input
                  aria-label={k + ' percent'}
                  type="number"
                  step=".5"
                  min=".1"
                  max="100"
                  placeholder="Auto"
                  value={el[k] ?? ''}
                  onChange={(e) =>
                    patch({
                      [k]:
                        e.target.value === ''
                          ? undefined
                          : Math.max(0.1, Math.min(100, Number(e.target.value))),
                    })
                  }
                />
              </Field>
            ))}
          </div>
        </>
      )}
      {number('zIndex', 'Layer', 0, 0, 1000)}
      <Field label="Visible">
        <input
          type="checkbox"
          checked={el.visible !== false}
          onChange={(e) => patch({ visible: e.target.checked })}
        />
      </Field>
      <h4>Appearance</h4>
      <Field label="Text color">
        <Color label="Text color" value={el.color || '#ffffff'} change={(color) => patch({ color })} />
      </Field>
      {number('fontSize', 'Font size', 16, 1, 250)}
      <Field label="Alignment">
        <select
          aria-label="Alignment"
          value={el.align || 'left'}
          onChange={(e) => patch({ align: e.target.value })}
        >
          {['left', 'center', 'right'].map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
      </Field>
      {number('backdropBlur', 'Background blur (px)', el.type === 'blur' ? 12 : 0, 0, 64)}
      {number('borderRadius', 'Border radius (px)', el.type === 'blur' ? 12 : 0, 0, 128)}
      {(el.type === 'panel' || el.type === 'blur' || el.type === 'button' || el.type === 'container') && (
        <Field label="Fill">
          <Color
            label="Fill"
            value={el.background || (el.type === 'button' ? '#375546' : '#35383c')}
            change={(background) => patch({ background })}
          />
        </Field>
      )}
    </div>
  )
}

function Canvas({
  project,
  screen,
  items,
  selected,
  select,
  move,
}: {
  project: Project
  screen: UIScreen
  items: UIElement[]
  selected: string
  select: (id: string) => void
  move: (id: string, x: number, y: number) => void
}) {
  const stage = useRef<HTMLDivElement>(null)
  const drag = useRef<{
    id: string
    cx: number
    cy: number
    x: number
    y: number
    dx: number
    dy: number
  } | null>(null)
  const [offset, offsetTo] = useState<{ id: string; x: number; y: number } | null>(null)
  const [portrait, orient] = useState(false)
  function start(e: PointerEvent<HTMLElement>, el: UIElement) {
    if (e.button !== 0) return
    const rect = stage.current?.getBoundingClientRect()
    if (!rect?.width || !rect.height) return
    select(el.id)
    if (el.parentId) return
    e.currentTarget.setPointerCapture(e.pointerId)
    drag.current = {
      id: el.id,
      cx: e.clientX,
      cy: e.clientY,
      x: el.x,
      y: el.y,
      dx: (100 / rect.width) * (el.anchor?.endsWith('right') ? -1 : 1),
      dy: (100 / rect.height) * (el.anchor?.startsWith('bottom') ? -1 : 1),
    }
  }
  function position(e: PointerEvent) {
    const d = drag.current
    if (!d) return null
    return {
      id: d.id,
      x: round(Math.min(100, Math.max(-100, d.x + (e.clientX - d.cx) * d.dx))),
      y: round(Math.min(100, Math.max(-100, d.y + (e.clientY - d.cy) * d.dy))),
    }
  }
  function finish(e: PointerEvent) {
    const pos = position(e),
      d = drag.current
    if (pos && d && (pos.x !== d.x || pos.y !== d.y)) move(pos.id, pos.x, pos.y)
    drag.current = null
    offsetTo(null)
  }
  function renderItem(el: UIElement): React.ReactNode {
    const pos = offset?.id === el.id ? offset : el
    const style: CSSProperties = {
      ...anchorStyle(el.anchor, pos.x, pos.y),
      color: el.color || 'white',
      backgroundColor: el.background || (el.type === 'blur' ? 'rgba(18, 26, 32, 0.35)' : el.type === 'html' ? 'transparent' : undefined),
      backdropFilter: Number(el.backdropBlur ?? (el.type === 'blur' ? 12 : 0)) > 0 ? `blur(${Number(el.backdropBlur ?? 12)}px)` : undefined,
      WebkitBackdropFilter: Number(el.backdropBlur ?? (el.type === 'blur' ? 12 : 0)) > 0 ? `blur(${Number(el.backdropBlur ?? 12)}px)` : undefined,
      borderRadius: Number.isFinite(el.borderRadius) ? el.borderRadius + 'px' : (el.type === 'blur' ? '12px' : undefined),
      border: el.borderColor ? `1px solid ${el.borderColor}` : undefined,
      width: el.width ? el.width + '%' : undefined,
      height: el.height ? el.height + '%' : undefined,
      fontSize: 'calc(' + Math.max(1, el.fontSize || 16) + ' * var(--hud-pixel))',
      textAlign: el.align || 'left',
      opacity: el.visible === false ? 0.35 : 1,
      zIndex: el.zIndex || 0,
    }
    const asset = el.type === 'image' && project.assets.find((a) => a.id === el.asset)
    if (el.type === 'container')
      return (
        <div
          key={el.id}
          className={'hud-grid-box' + (selected === el.id ? ' selected' : '')}
          style={{ ...style, ...containerStyle(el, 'var(--hud-pixel)') }}
          onClick={(e) => {
            if (e.target === e.currentTarget) select(el.id)
          }}
          onPointerDown={(e) => {
            if (e.target === e.currentTarget) start(e, el)
          }}
          onPointerMove={(e) => {
            if (drag.current) offsetTo(position(e))
          }}
          onPointerUp={finish}
        >
          {items.filter((child) => child.parentId === el.id).map(renderItem)}
          {Array.isArray(project.settings.variables?.[el.itemsVariable]) &&
            (project.settings.variables[el.itemsVariable] as unknown[]).map((v, i) => (
              <span key={i}>{translation(project, String(v ?? ''))}</span>
            ))}
        </div>
      )
    return (
      <button
        key={el.id}
        title={el.text || el.type}
        aria-label={'Select ' + (el.text || el.type)}
        className={'hud-item ' + el.type + (selected === el.id ? ' selected' : '')}
        style={el.parentId ? { ...style, ...gridItemStyle } : style}
        onClick={() => select(el.id)}
        onPointerDown={(e) => start(e, el)}
        onPointerMove={(e) => {
          if (drag.current) offsetTo(position(e))
        }}
        onPointerUp={finish}
        onPointerCancel={() => {
          drag.current = null
          offsetTo(null)
        }}
      >
        {asset ? (
          <img src={asset.data} alt="" />
        ) : el.type === 'html' ? (
          (() => {
            const htmlAsset = project.assets.find((a) => a.id === el.asset && (a.type === 'html' || a.type === 'text'))
            return htmlAsset ? (
              <iframe
                title={htmlAsset.name}
                sandbox="allow-scripts"
                srcDoc={buildHtmlWidgetSrcdoc(
                  'hud-prev-' + el.id,
                  htmlAsset.data || '',
                  String(htmlAsset.properties?.css || ''),
                  String(htmlAsset.properties?.js || ''),
                )}
                style={{ width: '100%', height: '100%', border: 0, pointerEvents: 'none', background: 'transparent', colorScheme: 'dark' }}
              />
            ) : (
              <span style={{ fontSize: 11, opacity: 0.75 }}>HTML Frame (выбери ассет)</span>
            )
          })()
        ) : el.type === 'progress' ? (
          <progress value={50} max={100} />
        ) : (
          translation(project, el.text || labels[el.type])
        )}
        {el.type === 'counter' ? ' 0' : ''}
      </button>
    )
  }
  return (
    <div className="hud-design">
      <div className="hud-design-head">
        <strong>
          <LayoutGrid size={14} /> {screen.name}
        </strong>
        <div className="hud-devices">
          <button aria-label="Landscape preview" aria-pressed={!portrait} onClick={() => orient(false)}>
            <Monitor size={15} />
          </button>
          <button aria-label="Portrait preview" aria-pressed={portrait} onClick={() => orient(true)}>
            <Smartphone size={14} />
          </button>
        </div>
      </div>
      <div className="hud-stage-wrap">
        <div
          className={'hud-stage ' + (portrait ? 'portrait' : 'landscape')}
          style={{ backgroundColor: screen.background || undefined }}
          ref={stage}
        >
          {screen.safeArea !== false && <div className="hud-safe-area" aria-hidden />}
          {items.filter((el) => !el.parentId).map(renderItem)}
        </div>
      </div>
    </div>
  )
}

export default function InterfaceForm({
  p,
  edit,
  focusUiId,
  onEditAsset,
}: {
  p: Project
  edit: Edit
  focusUiId?: string
  onEditAsset?: (id: string) => void
}) {
  const [defaults] = useState(() => phases.map((phase) => makeScreen(phase, names[phase])))
  const [defaultDialogue] = useState(() => makeDialogueScreen())
  const screens = [
    ...defaults.map((d) => p.screens?.find((s) => s.phase === d.phase) || d),
    p.screens?.find((s) => s.id === DEFAULT_DIALOGUE_SCREEN_ID) || defaultDialogue,
    ...(p.screens || []).filter((s) => s.phase === 'window' && s.id !== DEFAULT_DIALOGUE_SCREEN_ID),
  ]
  const focused = p.ui.find((item) => item.id === focusUiId)
  const [screenId, setScreenId] = useState(focused?.screen || screens[0].id)
  const screen = screens.find((s) => s.id === screenId) || screens[0]
  const persisted = !!p.screens?.some((s) => s.id === screen.id)
  const items = [
    ...(persisted ? [] : starter(screen)),
    ...p.ui.filter((e) => e.screen === screen.id || (!e.screen && screen.phase === 'playing')),
  ]
  const [selected, select] = useState(focused?.id || ''),
    [kind, setKind] = useState('text')
  const [creating, showCreate] = useState(false),
    [newName, setName] = useState('Inventory'),
    [shortcut, addShortcut] = useState(true)
  const [deletePending, requestDelete] = useState(false)
  const element = items.find((x) => x.id === selected)
  function choose(id: string) {
    setScreenId(id)
    select('')
    requestDelete(false)
    showCreate(false)
  }
  function patchElement(id: string, changes: Partial<UIElement>) {
    edit((n) => {
      ensureScreen(n, screen)
      const el = n.ui.find((item) => item.id === id)
      if (el) {
        const prevId = el.id
        Object.assign(el, changes)
        if (changes.id && changes.id !== prevId) {
          for (const child of n.ui) if (child.parentId === prevId) child.parentId = changes.id
        }
      }
    })
    if (changes.id && changes.id !== id) select(changes.id)
  }
  function patchScreen(changes: Partial<UIScreen>) {
    edit((n) => {
      ensureScreen(n, screen)
      Object.assign(n.screens!.find((s) => s.id === screen.id)!, changes)
    })
  }
  function add() {
    const item = createElement(screen.id, kind, items.length)
    if (element?.type === 'container' && kind !== 'container') item.parentId = element.id
    edit((n) => {
      ensureScreen(n, screen)
      n.ui.push(item)
    })
    select(item.id)
  }
  function create() {
    if (!newName.trim()) return
    const win = makeScreen('window', newName.trim())
    edit((n) => {
      ensureScreen(n, win)
      if (shortcut) {
        const hud = screens[0]
        ensureScreen(n, hud)
        const num = n.ui.filter((el) => el.screen === hud.id && el.action === 'open').length
        n.ui.push({
          ...createElement(hud.id, 'button', num),
          text: win.name,
          anchor: 'top-left',
          x: 3,
          y: 8 + num * 8,
          action: 'open',
          target: win.id,
        })
      }
    })
    choose(win.id)
  }
  function remove() {
    edit((n) => removeScreen(n, screen.id))
    choose(defaults[0].id)
  }
  function duplicate() {
    if (!element) return
    const el = { ...structuredClone(element), id: uid('ui'), x: element.x + 2, y: element.y + 2 }
    edit((n) => {
      ensureScreen(n, screen)
      n.ui.push(el)
      if (el.type === 'container') {
        const children = n.ui.filter((child) => child.parentId === element.id)
        n.ui.push(...children.map((child) => ({ ...structuredClone(child), id: uid('ui'), parentId: el.id })))
      }
    })
    select(el.id)
  }
  return (
    <div className="hud-workbench">
      <nav className="hud-sidebar" aria-label="Interface screens">
        <div className="hud-rail-head">
          <h4>Screens</h4>
          <button
            title="New screen"
            aria-label="New screen"
            onClick={() => {
              setName(screens.some((s) => s.name === 'Inventory') ? 'Shop' : 'Inventory')
              showCreate(!creating)
            }}
          >
            <Plus size={14} />
          </button>
        </div>
        <div className="hud-screen-list">
          {screens.map((s) => (
            <button
              key={s.id}
              aria-current={s.id === screen.id ? 'page' : undefined}
              onClick={() => choose(s.id)}
            >
              {s.phase === 'window' ? (
                <AppWindow size={14} />
              ) : s.phase === 'playing' ? (
                <Gamepad2 size={14} />
              ) : (
                <PanelTop size={14} />
              )}
              <span>{s.name}</span>
            </button>
          ))}
        </div>
        {creating && (
          <div className="hud-create">
            <Field label="New screen name">
              <input
                autoFocus
                value={newName}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') create()
                }}
              />
            </Field>
            <div className="hud-suggestions">
              {['Inventory', 'Shop'].map((name) => (
                <button onClick={() => setName(name)} key={name}>
                  {name}
                </button>
              ))}
            </div>
            <label>
              <input type="checkbox" checked={shortcut} onChange={(e) => addShortcut(e.target.checked)} /> Add
              HUD button
            </label>
            <button className="mf-primary" onClick={create} disabled={!newName.trim()}>
              Create screen
            </button>
          </div>
        )}
        <div className="hud-rail-head hud-layer-heading">
          <h4>Elements</h4>
          <Layers size={13} />
        </div>
        <div className="hud-elements">
          {items.map((el) => (
            <button className={selected === el.id ? 'active' : ''} key={el.id} onClick={() => select(el.id)}>
              <span>{el.text || labels[el.type]}</span>
              <small>{labels[el.type]}</small>
            </button>
          ))}
        </div>
      </nav>
      <div className="hud-center">
        <Canvas
          project={p}
          screen={screen}
          items={items}
          selected={selected}
          select={select}
          move={(id, x, y) => patchElement(id, { x, y })}
        />
        <div className="hud-create-element">
          <select aria-label="UI element type" value={kind} onChange={(e) => setKind(e.target.value)}>
            {types.map((t) => (
              <option key={t} value={t}>
                {labels[t]}
              </option>
            ))}
          </select>
          <button onClick={add}>
            <Plus size={13} /> Add element
          </button>
        </div>
      </div>
      <aside className="hud-properties">
        <div className="hud-rail-head">
          <h4>{element ? 'Element properties' : 'Screen properties'}</h4>
          {element && (
            <button aria-label="Show screen properties" title="Screen properties" onClick={() => select('')}>
              <PanelTop size={14} />
            </button>
          )}
        </div>
        {element ? (
          <>
            <div className="hud-active-element">
              <strong>{labels[element.type] || element.type}</strong>
              <button title="Duplicate element" aria-label="Duplicate element" onClick={duplicate}>
                <Copy size={13} />
              </button>
              <button
                title="Delete element"
                aria-label="Delete element"
                onClick={() => {
                  edit((n) => {
                    ensureScreen(n, screen)
                    n.ui = n.ui.filter((el) => el.id !== element.id)
                    for (const child of n.ui) if (child.parentId === element.id) delete child.parentId
                  })
                  select('')
                }}
              >
                <Trash2 size={13} />
              </button>
            </div>
            <ElementProperties
              p={p}
              items={items}
              el={element}
              windows={screens.filter((s) => s.phase === 'window')}
              patch={(changes) => patchElement(element.id, changes)}
              edit={edit}
              onEditAsset={onEditAsset}
            />
          </>
        ) : (
          <div className="hud-props">
            <Field label="Screen name">
              <input value={screen.name} onChange={(e) => patchScreen({ name: e.target.value })} />
            </Field>
            <Field label="Safe area">
              <input
                type="checkbox"
                checked={screen.safeArea !== false}
                onChange={(e) => patchScreen({ safeArea: e.target.checked })}
              />
            </Field>
            {screen.phase === 'window' && (
              <Field label="Modal (locks input)">
                <input
                  type="checkbox"
                  checked={screen.modal !== false}
                  onChange={(e) => patchScreen({ modal: e.target.checked })}
                />
              </Field>
            )}
            <Field label="Background">
              <Color
                label="Screen background"
                value={screen.background || '#20272b'}
                change={(background) => patchScreen({ background })}
              />
            </Field>
            <Field label="Screen blur (px)">
              <Numeric
                label="Screen backdrop blur"
                value={Number((screen as any).backdropBlur ?? 0)}
                min={0}
                max={64}
                step={1}
                change={(v) => patchScreen({ backdropBlur: v } as any)}
              />
            </Field>
            {screen.background && (
              <button onClick={() => patchScreen({ background: undefined })}>Clear background</button>
            )}
            {persisted &&
              (deletePending ? (
                <div className="hud-delete-confirm">
                  <p>
                    {screen.phase === 'window'
                      ? 'Delete this window and its controls?'
                      : 'Restore the default screen and remove its custom controls?'}
                  </p>
                  <button onClick={remove}>Confirm</button>
                  <button onClick={() => requestDelete(false)}>Cancel deletion</button>
                </div>
              ) : (
                <button className="hud-remove" onClick={() => requestDelete(true)}>
                  <Trash2 size={13} />{' '}
                  {screen.phase === 'window' ? 'Delete screen' : 'Restore default screen'}
                </button>
              ))}
          </div>
        )}
      </aside>
    </div>
  )
}
