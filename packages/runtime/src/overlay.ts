import { containerStyle, gridItemStyle } from '../../project-schema/src/hud-layout'
import type { Project, UIElement } from '../../project-schema/src'
import { anchorStyle } from '../../project-schema/src/screens'
import type { Input } from './input'

export type Phase = 'menu' | 'playing' | 'paused' | 'results'
interface Actions {
  play(): void
  pause(): void
  retry(): void
  reward(): void
  language(): void
  emit(name: string, source?: unknown): void
}
export const words: Record<string, Record<string, string>> = {
  en: {
    'menu.play': 'Play',
    'menu.resume': 'Resume',
    'menu.retry': 'Play again',
    'menu.pause': 'Paused',
    'menu.results': 'Results',
    'hud.score': 'Score',
    'hud.time': 'Time',
    'hud.best': 'Best',
    'menu.reward': 'Watch ad · +15 seconds',
    'menu.controls': 'WASD or arrow keys to move. Collect every coin.',
  },
  ru: {
    'menu.play': 'Играть',
    'menu.resume': 'Продолжить',
    'menu.retry': 'Играть снова',
    'menu.pause': 'Пауза',
    'menu.results': 'Результаты',
    'hud.score': 'Счёт',
    'hud.time': 'Время',
    'hud.best': 'Рекорд',
    'menu.reward': 'Реклама · +15 секунд',
    'menu.controls': 'Соберите все монеты. Управление — WASD или стрелки.',
  },
}
export function translate(
  project: Project,
  language: string,
  key: string,
  params: Record<string, unknown> = {},
) {
  const fallback = project.settings.language || 'en'
  const value =
    project.locales[language]?.[key] ??
    words[language]?.[key] ??
    project.locales[fallback]?.[key] ??
    project.locales.en?.[key] ??
    words.en[key] ??
    key
  return value.replace(/\{(\w+)\}/g, (s: string, k: string) => String(params[k] ?? s))
}

export function buildHtmlWidgetSrcdoc(
  frameId: string,
  html: string,
  css = '',
  js = '',
): string {
  const safeId = JSON.stringify(frameId)
  const bridge = `<script>(function(){
  var FRAME_ID=${safeId};
  var listeners={};
  function post(kind,payload){try{window.parent.postMessage({__mfHtml:true,frameId:FRAME_ID,kind:kind,payload:payload},'*');}catch(e){}}
  window.miniforge={
    emit:function(name,data){post('emit',{name:String(name),data:data});},
    action:function(name,data){post('action',{name:String(name),data:data});},
    setVar:function(key,value){post('setVar',{key:String(key),value:value});},
    on:function(name,cb){if(!listeners[name])listeners[name]=[];listeners[name].push(cb);return function(){listeners[name]=(listeners[name]||[]).filter(function(f){return f!==cb;});};}
  };
  ['log','warn','error'].forEach(function(lvl){
    var orig=console[lvl];
    console[lvl]=function(){
      var args=[].slice.call(arguments).map(function(a){try{return typeof a==='object'?JSON.stringify(a):String(a);}catch(e){return String(a);}});
      post('console',{level:lvl,text:args.join(' ')});
      if(orig)orig.apply(console,arguments);
    };
  });
  window.addEventListener('error',function(ev){post('console',{level:'error',text:ev.message||'Script error'});});
  window.addEventListener('message',function(ev){
    var d=ev.data;
    if(!d||!d.__mfToHtml)return;
    (listeners[d.name]||[]).forEach(function(fn){try{fn(d.data);}catch(err){post('console',{level:'error',text:String(err)});}});
  });
  document.addEventListener('click',function(ev){
    var t=ev.target&&ev.target.closest?ev.target.closest('[data-event],[data-action]'):null;
    if(!t)return;
    var act=t.getAttribute('data-action');
    if(act){post('action',{name:act,data:t.getAttribute('data-target')||undefined});}
    var evName=t.getAttribute('data-event');
    if(evName){
      var raw=t.getAttribute('data-payload');
      var parsed=raw;
      if(raw){try{parsed=JSON.parse(raw);}catch(e){}}
      post('emit',{name:evName,data:parsed});
    }
  });
})();<\/script>`
  return `<!DOCTYPE html><html style="background:transparent;color-scheme:dark"><head><meta charset="utf-8"><style>html,body{margin:0;padding:0;background:transparent;color-scheme:dark;overflow:hidden}${css || ''}</style>${bridge}</head><body style="background:transparent">${html || ''}<script>try{${js || ''}}catch(e){console.error(e);}<\/script></body></html>`
}

