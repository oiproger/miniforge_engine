import React, { useState } from 'react'
import { Settings2, Upload, RotateCcw, Monitor, Globe, Package } from 'lucide-react'
import {
  defaultExportSettings,
  type ExportSettingsConfig,
  type Project,
} from '../../../packages/project-schema/src'
import { Field, Numeric } from './Fields'

export function ExportSettingsPanel({
  p,
  edit,
  localTemplates,
  onPickLocalTemplate,
}: {
  p: Project
  edit: (fn: (project: Project) => void) => void
  localTemplates: Partial<Record<'windows' | 'macos' | 'linux', { name: string; bytes: Uint8Array }>>
  onPickLocalTemplate: (platform: 'windows' | 'macos' | 'linux', file: File) => void
}) {
  const cfg: ExportSettingsConfig = {
    ...defaultExportSettings(p),
    ...(p.settings.export || {}),
  }

  const [iconErr, setIconErr] = useState('')

  const patchCfg = (patch: Partial<ExportSettingsConfig>) => {
    edit((n) => {
      n.settings.export = {
        ...defaultExportSettings(n),
        ...(n.settings.export || {}),
        ...patch,
      }
    })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxHeight: '72vh', overflowY: 'auto', paddingRight: 4 }}>
      {/* App Identity */}
      <div style={{ border: '1px solid #2b323b', borderRadius: 8, padding: 12, background: '#161b22', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <strong style={{ fontSize: 12.5, display: 'inline-flex', alignItems: 'center', gap: 6, color: '#f3a05d' }}>
          <Settings2 size={13} /> Application Identity
        </strong>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <Field label="App Name">
            <input
              value={cfg.appName}
              placeholder={p.name}
              onChange={(e) => patchCfg({ appName: e.target.value })}
            />
          </Field>
          <Field label="Version (SemVer)">
            <input
              value={cfg.version}
              placeholder="1.0.0"
              onChange={(e) => patchCfg({ version: e.target.value })}
            />
          </Field>
          <Field label="Bundle Identifier">
            <input
              value={cfg.identifier}
              placeholder="dev.miniforge.game.mygame"
              onChange={(e) => patchCfg({ identifier: e.target.value })}
            />
          </Field>
          <Field label="Author / Studio">
            <input
              value={cfg.author || ''}
              placeholder="Indie Studio"
              onChange={(e) => patchCfg({ author: e.target.value })}
            />
          </Field>
        </div>

        {/* Custom App Icon */}
        <Field label="Application Icon (PNG recommended, 256×256 or 512×512)">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {cfg.iconDataUrl ? (
              <img
                src={cfg.iconDataUrl}
                alt="App Icon"
                style={{ width: 52, height: 52, borderRadius: 10, objectFit: 'cover', border: '1px solid #384452', background: '#0d1117' }}
              />
            ) : (
              <div
                style={{
                  width: 52,
                  height: 52,
                  borderRadius: 10,
                  border: '1px dashed #384452',
                  display: 'grid',
                  placeItems: 'center',
                  fontSize: 10,
                  color: '#8b9bb0',
                  textAlign: 'center',
                }}
              >
                Default
              </div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              <div style={{ display: 'flex', gap: 6 }}>
                <label className="mf-btn" style={{ fontSize: 11.5, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                  <Upload size={12} /> Upload Icon
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/x-icon"
                    style={{ display: 'none' }}
                    onChange={(e) => {
                      const file = e.target.files?.[0]
                      if (!file) return
                      if (file.size > 4 * 1024 * 1024) {
                        setIconErr('Icon must be under 4 MB')
                        return
                      }
                      setIconErr('')
                      const reader = new FileReader()
                      reader.onload = () => patchCfg({ iconDataUrl: String(reader.result || '') })
                      reader.readAsDataURL(file)
                    }}
                  />
                </label>
                {cfg.iconDataUrl && (
                  <button type="button" className="mf-btn" style={{ fontSize: 11.5 }} onClick={() => patchCfg({ iconDataUrl: '' })}>
                    <RotateCcw size={11} /> Reset
                  </button>
                )}
              </div>
              {iconErr && <span style={{ fontSize: 11, color: '#f87171' }}>{iconErr}</span>}
            </div>
          </div>
        </Field>
      </div>

      {/* Window Configuration */}
      <div style={{ border: '1px solid #2b323b', borderRadius: 8, padding: 12, background: '#161b22', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <strong style={{ fontSize: 12.5, display: 'inline-flex', alignItems: 'center', gap: 6, color: '#58b8ff' }}>
          <Monitor size={13} /> Desktop Window Settings
        </strong>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <Field label="Window Width (px)">
            <Numeric label="Width" value={cfg.windowWidth} min={320} max={3840} step={16} change={(v) => patchCfg({ windowWidth: Math.round(v) })} />
          </Field>
          <Field label="Window Height (px)">
            <Numeric label="Height" value={cfg.windowHeight} min={240} max={2160} step={16} change={(v) => patchCfg({ windowHeight: Math.round(v) })} />
          </Field>
        </div>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', paddingTop: 2 }}>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, cursor: 'pointer' }}>
            <input type="checkbox" checked={cfg.fullscreen} onChange={(e) => patchCfg({ fullscreen: e.target.checked })} />
            Start Fullscreen
          </label>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, cursor: 'pointer' }}>
            <input type="checkbox" checked={cfg.resizable} onChange={(e) => patchCfg({ resizable: e.target.checked })} />
            Resizable Window
          </label>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, cursor: 'pointer' }}>
            <input type="checkbox" checked={cfg.decorated} onChange={(e) => patchCfg({ decorated: e.target.checked })} />
            Show Titlebar / Frame
          </label>
        </div>
      </div>

      {/* Desktop Export Mode & Export Templates */}
      <div style={{ border: '1px solid #2b323b', borderRadius: 8, padding: 12, background: '#161b22', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <strong style={{ fontSize: 12.5, display: 'inline-flex', alignItems: 'center', gap: 6, color: '#7ee787' }}>
          <Package size={13} /> Desktop Packaging Mode (Export Templates)
        </strong>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <button
            type="button"
            className={cfg.desktopMode === 'template' ? 'mf-primary' : 'mf-btn'}
            style={{ padding: '8px 10px', fontSize: 12, textAlign: 'left' }}
            onClick={() => patchCfg({ desktopMode: 'template' })}
          >
            <div><strong>Instant Executable (Template)</strong></div>
            <div style={{ fontSize: 10.5, opacity: 0.85, marginTop: 2 }}>Packages prebuilt player + game/ in 1s (no Rust needed)</div>
          </button>
          <button
            type="button"
            className={cfg.desktopMode === 'source' ? 'mf-primary' : 'mf-btn'}
            style={{ padding: '8px 10px', fontSize: 12, textAlign: 'left' }}
            onClick={() => patchCfg({ desktopMode: 'source' })}
          >
            <div><strong>Tauri Source Project (.zip)</strong></div>
            <div style={{ fontSize: 10.5, opacity: 0.85, marginTop: 2 }}>Compile native installer (.exe/.dmg/.deb) on target OS</div>
          </button>
        </div>

        {cfg.desktopMode === 'template' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7, marginTop: 4 }}>
            <Field label="Export Templates Base URL (folder with miniforge-player-windows.exe / -macos / -linux)">
              <input
                value={cfg.templateBaseUrl || 'https://github.com/oiproger/miniforge_engine/releases/latest/download/'}
                placeholder="https://github.com/oiproger/miniforge_engine/releases/latest/download/"
                onChange={(e) => patchCfg({ templateBaseUrl: e.target.value })}
              />
            </Field>
            <div style={{ fontSize: 11, color: '#9aa7b8' }}>
              Or load a local prebuilt player binary for offline instant export:
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
              {(['windows', 'macos', 'linux'] as const).map((plat) => (
                <label
                  key={plat}
                  className="mf-btn"
                  style={{
                    fontSize: 11,
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 3,
                    padding: '6px 8px',
                    borderColor: localTemplates[plat] ? '#22c55e' : undefined,
                  }}
                >
                  <span style={{ textTransform: 'capitalize', fontWeight: 600 }}>{plat} Player</span>
                  <span style={{ fontSize: 10, color: localTemplates[plat] ? '#7ee787' : '#8b9bb0' }}>
                    {localTemplates[plat] ? `Loaded (${(localTemplates[plat]!.bytes.length / 1e6).toFixed(1)} MB)` : 'Pick file…'}
                  </span>
                  <input
                    type="file"
                    style={{ display: 'none' }}
                    onChange={(e) => {
                      const f = e.target.files?.[0]
                      if (f) onPickLocalTemplate(plat, f)
                    }}
                  />
                </label>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Performance: Event Graph Nativization */}
      <div style={{ border: '1px solid #2b323b', borderRadius: 8, padding: 12, background: '#161b22', display: 'flex', flexDirection: 'column', gap: 6 }}>
        <strong style={{ fontSize: 12.5, display: 'inline-flex', alignItems: 'center', gap: 6, color: '#fbbf24' }}>
          Event Graph Nativization (AOT JS Compiler)
        </strong>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 12.5, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={Boolean(cfg.nativizeEventGraphs)}
            onChange={(e) => patchCfg({ nativizeEventGraphs: e.target.checked })}
          />
          <span><strong>Compile Event Graphs to native JavaScript on export</strong></span>
        </label>
        <div style={{ fontSize: 11, color: '#9aa7b8', lineHeight: 1.45 }}>
          Replaces the runtime graph interpreter with ahead-of-time compiled ES modules during export (Web, Yandex Games, Poki, Desktop). Faster loop execution, zero <code>eval()</code>, 100% CSP-safe. Editor Play preview continues using the live interpreter for instant iteration.
        </div>
      </div>

      {/* Web Meta */}
      <div style={{ border: '1px solid #2b323b', borderRadius: 8, padding: 12, background: '#161b22', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <strong style={{ fontSize: 12.5, display: 'inline-flex', alignItems: 'center', gap: 6, color: '#cbd5e1' }}>
          <Globe size={13} /> Web / HTML5 Settings
        </strong>
        <Field label="Page Background Color">
          <input
            type="color"
            value={cfg.webBackground || '#0d1117'}
            onChange={(e) => patchCfg({ webBackground: e.target.value })}
            style={{ width: 64, height: 28, padding: 2 }}
          />
        </Field>
      </div>
    </div>
  )
}
