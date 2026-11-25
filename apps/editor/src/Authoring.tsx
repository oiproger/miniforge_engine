import { captureProjectThumbnail } from './ProjectHub'
import { makeDefaultPlugin } from '../../../packages/project-schema/src'
import { PluginEditor, PluginManagerPanel } from './PluginManager'
import { MaterialPreview } from './MaterialPreview'
import { ShaderStudio } from './ShaderStudio'
import { makeDefaultDialogueGraph, makeDefaultSequence } from '../../../packages/project-schema/src'
import { MeshBuilder, defaultMeshBuilderRecipe, buildRecipeToGlbDataUrl } from './MeshBuilder'
import { PaintEditor } from './PaintEditor'
import { SoundSynth } from './SoundSynth'
import { DialogueEditor } from './DialogueEditor'
import { SequencerEditor } from './SequencerEditor'
import { makeDefaultEventGraph } from '../../../packages/project-schema/src'
import { lazy, Suspense, useEffect, useRef, useState, type ReactNode } from 'react'
import {
  X,
  Plus,
  Trash2,
  SlidersHorizontal,
  Check,
  Code2,
  Monitor,
  Languages,
  CircleDot,
  AlertTriangle,
  Flame,
  File,
  Import,
  Download,
} from 'lucide-react'
import { DEFAULT_DIALOGUE_SCREEN_ID, makeDialogueControls, makeDialogueScreen, getScene, uid, makeMaterial, makeParticleAsset, makeHtmlAsset, makeEntity, applyAutoStaticBatching, type Asset, type Project,
 } from '../../../packages/project-schema/src'
import InterfaceForm from './HudEditor'
import { Field, Numeric, Color } from './Fields'
import { ParticleEditor } from './ParticleEditor'
import { HtmlEditor } from './HtmlEditor'
import { PrefabEditor } from './PrefabEditor'
import { ModelEditor } from './ModelEditor'
import { EventGraphEditor } from './EventGraphEditor'
import { downloadAssetFile } from './io'
import { TextureGenerator, defaultProceduralTexture, renderProceduralTextureDataUrl } from './TextureGenerator'
import {
 } from '../../../packages/runtime/src/touch'
import { defaultScript, AssetSelect } from './Inspector'
import { shaders, checkShader } from './shaderTemplates'
import { materialPresets, generateProceduralTextures, type ProceduralPattern } from './materialTextures'