export class Overlay {
  host = document.createElement('div')
  private shadow = this.host.attachShadow({ mode: 'open' })
  private panel = document.createElement('section')
  private hud = document.createElement('header')
  private custom = document.createElement('div')
  private mountedLayer = document.createElement('div')
  private mounted = new Map<string, { root: HTMLElement; style?: HTMLStyleElement }>()
  private stats = document.createElement('small')
  private pad = document.createElement('div')
  private stick = document.createElement('i')
  private windows: string[] = []
  private phase?: Phase
  private snapshot?: { score: number; time: number; best: number; lang: string; mode: boolean }
  private variables: Record<string, unknown> = {}
  private labels = new Map<string, HTMLElement>()
  private htmlFrames = new Map<string, HTMLIFrameElement>()
  private onHtmlMessage = (ev: MessageEvent) => {
    const d = ev.data
    if (!d || !d.__mfHtml) return
    const frame = this.htmlFrames.get(String(d.frameId))
    if (!frame || ev.source !== frame.contentWindow) return
    if (d.kind === 'emit' && d.payload?.name) {
      this.actions.emit(String(d.payload.name), d.payload.data)
    } else if (d.kind === 'action' && d.payload?.name) {
      const act = String(d.payload.name)
      if (act === 'play') this.actions.play()
      else if (act === 'pause') this.actions.pause()
      else if (act === 'retry') this.actions.retry()
      else if (act === 'close') this.close()
      else if (act === 'back') this.back()
      else if (act === 'open' && d.payload.data) this.open(String(d.payload.data))
      else this.actions.emit(act, d.payload.data)
    } else if (d.kind === 'setVar' && d.payload?.key) {
      this.variables[String(d.payload.key)] = d.payload.value
      this.actions.emit('ui.var.set', { key: d.payload.key, value: d.payload.value })
    }
  }
  constructor(
    private project: Project,
    private actions: Actions,
    private input: Input,
    private t: (key: string) => string,
  ) {
    this.host.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:2'
    const style = document.createElement('style')
    style.textContent = `
:host{color:#fff;font:600 15px system-ui,sans-serif}*{box-sizing:border-box}section{pointer-events:auto;position:absolute;inset:0;display:grid;place-content:center;justify-items:center;gap:12px;text-align:center;background:linear-gradient(180deg,#12272242,#071d218c);padding:20px}section[hidden],header[hidden],.pad[hidden]{display:none}h1{font-size:clamp(28px,6vw,64px);letter-spacing:-.055em;text-shadow:0 2px 24px #182114;margin:0}p{margin:0 0 6px;text-shadow:0 1px 4px #122}button{border:0;cursor:pointer;pointer-events:auto;font:inherit;border-radius:9px;padding:10px 18px;color:#15291b;background:#c3f48a}button:focus-visible{outline:3px solid white}section button+button,header button{background:#22332fe8;color:white}header{position:absolute;top:14px;left:14px;right:14px;display:flex;align-items:center;gap:10px}output{background:#182922d9;color:#ebffbd;border-radius:7px;padding:8px 12px;font-variant-numeric:tabular-nums}header button{margin-left:auto}.pad{display:none;position:absolute;bottom:22px;left:22px;border:1px solid #ffffff80;background:#253b3277;width:100px;height:100px;border-radius:50%;touch-action:none;pointer-events:auto;place-items:center}.pad i{width:40px;height:40px;border-radius:50%;background:#eaffdacc}@media(pointer:coarse){.pad{display:grid}}small{position:absolute;bottom:8px;right:8px;padding:3px 6px;color:white;background:#101c22ad;font:11px monospace}small:empty{display:none}.inventory-entry{padding:6px 8px;border-radius:6px;background:#101b22cc;pointer-events:auto;cursor:pointer}.inventory-entry:hover{background:#1d303ce6}
`
    this.custom.className = 'custom'
    this.custom.style.cssText = 'position:absolute;inset:0'
    this.mountedLayer.className = 'mounted'
    this.mountedLayer.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:4'
    this.pad.className = 'pad'
    this.pad.append(this.stick)
    const move = (e: PointerEvent) => {
      const r = this.pad.getBoundingClientRect()
      const x = (e.clientX - r.left - r.width / 2) / 38,
        y = (e.clientY - r.top - r.height / 2) / 38,
        n = Math.max(1, Math.hypot(x, y))
      input.joystick(x / n, y / n)
      this.stick.style.transform = `translate(${(x / n) * 25}px,${(y / n) * 25}px)`
    }
    this.pad.onpointerdown = (e) => {
      this.pad.setPointerCapture(e.pointerId)
      move(e)
    }
    this.pad.onpointermove = (e) => {
      if (this.pad.hasPointerCapture(e.pointerId)) move(e)
    }
    this.pad.onlostpointercapture = () => {
      input.joystick(0, 0)
      this.stick.style.transform = ''
    }
    this.shadow.append(style, this.hud, this.pad, this.panel, this.custom, this.mountedLayer, this.stats)
    window.addEventListener('message', this.onHtmlMessage)
  }
  private button(text: string, fn: () => void) {
    const el = document.createElement('button')
    el.textContent = text
    el.onclick = fn
    return el
  }
  private phaseScreen() {
    return this.project.screens?.find((s) => s.phase === this.phase)
  }
  current(): string | undefined {
    return this.windows.at(-1) ?? this.phaseScreen()?.id
  }
  open(id: string): boolean {
    if (!this.project.screens?.some((s) => s.id === id && s.phase === 'window')) return false
    if (this.windows.at(-1) === id) return true
    const index = this.windows.indexOf(id)
    if (index >= 0) this.windows.length = index + 1
    else this.windows.push(id)
    this.redraw()
    return true
  }
  back(): boolean {
    if (!this.windows.length) return false
    this.windows.pop()
    this.redraw()
    return true
  }
  close(): boolean {
    if (!this.windows.length) return false
    this.windows = []
    this.redraw()
    return true
  }
  mount(id: string, content: string | HTMLElement, css?: string): HTMLElement {
    this.unmount(id)
    const root = document.createElement('div')
    root.dataset.mountedId = id
    root.style.cssText = 'position:absolute;inset:0;pointer-events:none'
    if (typeof content === 'string') root.innerHTML = content
    else root.append(content)
    let styleEl: HTMLStyleElement | undefined
    if (css) {
      styleEl = document.createElement('style')
      styleEl.textContent = css
      this.shadow.append(styleEl)
    }
    this.mountedLayer.append(root)
    this.mounted.set(id, { root, style: styleEl })
    return root
  }
  unmount(id: string) {
    const entry = this.mounted.get(id)
    if (!entry) return
    entry.root.remove()
    entry.style?.remove()
    this.mounted.delete(id)
  }
  private redraw() {
    const state = this.snapshot
    if (state && this.phase)
      this.render(this.phase, state.score, state.time, state.best, state.lang, state.mode)
  }
  private activate(item: UIElement) {
    switch (item.action) {
      case 'open':
        if (item.target) this.open(item.target)
        return
      case 'back':
        this.back()
        return
      case 'close':
        this.close()
        return
      case 'play':
        this.actions.play()
        return
      case 'pause':
        this.actions.pause()
        return
      case 'retry':
        this.actions.retry()
        return
      case 'reward':
        this.actions.reward()
        return
      case 'language':
        this.actions.language()
        return
      case 'input':
        return
      default:
        this.actions.emit(String(item.event || item.id), item.id)
    }
  }
  private bindInput(el: HTMLElement, action: string) {
    const source = (pointer: number) => 'pointer-' + pointer
    el.style.touchAction = 'none'
    el.onpointerdown = (e) => {
      if (e.button !== 0) return
      el.setPointerCapture(e.pointerId)
      this.input.setVirtual(action, source(e.pointerId), true)
    }
    el.onlostpointercapture =
      el.onpointercancel =
      el.onpointerup =
        (e) => this.input.setVirtual(action, source(e.pointerId), false)
    const key = 'hud-keyboard'
    el.onkeydown = (e) => {
      if (e.code === 'Space' || e.code === 'Enter') {
        e.preventDefault()
        e.stopPropagation()
        this.input.setVirtual(action, key, true)
      }
    }
    el.onkeyup = (e) => {
      if (e.code === 'Space' || e.code === 'Enter') {
        e.preventDefault()
        e.stopPropagation()
        this.input.setVirtual(action, key, false)
      }
    }
    el.onblur = () => this.input.setVirtual(action, key, false)
  }
  render(phase: Phase, score: number, time: number, best: number, lang: string, mode: boolean) {
    if (this.phase !== phase) this.windows = []
    this.phase = phase
    this.snapshot = { score, time, best, lang, mode }
    const active = this.project.screens?.find((s) => s.id === this.current())
    const windowOpen = !!this.windows.length
    const isModalWindow = windowOpen && active?.modal !== false
    this.input.setModal(isModalWindow)
    if (isModalWindow) this.input.releaseVirtual()
    this.host.style.pointerEvents = isModalWindow || phase !== 'playing' ? 'auto' : 'none'
    if (isModalWindow && document.pointerLockElement) document.exitPointerLock()
    this.hud.replaceChildren()
    this.panel.replaceChildren()
    this.custom.replaceChildren()
    this.labels.clear()
    this.htmlFrames.clear()
    const items = this.project.ui.filter(
      (item) =>
        item.visible !== false &&
        (item.screen ? item.screen === active?.id : !windowOpen && phase === 'playing'),
    )
    const authored = windowOpen || (!!active && items.some((item) => item.screen === active.id))
    this.panel.hidden = authored || phase === 'playing'
    this.hud.hidden = authored || phase !== 'playing'
    this.custom.hidden = !items.length && !windowOpen
    this.custom.style.background = active?.background || (isModalWindow ? '#152024dc' : 'transparent')
    const screenBlur = Number((active as any)?.backdropBlur ?? 0)
    this.custom.style.backdropFilter = screenBlur > 0 ? `blur(${screenBlur}px)` : ''
    ;(this.custom.style as any).webkitBackdropFilter = screenBlur > 0 ? `blur(${screenBlur}px)` : ''
    this.custom.style.pointerEvents = phase === 'playing' && !isModalWindow ? 'none' : 'auto'
    const safe = active?.safeArea !== false
    this.custom.style.inset = safe
      ? 'env(safe-area-inset-top, 0px) env(safe-area-inset-right, 0px) env(safe-area-inset-bottom, 0px) env(safe-area-inset-left, 0px)'
      : '0'
    this.pad.hidden = isModalWindow || phase !== 'playing'
    const label = document.createElement('output')
    label.dataset.role = 'score'
    if (mode) this.hud.append(label)
    this.hud.append(this.button('Ⅱ', this.actions.pause))
    this.hud.lastElementChild?.setAttribute('aria-label', this.t('menu.pause'))
    if (phase !== 'playing') {
      const h = document.createElement('h1')
      h.textContent =
        phase === 'menu' ? this.project.name : this.t(phase === 'paused' ? 'menu.pause' : 'menu.results')
      const p = document.createElement('p')
      p.textContent =
        phase === 'menu' && mode
          ? this.t('menu.controls')
          : phase === 'results'
            ? `${this.t('hud.score')} ${score}   ·   ${this.t('hud.best')} ${best}`
            : ''
      this.panel.append(
        h,
        p,
        this.button(
          this.t(phase === 'results' ? 'menu.retry' : phase === 'paused' ? 'menu.resume' : 'menu.play'),
          phase === 'results' ? this.actions.retry : this.actions.play,
        ),
      )
      if (phase === 'results' && mode && time === 0)
        this.panel.append(this.button(this.t('menu.reward'), this.actions.reward))
      this.panel.append(this.button(lang.toUpperCase(), this.actions.language))
    }
    const ordered = [...items.filter((i) => !i.parentId), ...items.filter((i) => i.parentId)]
    for (const item of ordered) {
      const parent = item.parentId ? this.labels.get(item.parentId) : this.custom
      if (!parent) continue
      const el =
        item.type === 'button'
          ? this.button(this.t(item.text), () => this.activate(item))
          : document.createElement(
              item.type === 'image' ? 'img' : item.type === 'progress' ? 'progress' : 'div',
            )
      if (item.type === 'html') {
        el.textContent = ''
        const asset = this.project.assets.find((a) => a.id === item.asset && (a.type === 'html' || a.type === 'text'))
        const iframe = document.createElement('iframe')
        iframe.setAttribute('sandbox', 'allow-scripts')
        iframe.style.cssText = 'width:100%;height:100%;border:0;background:transparent;color-scheme:dark;display:block;'
        iframe.setAttribute('allowtransparency', 'true')
        iframe.srcdoc = buildHtmlWidgetSrcdoc(
          item.id,
          asset?.data || '',
          String(asset?.properties?.css || ''),
          String(asset?.properties?.js || ''),
        )
        el.append(iframe)
        this.htmlFrames.set(item.id, iframe)
      } else if (el instanceof HTMLImageElement) {
        el.src = this.project.assets.find((a) => a.id === item.asset)?.data || ''
        el.alt = this.t(item.text || '')
      } else if (item.type !== 'progress') el.textContent = this.t(item.text || '')
      el.dataset.uiId = item.id
      Object.assign(el.style, {
        position: 'absolute',
        ...anchorStyle(item.anchor, item.x, item.y),
        width: Number.isFinite(item.width) ? item.width + '%' : 'auto',
        height: Number.isFinite(item.height) ? item.height + '%' : 'auto',
        color: item.color || 'white',
        fontSize: (item.fontSize || 16) + 'px',
        textAlign: item.align || 'left',
        zIndex: String(item.zIndex || 0),
        background: item.background || (item.type === 'blur' ? 'rgba(18, 26, 32, 0.35)' : ''),
        borderRadius: Number.isFinite(item.borderRadius) ? item.borderRadius + 'px' : (item.type === 'blur' ? '12px' : ''),
        border: item.borderColor ? `1px solid ${item.borderColor}` : '',
        backdropFilter: Number(item.backdropBlur ?? (item.type === 'blur' ? 12 : 0)) > 0 ? `blur(${Number(item.backdropBlur ?? 12)}px)` : '',
        webkitBackdropFilter: Number(item.backdropBlur ?? (item.type === 'blur' ? 12 : 0)) > 0 ? `blur(${Number(item.backdropBlur ?? 12)}px)` : '',
        pointerEvents: item.type === 'button' || (item.type === 'html' && item.interactive !== false) ? 'auto' : 'none',
      })
      if (item.type === 'button' && item.action === 'input' && item.target) this.bindInput(el, item.target)
      this.labels.set(item.id, el)
      if (item.type === 'container') {
        el.textContent = ''
        Object.assign(el.style, containerStyle(item))
      }
      if (item.parentId) Object.assign(el.style, gridItemStyle)
      parent.append(el)
    }
    this.update(score, time, { ...this.variables, score, time, best })
  }
  update(score: number, time: number, vars: Record<string, unknown>) {
    this.variables = vars
    if (this.snapshot) {
      this.snapshot.score = score
      this.snapshot.time = time
    }
    const scoreEl = this.hud.querySelector('output')
    if (scoreEl)
      scoreEl.textContent = `${this.t('hud.score')}  ${score}    ·    ${this.t('hud.time')}  ${Math.ceil(time)}`
    for (const item of this.project.ui) {
      const el = this.labels.get(item.id)
      if (el && item.type === 'container' && item.itemsVariable) {
        const value = vars[item.itemsVariable]
        const entries = Array.isArray(value) ? value : []
        const cells = el.getElementsByClassName('inventory-entry')
        while (cells.length > entries.length) cells[cells.length - 1].remove()
        for (let i = 0; i < entries.length; i++) {
          let cell = cells[i] as HTMLElement | undefined
          if (!cell) {
            cell = document.createElement('div')
            cell.className = 'inventory-entry'
            el.append(cell)
          }
          const raw = entries[i]
          const isObj = raw && typeof raw === 'object'
          const label = this.t(String(isObj ? (raw as any).label ?? (raw as any).id ?? '' : (raw ?? '')))
          if (cell.textContent !== label) cell.textContent = label
          cell.onclick = () =>
            this.actions.emit('ui.item.click', {
              container: item.id,
              index: i,
              item: raw,
              id: isObj ? (raw as any).id : String(raw),
            })
        }
      }
      if (!el || !item.variable || item.type === 'container') continue
      if (el instanceof HTMLProgressElement) {
        el.max = Number(item.max) || 100
        el.value = Number(vars[item.variable]) || 0
      } else el.textContent = this.t(item.text || '') + ' ' + String(vars[item.variable] ?? 0)
    }
  }
  get(id: string) {
    return this.labels.get(id) ?? this.mounted.get(id)?.root
  }
  setBlur(id: string, blurPx: number) {
    const el = this.get(id)
    if (!el) return
    const v = blurPx > 0 ? `blur(${blurPx}px)` : ''
    el.style.backdropFilter = v
    ;(el.style as any).webkitBackdropFilter = v
  }
  setStyle(id: string, styles: Partial<CSSStyleDeclaration>) {
    const el = this.get(id)
    if (el) Object.assign(el.style, styles)
  }
  performance(text: string) {
    this.stats.textContent = text
  }
  dispatchEvent(name: string, data?: unknown) {
    for (const iframe of this.htmlFrames.values()) {
      try { iframe.contentWindow?.postMessage({ __mfToHtml: true, name, data }, '*') } catch {}
    }
  }
  dispose() {
    window.removeEventListener('message', this.onHtmlMessage)
    for (const id of [...this.mounted.keys()]) this.unmount(id)
    this.input.releaseVirtual()
    this.host.remove()
  }
}
