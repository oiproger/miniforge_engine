import type { Project } from '../../project-schema/src'
import type { Input } from './input'

export type Phase = 'menu' | 'playing' | 'paused' | 'results'
interface Actions {
  play(): void
  pause(): void
  retry(): void
  reward(): void
  language(): void
  emit(name: string): void
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

export class Overlay {
  host = document.createElement('div')
  private shadow = this.host.attachShadow({ mode: 'open' })
  private panel = document.createElement('section')
  private hud = document.createElement('header')
  private custom = document.createElement('div')
  private stats = document.createElement('small')
  private pad = document.createElement('div')
  private stick = document.createElement('i')
  private labels = new Map<string, HTMLElement>()
  constructor(
    private project: Project,
    private actions: Actions,
    input: Input,
    private t: (key: string) => string,
  ) {
    this.host.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:2'
    const style = document.createElement('style')
    style.textContent = `
:host{color:#fff;font:600 15px system-ui,sans-serif}*{box-sizing:border-box}section{pointer-events:auto;position:absolute;inset:0;display:grid;place-content:center;justify-items:center;gap:12px;text-align:center;background:linear-gradient(180deg,#12272242,#071d218c);padding:20px}section[hidden],header[hidden],.pad[hidden]{display:none}h1{font-size:clamp(28px,6vw,64px);letter-spacing:-.055em;text-shadow:0 2px 24px #182114;margin:0}p{margin:0 0 6px;text-shadow:0 1px 4px #122}button{border:0;cursor:pointer;pointer-events:auto;font:inherit;border-radius:9px;padding:10px 18px;color:#15291b;background:#c3f48a}button:focus-visible{outline:3px solid white}section button+button,header button{background:#22332fe8;color:white}header{position:absolute;top:14px;left:14px;right:14px;display:flex;align-items:center;gap:10px}output{background:#182922d9;color:#ebffbd;border-radius:7px;padding:8px 12px;font-variant-numeric:tabular-nums}header button{margin-left:auto}.pad{display:none;position:absolute;bottom:22px;left:22px;border:1px solid #ffffff80;background:#253b3277;width:100px;height:100px;border-radius:50%;touch-action:none;pointer-events:auto;place-items:center}.pad i{width:40px;height:40px;border-radius:50%;background:#eaffdacc}@media(pointer:coarse){.pad{display:grid}}small{position:absolute;bottom:8px;right:8px;padding:3px 6px;color:white;background:#101c22ad;font:11px monospace}small:empty{display:none}
`
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
    this.shadow.append(style, this.custom, this.hud, this.pad, this.panel, this.stats)
  }
  private button(text: string, fn: () => void) {
    const el = document.createElement('button')
    el.textContent = text
    el.onclick = fn
    return el
  }
  render(phase: Phase, score: number, time: number, best: number, lang: string, mode: boolean) {
    this.hud.replaceChildren()
    this.panel.replaceChildren()
    this.custom.replaceChildren()
    this.labels.clear()
    this.panel.hidden = phase === 'playing'
    this.hud.hidden = phase !== 'playing'
    this.custom.hidden = this.hud.hidden
    this.pad.hidden = this.hud.hidden
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
    for (const item of this.project.ui) {
      if (item.visible === false) continue
      const el =
        item.type === 'button'
          ? this.button(this.t(item.text), () => this.actions.emit(String(item.event || item.id)))
          : document.createElement(
              item.type === 'image' ? 'img' : item.type === 'progress' ? 'progress' : 'div',
            )
      if (el instanceof HTMLImageElement)
        el.src = this.project.assets.find((a) => a.id === item.asset)?.data || ''
      else if (item.type !== 'progress') el.textContent = this.t(item.text || '')
      Object.assign(el.style, {
        position: 'absolute',
        left: item.x + '%',
        top: item.y + '%',
        color: item.color || 'white',
        fontSize: (item.fontSize || 16) + 'px',
        textAlign: item.align || 'left',
        zIndex: String(item.zIndex || 0),
        background: item.background || '',
        pointerEvents: item.type === 'button' ? 'auto' : 'none',
      })
      this.labels.set(item.id, el)
      this.custom.append(el)
    }
    this.update(score, time, { score, time, best })
  }
  update(score: number, time: number, vars: Record<string, unknown>) {
    const scoreEl = this.hud.querySelector('output')
    if (scoreEl)
      scoreEl.textContent = `${this.t('hud.score')}  ${score}    ·    ${this.t('hud.time')}  ${Math.ceil(time)}`
    for (const item of this.project.ui) {
      const el = this.labels.get(item.id)
      if (!el || !item.variable) continue
      if (el instanceof HTMLProgressElement) {
        el.max = Number(item.max) || 100
        el.value = Number(vars[item.variable]) || 0
      } else el.textContent = this.t(item.text || '') + ' ' + String(vars[item.variable] ?? 0)
    }
  }
  get(id: string) {
    return this.labels.get(id)
  }
  performance(text: string) {
    this.stats.textContent = text
  }
  dispose() {
    this.host.remove()
  }
}
