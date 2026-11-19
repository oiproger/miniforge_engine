import { useEffect, useRef } from 'react'
import * as monaco from 'monaco-editor/esm/vs/editor/editor.api.js'
import 'monaco-editor/esm/vs/editor/contrib/suggest/browser/suggestController.js'
import 'monaco-editor/esm/vs/basic-languages/typescript/typescript.contribution.js'
import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker.js?worker'

Object.assign(self, { MonacoEnvironment: { getWorker: () => new EditorWorker() } })
monaco.languages.register({ id: 'glsl' })
monaco.languages.setMonarchTokensProvider('glsl', {
  tokenizer: {
    root: [
      [/\/\/.*$/, 'comment'],
      [/\b(?:uniform|varying|float|vec[234]|mat[234]|void|return|if|discard|const)\b/, 'keyword'],
      [/\b\d+(\.\d+)?\b/, 'number'],
    ],
  },
})
interface APIMember {name:string;signature:string;method:boolean;description:string}
let apiRequest: Promise<Record<string,APIMember[]>> | undefined
function loadAPI():Promise<Record<string, APIMember[]>>{
  return apiRequest ??= fetch(new URL(import.meta.env.BASE_URL+'engine/script-api.json',document.baseURI)).then(response=>{
    if(!response.ok)throw Error('API catalog unavailable')
    return response.json()
  }).catch(()=>{apiRequest=undefined;return {}})
}
monaco.languages.registerCompletionItemProvider('typescript', {
  triggerCharacters: ['.'],
  async provideCompletionItems(model, position) {
    const word = model.getWordUntilPosition(position)
    const range = new monaco.Range(position.lineNumber, word.startColumn, position.lineNumber, word.endColumn)
    const before = model.getLineContent(position.lineNumber).slice(0,position.column-1)
    const path = /\b(api(?:\.\w+)*)\.\w*$/.exec(before)?.[1]
    const catalog = await loadAPI()
    const members=catalog[path??'lifecycle']??[]
    return {suggestions:members.map(member=>({
      label:member.name,insertText:member.name, range,
      kind:member.method?monaco.languages.CompletionItemKind.Method:monaco.languages.CompletionItemKind.Property,
      detail:member.signature, documentation:member.description
    }))}
  }
})
export default function CodeEditor({
  value,
  language,
  onChange,
}: {
  value: string
  language: 'glsl' | 'typescript'
  onChange: (s: string) => void
}) {
  const container = useRef<HTMLDivElement>(null),
    callback = useRef(onChange),
    initial = useRef(value),
    instance = useRef<monaco.editor.IStandaloneCodeEditor | null>(null)
  callback.current = onChange
  useEffect(() => {
    if (!container.current) return
    const model = monaco.editor.createModel(initial.current, language)
    const editor = monaco.editor.create(container.current, {
      model,
      theme: 'vs-dark',
      fontSize: 13,
      automaticLayout: true,
      minimap: { enabled: false },
      scrollBeyondLastLine: false,
      tabSize: 2,
    })
    const sub = editor.onDidChangeModelContent(() => callback.current(editor.getValue()))
    instance.current = editor
    return () => {
      sub.dispose()
      editor.dispose()
      model.dispose()
      instance.current = null
    }
  }, [language])
  useEffect(() => {
    const editor = instance.current
    if (editor && value !== editor.getValue()) editor.setValue(value)
  }, [value])
  return <div ref={container} className="mf-code" />
}
