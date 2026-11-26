/// <reference types="vite/client" />

declare module 'monaco-editor/esm/vs/language/typescript/monaco.contribution.js' {
  export const javascriptDefaults: typeof import('monaco-editor').typescript.javascriptDefaults
  export const typescriptDefaults: typeof import('monaco-editor').typescript.typescriptDefaults
}

declare module 'monaco-editor/esm/vs/language/html/monaco.contribution.js' {
  export const htmlDefaults: typeof import('monaco-editor').html.htmlDefaults
}