const CodeEditor = lazy(() => import('./CodeEditor'))
type Edit = (fn: (p: Project) => void) => void
const presets: Record<string, Record<string, unknown>> = {
  Default: { background: '#242b35', ambient: 1.3, exposure: 1, shadows: true, fogDensity: 0 },
  Outdoor: {
    background: '#a6c6df',
    ambient: 1.7,
    exposure: 1.15,
    shadows: true,
    fogDensity: 0.008,
    fogColor: '#a6c6df',
  },
  Sunset: {
    background: '#da987f',
    ambient: 1.1,
    exposure: 1.05,
    shadows: true,
    fogDensity: 0.018,
    fogColor: '#d99983',
  },
  Night: {
    background: '#141c38',
    ambient: 0.45,
    exposure: 0.7,
    shadows: true,
    fogDensity: 0.02,
    fogColor: '#202b48',
  },
  Unlit: {
    background: '#31343c',
    ambient: 3,
    exposure: 1,
    shadows: false,
    fogDensity: 0,
    toneMapping: 'none',
  },
  'Mobile Low': {
    background: '#28343d',
    ambient: 1,
    exposure: 1,
    shadows: false,
    fogDensity: 0,
    resolutionScale: 0.8,
    pixelRatioLimit: 1,
  },
  'PGT Overcast': {
    background: '#7b8790',
    ambient: 1.15,
    ambientColor: '#aeb8c0',
    sunColor: '#dde3e6',
    sunIntensity: 0.75,
    exposure: 0.95,
    shadows: true,
    fogDensity: 0.028,
    fogColor: '#88949c',
    skyEnabled: true,
    skyTopColor: '#54616b',
    skyHorizonColor: '#96a2aa',
    skyBottomColor: '#3b4248',
  },
  'PGT Dusk': {
    background: '#2a2d3b',
    ambient: 0.65,
    ambientColor: '#69748c',
    sunColor: '#e89a6b',
    sunIntensity: 0.85,
    exposure: 0.85,
    shadows: true,
    fogDensity: 0.032,
    fogColor: '#3e4354',
    skyEnabled: true,
    skyTopColor: '#1c2338',
    skyHorizonColor: '#7d5c5a',
    skyBottomColor: '#1a1d24',
  },
  'PGT Foggy Night': {
    background: '#0e141c',
    ambient: 0.32,
    ambientColor: '#46586e',
    sunColor: '#7a96b8',
    sunIntensity: 0.35,
    exposure: 0.72,
    shadows: true,
    fogDensity: 0.055,
    fogColor: '#151e29',
    skyEnabled: true,
    skyTopColor: '#080c12',
    skyHorizonColor: '#1c2736',
    skyBottomColor: '#090c10',
  },
  'Anomaly Shift': {
    background: '#18221e',
    ambient: 0.7,
    ambientColor: '#7ea892',
    sunColor: '#c4ff9e',
    sunIntensity: 0.9,
    exposure: 0.9,
    shadows: true,
    fogDensity: 0.045,
    fogColor: '#22332c',
    skyEnabled: true,
    skyTopColor: '#11211b',
    skyHorizonColor: '#3d594c',
    skyBottomColor: '#0d1411',
  },
}
function SettingsGroup({ title, open = false, children }: { title: string; open?: boolean; children: ReactNode }) {
  return (
    <details className="mf-settings-group" open={open}>
      <summary>{title}</summary>
      <div className="mf-settings-body">{children}</div>
    </details>
  )
}
function Settings({ p, edit }: { p: Project; edit: Edit }) {
  const env = getScene(p).environment
  const patch = (k: string, v: unknown) =>
    edit((n) => {
      getScene(n).environment[k] = v
    })
  return (
    <>
      <SettingsGroup title="Project" open>
        <div className="mf-form-grid">
          <Field label="Name">
            <input value={p.name} onChange={(e) => edit((n) => (n.name = e.target.value))} />
          </Field>
          <Field label="Description">
            <textarea
              rows={2}
              placeholder="Short description shown in Project Hub..."
              value={p.description || ''}
              onChange={(e) => edit((n) => (n.description = e.target.value))}
              style={{ width: '100%', resize: 'vertical', fontFamily: 'inherit', fontSize: 12 }}
            />
          </Field>
          <Field label="Project image (Thumbnail)">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {p.thumbnail ? (
                <img
                  src={p.thumbnail}
                  alt="Project thumbnail"
                  style={{ width: 220, height: 124, objectFit: 'cover', borderRadius: 6, border: '1px solid #30363d' }}
                />
              ) : (
                <div style={{ width: 220, height: 76, borderRadius: 6, border: '1px dashed #30363d', display: 'grid', placeItems: 'center', fontSize: 11, color: '#8b9bb0' }}>
                  Auto-generated from 3D scene
                </div>
              )}
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <label className="mf-btn" style={{ fontSize: 11, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  Upload Image
                  <input
                    type="file"
                    accept="image/*"
                    style={{ display: 'none' }}
                    onChange={(e) => {
                      const file = e.target.files?.[0]
                      if (!file) return
                      const reader = new FileReader()
                      reader.onload = () => edit((n) => (n.thumbnail = String(reader.result || '')))
                      reader.readAsDataURL(file)
                    }}
                  />
                </label>
                <button
                  type="button"
                  className="mf-btn"
                  style={{ fontSize: 11 }}
                  onClick={() => {
                    void captureProjectThumbnail(p).then((url) => edit((n) => (n.thumbnail = url)))
                  }}
                >
                  Capture 3D Screenshot
                </button>
                {p.thumbnail && (
                  <button
                    type="button"
                    className="mf-btn"
                    style={{ fontSize: 11 }}
                    onClick={() => edit((n) => { delete n.thumbnail })}
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>
          </Field>
          <Field label="Game duration (s)">
            <Numeric
              label="Game duration"
              value={p.settings.duration}
              min={1}
              step={1}
              change={(v) => edit((n) => (n.settings.duration = v))}
            />
          </Field>
          <Field label="Fallback language">
            <select
              value={p.settings.language}
              onChange={(e) => edit((n) => (n.settings.language = e.target.value))}
            >
              {Object.keys(p.locales).map((k) => (
                <option key={k}>{k}</option>
              ))}
            </select>
          </Field>
          <Field label="Dialogue UI screen">
            <select
              value={p.settings.dialogueScreen || ''}
              onChange={(e) => {
                const val = e.target.value
                edit((n) => {
                  n.settings.dialogueScreen = val || undefined
                  if (val === DEFAULT_DIALOGUE_SCREEN_ID) {
                    n.screens ??= []
                    if (!n.screens.some((sc) => sc.id === DEFAULT_DIALOGUE_SCREEN_ID)) {
                      n.screens.push(makeDialogueScreen())
                      n.ui.push(...makeDialogueControls(DEFAULT_DIALOGUE_SCREEN_ID))
                    }
                  }
                })
              }}
            >
              <option value="">Auto (Dialogue screen or built-in)</option>
              <option value="builtin">Built-in Overlay (default)</option>
              <option value={DEFAULT_DIALOGUE_SCREEN_ID}>Dialogue (UI Editor screen)</option>
              {(p.screens || [])
                .filter((sc) => sc.phase === 'window' && sc.id !== DEFAULT_DIALOGUE_SCREEN_ID)
                .map((sc) => (
                  <option key={sc.id} value={sc.id}>
                    {sc.name} ({sc.id})
                  </option>
                ))}
            </select>
          </Field>
        </div>
      </SettingsGroup>

      <SettingsGroup title="Atmosphere & Sky" open>
        <div className="mf-presets">
          {Object.keys(presets).map((k) => (
            <button key={k} onClick={() => edit((n) => Object.assign(getScene(n).environment, presets[k]))}>
              {k}
            </button>
          ))}
        </div>
        <div className="mf-form-grid">
          {['background', 'fogColor'].map((k) => (
            <Field label={k === 'background' ? 'Background' : 'Fog color'} key={k}>
              <Color label={k} value={env[k] || '#222b35'} change={(v) => patch(k, v)} />
            </Field>
          ))}
          <Field label="Fog density">
            <Numeric label="Fog density" value={env.fogDensity ?? 0} min={0} max={1} step={0.005} change={(v) => patch('fogDensity', v)} />
          </Field>
          <Field label="Depth fog">
            <input type="checkbox" checked={Boolean(env.fogDepth)} onChange={(e) => patch('fogDepth', e.target.checked)} />
          </Field>
          <Field label="Fog fade start">
            <Numeric label="Fog fade start" value={env.fogFadeStart ?? 0} min={0} max={300} step={1} change={(v) => patch('fogFadeStart', v)} />
          </Field>
          <Field label="Fog fade end">
            <Numeric label="Fog fade end" value={env.fogFadeEnd ?? 0} min={0} max={400} step={1} change={(v) => patch('fogFadeEnd', v)} />
          </Field>
          <Field label="Sky asset">
            <AssetSelect assets={p.assets} type="skybox" label="Sky asset" value={env.skyAsset || ''} change={(v) => patch('skyAsset', v || undefined)} />
          </Field>
          <Field label="Sky enabled">
            <input type="checkbox" checked={Boolean(env.skyEnabled)} onChange={(e) => patch('skyEnabled', e.target.checked)} />
          </Field>
          {env.skyEnabled && !env.skyAsset && (
            <>
              <Field label="Sky mode">
                <select value={env.skyMode || 'gradient'} onChange={(e) => patch('skyMode', e.target.value)}>
                  <option value="gradient">Sky Dome (Gradient)</option>
                  <option value="procedural">Procedural (Clouds + Stars)</option>
                  <option value="cubemap">Skybox (6 Sides)</option>
                </select>
              </Field>
              {(env.skyMode || 'gradient') !== 'cubemap' && (
                <>
                  <Field label="Sky top">
                    <Color label="Sky top" value={env.skyTopColor || '#3a536b'} change={(v) => patch('skyTopColor', v)} />
                  </Field>
                  <Field label="Sky horizon">
                    <Color label="Sky horizon" value={env.skyHorizonColor || '#8c99a3'} change={(v) => patch('skyHorizonColor', v)} />
                  </Field>
                  <Field label="Sky bottom">
                    <Color label="Sky bottom" value={env.skyBottomColor || '#262b30'} change={(v) => patch('skyBottomColor', v)} />
                  </Field>
                </>
              )}
              {env.skyMode === 'procedural' && (
                <>
                  <Field label="Cloud color">
                    <Color label="Cloud color" value={env.skyCloudColor || '#e4ebf0'} change={(v) => patch('skyCloudColor', v)} />
                  </Field>
                  <Field label="Cloud coverage">
                    <Numeric label="Cloud coverage" value={env.skyCloudCoverage ?? 0.48} min={0} max={1} step={0.05} change={(v) => patch('skyCloudCoverage', v)} />
                  </Field>
                  <Field label="Cloud speed">
                    <Numeric label="Cloud speed" value={env.skyCloudSpeed ?? 0.035} min={0} max={0.5} step={0.005} change={(v) => patch('skyCloudSpeed', v)} />
                  </Field>
                  <Field label="Cloud scale">
                    <Numeric label="Cloud scale" value={env.skyCloudScale ?? 1.8} min={0.2} max={8} step={0.1} change={(v) => patch('skyCloudScale', v)} />
                  </Field>
                  <Field label="Sun sharpness">
                    <Numeric label="Sun sharpness" value={env.skySunSize ?? 72} min={8} max={256} step={4} change={(v) => patch('skySunSize', v)} />
                  </Field>
                  <Field label="Star intensity">
                    <Numeric label="Star intensity" value={env.skyStarIntensity ?? 0} min={0} max={1} step={0.05} change={(v) => patch('skyStarIntensity', v)} />
                  </Field>
                </>
              )}
              {env.skyMode === 'cubemap' &&
                ([
                  ['px', 'Right (+X)'],
                  ['nx', 'Left (-X)'],
                  ['py', 'Top (+Y)'],
                  ['ny', 'Bottom (-Y)'],
                  ['pz', 'Front (+Z)'],
                  ['nz', 'Back (-Z)'],
                ] as const).map(([faceKey, label]) => {
                  const face = env.skyFaces?.[faceKey] || {}
                  const setFace = (upd: Record<string, unknown>) =>
                    patch('skyFaces', { ...(env.skyFaces || {}), [faceKey]: { ...face, ...upd } })
                  return (
                    <Field key={faceKey} label={label}>
                      <div className="mf-pair">
                        <AssetSelect assets={p.assets} type="texture" label={label + ' texture'} value={face.texture || ''} change={(t) => setFace({ texture: t || undefined })} />
                        <Color label={label + ' color'} value={face.color || '#8fa6b8'} change={(col) => setFace({ color: col })} />
                      </div>
                    </Field>
                  )
                })}
              <Field label="Save sky asset">
                <button
                  type="button"
                  className="mf-secondary"
                  onClick={() => {
                    const skyId = uid('sky')
                    edit((n) => {
                      n.assets.push({
                        id: skyId,
                        name: (env.skyMode === 'cubemap' ? 'Skybox' : env.skyMode === 'procedural' ? 'Procedural Sky' : 'Gradient Sky') + ' Asset',
                        type: 'skybox',
                        data: '',
                        properties: {
                          mode: env.skyMode || 'gradient',
                          topColor: env.skyTopColor || '#3a536b',
                          horizonColor: env.skyHorizonColor || '#8c99a3',
                          bottomColor: env.skyBottomColor || '#262b30',
                          sunColor: env.sunColor || '#fff1cc',
                          sunSize: env.skySunSize ?? 72,
                          cloudColor: env.skyCloudColor || '#e4ebf0',
                          cloudCoverage: env.skyCloudCoverage ?? 0.48,
                          cloudSpeed: env.skyCloudSpeed ?? 0.035,
                          cloudScale: env.skyCloudScale ?? 1.8,
                          starIntensity: env.skyStarIntensity ?? 0,
                          faces: structuredClone(env.skyFaces || {}),
                        },
                      })
                      getScene(n).environment.skyAsset = skyId
                    })
                  }}
                >
                  Save as Skybox Asset
                </button>
              </Field>
            </>
          )}
        </div>
      </SettingsGroup>

      <SettingsGroup title="Lighting, Shadows & Render Quality">
        <div className="mf-form-grid">
          <Field label="Ambient light">
            <Numeric label="Ambient light" value={env.ambient ?? 1} min={0} max={10} step={0.1} change={(v) => patch('ambient', v)} />
          </Field>
          <Field label="Ambient color">
            <Color label="Ambient color" value={env.ambientColor || '#c8cfda'} change={(v) => patch('ambientColor', v)} />
          </Field>
          <Field label="Hemisphere ground">
            <Color label="Ambient ground color" value={env.ambientGroundColor || '#2a2d30'} change={(v) => patch('ambientGroundColor', v)} />
          </Field>
          <Field label="Ground bounce">
            <Numeric label="Ground bounce" value={env.ambientGroundIntensity ?? 0.5} min={0} max={3} step={0.05} change={(v) => patch('ambientGroundIntensity', v)} />
          </Field>
          <Field label="Sun color">
            <Color label="Sun color" value={env.sunColor || '#fff3d9'} change={(v) => patch('sunColor', v)} />
          </Field>
          <Field label="Sun intensity">
            <Numeric label="Sun intensity" value={env.sunIntensity ?? 1} min={0} max={5} step={0.1} change={(v) => patch('sunIntensity', v)} />
          </Field>
          <Field label="Exposure">
            <Numeric label="Exposure" value={env.exposure ?? 1} min={0.05} max={5} step={0.05} change={(v) => patch('exposure', v)} />
          </Field>
          <Field label="Shadows">
            <input type="checkbox" checked={env.shadows !== false} onChange={(e) => patch('shadows', e.target.checked)} />
          </Field>
          <Field label="Shadow quality">
            <select value={env.shadowQuality || 'medium'} onChange={(e) => patch('shadowQuality', e.target.value)}>
              {['low', 'medium', 'high'].map((k) => (
                <option key={k}>{k}</option>
              ))}
            </select>
          </Field>
          <Field label="Shadow range">
            <Numeric label="Shadow range" value={env.shadowRange ?? 40} min={5} max={200} step={5} change={(v) => patch('shadowRange', v)} />
          </Field>
          <Field label="Shadow softness">
            <Numeric label="Shadow softness" value={env.shadowSoftness ?? 1} min={0} max={4} step={0.1} change={(v) => patch('shadowSoftness', v)} />
          </Field>
          <Field label="Shadow bias">
            <Numeric label="Shadow bias" value={env.shadowBias ?? 0.003} min={0} max={0.05} step={0.001} change={(v) => patch('shadowBias', v)} />
          </Field>
          <Field label="Shadows follow camera">
            <input type="checkbox" checked={Boolean(env.shadowFollowCamera)} onChange={(e) => patch('shadowFollowCamera', e.target.checked)} />
          </Field>
          <Field label="Soft shadow Y">
            <Numeric label="Soft shadow Y" value={env.softShadowHeight ?? 0} min={-50} max={50} step={0.1} change={(v) => patch('softShadowHeight', v)} />
          </Field>
          <Field label="Anisotropy (1..16)">
            <select value={String(env.anisotropy ?? 4)} onChange={(e) => patch('anisotropy', Number(e.target.value))}>
              {['1', '2', '4', '8', '16'].map((k) => (
                <option key={k} value={k}>{k}x</option>
              ))}
            </select>
          </Field>
          <Field label="Mipmaps">
            <input type="checkbox" checked={env.mipmaps !== false} onChange={(e) => patch('mipmaps', e.target.checked)} />
          </Field>
          <Field label="Frustum culling">
            <input type="checkbox" checked={env.frustumCulling !== false} onChange={(e) => patch('frustumCulling', e.target.checked)} />
          </Field>
          <Field label="Sort transparent">
            <input type="checkbox" checked={env.sortTransparent !== false} onChange={(e) => patch('sortTransparent', e.target.checked)} />
          </Field>
          <Field label="Smooth shading">
            <input type="checkbox" checked={Boolean(env.smoothShading)} onChange={(e) => patch('smoothShading', e.target.checked)} />
          </Field>
          <Field label="Resolution scale">
            <Numeric label="Resolution scale" value={env.resolutionScale ?? 1} min={0.25} max={2} step={0.05} change={(v) => patch('resolutionScale', v)} />
          </Field>
          <Field label="Pixel ratio limit">
            <Numeric label="Pixel ratio limit" value={env.pixelRatioLimit ?? 1.6} min={0.5} max={4} step={0.1} change={(v) => patch('pixelRatioLimit', v)} />
          </Field>
        </div>
      </SettingsGroup>

      <SettingsGroup title="Global Light Baking & Reflections">
        <div className="mf-form-grid">
          <Field label="Bake static lighting">
            <input type="checkbox" checked={Boolean(env.bakedLighting)} onChange={(e) => patch('bakedLighting', e.target.checked)} />
          </Field>
          <Field label="Run bake">
            <button
              type="button"
              className="mf-secondary"
              onClick={() => {
                edit((n) => {
                  const e = getScene(n).environment
                  e.bakedLighting = true
                  if (!e.reflectionMode || e.reflectionMode === 'off') e.reflectionMode = 'baked'
                  e.lastBaked = new Date().toLocaleTimeString()
                })
              }}
            >
              Bake Lighting &amp; Reflections {env.lastBaked ? '(' + env.lastBaked + ')' : ''}
            </button>
          </Field>
          <Field label="Global reflections">
            <select value={env.reflectionMode || 'off'} onChange={(e) => patch('reflectionMode', e.target.value)}>
              <option value="off">Off</option>
              <option value="baked">Baked (Cubemap)</option>
              <option value="realtime">Realtime (Cubemap)</option>
            </select>
          </Field>
          {env.reflectionMode && env.reflectionMode !== 'off' && (
            <>
              <Field label="Reflection resolution">
                <select value={String(env.reflectionResolution ?? 128)} onChange={(e) => patch('reflectionResolution', Number(e.target.value))}>
                  <option value="64">64 px (Fast)</option>
                  <option value="128">128 px (Balanced)</option>
                  <option value="256">256 px (Crisp)</option>
                </select>
              </Field>
              {env.reflectionMode === 'realtime' && (
                <Field label="Update every N frames">
                  <Numeric label="Reflection interval" value={env.reflectionInterval ?? 4} min={1} max={60} step={1} change={(v) => patch('reflectionInterval', v)} />
                </Field>
              )}
            </>
          )}
        </div>
      </SettingsGroup>

      <SettingsGroup title="Post-Processing (WebGL2)">
        <div className="mf-form-grid">
          <Field label="Tone mapping">
            <select value={env.toneMapping || 'none'} onChange={(e) => patch('toneMapping', e.target.value)}>
              <option value="none">None (Fastest)</option>
              <option value="aces">ACES Filmic</option>
            </select>
          </Field>
          {(
            [
              ['ao', 'Ambient Occlusion (AO)', 0, 0, 1, 0.05],
              ['aoRadius', 'AO radius', 2.5, 1, 6, 0.25],
              ['dof', 'Depth of Field (DoF)', 0, 0, 1, 0.05],
              ['dofFocus', 'DoF focus Y', 0.5, 0, 1, 0.05],
              ['dofAperture', 'DoF focus band', 0.22, 0.05, 0.5, 0.02],
              ['bloom', 'Bloom glow', 0, 0, 2, 0.05],
              ['bloomThreshold', 'Bloom threshold', 0.72, 0.2, 1, 0.02],
              ['vignette', 'Vignette', 0, 0, 1, 0.05],
              ['chromatic', 'Chromatic aberration', 0, 0, 1, 0.05],
              ['grain', 'Film grain', 0, 0, 0.4, 0.02],
              ['scanlines', 'CRT scanlines', 0, 0, 1, 0.05],
              ['contrast', 'Contrast', 1, 0.5, 2, 0.05],
              ['saturation', 'Saturation', 1, 0, 2, 0.05],
            ] as const
          ).map(([k, label, def, min, max, step]) => (
            <Field key={k} label={label}>
              <Numeric label={label} value={env[k] ?? def} min={min} max={max} step={step} change={(v) => patch(k, v)} />
            </Field>
          ))}
        </div>
      </SettingsGroup>

      <SettingsGroup title="Performance & Optimization">
        {(() => {
          const perf = p.settings.performance || {}
          const activeScene = getScene(p)
          const batchedCount = activeScene.entities.filter((e) => e.properties.staticBatch === true).length
          const patchPerf = (k: string, v: unknown) =>
            edit((n) => {
              n.settings.performance = { ...(n.settings.performance || {}), [k]: v }
            })
          return (
            <>
              <div className="mf-form-grid">
                <Field label="Static Mesh Batching">
                  <input
                    type="checkbox"
                    checked={Boolean(perf.staticBatching)}
                    onChange={(e) => {
                      const on = e.target.checked
                      edit((n) => {
                        n.settings.performance = { ...(n.settings.performance || {}), staticBatching: on }
                        if (on) {
                          for (const sc of n.scenes) applyAutoStaticBatching(sc, false)
                        }
                      })
                    }}
                  />
                </Field>
                <Field label="Resolution scale">
                  <Numeric
                    label="Resolution scale"
                    value={perf.resolutionScale ?? 1}
                    min={0.4}
                    max={1}
                    step={0.05}
                    change={(v) => patchPerf('resolutionScale', v)}
                  />
                </Field>
                <Field label="Light cull dist (m)">
                  <Numeric
                    label="Light cull distance"
                    value={perf.lightCullDistance ?? 45}
                    min={0}
                    max={250}
                    step={5}
                    change={(v) => patchPerf('lightCullDistance', v)}
                  />
                </Field>
                <Field label="Particle cull dist (m)">
                  <Numeric
                    label="Particle cull distance"
                    value={perf.particleCullDistance ?? 40}
                    min={0}
                    max={250}
                    step={5}
                    change={(v) => patchPerf('particleCullDistance', v)}
                  />
                </Field>
                <Field label="Object cull dist (m)">
                  <Numeric
                    label="Global cull distance"
                    value={perf.cullDistance ?? 0}
                    min={0}
                    max={300}
                    step={5}
                    change={(v) => patchPerf('cullDistance', v)}
                  />
                </Field>
                <Field label="Animation throttling">
                  <input
                    type="checkbox"
                    checked={perf.animationThrottle !== false}
                    onChange={(e) => patchPerf('animationThrottle', e.target.checked)}
                  />
                </Field>
              </div>
              <div className="mf-row" style={{ gap: 6, marginTop: 8, alignItems: 'center' }}>
                <button
                  type="button"
                  className="mf-btn"
                  onClick={() =>
                    edit((n) => {
                      applyAutoStaticBatching(getScene(n), true)
                    })
                  }
                >
                  Auto-mark static objects
                </button>
                <button
                  type="button"
                  className="mf-btn"
                  onClick={() =>
                    edit((n) => {
                      for (const e of getScene(n).entities) e.properties.staticBatch = false
                    })
                  }
                >
                  Clear static flags
                </button>
                <small style={{ marginLeft: 'auto', opacity: 0.78 }}>
                  Marked Static: {batchedCount} / {activeScene.entities.length}
                </small>
              </div>
            </>
          )
        })()}
      </SettingsGroup>
    </>
  )
}
const DEFAULT_MATERIAL_PROPS: Record<string, any> = {
  unlit: false,
  color: '#ffffff',
  emissive: '#000000',
  emissiveIntensity: 0,
  roughness: 0.8,
  metalness: 0,
  opacity: 1,
  alphaTest: 0,
  map: '',
  normalMap: '',
  emissiveMap: '',
  shader: '',
  doubleSided: false,
  flatShading: false,
  castShadow: true,
  receiveShadow: true,
  softShadow: 0,
  roundLighting: false,
  normalScale: 1,
  pixelated: false,
  additive: false,
  depthWrite: true,
  depthTest: true,
  repeatX: 1,
  repeatY: 1,
  offsetX: 0,
  offsetY: 0,
}

function MaterialForm({ a, p, patch, edit }: { a: Asset; p: Project; patch: (k: string, v: unknown) => void; edit: Edit }) {
  const [pattern, setPattern] = useState<ProceduralPattern>('concrete')
  const [accent, setAccent] = useState('#5b6166')
  function bakeProcedural(
    kind: ProceduralPattern,
    baseCol: string,
    accentCol: string,
    extraProps?: Record<string, any>,
    resetAll = false,
  ) {
    const { diffuse, normal } = generateProceduralTextures(kind, baseCol, accentCol, 256)
    edit((n) => {
      const mat = n.assets.find((x) => x.id === a.id)
      const prevDiffId = mat?.properties?._procDiffId as string | undefined
      const prevNormId = mat?.properties?._procNormId as string | undefined
      const existingDiff = prevDiffId ? n.assets.find((x) => x.id === prevDiffId) : undefined
      const existingNorm = prevNormId ? n.assets.find((x) => x.id === prevNormId) : undefined
      const diffId = existingDiff ? existingDiff.id : uid('tex')
      const normId = existingNorm ? existingNorm.id : uid('tex')
      if (existingDiff) {
        existingDiff.name = `${a.name} (${kind})`
        existingDiff.data = diffuse
      } else {
        n.assets.push({ id: diffId, name: `${a.name} (${kind})`, type: 'texture', data: diffuse, properties: {} })
      }
      if (existingNorm) {
        existingNorm.name = `${a.name} (${kind} normal)`
        existingNorm.data = normal
      } else {
        n.assets.push({ id: normId, name: `${a.name} (${kind} normal)`, type: 'texture', data: normal, properties: {} })
      }
      if (mat) {
        if (resetAll) {
          mat.properties = { ...DEFAULT_MATERIAL_PROPS, ...(extraProps || {}) }
        } else if (extraProps) {
          Object.assign(mat.properties, extraProps)
        }
        mat.properties.map = diffId
        mat.properties.normalMap = normId
        mat.properties._procDiffId = diffId
        mat.properties._procNormId = normId
      }
    })
  }
  const m = a.properties
  return (
    <>
      <h4>Material presets</h4>
      <div className="mf-presets">
        {materialPresets.map((preset) => (
          <button
            key={preset.name}
            type="button"
            onClick={() => {
              if (preset.pattern) {
                setPattern(preset.pattern)
                if (preset.accent) setAccent(preset.accent)
                bakeProcedural(
                  preset.pattern,
                  preset.properties.color || '#9aa0a4',
                  preset.accent || '#5b6166',
                  preset.properties,
                  true,
                )
              } else {
                edit((n) => {
                  const mat = n.assets.find((x) => x.id === a.id)
                  if (mat) {
                    const prevDiffId = mat.properties?._procDiffId
                    const prevNormId = mat.properties?._procNormId
                    mat.properties = {
                      ...DEFAULT_MATERIAL_PROPS,
                      ...preset.properties,
                      ...(prevDiffId ? { _procDiffId: prevDiffId } : {}),
                      ...(prevNormId ? { _procNormId: prevNormId } : {}),
                    }
                  }
                })
              }
            }}
          >
            {preset.name}
          </button>
        ))}
        <button
          type="button"
          onClick={() =>
            edit((n) => {
              const mat = n.assets.find((x) => x.id === a.id)
              if (mat) mat.properties = { ...DEFAULT_MATERIAL_PROPS }
            })
          }
        >
          Reset defaults
        </button>
      </div>
      <h4>Procedural surface generator (Albedo + Normal map)</h4>
      <div className="mf-form-grid">
        <Field label="Pattern">
          <select value={pattern} onChange={(e) => setPattern(e.target.value as ProceduralPattern)}>
            <option value="concrete">Concrete / Plaster</option>
            <option value="asphalt">Wet Asphalt</option>
            <option value="tile">Soviet Tile</option>
            <option value="brick">Brick Wall</option>
            <option value="rust">Rusty Metal</option>
            <option value="panel">Concrete Panels</option>
          </select>
        </Field>
        <Field label="Detail / seam color">
          <Color label="Accent color" value={accent} change={setAccent} />
        </Field>
        <Field label="Generate maps">
          <button
            type="button"
            className="mf-secondary"
            onClick={() => bakeProcedural(pattern, m.color || '#9aa0a4', accent)}
          >
            Bake Diffuse + Normal
          </button>
        </Field>
      </div>
      <div className="mf-form-grid">
        <Field label="Shading">
          <select
            value={m.unlit ? 'unlit' : 'pbr'}
            onChange={(e) => patch('unlit', e.target.value === 'unlit')}
          >
            <option value="pbr">Standard / PBR</option>
            <option value="unlit">Basic / Unlit</option>
          </select>
        </Field>
        {['color', 'emissive'].map((k) => (
          <Field key={k} label={k === 'color' ? 'Base color' : 'Emissive'}>
            <Color
              label={k}
              value={m[k] || (k === 'color' ? '#ffffff' : '#000000')}
              change={(v) => patch(k, v)}
            />
          </Field>
        ))}
        {(['roughness', 'metalness', 'opacity', 'alphaTest'] as const).map((k, i) => (
          <Field key={k} label={['Roughness', 'Metallic', 'Opacity', 'Alpha cutoff'][i]}>
            <Numeric
              label={k}
              min={0}
              max={1}
              value={m[k] ?? [0.8, 0, 1, 0][i]}
              change={(v) => patch(k, v)}
            />
          </Field>
        ))}
        {(['map', 'normalMap', 'emissiveMap', 'shader'] as const).map((k, i) => (
          <Field key={k} label={['Base color map', 'Normal map', 'Emissive map', 'Custom shader'][i]}>
            <AssetSelect
              assets={p.assets}
              type={k === 'shader' ? 'shader' : 'texture'}
              label={k}
              value={m[k]}
              change={(v) => patch(k, v)}
            />
          </Field>
        ))}
        <Field label="Emissive intensity">
          <Numeric label="emissiveIntensity" min={0} max={2} step={0.1} value={m.emissiveIntensity ?? 0} change={(v) => patch('emissiveIntensity', v)} />
        </Field>
        {['doubleSided', 'flatShading'].map((k, i) => (
          <Field key={k} label={['Double sided', 'Flat shading'][i]}>
            <input type="checkbox" checked={!!m[k]} onChange={(e) => patch(k, e.target.checked)} />
          </Field>
        ))}
        <Field label="Cast shadow">
          <input type="checkbox" checked={m.castShadow !== false} onChange={(e) => patch('castShadow', e.target.checked)} />
        </Field>
        <Field label="Receive shadow">
          <input type="checkbox" checked={m.receiveShadow !== false} onChange={(e) => patch('receiveShadow', e.target.checked)} />
        </Field>
        <Field label="Soft shadow radius">
          <Numeric label="softShadow" min={0} max={10} step={0.1} value={m.softShadow ?? 0} change={(v) => patch('softShadow', v)} />
        </Field>
        <Field label="Round lighting">
          <input type="checkbox" checked={Boolean(m.roundLighting)} onChange={(e) => patch('roundLighting', e.target.checked)} />
        </Field>
        <Field label="Normal scale">
          <Numeric label="normalScale" min={0} max={4} step={0.1} value={m.normalScale ?? 1} change={(v) => patch('normalScale', v)} />
        </Field>
        <Field label="Pixelated (NEAREST)">
          <input type="checkbox" checked={Boolean(m.pixelated)} onChange={(e) => patch('pixelated', e.target.checked)} />
        </Field>
        <Field label="Additive blend">
          <input type="checkbox" checked={Boolean(m.additive)} onChange={(e) => patch('additive', e.target.checked)} />
        </Field>
        <Field label="Depth write">
          <input type="checkbox" checked={m.depthWrite !== false} onChange={(e) => patch('depthWrite', e.target.checked)} />
        </Field>
        <Field label="Depth test">
          <input type="checkbox" checked={m.depthTest !== false} onChange={(e) => patch('depthTest', e.target.checked)} />
        </Field>
        {['tiling', 'offset'].map((k) => (
          <Field label={k === 'tiling' ? 'UV tiling' : 'UV offset'} key={k}>
            <div className="mf-pair">
              {['U', 'V'].map((axis, i) => (
                <Numeric
                  key={axis}
                  label={k + ' ' + axis}
                  value={m[k]?.[i] ?? (k === 'tiling' ? 1 : 0)}
                  change={(v) => {
                    const vec = [...(m[k] || (k === 'tiling' ? [1, 1] : [0, 0]))]
                    vec[i] = v
                    patch(k, vec)
                  }}
                />
              ))}
            </div>
          </Field>
        ))}
      </div>
    </>
  )
}
function SkyboxForm({ a, p, patch }: { a: Asset; p: Project; patch: (k: string, v: unknown) => void }) {
  const s = a.properties
  const mode = s.mode || 'procedural'
  return (
    <div className="mf-form-grid">
      <Field label="Sky mode">
        <select value={mode} onChange={(e) => patch('mode', e.target.value)}>
          <option value="gradient">Sky Dome (Gradient)</option>
          <option value="procedural">Procedural (Clouds + Stars)</option>
          <option value="cubemap">Skybox (6 Sides)</option>
        </select>
      </Field>
      {mode !== 'cubemap' && (
        <>
          <Field label="Top color"><Color label="Top color" value={s.topColor || '#243b55'} change={(v) => patch('topColor', v)} /></Field>
          <Field label="Horizon color"><Color label="Horizon color" value={s.horizonColor || '#9ab2c4'} change={(v) => patch('horizonColor', v)} /></Field>
          <Field label="Bottom color"><Color label="Bottom color" value={s.bottomColor || '#232a30'} change={(v) => patch('bottomColor', v)} /></Field>
        </>
      )}
      {mode === 'procedural' && (
        <>
          <Field label="Sun color"><Color label="Sun color" value={s.sunColor || '#fff1cc'} change={(v) => patch('sunColor', v)} /></Field>
          <Field label="Cloud color"><Color label="Cloud color" value={s.cloudColor || '#e4ebf0'} change={(v) => patch('cloudColor', v)} /></Field>
          <Field label="Cloud coverage"><Numeric label="Cloud coverage" value={s.cloudCoverage ?? 0.48} min={0} max={1} step={0.05} change={(v) => patch('cloudCoverage', v)} /></Field>
          <Field label="Cloud speed"><Numeric label="Cloud speed" value={s.cloudSpeed ?? 0.035} min={0} max={0.5} step={0.005} change={(v) => patch('cloudSpeed', v)} /></Field>
          <Field label="Cloud scale"><Numeric label="Cloud scale" value={s.cloudScale ?? 1.8} min={0.2} max={8} step={0.1} change={(v) => patch('cloudScale', v)} /></Field>
          <Field label="Sun sharpness"><Numeric label="Sun sharpness" value={s.sunSize ?? 72} min={8} max={256} step={4} change={(v) => patch('sunSize', v)} /></Field>
          <Field label="Star intensity"><Numeric label="Star intensity" value={s.starIntensity ?? 0} min={0} max={1} step={0.05} change={(v) => patch('starIntensity', v)} /></Field>
        </>
      )}
      {mode === 'cubemap' &&
        ([
          ['px', 'Right (+X)'],
          ['nx', 'Left (-X)'],
          ['py', 'Top (+Y)'],
          ['ny', 'Bottom (-Y)'],
          ['pz', 'Front (+Z)'],
          ['nz', 'Back (-Z)'],
        ] as const).map(([faceKey, label]) => {
          const face = s.faces?.[faceKey] || {}
          const setFace = (upd: Record<string, unknown>) =>
            patch('faces', { ...(s.faces || {}), [faceKey]: { ...face, ...upd } })
          return (
            <Field key={faceKey} label={label}>
              <div className="mf-pair">
                <AssetSelect assets={p.assets} type="texture" label={label + ' texture'} value={face.texture || ''} change={(t) => setFace({ texture: t || undefined })} />
                <Color label={label + ' color'} value={face.color || '#8fa6b8'} change={(col) => setFace({ color: col })} />
              </div>
            </Field>
          )
        })}
    </div>
  )
}
function LocalesForm({ p, edit, fail }: { p: Project; edit: Edit; fail: (s: string) => void }) {
  const [search, setSearch] = useState(''),
    [newKey, setKey] = useState(''),
    [newLang, setLang] = useState(''),
    [missing, onlyMissing] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const langs = Object.keys(p.locales)
  const keys = [...new Set(Object.values(p.locales).flatMap(Object.keys))].sort()
  function exportData() {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(p.locales, null, 2)], { type: 'application/json' }),
    )
    const a = document.createElement('a')
    a.href = url
    a.download = 'locales.json'
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 800)
  }
  async function load(file?: File) {
    if (!file) return
    try {
      const data: unknown = JSON.parse(await file.text())
      if (
        !data ||
        typeof data !== 'object' ||
        Array.isArray(data) ||
        !Object.keys(data).length ||
        Object.entries(data).some(
          ([lang, v]) =>
            !lang.trim() ||
            !v ||
            typeof v !== 'object' ||
            Array.isArray(v) ||
            Object.values(v).some((s) => typeof s !== 'string'),
        )
      )
        throw Error('Expected a JSON object with a string dictionary per language')
      edit((n) => {
        n.locales = data as Project['locales']
        if (!n.locales[n.settings.language]) n.settings.language = Object.keys(n.locales)[0]
      })
      fail('')
    } catch (e) {
      fail(String(e))
    }
  }
  return (
    <>
      <div className="mf-row">
        <input
          placeholder="Search keys"
          aria-label="Search translations"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <label>
          <input type="checkbox" checked={missing} onChange={(e) => onlyMissing(e.target.checked)} /> Missing
          only
        </label>
        <button title="Import translations" onClick={() => input.current?.click()}>
          <Import size={14} />
        </button>
        <button title="Export translations" onClick={exportData}>
          <Download size={14} />
        </button>
        <input
          hidden
          ref={input}
          type="file"
          accept=".json"
          onChange={(e) => void load(e.target.files?.[0])}
        />
      </div>
      <div className="mf-table-scroll">
        <table>
          <thead>
            <tr>
              <th>Key</th>
              {langs.map((s) => (
                <th key={s}>{s.toUpperCase()}</th>
              ))}
              <th />
            </tr>
          </thead>
          <tbody>
            {keys
              .filter((k) => k.includes(search) && (!missing || langs.some((s) => !p.locales[s][k])))
              .map((k) => (
                <tr key={k}>
                  <td>{k}</td>
                  {langs.map((s) => (
                    <td key={s}>
                      <input
                        aria-label={s + ' ' + k}
                        value={p.locales[s][k] || ''}
                        onChange={(e) => edit((n) => (n.locales[s][k] = e.target.value))}
                      />
                    </td>
                  ))}
                  <td>
                    <button
                      aria-label={'Delete ' + k}
                      onClick={() => edit((n) => Object.values(n.locales).forEach((d) => delete d[k]))}
                    >
                      <Trash2 size={12} />
                    </button>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
      <div className="mf-row">
        <input
          placeholder="New translation key"
          aria-label="New translation key"
          value={newKey}
          onChange={(e) => setKey(e.target.value)}
        />
        <button
          disabled={!newKey.trim() || keys.includes(newKey.trim())}
          onClick={() => {
            edit((n) => Object.values(n.locales).forEach((d) => (d[newKey.trim()] = '')))
            setKey('')
          }}
        >
          <Plus size={13} /> Key
        </button>
        <input
          placeholder="Language code"
          aria-label="Language code"
          value={newLang}
          onChange={(e) => setLang(e.target.value)}
        />
        <button
          disabled={!/^[a-z]{2,3}(-[a-zA-Z]{2,4})?$/.test(newLang) || langs.includes(newLang)}
          onClick={() => {
            edit((n) => (n.locales[newLang] = {}))
            setLang('')
          }}
        >
          <Plus size={13} /> Language
        </button>
      </div>
    </>
  )
}
export interface AuthoringProps {
  project: Project
  target: string
  focusUiId?: string
  onChange: (p: Project) => void
  onClose: () => void
}
export function Authoring(props: AuthoringProps) {
  return <AuthoringDialog key={props.target + '-' + (props.focusUiId || '')} {...props} />
}
function AuthoringDialog({ project, target, focusUiId, onChange, onClose }: AuthoringProps) {
  const [p, set] = useState(() => structuredClone(project))
  const [subAssetId, setSubAssetId] = useState<string | null>(null)
  const [newId] = useState(() => uid('asset'))
  const [vertex, setVertex] = useState(false),
    [error, fail] = useState('')
  const activeTarget = subAssetId || target
  const id = activeTarget.startsWith('new-') ? newId : activeTarget
  const a = p.assets.find((a) => a.id === id)
  const edit: Edit = (fn) =>
    set((old) => {
      const n = structuredClone(old)
      fn(n)
      return n
    })
  useEffect(() => {
    if (!target.startsWith('new-')) return
    const type = target.slice(4)
    const created: Asset =
      type === 'material'
        ? makeMaterial('New material', '#78aca0', id)
        : type === 'particle'
          ? makeParticleAsset('New Particles', 'steam', id)
          : type === 'html'
            ? makeHtmlAsset('New Widget.html', 'phone', id)
            : type === 'texture'
              ? (() => {
                  const cfg = defaultProceduralTexture()
                  return {
                    id,
                    name: 'Procedural Texture.png',
                    type: 'texture' as const,
                    data: renderProceduralTextureDataUrl(cfg),
                    properties: { procedural: cfg, isNormalMap: false },
                  }
                })()
              : type === 'prefab'
                ? {
                    id,
                    name: 'New Prefab',
                    type: 'prefab' as const,
                    data: JSON.stringify([makeEntity('New Prefab', 'box')]),
                    properties: {},
                  }
                : type === 'graph'
                  ? {
                      id,
                      name: 'New Event Graph',
                      type: 'graph' as const,
                      data: JSON.stringify(makeDefaultEventGraph()),
                      properties: {},
                    }
                  : type === 'mesh'
                    ? (() => {
                        const recipe = defaultMeshBuilderRecipe()
                        return {
                          id,
                          name: 'Low-Poly Mesh.glb',
                          type: 'model' as const,
                          data: buildRecipeToGlbDataUrl(recipe),
                          properties: { meshBuilder: recipe },
                        }
                      })()
                    : type === 'paint'
                      ? {
                          id,
                          name: 'Painted Texture.png',
                          type: 'texture' as const,
                          data: '',
                          properties: { paintEditor: true },
                        }
                      : type === 'sound'
                        ? {
                            id,
                            name: 'Synth Sound.wav',
                            type: 'audio' as const,
                            data: '',
                            properties: { synth: true },
                          }
                        : type === 'dialogue'
                          ? {
                              id,
                              name: 'NPC Dialogue',
                              type: 'dialogue' as const,
                              data: JSON.stringify(makeDefaultDialogueGraph()),
                              properties: {},
                            }
                          : type === 'sequence'
                            ? {
                                id,
                                name: 'Cutscene Sequence',
                                type: 'sequence' as const,
                                data: JSON.stringify(makeDefaultSequence()),
                                properties: {},
                              }
                            : type === 'plugin'
                              ? {
                                  id,
                                  name: 'My Custom Plugin',
                                  type: 'plugin' as const,
                                  data: JSON.stringify(makeDefaultPlugin('My Custom Plugin'), null, 2),
                                  properties: {},
                                }
                : {
            id,
            type: type === 'shader' ? 'shader' : 'script',
            name: type === 'shader' ? 'New shader.glsl' : 'New script.ts',
            data: type === 'shader' ? shaders.Unlit.fragment : defaultScript,
            properties: type === 'shader' ? { vertex: shaders.Unlit.vertex } : {},
          }
    edit((n) => {
      if (!n.assets.some((i) => i.id === id)) n.assets.push(created)
    })
  }, [target, id])
  const root = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    root.current?.focus()
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !document.querySelector('.suggest-widget.visible')) {
        e.preventDefault()
        onClose()
      }
      if (e.key === 'Tab') {
        const all = root.current?.querySelectorAll<HTMLElement>(
          'button:not([disabled]),input:not([hidden]),select,textarea,[tabindex="0"]',
        )
        if (!all?.length) return
        const first = all[0],
          last = all[all.length - 1]
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault()
          last.focus()
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault()
          first.focus()
        }
      }
    }
    const el = root.current
    el?.addEventListener('keydown', key)
    return () => {
      el?.removeEventListener('keydown', key)
      previous?.focus()
    }
  }, [onClose])
  const changeA = (fn: (a: Asset) => void) =>
    edit((n) => {
      const asset = n.assets.find((a) => a.id === id)
      if (asset) fn(asset)
    })
  const name =
    target === 'settings'
      ? 'Project settings'
      : activeTarget === 'ui'
        ? 'Game interface'
        : target === 'locales'
          ? 'Localization'
          : a?.type === 'material'
            ? 'Material editor'
            : a?.type === 'particle'
              ? '3D Particle Editor'
              : a?.type === 'html'
                ? 'HTML / CSS / JS Widget Studio'
                : a?.type === 'texture'
                  ? 'Procedural Texture Generator'
                  : a?.type === 'prefab'
                    ? 'Prefab Editor'
                  : a?.type === 'graph'
                    ? 'Event Graph Editor (Blueprint)'
                  : a?.type === 'dialogue'
                    ? 'Dialogue & Quest Graph Editor'
                  : a?.type === 'sequence'
                    ? 'Keyframe Sequencer'
                  : target === 'plugins'
                    ? 'Plugin Manager'
                  : a?.type === 'plugin'
                    ? 'Plugin Editor & Manager'
                  : a?.type === 'audio'
                    ? 'Sound / SFX / Music Synth'
                  : a?.type === 'model' && a.properties?.meshBuilder
                    ? 'Low-Poly CSG Mesh Builder'
            : a?.type === 'shader'
              ? 'Shader editor'
              : a?.type === 'script'
                ? 'Script editor'
                : 'Asset properties'
  const Icon =
    target === 'settings'
      ? SlidersHorizontal
      : activeTarget === 'ui'
        ? Monitor
        : target === 'locales'
          ? Languages
          : a?.type === 'material'
            ? CircleDot
            : a?.type === 'particle'
              ? Flame
            : ['shader', 'script'].includes(a?.type || '')
              ? Code2
              : File
  const save = () => {
    try {
      if (a?.type === 'shader') checkShader(a.properties.vertex || shaders.Unlit.vertex, a.data)
      if (!p.name.trim() || (a && !a.name.trim())) throw Error('Enter a name before saving.')
      onChange(p)
      onClose()
    } catch (err) {
      fail(String(err))
    }
  }
  return (
    <div
      className="mf-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        className={(activeTarget === 'ui' || a?.type === 'graph' || a?.type === 'dialogue' || a?.type === 'sequence' || a?.type === 'plugin' || a?.type === 'material' || a?.type === 'shader' || (a?.type === 'model' && Boolean(a.properties?.meshBuilder))) ? 'mf-dialog mf-hud-dialog' : a?.type === 'particle' || a?.type === 'html' || a?.type === 'texture' || a?.type === 'prefab' || a?.type === 'model' || a?.type === 'audio' ? 'mf-dialog mf-particle-dialog' : 'mf-dialog'}
        role="dialog"
        aria-modal="true"
        aria-label={name}
        tabIndex={-1}
        ref={root}
      >
        <header>
          <Icon size={17} />
          <h3>{name}</h3>
          <button title="Close" aria-label="Close dialog" onClick={onClose}>
            <X size={17} />
          </button>
        </header>
        <div className="mf-dialog-body">
          {target === 'plugins' && <PluginManagerPanel p={p} edit={edit} />}
          {target === 'settings' && <Settings p={p} edit={edit} />}{' '}
          {activeTarget === 'ui' && <InterfaceForm p={p} edit={edit} focusUiId={focusUiId} onEditAsset={(aid: string) => setSubAssetId(aid)} />}{' '}
          {target === 'locales' && <LocalesForm p={p} edit={edit} fail={fail} />}
          {a && (
            <>
              <Field label="Asset name">
                <input value={a.name} onChange={(e) => changeA((a) => (a.name = e.target.value))} />
              </Field>
              {a.type === 'skybox' && (
                <SkyboxForm p={p} a={a} patch={(k, v) => changeA((a) => (a.properties[k] = v))} />
              )}
              {a.type === 'particle' && (
                <ParticleEditor p={p} a={a} patch={(k, v) => changeA((a) => (a.properties[k] = v))} />
              )}
              {a.type === 'html' && (
                <>
                  {subAssetId && (
                    <div style={{ marginBottom: 8 }}>
                      <button type="button" className="mf-btn" onClick={() => setSubAssetId(null)}>
                        ← Back to HUD Editor
                      </button>
                    </div>
                  )}
                  <HtmlEditor a={a} changeA={changeA} />
                </>
              )}
              {a.type === 'material' && (
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'minmax(320px, 380px) minmax(0, 1fr)',
                    gap: 16,
                    alignItems: 'start',
                  }}
                >
                  <div style={{ position: 'sticky', top: 0 }}>
                    <MaterialPreview p={p} a={a} height={360} />
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <MaterialForm p={p} a={a} edit={edit} patch={(k, v) => changeA((a) => (a.properties[k] = v))} />
                  </div>
                </div>
              )}
              {a.type === 'shader' && <ShaderStudio a={a} changeA={changeA} />}
              {a.type === 'script' && (
                <Suspense fallback={<p>Loading code editor…</p>}>
                  <CodeEditor
                    language="typescript"
                    value={a.data}
                    onChange={(code) =>
                      changeA((a) => {
                        a.data = code
                      })
                    }
                  />
                </Suspense>
              )}
              {a.type === 'texture' && (
                a.properties?.paintEditor ? (
                  <PaintEditor a={a} changeA={changeA} />
                ) : a.properties?.procedural ? (
                  <TextureGenerator a={a} changeA={changeA} edit={edit} />
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <img className="mf-image" alt={a.name} src={a.data} />
                    <button
                      type="button"
                      className="mf-btn"
                      style={{ alignSelf: 'flex-start' }}
                      onClick={() =>
                        changeA((asset) => {
                          const cfg = defaultProceduralTexture()
                          asset.properties = { ...(asset.properties || {}), procedural: cfg }
                          asset.data = renderProceduralTextureDataUrl(cfg)
                        })
                      }
                    >
                      Convert to Procedural Texture Generator
                    </button>
                    <button
                      type="button"
                      className="mf-btn"
                      onClick={() =>
                        changeA((asset) => {
                          asset.properties = { ...(asset.properties || {}), paintEditor: true }
                        })
                      }
                    >
                      Open in 2D Paint Editor
                    </button>
                  </div>
                )
              )}
              {a.type === 'audio' && <SoundSynth a={a} changeA={changeA} />}
              {a.type === 'prefab' && <PrefabEditor a={a} p={p} changeA={changeA} edit={edit} />}
              {a.type === 'graph' && <EventGraphEditor a={a} p={p} changeA={changeA} />}
              {a.type === 'dialogue' && <DialogueEditor a={a} changeA={changeA} />}
              {a.type === 'sequence' && <SequencerEditor a={a} p={p} changeA={changeA} />}
              {a.type === 'plugin' && <PluginEditor a={a} p={p} changeA={changeA} edit={edit} />}
              {a.type === 'json' && (
                <pre className="mf-readonly">{JSON.stringify(JSON.parse(a.data || '{}'), null, 2)}</pre>
              )}
              {a.type === 'model' && (
                a.properties?.meshBuilder ? (
                  <MeshBuilder a={a} p={p} changeA={changeA} />
                ) : (
                  <ModelEditor key={a.id}
                    a={a}
                    p={p}
                    changeA={changeA}
                    edit={edit}
                    onDownload={() => void downloadAssetFile(a)}
                  />
                )
              )}
            </>
          )}
          {error && (
            <div className="mf-error" role="alert">
              <AlertTriangle size={15} />
              <pre>{error}</pre>
            </div>
          )}
        </div>
        <footer>
          <button onClick={onClose}>Cancel</button>
          <button className="mf-primary" onClick={save}>
            <Check size={14} /> Save changes
          </button>
        </footer>
      </div>
    </div>
  )
}
export default Authoring
