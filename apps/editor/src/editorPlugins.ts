import {
  getScene,
  parsePluginManifest,
  uid,
  type EditorPluginAction,
  type Project,
  type Scene,
} from '../../../packages/project-schema/src'

export interface EditorPluginContext {
  pluginId: string
  project: Project
  uid: (prefix?: string) => string
  notify: (msg: string) => void
  patchProject: (fn: (p: Project) => void) => void
  patchScene: (fn: (scene: Scene) => void) => void
  registerMenuAction: (action: { id: string; label: string; run: () => void }) => void
}

/** Collect live Editor Plugin menu actions from all enabled `type === 'plugin'` assets. */
export function collectEditorPluginActions(
  project: Project,
  patchProject: (fn: (p: Project) => void) => void,
  notify: (msg: string) => void,
): EditorPluginAction[] {
  const actions: EditorPluginAction[] = []
  const plugins = project.assets.filter((a) => a.type === 'plugin')
  for (const asset of plugins) {
    const manifest = parsePluginManifest(asset.data)
    if (!manifest.enabled) continue
    try {
      const exportsObj: Record<string, any> = {}
      const runner = new Function('exports', manifest.code)
      runner(exportsObj)
      if (typeof exportsObj.registerEditor === 'function') {
        const ctx: EditorPluginContext = {
          pluginId: manifest.id,
          project,
          uid,
          notify,
          patchProject,
          patchScene: (fn) => patchProject((p) => fn(getScene(p))),
          registerMenuAction: (act) => {
            actions.push({
              id: act.id,
              pluginId: manifest.id,
              label: act.label,
              run: () => {
                try {
                  act.run()
                } catch (err) {
                  notify(`Plugin error (${manifest.name}): ${String(err)}`)
                }
              },
            })
          },
        }
        exportsObj.registerEditor(ctx)
      }
    } catch (err) {
      console.error(`[EditorPlugin:${manifest.name}]`, err)
    }
  }
  return actions
}
