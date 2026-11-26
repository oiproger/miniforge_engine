import * as monaco from 'monaco-editor/esm/vs/editor/editor.api.js'
import 'monaco-editor/esm/vs/basic-languages/html/html.contribution.js'
import 'monaco-editor/esm/vs/basic-languages/css/css.contribution.js'
import 'monaco-editor/esm/vs/basic-languages/javascript/javascript.contribution.js'
import 'monaco-editor/esm/vs/language/css/monaco.contribution.js'
import { htmlDefaults } from 'monaco-editor/esm/vs/language/html/monaco.contribution.js'
import { javascriptDefaults, typescriptDefaults } from 'monaco-editor/esm/vs/language/typescript/monaco.contribution.js'

export const widgetLanguages = { html: 'html', css: 'css', js: 'javascript' } as const
export type WidgetTab = keyof typeof widgetLanguages

interface WidgetSnippet {
  name: string
  label: string
  snippet: string
}

export const widgetSnippets: Record<WidgetTab, WidgetSnippet[]> = {
  html: [
    { name: 'mf-grid', label: 'Grid', snippet: '<div class="${1:grid}">\n\t<div>${2:Item 1}</div>\n\t<div>${3:Item 2}</div>\n</div>$0' },
    { name: 'mf-button', label: 'Event button', snippet: '<button type="button" data-event="${1:inventory.use}">${2:Use item}</button>$0' },
    { name: 'mf-list', label: 'List', snippet: '<ul class="${1:list}">\n\t<li>${2:First item}</li>\n\t<li>${3:Second item}</li>\n</ul>$0' },
    { name: 'mf-card', label: 'Card', snippet: '<section class="${1:card}">\n\t<h2>${2:Title}</h2>\n\t<p>${3:Description}</p>\n</section>$0' },
    { name: 'mf-close', label: 'Close button', snippet: '<button type="button" data-action="close">${1:Close}</button>$0' },
  ],
  css: [
    { name: 'mf-grid', label: 'Responsive grid', snippet: '.${1:grid} {\n\tdisplay: grid;\n\tgrid-template-columns: repeat(auto-fit, minmax(min(100%, ${2:120px}), 1fr));\n\tgap: ${3:8px};\n}$0' },
    { name: 'mf-flex', label: 'Flex row', snippet: '.${1:toolbar} {\n\tdisplay: flex;\n\tflex-wrap: wrap;\n\talign-items: center;\n\tgap: ${2:8px};\n}$0' },
    { name: 'mf-list', label: 'Scrollable list', snippet: '.${1:list} {\n\tdisplay: grid;\n\tgap: ${2:6px};\n\tmax-height: ${3:240px};\n\toverflow-y: auto;\n\tpadding: 0;\n\tlist-style: none;\n}$0' },
    { name: 'mf-button', label: 'Button style', snippet: '.${1:button} {\n\tpadding: 8px 12px;\n\tborder: 0;\n\tborder-radius: 6px;\n\tbackground: ${2:#3d67c8};\n\tcolor: white;\n\tcursor: pointer;\n}\n.${1:button}:focus-visible {\n\toutline: 2px solid white;\n\toutline-offset: 2px;\n}$0' },
  ],
  js: [
    { name: 'mf-on', label: 'Listen for game event', snippet: 'miniforge.on("${1:inventory.update}", (data) => {\n\t${2:console.log(data);}\n});$0' },
    { name: 'mf-emit', label: 'Emit game event', snippet: 'miniforge.emit("${1:inventory.use}", { ${2:slot: 0} });$0' },
    { name: 'mf-click', label: 'Button handler', snippet: 'document.querySelector("${1:#use-button}")?.addEventListener("click", () => {\n\t${2:miniforge.emit("inventory.use");}\n});$0' },
    { name: 'mf-set-var', label: 'Set game variable', snippet: 'miniforge.setVar("${1:selectedSlot}", ${2:0});$0' },
  ],
}

// Game scripts already have an API-specific completion provider.
typescriptDefaults.setModeConfiguration({})
javascriptDefaults.addExtraLib(`
interface MiniforgeWidgetBridge {
  /** Send a named event and optional payload to the game. */
  emit(name: string, data?: unknown): void;
  /** Trigger window navigation or another game action. */
  action(name: string, data?: unknown): void;
  /** Write a game variable. */
  setVar(key: string, value: unknown): void;
  /** Listen for game events. Returns a function that unsubscribes this handler. */
  on(name: string, callback: (data: unknown) => void): () => void;
}
declare const miniforge: MiniforgeWidgetBridge;
interface Window { miniforge: MiniforgeWidgetBridge; }
`, 'inmemory:///miniforge-widget-bridge.d.ts')

htmlDefaults.setOptions({
  ...htmlDefaults.options,
  data: {
    useDefaultDataProvider: true,
    dataProviders: {
      miniforge: {
        version: 1.1,
        globalAttributes: [
          { name: 'data-event', description: 'Send a named event to the game when clicked.' },
          { name: 'data-payload', description: 'Optional JSON or text payload for data-event.' },
          { name: 'data-action', description: 'Run a built-in UI action when clicked.',
            values: ['open', 'close', 'back', 'play', 'pause', 'retry'].map((name) => ({ name })) },
          { name: 'data-target', description: 'Screen ID for the open action.' },
        ],
      },
    },
  },
})

for (const tab of Object.keys(widgetLanguages) as WidgetTab[]) {
  monaco.languages.registerCompletionItemProvider(widgetLanguages[tab], {
    provideCompletionItems(model, position) {
      if (!model.uri.path.endsWith('/widget.' + tab)) return { suggestions: [] }
      const prefix = model.getLineContent(position.lineNumber).slice(0, position.column - 1).match(/[\w-]+$/)?.[0] ?? ''
      return {
        suggestions: widgetSnippets[tab].map(({ name, label, snippet }) => ({
          label: name,
          detail: label,
          kind: monaco.languages.CompletionItemKind.Snippet,
          insertText: snippet,
          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          range: new monaco.Range(position.lineNumber, position.column - prefix.length, position.lineNumber, position.column),
        })),
      }
    },
  })
}
