import { useMemo, useRef, useState } from 'react'
import {
  Puzzle,
  Plus,
  Download,
  Upload,
  CheckCircle2,
  AlertTriangle,
  Sparkles,
  Trash2,
  Code2,
  Power,
} from 'lucide-react'
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

export function PluginManagerPanel({
  p,
  edit,
  onOpenAsset,
}: {
  p: Project
  edit: (fn: (proj: Project) => void) => void
  onOpenAsset?: (assetId: string) => void
}) {
  const [statusMsg, setStatusMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const fileRef = useRef<HTMLInputElement | null>(null)

  const installedAssets = useMemo(
    () =>
      p.assets
        .filter((a) => a.type === 'plugin')
        .map((asset) => ({ asset, manifest: parsePluginManifest(asset.data) })),
    [p.assets],
  )

  const installedIds = useMemo(
    () => new Set(installedAssets.map((x) => x.manifest.id)),
    [installedAssets],
  )

  const availableExamples = useMemo(
    () => EXAMPLE_PLUGINS.filter((ex) => !installedIds.has(ex.id)),
    [installedIds],
  )

  const installExample = (ex: PluginManifest) => {
    const newId = uid('plugin')
    edit((proj) => {
      const existing = proj.assets.find(
        (x) => x.type === 'plugin' && parsePluginManifest(x.data).id === ex.id,
      )
      if (existing) {
        existing.data = JSON.stringify({ ...ex, enabled: true }, null, 2)
        existing.name = ex.name
      } else {
        proj.assets.push({
          id: newId,
          name: ex.name,
          type: 'plugin',
          data: JSON.stringify({ ...ex, enabled: true }, null, 2),
          properties: {},
        })
      }
    })
    setStatusMsg({ ok: true, text: `Installed "${ex.name}"` })
  }

  const toggleEnabled = (assetId: string, enabled: boolean) => {
    edit((proj) => {
      const target = proj.assets.find((x) => x.id === assetId)
      if (!target) return
      const m = parsePluginManifest(target.data)
      target.data = JSON.stringify({ ...m, enabled }, null, 2)
    })
  }

  const uninstallPlugin = (assetId: string, name: string) => {
    edit((proj) => {
      proj.assets = proj.assets.filter((x) => x.id !== assetId)
    })
    setStatusMsg({ ok: true, text: `Uninstalled "${name}"` })
  }

  const createCustomPlugin = () => {
    const id = uid('plugin')
    const manifest = makeDefaultPlugin('My Custom Plugin')
    edit((proj) => {
      proj.assets.push({
        id,
        name: manifest.name,
        type: 'plugin',
        data: JSON.stringify(manifest, null, 2),
        properties: {},
      })
    })
    setStatusMsg({ ok: true, text: `Created "${manifest.name}"` })
    onOpenAsset?.(id)
  }

  const importPluginFile = async (file: File) => {
    try {
      const text = await file.text()
      const parsed: PluginManifest = file.name.endsWith('.json')
        ? parsePluginManifest(text)
        : { ...makeDefaultPlugin(file.name.replace(/\.[^.]+$/, '')), code: text }
      const newId = uid('plugin')
      edit((proj) => {
        const existing = proj.assets.find(
          (x) => x.type === 'plugin' && parsePluginManifest(x.data).id === parsed.id,
        )
        if (existing) {
          existing.name = parsed.name
          existing.data = JSON.stringify(parsed, null, 2)
        } else {
          proj.assets.push({
            id: newId,
            name: parsed.name,
            type: 'plugin',
            data: JSON.stringify(parsed, null, 2),
            properties: {},
          })
        }
      })
      setStatusMsg({ ok: true, text: `Imported "${parsed.name}" v${parsed.version}` })
    } catch (err) {
      setStatusMsg({ ok: false, text: 'Invalid plugin file: ' + String(err) })
    }
  }

  const exportPluginFile = (manifest: PluginManifest) => {
    const blob = new Blob([JSON.stringify(manifest, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${manifest.id || 'plugin'}.mfplugin.json`
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxHeight: '76vh', overflowY: 'auto', padding: 4 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <div style={{ fontSize: 12, color: '#9aa7b8' }}>
          Installed: <strong style={{ color: '#7ee787' }}>{installedAssets.length}</strong> · Available:{' '}
          <strong style={{ color: '#7cc7ff' }}>{availableExamples.length}</strong>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
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
          <button type="button" className="mf-primary" style={{ padding: '5px 10px', fontSize: 11.5 }} onClick={createCustomPlugin}>
            <Plus size={12} /> New Custom Plugin
          </button>
        </div>
      </div>

      {statusMsg && (
        <div
          style={{
            padding: '7px 12px',
            borderRadius: 8,
            fontSize: 12,
            background: statusMsg.ok ? 'rgba(87,209,99,0.12)' : 'rgba(229,83,75,0.16)',
            color: statusMsg.ok ? '#7ee787' : '#ff7b72',
            border: '1px solid #2b323b',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          {statusMsg.ok ? <CheckCircle2 size={13} /> : <AlertTriangle size={13} />}
          {statusMsg.text}
        </div>
      )}

      {/* Section 1: Installed Plugins */}
      <section style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: 700, color: '#7ee787', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
          <CheckCircle2 size={14} /> Installed Plugins ({installedAssets.length})
        </div>
        {installedAssets.length === 0 ? (
          <div style={{ border: '1px dashed #2b323b', borderRadius: 8, padding: 14, fontSize: 12, color: '#8b9bb0' }}>
            No plugins installed in this project yet. Install one from the catalog below or create a custom plugin.
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
            {installedAssets.map(({ asset, manifest }) => (
              <div
                key={asset.id}
                style={{
                  border: manifest.enabled ? '1px solid rgba(126,231,135,0.35)' : '1px solid #2b323b',
                  borderRadius: 8,
                  padding: 12,
                  background: '#151c25',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6 }}>
                  <strong style={{ fontSize: 13, color: '#eef3f8' }}>
                    {manifest.name}{' '}
                    <span style={{ fontSize: 10.5, fontWeight: 500, color: '#8b9bb0' }}>v{manifest.version}</span>
                  </strong>
                  <span
                    style={{
                      fontSize: 10,
                      padding: '2px 7px',
                      borderRadius: 99,
                      background: manifest.enabled ? 'rgba(87,209,99,0.18)' : 'rgba(148,163,184,0.16)',
                      color: manifest.enabled ? '#7ee787' : '#94a3b8',
                    }}
                  >
                    {manifest.enabled ? 'Active' : 'Disabled'}
                  </span>
                </div>
                <p style={{ margin: 0, fontSize: 12, color: '#9aa7b8', lineHeight: 1.45 }}>
                  {manifest.description || 'Custom Miniforge plugin'}
                </p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 'auto' }}>
                  <button
                    type="button"
                    className="mf-btn"
                    style={{ fontSize: 11.5 }}
                    onClick={() => toggleEnabled(asset.id, !manifest.enabled)}
                  >
                    <Power size={12} /> {manifest.enabled ? 'Disable' : 'Enable'}
                  </button>
                  {onOpenAsset && (
                    <button
                      type="button"
                      className="mf-btn"
                      style={{ fontSize: 11.5 }}
                      onClick={() => onOpenAsset(asset.id)}
                    >
                      <Code2 size={12} /> Edit Code
                    </button>
                  )}
                  <button
                    type="button"
                    className="mf-btn"
                    style={{ fontSize: 11.5 }}
                    onClick={() => exportPluginFile(manifest)}
                  >
                    <Download size={12} /> Export
                  </button>
                  <button
                    type="button"
                    className="mf-btn"
                    style={{ fontSize: 11.5, color: '#ff7b72', borderColor: 'rgba(255,123,114,0.35)' }}
                    onClick={() => uninstallPlugin(asset.id, manifest.name)}
                  >
                    <Trash2 size={12} /> Uninstall
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Section 2: Available (Not Installed) Plugins */}
      <section style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: 700, color: '#7cc7ff', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
          <Sparkles size={14} /> Available / Not Installed ({availableExamples.length})
        </div>
        {availableExamples.length === 0 ? (
          <div style={{ border: '1px dashed #2b323b', borderRadius: 8, padding: 14, fontSize: 12, color: '#8b9bb0' }}>
            All built-in example plugins are already installed in this project.
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
            {availableExamples.map((ex) => (
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
                    <Plus size={12} /> Install to Project
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

export function PluginEditor({
  a,
  p,
  changeA,
  edit,
  onOpenAsset,
}: {
  a: Asset
  p: Project
  changeA: (fn: (asset: Asset) => void) => void
  edit: (fn: (proj: Project) => void) => void
  onOpenAsset?: (assetId: string) => void
}) {
  const manifest: PluginManifest = useMemo(() => parsePluginManifest(a.data), [a.data])
  const [tab, setTab] = useState<'code' | 'manager'>('code')
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

  const installedCount = p.assets.filter((x) => x.type === 'plugin').length

  return (
    <div className="mf-bp-editor">
      <div className="mf-bp-toolbar">
        <div className="mf-bp-tabs">
          <button type="button" className={'mf-bp-tab' + (tab === 'code' ? ' active' : '')} onClick={() => setTab('code')}>
            <Puzzle size={13} /> Plugin Code &amp; Manifest
          </button>
          <button type="button" className={'mf-bp-tab' + (tab === 'manager' ? ' active' : '')} onClick={() => setTab('manager')}>
            <Sparkles size={13} /> Installed &amp; Available ({installedCount})
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
        <div style={{ padding: 14, overflowY: 'auto' }}>
          <PluginManagerPanel p={p} edit={edit} onOpenAsset={onOpenAsset} />
        </div>
      )}
    </div>
  )
}
