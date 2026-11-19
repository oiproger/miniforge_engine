import { useEffect, useMemo, useRef, useState } from 'react'
import { Play, Trash2, Send, Code2, Sparkles, Terminal } from 'lucide-react'
import { HTML_WIDGET_TEMPLATES, type Asset } from '../../../packages/project-schema/src'
import { buildHtmlWidgetSrcdoc } from '../../../packages/runtime/src/overlay'

interface EventLogEntry {
  id: number
  time: string
  kind: 'emit' | 'action' | 'setVar' | 'console' | 'incoming'
  level?: string
  title: string
  detail: string
}

export function HtmlEditor({
  a,
  changeA,
}: {
  a: Asset
  changeA: (fn: (asset: Asset) => void) => void
}) {
  const [tab, setTab] = useState<'html' | 'css' | 'js'>('html')
  const [logs, setLogs] = useState<EventLogEntry[]>([])
  const [runNonce, setRunNonce] = useState(0)
  const [testEventName, setTestEventName] = useState('phone.notify')
  const [testEventPayload, setTestEventPayload] = useState('{"text":"Тестовое уведомление из игры"}')
  const iframeRef = useRef<HTMLIFrameElement | null>(null)
  const logSeq = useRef(1)
  const frameId = 'preview-' + a.id

  const htmlCode = a.data || ''
  const cssCode = String(a.properties?.css || '')
  const jsCode = String(a.properties?.js || '')

  const srcdoc = useMemo(
    () => buildHtmlWidgetSrcdoc(frameId, htmlCode, cssCode, jsCode),
    [frameId, htmlCode, cssCode, jsCode, runNonce],
  )

  useEffect(() => {
    const onMsg = (ev: MessageEvent) => {
      const d = ev.data
      if (!d || !d.__mfHtml || d.frameId !== frameId) return
      const now = new Date().toLocaleTimeString('en-GB', { hour12: false })
      let title = String(d.kind)
      let detail = ''
      if (d.kind === 'emit') {
        title = `emit("${d.payload?.name || ''}")`
        detail = d.payload?.data !== undefined ? JSON.stringify(d.payload.data) : ''
      } else if (d.kind === 'action') {
        title = `action("${d.payload?.name || ''}")`
        detail = d.payload?.data !== undefined ? JSON.stringify(d.payload.data) : ''
      } else if (d.kind === 'setVar') {
        title = `setVar("${d.payload?.key || ''}")`
        detail = JSON.stringify(d.payload?.value)
      } else if (d.kind === 'console') {
        title = `console.${d.payload?.level || 'log'}`
        detail = String(d.payload?.text || '')
      }
      setLogs((prev) => [
        { id: logSeq.current++, time: now, kind: d.kind, level: d.payload?.level, title, detail },
        ...prev.slice(0, 79),
      ])
    }
    window.addEventListener('message', onMsg)
    return () => window.removeEventListener('message', onMsg)
  }, [frameId])

  const sendTestEvent = () => {
    if (!testEventName.trim()) return
    let parsed: unknown = testEventPayload
    try {
      parsed = JSON.parse(testEventPayload)
    } catch {
      /* send as plain string */
    }
    iframeRef.current?.contentWindow?.postMessage(
      { __mfToHtml: true, name: testEventName.trim(), data: parsed },
      '*',
    )
    const now = new Date().toLocaleTimeString('en-GB', { hour12: false })
    setLogs((prev) => [
      {
        id: logSeq.current++,
        time: now,
        kind: 'incoming',
        title: `game -> "${testEventName.trim()}"`,
        detail: typeof parsed === 'string' ? parsed : JSON.stringify(parsed),
      },
      ...prev.slice(0, 79),
    ])
  }

  const applyTemplate = (key: string) => {
    const tpl = HTML_WIDGET_TEMPLATES[key]
    if (!tpl) return
    changeA((asset) => {
      asset.data = tpl.html
      asset.properties = { ...(asset.properties || {}), css: tpl.css, js: tpl.js }
    })
    setRunNonce((n) => n + 1)
  }

  const currentVal = tab === 'html' ? htmlCode : tab === 'css' ? cssCode : jsCode
  const updateCurrent = (val: string) => {
    changeA((asset) => {
      if (tab === 'html') asset.data = val
      else asset.properties = { ...(asset.properties || {}), [tab]: val }
    })
  }

  return (
    <div className="mf-html-studio">
      <div className="mf-html-top">
        <div className="mf-html-tabs">
          {(['html', 'css', 'js'] as const).map((k) => (
            <button
              key={k}
              type="button"
              className={'mf-btn' + (tab === k ? ' active' : '')}
              onClick={() => setTab(k)}
            >
              <Code2 size={12} /> {k.toUpperCase()}
            </button>
          ))}
        </div>
        <div className="mf-html-templates">
          <Sparkles size={12} />
          {Object.keys(HTML_WIDGET_TEMPLATES).map((k) => (
            <button key={k} type="button" className="mf-preset-chip" onClick={() => applyTemplate(k)}>
              {k}
            </button>
          ))}
          <button type="button" className="mf-btn" onClick={() => setRunNonce((n) => n + 1)} title="Reload preview">
            <Play size={12} /> Run
          </button>
        </div>
      </div>

      <div className="mf-html-split">
        <div className="mf-html-code-col">
          <textarea
            aria-label={`HTML widget ${tab.toUpperCase()} code`}
            className="mf-html-textarea"
            spellCheck={false}
            value={currentVal}
            onChange={(e) => updateCurrent(e.target.value)}
          />
          <div className="mf-html-hint">
            Мост: <code>miniforge.emit(event, data)</code> · <code>miniforge.on(event, cb)</code> ·{' '}
            <code>miniforge.action('close')</code> · атрибуты <code>data-event="..."</code> / <code>data-payload='...'</code>
          </div>
        </div>

        <div className="mf-html-preview-col">
          <div className="mf-minor-label" style={{ marginTop: 0 }}>
            Live Interactive Preview (кликай элементы)
          </div>
          <div className="mf-html-stage">
            <iframe
              key={runNonce}
              ref={iframeRef}
              title="HTML Widget Live Preview"
              sandbox="allow-scripts"
              srcDoc={srcdoc}
              className="mf-html-iframe"
            />
          </div>

          <div className="mf-html-testbar">
            <input
              aria-label="Test event name"
              value={testEventName}
              onChange={(e) => setTestEventName(e.target.value)}
              placeholder="event.name"
            />
            <input
              aria-label="Test event payload JSON"
              value={testEventPayload}
              onChange={(e) => setTestEventPayload(e.target.value)}
              placeholder='{"key":"val"}'
            />
            <button type="button" className="mf-btn" onClick={sendTestEvent}>
              <Send size={12} /> Send
            </button>
          </div>

          <div className="mf-html-log-hdr">
            <span>
              <Terminal size={12} /> Event &amp; Console Log ({logs.length})
            </span>
            <button type="button" className="mf-btn" onClick={() => setLogs([])}>
              <Trash2 size={11} /> Clear
            </button>
          </div>
          <div className="mf-html-logs">
            {!logs.length ? (
              <div className="mf-html-log-empty">
                Нажми на кнопку в превью или вызови miniforge.emit(...) — события появятся здесь.
              </div>
            ) : (
              logs.map((entry) => (
                <div key={entry.id} className={'mf-html-log-row ' + entry.kind + (entry.level === 'error' ? ' err' : '')}>
                  <span className="mf-log-time">{entry.time}</span>
                  <strong>{entry.title}</strong>
                  {entry.detail && <code>{entry.detail}</code>}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
