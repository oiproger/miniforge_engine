import { lazy, Suspense, useEffect, useState } from 'react'
import { BookOpen, Code2, FileCode2, FileText, Plus, Save, Search, Sparkles } from 'lucide-react'
import { uid, type Asset, type Project } from '../../../packages/project-schema/src'
import type { CodeLanguage } from './CodeEditor'
import { defaultScript } from './Inspector'
import { checkShader, shaders } from './shaderTemplates'

const CodeEditor = lazy(() => import('./CodeEditor'))

const API_DOCS_ID = '__builtin_api_docs__'

const API_REFERENCE_MD = `# Miniforge Engine v0.3 — Полный справочник API (Read-Only)

## 1. Структура скрипта и ScriptLifecycle
\`\`\`ts
export default function (api: GameAPI) {
  return {
    onCreate() {},                     // 1 раз при привязке скрипта
    onStart() {},                      // 1 раз при первом включении сущности
    onEnable() {},                     // при setActive(id, true)
    onDisable() {},                    // при setActive(id, false)
    onUpdate(dt: number) {},           // каждый кадр рендера
    onFixedUpdate(dt: number) {},      // фиксированный шаг 60 Гц (физика)
    onCollisionEnter(other: string) {},// начало твёрдого столкновения
    onTriggerEnter(other: string) {},  // вход в триггер / воду
    onTriggerStay(other: string, dt: number) {}, // каждый тик внутри триггера
    onTriggerExit(other: string) {},   // выход из триггера
    onPointerClick() {},               // клик мышью / по прицелу (Pointer Lock)
    onDestroy() {},                    // удаление сущности или выгрузка сцены
  }
}
\`\`\`

## 2. Базовые методы GameAPI
- \`api.entity\`, \`api.object\` (SceneNode: \`position\`, \`rotation\`, \`scale\`), \`api.params\`, \`api.vars\`, \`api.time\`
- \`api.find(id)\`, \`api.findByTag(tag)\`, \`api.component(type)\`
- \`api.spawnPrefab(assetId, position?, parent?)\`, \`api.destroy(id)\`, \`api.setActive(id, active)\`
- \`api.scene.load(sceneId)\`, \`api.t(key, params?)\`

## 3. Камера и игрок (\`api.camera\`, \`api.player\`)
- \`api.camera.position\`, \`forward\`, \`right\`, \`yaw\`, \`pitch\`, \`fov\`, \`eyeHeight\`
- \`api.camera.lookAt(target)\`, \`setLook(yaw, pitch)\`, \`shake(intensity, duration?)\`
- \`api.player.id\`, \`position\`, \`isGrounded\`, \`isCrouching\`, \`isSprinting\`, \`speed\`
- \`api.player.teleport(pos, yawDelta?, pitchDelta?)\` — бесшовный телепорт (идеально для «Смещения»)
- \`api.player.setSpeed(speed)\`, \`api.player.setCrouch(bool)\`

## 4. Система Tween в стиле Godot 4 (\`api.createTween()\`)
\`\`\`ts
const tw = api.createTween().setTrans('back').setEase('out')
tw.tweenProperty(api.object, 'position.y', 3, 0.8)
tw.parallel().tweenProperty(api.object, 'rotation.y', Math.PI, 0.8)
tw.tweenInterval(0.3)
tw.tweenCallback(() => api.audio.play())
await tw.finished
\`\`\`
- Кривые (\`setTrans\`): \`linear\`, \`sine\`, \`quad\`, \`cubic\`, \`quart\`, \`quint\`, \`expo\`, \`circ\`, \`back\`, \`elastic\`, \`bounce\`
- Режимы (\`setEase\`): \`in\`, \`out\`, \`inOut\`, \`outIn\`
- Модификаторы: \`.setDelay(sec)\`, \`.from(val)\`, \`.asRelative()\`, \`.parallel()\`, \`.chain()\`, \`.setLoops(n)\`, \`.pause()\`, \`.play()\`, \`.kill()\`

## 5. Сохранение и загрузка игры (\`api.saveSystem\`)
Сохраняет сцену, позицию/взгляд игрока, \`vars\`, \`worldState\`, состояния сущностей и кастомные данные (\`save.before\` / \`save.loaded\`).
- \`await api.saveSystem.save(slot = 'main', { cloudSync: true })\` — локально + облако Yandex/Poki
- \`await api.saveSystem.load(slot = 'main', { cloudSync: true, preferCloud: false })\` — берёт самый свежий сэйв
- \`api.saveSystem.exportJSON(slot?)\` — строка JSON сохранения
- \`api.saveSystem.downloadJSON(slot?, filename?)\` — скачать .json файл сохранения из игры
- \`await api.saveSystem.importJSON(jsonText, slot?, applyNow?)\` — загрузить сохранение из JSON
- \`api.saveSystem.listSlots()\`, \`await api.saveSystem.deleteSlot(slot?)\`
- Готовый Behavior: **Save & Cloud Sync Manager** (автосэйв, F5/F9, синхронизация с Yandex/Poki).

## 6. Среда, Небо, Пост-процессинг и Материалы
- \`api.environment.setFog(density, color?)\`, \`setFogFade(start, end, depthMode?)\`, \`setAmbient(i, color?)\`, \`setAmbientGround(hex, i?)\`, \`setSun(dir, color?, i?)\`, \`setExposure(v)\`
- \`api.environment.setSky(top, horizon?, bottom?, enabled?)\`
- \`api.environment.setProceduralSky({ topColor, horizonColor, bottomColor, cloudCoverage, cloudSpeed, cloudScale, starIntensity })\`
- \`api.environment.setSkyboxFaces({ px, nx, py, ny, pz, nz })\`, \`api.environment.setSkyAsset(assetId)\`
- \`api.graphics.setPostProcess({ ao, aoRadius, dof, dofFocus, dofAperture, bloom, bloomThreshold, vignette, chromatic, grain, scanlines, contrast, saturation, toneMapping })\`
- \`api.materials.set(id, matId)\`, \`setColor(id, hex, opacity?)\`, \`setEmissive(id, hex, i?)\`, \`setShader(id, shaderId)\`, \`create(name, props)\`
- \`api.lights.setIntensity/setColor/setRange/setEnabled(id, ...)\`, \`api.lights.setFlashlight({ enabled, color, intensity, range, angle })\`

## 7. 3D-звук, Физика, UI и Сервисы
- \`const h = api.audio.play(assetId, { volume, loop, pitch, position, refDistance, maxDistance, bus })\`
- \`api.audio.stop(h)\`, \`setVolume(h, v, fadeSec?)\`, \`setPitch(h, p)\`, \`setPosition(h, pos)\`, \`setBusVolume('sfx'|'ambient'|'ui', v)\`
- \`api.physics.raycastHit(origin, dir, len, [api.player.id])\` → \`{ id, distance, point, normal }\`
- \`api.physics.applyImpulse/applyForce/setVelocity/getVelocity/setGravityScale\`
- \`api.ui.open/back/close/current\`, \`setBlur(id, px)\`, \`setStyle(id, css)\`, \`mount(id, html, css?)\`, \`unmount(id)\`
- \`api.services.register/get/has\`, \`api.worldState.get/set/all/save/load\`
`

