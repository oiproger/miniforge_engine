import { createSteamPreviewInvoke } from './steamPreview'
import type { Project } from '../../project-schema/src'
import type { PlatformAdapter } from '../../platform-sdk/src'
import type { startGame } from '../../runtime/src'

export async function boot(run: typeof startGame, platformFactory: (id: string) => PlatformAdapter) {
  const root = document.getElementById('game')!
  try {
    const preview = document.getElementById('preview-data')
    const config = preview
      ? JSON.parse(preview.textContent!)
      : await fetch('./project.json').then((r) => {
          if (!r.ok) throw new Error('Cannot load project.json (' + r.status + ')')
          return r.json()
        })
    const project: Project = config.project
    const scripts: Record<string, any> = Object.create(null)
    for (const [id, url] of Object.entries(config.modules as Record<string, string>)) {
      try {
        scripts[id] = await import(/* @vite-ignore */ url)
      } catch (error) {
        console.error('Script ' + id, error)
        if (preview) parent.postMessage({ error: 'Script ' + id + ': ' + String(error) }, '*')
      }
    }
    const physics = config.physics ? (await import(/* @vite-ignore */ config.physics)).default : undefined
    const platform = platformFactory(project.id)
    if (preview) {
      const state = new Map<string, unknown>(config.progress || [])
      platform.saveData = async (key, value) => {
        state.set(key, value)
        parent.postMessage({ type: 'miniforge:progress', key, value }, '*')
      }
      platform.loadData = async (key) => state.get(key) ?? null
    }
    const session = await run(root, project, {
      platform,
      scripts,
      physics,
      performance: !!preview,
      preview: !!preview,
      steamPreviewInvoke: preview && typeof config.nativeSteamSession === 'string'
        ? createSteamPreviewInvoke(config.nativeSteamSession)
        : undefined,
      onEvent: (name, data) => {
        if (preview && name.endsWith('.error')) parent.postMessage({ error: String(data) }, '*')
      },
    })
    performance.mark('miniforge-game-ready')
    if (preview) {
      window.addEventListener('message', (e) => {
        if (e.source !== parent) return
        if (e.data?.type === 'miniforge:pause') session.pause()
        if (e.data?.type === 'miniforge:resume') session.resume()
      })
      parent.postMessage({ type: 'miniforge:ready' }, '*')
      const metrics = setInterval(() => parent.postMessage({ stats: session.stats }, '*'), 750)
      window.addEventListener('pagehide', () => clearInterval(metrics), { once: true })
    }
    window.addEventListener(
      'pagehide',
      (e) => {
        if (!e.persisted) session.dispose()
      },
      { once: true },
    )
  } catch (error) {
    root.textContent = 'Game failed to start. ' + String(error)
    console.error(error)
    if (document.getElementById('preview-data')) parent.postMessage({ error: String(error) }, '*')
  }
}
