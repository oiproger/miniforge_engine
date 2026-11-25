import { nativizeProjectEventGraphs } from './nativizeEventGraph'
import { strToU8, strFromU8, zipSync, unzipSync } from 'fflate'
import { needsPhysics, validateProject, serializeProject, parseProject, type Project, type Entity } from '../../project-schema/src'
import type { Profile } from '../../platform-sdk/src'
import { projectIssues } from '../../project-schema/src/references'
export type { Profile }
export type Files = Record<string, Uint8Array>
type RuntimeLoader = (file: string) => Promise<string>
const css =
  '*{box-sizing:border-box}html,body,#game{margin:0;width:100%;height:100%;overflow:hidden}#game{position:relative;background:#172329;color:#fff;font:16px system-ui;touch-action:none}canvas{display:block}button{font:inherit}'
const head =
  '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">'
const title = (name: string) =>
  name.replace(/[<>&"]/g, (char) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' })[char]!)
const jsonText = (value: unknown) => JSON.stringify(value).replace(/</g, '\\u003c')
const toBlob = (data: Uint8Array, type: string) => new Blob([Uint8Array.from(data)], { type })

const loadRuntime: RuntimeLoader = async (file) => {
  const response = await fetch(
    new URL((import.meta.env?.BASE_URL || './') + 'engine/' + file, document.baseURI),
  )
  if (!response.ok || response.headers.get('Content-Type')?.includes('text/html'))
    throw new Error('Runtime bundle unavailable: ' + file)
  return response.text()
}

export function exportProject(project: Project) {
  return toBlob(zipSync({ 'project.json': strToU8(serializeProject(project)) }), 'application/zip')
}
export async function importProject(file: Blob) {
  const data = new Uint8Array(await file.arrayBuffer())
  if (data[0] !== 80 || data[1] !== 75) return parseProject(strFromU8(data))
  const entry = unzipSync(data, {
    filter: (f) => f.name === 'project.json' && f.originalSize < 256 * 1024 * 1024,
  })['project.json']
  if (!entry) throw new Error('Archive requires a project.json smaller than 256 MiB')
  return parseProject(strFromU8(entry))
}

function usedAssets(project: Project) {
  const remaining = new Map(project.assets.map((asset) => [asset.id, asset]))
  const used = new Set<string>()
  function visit(value: unknown) {
    if (typeof value === 'string' && remaining.has(value) && !used.has(value)) {
      used.add(value)
      const asset = remaining.get(value)!
      visit(asset.properties)
      if (
        asset.type === 'prefab' ||
        asset.type === 'skybox' ||
        asset.type === 'particle' ||
        asset.type === 'sequence' ||
        asset.type === 'graph' ||
        asset.type === 'dialogue'
      ) {
        try {
          visit(JSON.parse(asset.data))
        } catch {
          /* non-JSON asset data */
        }
      }
    } else if (Array.isArray(value)) value.forEach(visit)
    else if (value && typeof value === 'object') Object.values(value).forEach(visit)
  }
  visit({ ...project, assets: [] })
  // Scripts, Event Graphs, interactive HTML UI, plugins, and Rule components can look up arbitrary resources by ID or name at runtime.
  const hasRules = project.scenes.some((sc) =>
    sc.entities.some((e) => e.components.some((c) => c.type === 'rule')),
  )
  const dynamic =
    hasRules ||
    project.assets.some(
      (a) =>
        (used.has(a.id) && (a.type === 'script' || a.type === 'graph' || a.type === 'html')) ||
        a.type === 'plugin',
    )
  if (dynamic) {
    for (const asset of project.assets) if (asset.type === 'prefab') visit(asset.id)
  }
  return project.assets.filter((a) => used.has(a.id) || a.type === 'plugin' || (dynamic && a.type !== 'script'))
}

async function compileScript(name: string, source: string) {
  const ts = await import('typescript')
  const result = ts.transpileModule(source, {
    fileName: name.replace(/\.[^.]+$/, '') + '.ts',
    reportDiagnostics: true,
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, isolatedModules: true },
  })
  const error = result.diagnostics?.find((d) => d.category === ts.DiagnosticCategory.Error)
  if (error) throw new Error(name + ': ' + ts.flattenDiagnosticMessageText(error.messageText, '\n'))
  const imports = ts.preProcessFile(result.outputText, true).importedFiles
  if (imports.length) throw new Error(name + ': external module imports are unsupported. Use the Game API.')
  return result.outputText
}

function binaryData(value: string) {
  const match = /^data:([\w.+/-]*);base64,([A-Za-z0-9+/=\s]*)$/.exec(value)
  if (!match) return null
  return Uint8Array.from(atob(match[2]), (ch) => ch.charCodeAt(0))
}
async function prepare(project: Project, preview: boolean, read: RuntimeLoader) {
  validateProject(project)
  const issues = projectIssues(project)
  if(issues.length)throw new Error(issues.map(i=>i.owner+' · '+i.message).join('\n'))
  const compiled = structuredClone(project)
  compiled.assets = usedAssets(compiled)
  const nativizedGraphs = !preview && compiled.settings?.export?.nativizeEventGraphs
    ? nativizeProjectEventGraphs(compiled)
    : 0
  const files: Files = {}
  const modules: Record<string, string> = Object.create(null)
  const resources = new Map<string, string>()
  const assetSizes: { name: string; type: string; bytes: number }[] = []
  for (const [i, asset] of compiled.assets.entries()) {
    const data = asset.data
    const binary = binaryData(data)
    let bytes = binary?.byteLength ?? strToU8(data).length
    if (asset.type === 'script') {
      const js = await compileScript(asset.name, data)
      const path = './scripts/' + i + '.js'
      modules[asset.id] = preview ? 'data:text/javascript;charset=utf-8,' + encodeURIComponent(js) : path
      if (!preview) files[path.slice(2)] = strToU8(js)
      bytes = strToU8(js).length
      asset.data = ''
    } else if (!preview && binary) {
      let path = resources.get(data)
      if (!path) {
        const suffix = /\.([a-z0-9]{1,8})$/i.exec(asset.name)?.[1].toLowerCase() || 'bin'
        path = './assets/' + i + '.' + suffix
        resources.set(data, path)
        files[path.slice(2)] = binary
      }
      asset.data = path
    }
    assetSizes.push({ name: asset.name, type: asset.type, bytes })
  }
  let physics: string | undefined
  if (
    compiled.assets.some(a=>a.type==='prefab' && needsPhysics(JSON.parse(a.data))) ||
    compiled.scenes.some(s=>needsPhysics(s.entities))
  ) {
    const js = await read('physics.js')
    physics = preview ? 'data:text/javascript;charset=utf-8,' + encodeURIComponent(js) : './physics.js'
    if (!preview) files['physics.js'] = strToU8(js)
  }
  return { config: { project: compiled, modules, physics }, files, assetSizes, nativizedGraphs }
}

export async function buildGame(
  project: Project,
  profile: Profile = 'web',
  read: RuntimeLoader = loadRuntime,
) {
  if (!['web', 'yandex', 'poki'].includes(profile)) throw new Error('Invalid web export profile')
  const { config, files, assetSizes, nativizedGraphs } = await prepare(project, false, read)
  files['index.html'] = strToU8(
    head +
      '<title>' +
      title(project.name) +
      '</title><link rel="stylesheet" href="./game.css"></head><body><main id="game"></main><script type="module" src="./game.js"></script></body></html>',
  )
  files['game.css'] = strToU8(css)
  files['game.js'] = strToU8(await read(profile + '.js'))
  files['project.json'] = strToU8(JSON.stringify(config))
  const packed = zipSync(files, { level: 6 })
  const total = Object.values(files).reduce((n, f) => n + f.length, 0)
  const groups: Record<string, number> = {}
  for (const [path, data] of Object.entries(files)) {
    const ext = path.split('.').pop()!
    groups[ext] = (groups[ext] || 0) + data.length
  }
  const report = {
    profile,
    total,
    compressed: packed.length,
    initialBytes: total,
    groups,
    assetSizes: assetSizes.sort((a, b) => b.bytes - a.bytes),
    warnings: assetSizes.filter((a) => a.bytes > 1024 * 1024).map((a) => a.name + ' exceeds 1 MiB'),
    files: Object.keys(files),
    nativizedGraphs,
    path: profile + '/',
  }
  return { files, blob: toBlob(packed, 'application/zip'), report }
}

export async function previewGame(project: Project, frame: HTMLIFrameElement) {
  const { config } = await prepare(project, true, loadRuntime)
  const runtime = await loadRuntime('web.js')
  const key = 'miniforge.preview.' + project.id
  let progress: [string, unknown][] = []
  try {
    progress = JSON.parse(localStorage.getItem(key) || '[]')
  } catch {
    /* storage unavailable */
  }
  const values = new Map(progress)
  // Steam LOCAL DEBUG is carried across sandboxed opaque-origin previews by
  // the trusted editor window. Never grant iframe same-origin privileges.
  const steamCfg = project.settings.steam
  const steamAppId = Number(steamCfg?.appId || 480)
  const steamDebug = Boolean(steamCfg?.enabled && steamCfg?.localDebug)
  let steamBus: BroadcastChannel | null = null
  if (steamDebug && typeof BroadcastChannel !== 'undefined') {
    try { steamBus = new BroadcastChannel(`miniforge-editor-steam-debug:${steamAppId}`) } catch {}
  }
  if (steamBus) steamBus.onmessage = event => {
    const message = event.data
    if (!message || message.__miniforgeSteam !== true || message.appId !== steamAppId ||
        (message.channel !== 'lobbies' && message.channel !== 'p2p')) return
    frame.contentWindow?.postMessage(message, '*')
  }
  const onMessage = (event: MessageEvent) => {
    if (event.source !== frame.contentWindow || event.origin !== 'null') return
    if (steamDebug && event.data?.__miniforgeSteam === true &&
        event.data?.appId === steamAppId &&
        (event.data.channel === 'lobbies' || event.data.channel === 'p2p')) {
      // The source window is verified above. Do not re-broadcast responses
      // received from the editor: only frames can originate this path.
      try { steamBus?.postMessage(event.data) } catch {}
      return
    }
    if (event.data?.type !== 'miniforge:progress') return
    if (typeof event.data.key !== 'string' || event.data.key.length > 256) return
    try {
      const next = new Map(values).set(event.data.key, event.data.value)
      const json = JSON.stringify([...next])
      if (json.length > 256 * 1024) return
      localStorage.setItem(key, json)
      values.set(event.data.key, event.data.value)
    } catch { /* storage unavailable */ }
  }
  window.addEventListener('message', onMessage)
  frame.setAttribute('sandbox', 'allow-scripts allow-pointer-lock')
  frame.setAttribute('title', project.name + ' preview')
  frame.srcdoc =
    head +
    "<meta http-equiv=\"Content-Security-Policy\" content=\"default-src 'none'; script-src 'unsafe-inline' 'wasm-unsafe-eval' data: blob:; style-src 'unsafe-inline'; img-src data: blob:; media-src data: blob:; connect-src data: blob: ws: wss: http: https:; worker-src blob:\"><style>" +
    css +
    '</style></head><body><main id="game"></main><script id="preview-data" type="application/json">' +
    jsonText({ ...config, progress }) +
    '</script><script type="module">' +
    runtime.replace(/<\/script/gi, '<\\/script') +
    '</script></body></html>'
  return () => {
    window.removeEventListener('message', onMessage)
    try { steamBus?.close() } catch {}
    frame.removeAttribute('srcdoc')
  }
}