function detectLanguage(asset: Asset): CodeLanguage {
  if (asset.type === 'script') return 'typescript'
  if (asset.type === 'shader') return 'glsl'
  if (asset.type === 'json') return 'json'
  const ext = asset.name.split('.').pop()?.toLowerCase()
  if (ext === 'json') return 'json'
  if (ext === 'md' || ext === 'markdown') return 'markdown'
  if (ext === 'ini' || ext === 'cfg' || ext === 'toml') return 'ini'
  if (ext === 'ts' || ext === 'js') return 'typescript'
  if (ext === 'glsl' || ext === 'frag' || ext === 'vert') return 'glsl'
  return 'plaintext'
}

export default function ScriptWorkspace({
  project,
  activeId,
  onSelect,
  onChange,
  onNotify,
}: {
  project: Project
  activeId: string
  onSelect: (id: string) => void
  onChange: (next: Project) => void
  onNotify: (msg: string) => void
}) {
  const editableAssets = project.assets.filter((a) => ['script', 'shader', 'json', 'text'].includes(a.type))
  const [search, setSearch] = useState('')
  const [drafts, setDrafts] = useState<Record<string, { data: string; vertex?: string }>>({})
  const [vertexStage, setVertexStage] = useState(false)
  const [findTrigger, setFindTrigger] = useState(0)
  const [shaderError, setShaderError] = useState('')

  const currentId = activeId || editableAssets[0]?.id || API_DOCS_ID
  const isDocs = currentId === API_DOCS_ID
  const asset = !isDocs ? editableAssets.find((a) => a.id === currentId) : undefined

  useEffect(() => {
    setVertexStage(false)
    setShaderError('')
  }, [currentId])

  const filtered = editableAssets.filter((a) => a.name.toLowerCase().includes(search.toLowerCase()))

  const currentValue = isDocs
    ? API_REFERENCE_MD
    : asset
      ? asset.type === 'shader' && vertexStage
        ? (drafts[asset.id]?.vertex ?? String(asset.properties.vertex ?? ''))
        : (drafts[asset.id]?.data ?? asset.data)
      : ''

  const isDirty = (id: string) => {
    const d = drafts[id]
    const a = editableAssets.find((x) => x.id === id)
    if (!d || !a) return false
    return d.data !== a.data || (a.type === 'shader' && (d.vertex ?? '') !== String(a.properties.vertex ?? ''))
  }

  function updateDraft(val: string) {
    if (!asset) return
    setDrafts((prev) => {
      const base = prev[asset.id] ?? { data: asset.data, vertex: String(asset.properties.vertex ?? '') }
      return {
        ...prev,
        [asset.id]:
          asset.type === 'shader' && vertexStage ? { ...base, vertex: val } : { ...base, data: val },
      }
    })
  }

  function saveCurrent() {
    if (!asset) return
    const d = drafts[asset.id]
    if (!d) {
      onNotify('No unsaved changes in ' + asset.name)
      return
    }
    if (asset.type === 'json') {
      try {
        JSON.parse(d.data)
      } catch (e) {
        setShaderError('Invalid JSON: ' + String(e))
        return
      }
    }
    if (asset.type === 'shader') {
      try {
        checkShader(d.vertex ?? '', d.data)
        setShaderError('')
      } catch (e) {
        setShaderError(String(e))
        return
      }
    }
    const next = structuredClone(project)
    const target = next.assets.find((a) => a.id === asset.id)
    if (target) {
      target.data = d.data
      if (target.type === 'shader') target.properties.vertex = d.vertex ?? ''
    }
    onChange(next)
    setDrafts((prev) => {
      const copy = { ...prev }
      delete copy[asset.id]
      return copy
    })
    onNotify('Saved ' + asset.name)
  }

  function createFile(kind: 'script' | 'text') {
    const name = prompt(
      kind === 'script' ? 'Script file name (.ts)' : 'Text/Data file name (.json, .md, .ini, .txt)',
      kind === 'script' ? 'NewScript.ts' : 'config.json',
    )?.trim()
    if (!name) return
    const ext = name.split('.').pop()?.toLowerCase()
    const type: Asset['type'] = kind === 'script' ? 'script' : ext === 'json' ? 'json' : 'text'
    const id = uid(type)
    const data =
      type === 'script'
        ? defaultScript
        : type === 'json'
          ? '{\n  "version": 1\n}\n'
          : ext === 'ini'
            ? '[settings]\nvolume = 1.0\n'
            : '# ' + name + '\n\n'
    const next = structuredClone(project)
    next.assets.push({ id, type, name, data, properties: {} })
    onChange(next)
    onSelect(id)
  }

  return (
    <div className="script-workspace">
      <aside className="script-sidebar">
        <div className="script-sidebar-head">
          <button type="button" className="minor-btn" onClick={() => createFile('script')}>
            <Plus size={12} /> Script
          </button>
          <button type="button" className="minor-btn" onClick={() => createFile('text')}>
            <Plus size={12} /> File
          </button>
        </div>
        <label className="searchbox" style={{ margin: '6px 8px' }}>
          <Search size={12} />
          <input
            placeholder="Filter files..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <div className="script-file-list">
          <button
            type="button"
            className={'script-file-item docs ' + (isDocs ? 'active' : '')}
            onClick={() => onSelect(API_DOCS_ID)}
          >
            <BookOpen size={13} />
            <span>API Reference.md</span>
          </button>
          {filtered.map((a) => (
            <button
              type="button"
              key={a.id}
              className={'script-file-item ' + (currentId === a.id ? 'active' : '')}
              onClick={() => onSelect(a.id)}
            >
              {a.type === 'script' ? (
                <Code2 size={13} />
              ) : a.type === 'shader' ? (
                <Sparkles size={13} />
              ) : a.type === 'json' ? (
                <FileCode2 size={13} />
              ) : (
                <FileText size={13} />
              )}
              <span>{a.name}</span>
              {isDirty(a.id) && <i className="dirty-dot" title="Unsaved changes" />}
            </button>
          ))}
        </div>
      </aside>
      <div className="script-main">
        <div className="script-toolbar">
          {isDocs ? (
            <strong>API Reference · GameAPI, Tween & SaveSystem (Read-Only)</strong>
          ) : asset ? (
            <>
              <input
                className="script-name-input"
                aria-label="File name"
                value={asset.name}
                onChange={(e) => {
                  const next = structuredClone(project)
                  const t = next.assets.find((x) => x.id === asset.id)
                  if (t) t.name = e.target.value
                  onChange(next)
                }}
              />
              {asset.type === 'shader' && (
                <>
                  <select
                    aria-label="Shader stage"
                    value={vertexStage ? 'vertex' : 'fragment'}
                    onChange={(e) => setVertexStage(e.target.value === 'vertex')}
                  >
                    <option value="fragment">Fragment</option>
                    <option value="vertex">Vertex</option>
                  </select>
                  <select
                    aria-label="Shader preset"
                    defaultValue=""
                    onChange={(e) => {
                      const preset = shaders[e.target.value]
                      if (!preset) return
                      setDrafts((prev) => ({
                        ...prev,
                        [asset.id]: { data: preset.fragment, vertex: preset.vertex },
                      }))
                    }}
                  >
                    <option value="">Load preset…</option>
                    {Object.keys(shaders).map((k) => (
                      <option key={k} value={k}>
                        {k}
                      </option>
                    ))}
                  </select>
                </>
              )}
              <button type="button" className="minor-btn" onClick={() => setFindTrigger((n) => n + 1)}>
                <Search size={12} /> Find / Replace
              </button>
              <button
                type="button"
                className={'minor-btn ' + (isDirty(asset.id) ? 'accent-btn' : '')}
                onClick={saveCurrent}
              >
                <Save size={12} /> Save (Ctrl+S)
              </button>
              <button type="button" className="minor-btn" onClick={() => onSelect(API_DOCS_ID)}>
                <BookOpen size={12} /> API Docs
              </button>
            </>
          ) : (
            <span>No file selected</span>
          )}
        </div>
        {shaderError && <div className="script-error-bar">{shaderError}</div>}
        <div className="script-editor-host">
          <Suspense fallback={<div style={{ padding: 16 }}>Loading code editor…</div>}>
            <CodeEditor
              key={currentId + (vertexStage ? ':v' : ':f')}
              value={currentValue}
              language={isDocs ? 'markdown' : asset ? detectLanguage(asset) : 'plaintext'}
              readOnly={isDocs}
              findTrigger={findTrigger}
              onSave={saveCurrent}
              onChange={updateDraft}
            />
          </Suspense>
        </div>
      </div>
    </div>
  )
}
