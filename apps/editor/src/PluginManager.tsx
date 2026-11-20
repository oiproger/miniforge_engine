import { useMemo, useRef, useState } from 'react'
import { Puzzle, Plus, Download, Upload, CheckCircle2, AlertTriangle, Sparkles } from 'lucide-react'
import {
  EXAMPLE_PLUGINS,
  makeDefaultPlugin,
  parsePluginManifest,
  uid,
  type Asset,
  type PluginManifest,
  type Project,
} from '../../../packages/project-schema/src'
import { Field } from './Fields'

export function PluginEditor({
  a,
  p,
  changeA,
  edit,
}: {
  a: Asset
  p: Project
  changeA: (fn: (asset: Asset) => void) => void
  edit: (fn: (proj: Project) => void) => void
}) {
  const manifest: PluginManifest = useMemo(() => parsePluginManifest(a.data), [a.data])
  const [tab, setTab] = useState<'code' | 'examples'>('code')
  const [checkMsg, setCheckMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const fileRef = useRef<HTMLInputElement | null>(null)

  const commit = (patch: Partial<PluginManifest>) => {
    const next: PluginManifest = { ...manifest, ...patch }
    changeA((asset) => {
      asset.name = next.name
      asset.data = JSON.stringify(next, null, 2)
    })
  }

  const validateCode = () => {
    try {
      new Function('exports', manifest.code)
      setCheckMsg({ ok: true, text: 'Syntax OK — ready to run in Editor & Runtime' })
    } catch (err) {
      setCheckMsg({ ok: false, text: String(err) })
    }
  }

  const exportPluginFile = () => {
    const blob = new Blob([JSON.stringify(manifest, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${manifest.id || 'plugin'}.mfplugin.json`
    link.click()
    URL.revokeObjectURL(url)
  }

  const importPluginFile = async (file: File) => {
    const text = await file.text()
    try {
      if (file.name.endsWith('.json')) {
        const parsed = parsePluginManifest(text)
        commit(parsed)
        setCheckMsg({ ok: true, text: `Imported ${parsed.name} v${parsed.version}` })
      } else {
        const base = makeDefaultPlugin(file.name.replace(/\.[^.]+$/, ''))
        commit({ ...base, code: text })
        setCheckMsg({ ok: true, text: `Imported JS plugin ${file.name}` })
      }
    } catch (err) {
      setCheckMsg({ ok: false, text: 'Invalid plugin file: ' + String(err) })
    }
  }

  const installExample = (ex: PluginManifest) => {
    edit((proj) => {
      const existing = proj.assets.find(
        (x) => x.type === 'plugin' && parsePluginManifest(x.data).id === ex.id,
      )
      if (existing) {
        existing.data = JSON.stringify(ex, null, 2)
        existing.name = ex.name
      } else {
        proj.assets.push({
          id: uid('plugin'),
          name: ex.name,
          type: 'plugin',
          data: JSON.stringify(ex, null, 2),
          properties: {},
        })
      }
    })
    setCheckMsg({ ok: true, text: `Installed "${ex.name}" into Project Assets!` })
  }

  return (
    <div className="mf-bp-editor">
      <div className="mf-bp-toolbar">
        <div className="mf-bp-tabs">
          <button type="button" className={'mf-bp-tab' + (tab === 'code' ? ' active' : '')} onClick={() => setTab('code')}>
            <Puzzle size={13} /> Plugin Code &amp; Manifest
          </button>
          <button type="button" className={'mf-bp-tab' + (tab === 'examples' ? ' active' : '')} onClick={() => setTab('examples')}>
            <Sparkles size={13} /> Example Plugins ({EXAMPLE_PLUGINS.length})
          </button>
        </div>
        <div className="mf-bp-actions">
          <input
            ref={fileRef}
            type="file"
            accept=".json,.mfplugin.json,.js"
            style={{ display: 'none' }}
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) void importPluginFile(f)
              e.target.value = ''
            }}
          />
          <button type="button" className="mf-btn" onClick={() => fileRef.current?.click()}>
            <Upload size={12} /> Import .mfplugin.json
          </button>
          <button type="button" className="mf-btn" onClick={exportPluginFile}>
            <Download size={12} /> Export
          </button>
          <button type="button" className="mf-primary" style={{ padding: '4px 10px', fontSize: 11.5 }} onClick={validateCode}>
            <CheckCircle2 size={12} /> Validate Syntax
          </button>
        </div>
      </div>

      {checkMsg && (
        <div
          style={{
            padding: '6px 12px',
            fontSize: 12,
            background: checkMsg.ok ? 'rgba(87,209,99,0.12)' : 'rgba(229,83,75,0.16)',
            color: checkMsg.ok ? '#7ee787' : '#ff7b72',
            borderBottom: '1px solid #2b323b',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          {checkMsg.ok ? <CheckCircle2 size={13} /> : <AlertTriangle size={13} />}
          {checkMsg.text}
        </div>
      )}

      {tab === 'code' ? (
        <div style={{ display: 'grid', gridTemplateColumns: '250px minmax(0, 1fr)', flex: 1, minHeight: 0 }}>
          <aside className="mf-bp-sidebar">
            <label className="mf-bp-check" style={{ fontWeight: 700, color: manifest.enabled ? '#7ee787' : '#9aa7b8' }}>
              <input
                type="checkbox"
                checked={manifest.enabled}
                onChange={(e) => commit({ enabled: e.target.checked })}
              />
              Plugin Enabled
            </label>
            <Field label="Plugin ID">
              <input value={manifest.id} onChange={(e) => commit({ id: e.target.value })} />
            </Field>
            <Field label="Name">
              <input value={manifest.name} onChange={(e) => commit({ name: e.target.value })} />
            </Field>
            <Field label="Version">
              <input value={manifest.version} onChange={(e) => commit({ version: e.target.value })} />
            </Field>
            <Field label="Author">
              <input value={manifest.author} onChange={(e) => commit({ author: e.target.value })} />
            </Field>
            <Field label="Category">
              <select value={manifest.category} onChange={(e) => commit({ category: e.target.value as any })}>
                <option value="gameplay">Gameplay</option>
                <option value="editor">Editor Tool</option>
                <option value="ui">UI / HUD</option>
                <option value="graphics">Graphics</option>
                <option value="audio">Audio</option>
                <option value="utility">Utility</option>
              </select>
            </Field>
            <Field label="Description">
              <textarea
                rows={4}
                value={manifest.description}
                onChange={(e) => commit({ description: e.target.value })}
                style={{ width: '100%', fontSize: 11.5 }}
              />
            </Field>
          </aside>

          <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            <textarea
              spellCheck={false}
              value={manifest.code}
              onChange={(e) => commit({ code: e.target.value })}
              style={{
                flex: 1,
                width: '100%',
                resize: 'none',
                border: 'none',
                outline: 'none',
                padding: 14,
                background: '#0d1117',
                color: '#e6edf3',
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
                fontSize: 12.5,
                lineHeight: 1.55,
              }}
            />
          </div>
        </div>
      ) : (
        <div style={{ padding: 14, overflowY: 'auto', display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12 }}>
          {EXAMPLE_PLUGINS.map((ex) => {
            const installed = p.assets.some(
              (x) => x.type === 'plugin' && parsePluginManifest(x.data).id === ex.id,
            )
            return (
              <div
                key={ex.id}
                style={{
                  border: '1px solid #2b323b',
                  borderRadius: 8,
                  padding: 12,
                  background: '#171d26',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <strong style={{ fontSize: 13, color: '#eef3f8' }}>{ex.name}</strong>
                  <span style={{ fontSize: 10.5, padding: '2px 7px', borderRadius: 99, background: 'rgba(88,166,255,0.16)', color: '#7cc7ff' }}>
                    {ex.category}
                  </span>
                </div>
                <p style={{ margin: 0, fontSize: 12, color: '#9aa7b8', lineHeight: 1.45 }}>{ex.description}</p>
                <div style={{ display: 'flex', gap: 6, marginTop: 'auto' }}>
                  <button
                    type="button"
                    className="mf-primary"
                    style={{ padding: '5px 10px', fontSize: 11.5 }}
                    onClick={() => installExample(ex)}
                  >
                    <Plus size={12} /> {installed ? 'Reinstall in Project' : 'Install to Project'}
                  </button>
                  <button
                    type="button"
                    className="mf-btn"
                    style={{ fontSize: 11.5 }}
                    onClick={() => {
                      commit(ex)
                      setTab('code')
                    }}
                  >
                    Load into Editor
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
