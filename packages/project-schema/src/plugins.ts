// Miniforge Engine v2.2 Plugin System Schema

export interface PluginManifest {
  id: string
  name: string
  version: string
  author: string
  description: string
  category: 'utility' | 'editor' | 'gameplay' | 'graphics' | 'audio' | 'ui'
  enabled: boolean
  code: string
}

export interface EditorPluginAction {
  id: string
  pluginId: string
  label: string
  run: () => void
}

export function makeDefaultPlugin(name = 'My Custom Plugin'): PluginManifest {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'custom-plugin'
  return {
    id: slug,
    name,
    version: '1.0.0',
    author: 'Developer',
    description: 'Custom Miniforge Engine plugin',
    category: 'gameplay',
    enabled: true,
    code: `// Miniforge Plugin v2.2
// Export registerEditor(ctx) and/or registerRuntime(ctx)

exports.registerEditor = function (ctx) {
  ctx.registerMenuAction({
    id: '${slug}-hello',
    label: '${name}: Hello World',
    run: () => {
      ctx.notify('Hello from ${name}!')
    },
  })
}

exports.registerRuntime = function (ctx) {
  ctx.onGameStart((api) => {
    console.log('[Plugin:${name}] Started on scene:', api.project.activeScene)
  })
}
`,
  }
}

export function parsePluginManifest(raw?: string): PluginManifest {
  try {
    const parsed = JSON.parse(raw || '')
    if (parsed && typeof parsed.code === 'string') {
      return {
        id: String(parsed.id || 'plugin'),
        name: String(parsed.name || 'Unnamed Plugin'),
        version: String(parsed.version || '1.0.0'),
        author: String(parsed.author || 'Unknown'),
        description: String(parsed.description || ''),
        category: parsed.category || 'utility',
        enabled: parsed.enabled !== false,
        code: parsed.code,
      }
    }
  } catch {
    /* fallback */
  }
  return makeDefaultPlugin()
}
