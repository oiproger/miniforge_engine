import { useEffect, useMemo, useRef, useState } from 'react'
import { Play, Trash2, Send, Terminal } from 'lucide-react'
import type { editor } from 'monaco-editor/esm/vs/editor/editor.api.js'
import CodeEditor from './CodeEditor'
import { widgetLanguages, widgetSnippets, type WidgetTab } from './widgetStudioLanguage'
import { HTML_WIDGET_TEMPLATES, type Asset } from '../../../packages/project-schema/src'
import { buildHtmlWidgetSrcdoc, HTML_WIDGET_GAME_ACTIONS } from '../../../packages/runtime/src/overlay'

interface EventLogEntry {
  id: number
  time: string
  kind: 'emit' | 'action' | 'setVar' | 'console' | 'incoming'
  level?: string
  title: string
  detail: string
}

export default function HtmlEditor({
  a,
  changeA,
}: {
  a: Asset
  changeA: (fn: (asset: Asset) => void) => void
}) {
  const [tab, setTab] = useState<WidgetTab>('html')
  const [logs, setLogs] = useState<EventLogEntry[]>([])
  const [live, setLive] = useState(true)
  const [compact, setCompact] = useState(false)
  const [template, setTemplate] = useState('')
  const htmlEditor = useRef<editor.IStandaloneCodeEditor | null>(null)
  const cssEditor = useRef<editor.IStandaloneCodeEditor | null>(null)
  const jsEditor = useRef<editor.IStandaloneCodeEditor | null>(null)
  const editors = { html: htmlEditor, css: cssEditor, js: jsEditor }
  const [testEventName, setTestEventName] = useState('phone.notify')
  const [testEventPayload, setTestEventPayload] = useState('{"text":"Тестовое уведомление из игры"}')
  const iframeRef = useRef<HTMLIFrameElement | null>(null)
  const logSeq = useRef(1)
  const frameId = 'preview-' + a.id

  const htmlCode = a.data || ''
  const cssCode = String(a.properties?.css || '')
  const jsCode = String(a.properties?.js || '')

  const [preview, setPreview] = useState(() => ({ htmlCode, cssCode, jsCode, run: 0 }))
  const srcdoc = useMemo(
    () => buildHtmlWidgetSrcdoc(frameId, preview.htmlCode, preview.cssCode, preview.jsCode),
    [frameId, preview],
  )
  const runPreview = () => setPreview((previous) => ({ htmlCode, cssCode, jsCode, run: previous.run + 1 }))
  const pending = preview.htmlCode !== htmlCode || preview.cssCode !== cssCode || preview.jsCode !== jsCode
  useEffect(() => {
    if (!live || !pending) return
    const timer = window.setTimeout(() => {
      setPreview((previous) => ({ htmlCode, cssCode, jsCode, run: previous.run + 1 }))
    }, 450)
    return () => window.clearTimeout(timer)
  }, [live, pending, htmlCode, cssCode, jsCode])

  useEffect(() => {
    const onMsg = (ev: MessageEvent) => {
      const d = ev.data
      if (ev.source !== iframeRef.current?.contentWindow || !d?.__mfHtml || d.frameId !== frameId) return
      if (!['emit', 'action', 'setVar', 'console'].includes(d.kind)) return
      const now = new Date().toLocaleTimeString('en-GB', { hour12: false })
      const name = d.payload?.name
      const builtinAction = d.kind === 'action' && HTML_WIDGET_GAME_ACTIONS.some((action) => action === name)
      // Game emits custom events back to mounted widgets. Preview mirrors that bus locally.
      if (typeof name === 'string' && name && (d.kind === 'emit' || (d.kind === 'action' && !builtinAction))) {
        iframeRef.current?.contentWindow?.postMessage({ __mfToHtml: true, name, data: d.payload.data }, '*')
      }
      let title = String(d.kind)
      let detail = ''
      if (d.kind === 'emit') {
        title = `emit("${d.payload?.name || ''}")`
        detail = d.payload?.data !== undefined ? JSON.stringify(d.payload.data) : ''
      } else if (d.kind === 'action') {
        title = `action("${name || ''}")${builtinAction ? ' · game only' : ''}`
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
    const frame = iframeRef.current?.contentWindow
    if (!testEventName.trim() || !frame) return
    let parsed: unknown = testEventPayload
    try {
      parsed = JSON.parse(testEventPayload)
    } catch {
      /* send as plain string */
    }
    frame.postMessage(
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
    setTemplate('')
    setPreview((previous) => ({ htmlCode: tpl.html, cssCode: tpl.css, jsCode: tpl.js, run: previous.run + 1 }))
  }

  const code = { html: htmlCode, css: cssCode, js: jsCode }
  const updateCode = (language: WidgetTab, val: string) => {
    changeA((asset) => {
      if (language === 'html') asset.data = val
      else asset.properties = { ...(asset.properties || {}), [language]: val }
    })
  }
  const insertSnippet = (name: string) => {
    const snippet = widgetSnippets[tab].find((item) => item.name === name)
    const instance = editors[tab].current
    if (!snippet || !instance) return
    instance.focus()
    instance.getContribution<editor.IEditorContribution & { insert(text: string): void }>('snippetController2')
      ?.insert(snippet.snippet)
  }
  const formatCode = () => {
    const instance = editors[tab].current
    instance?.focus()
    void instance?.getAction('editor.action.formatDocument')?.run()
  }

  return (
    <div className="mf-html-studio mf-widget-studio">
      <div className="mf-html-top">
        <div className="mf-html-tabs" role="tablist" aria-label="Widget source">
          {(Object.keys(widgetLanguages) as WidgetTab[]).map((language) => (
            <button key={language} type="button" role="tab" aria-selected={tab === language}
              className={'mf-btn' + (tab === language ? ' active' : '')} onClick={() => setTab(language)}>
              {language.toUpperCase()}
            </button>
          ))}
        </div>
        <div className="mf-html-tools">
          <select aria-label="Insert snippet" value="" onChange={(e) => insertSnippet(e.target.value)}>
            <option value="" disabled>Insert snippet…</option>
            {widgetSnippets[tab].map(({ name, label }) => <option key={name} value={name}>{label}</option>)}
          </select>
          <button type="button" className="mf-btn" onClick={formatCode}>Format</button>
          <select aria-label="Widget template" value={template} onChange={(e) => setTemplate(e.target.value)}>
            <option value="">Templates…</option>
            {Object.keys(HTML_WIDGET_TEMPLATES).map((key) => <option key={key}>{key}</option>)}
          </select>
        </div>
      </div>
      {template && (
        <div className="mf-html-template-confirm">
          <span>Replace HTML, CSS and JS with the <strong>{template}</strong> template?</span>
          <button type="button" className="mf-btn" onClick={() => applyTemplate(template)}>Replace code</button>
          <button type="button" className="mf-btn" onClick={() => setTemplate('')}>Keep code</button>
        </div>
      )}

      <div className="mf-html-split">
        <div className="mf-html-code-col">
          {(Object.keys(widgetLanguages) as WidgetTab[]).map((language) => (
            <div key={language} className="mf-widget-code-pane" role="tabpanel" aria-label={language.toUpperCase()}
              hidden={tab !== language}>
              <CodeEditor fileName={`widget.${language}`} language={widgetLanguages[language]} value={code[language]}
                onChange={(value) => updateCode(language, value)} editorRef={editors[language]} onSave={runPreview} />
            </div>
          ))}
          <div className="mf-html-hint">
            Ctrl+Space for suggestions. Type <code>mf-</code> for snippets. Tab moves between snippet fields.
          </div>
        </div>

        <div className="mf-html-preview-col">
          <div className="mf-html-tools mf-widget-preview-tools">
            <label><input type="checkbox" checked={live} onChange={(e) => setLive(e.target.checked)} /> Live</label>
            <select aria-label="Preview viewport" value={compact ? 'compact' : 'fill'}
              onChange={(e) => setCompact(e.target.value === 'compact')}>
              <option value="fill">Fit panel</option>
              <option value="compact">Compact · 360 px</option>
            </select>
            <button type="button" className="mf-btn" onClick={runPreview} title="Run preview (Ctrl+S)">
              <Play size={12} /> Run
            </button>
            {pending && !live && <small>Preview paused</small>}
          </div>
          <div className={'mf-html-stage' + (compact ? ' compact' : '')}>
            <iframe key={preview.run} ref={iframeRef} title="HTML Widget Live Preview"
              sandbox="allow-scripts" srcDoc={srcdoc} className="mf-html-iframe" />
          </div>

          <div className="mf-html-testbar">
            <input
              aria-label="Test event name"
              value={testEventName}
              onChange={(e) => setTestEventName(e.target.value)}
              placeholder="event.name"
            />
            <input
              aria-label="Test event payload (JSON or text)"
              value={testEventPayload}
              onChange={(e) => setTestEventPayload(e.target.value)}
              placeholder='{"key":"val"}'
            />
            <button type="button" className="mf-btn" onClick={sendTestEvent} disabled={!testEventName.trim()}>
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
                Events are replayed to the widget. Game navigation actions are logged here.
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
