import type { AssimpInstance } from 'assimpjs'

let instancePromise: Promise<AssimpInstance> | null = null

async function getAssimp(): Promise<AssimpInstance> {
  if (!instancePromise) {
    instancePromise = (async () => {
      const mod = await import('assimpjs')
      const factory =
        typeof (mod as any).default === 'function'
          ? (mod as any).default
          : typeof (mod as any).default?.default === 'function'
            ? (mod as any).default.default
            : mod
      const wasmUrl =
        typeof window !== 'undefined'
          ? new URL('./assimpjs.wasm', window.location.href).href
          : './assimpjs.wasm'
      return factory({
        locateFile: () => wasmUrl,
      }) as Promise<AssimpInstance>
    })()
  }
  return instancePromise
}

/**
 * Convert any Assimp-supported 3D model (.x, .fbx, .smd, .obj, .dae, .3ds, .ms3d, .b3d, .ply, .stl, .md2, .md3, .md5mesh...)
 * directly into a glTF 2.0 binary (.glb) inside the browser or Tauri desktop app (Linux, Windows, macOS).
 */
export async function convertModelWithAssimpWasm(
  mainFile: { name: string; bytes: Uint8Array },
  companions: { name: string; bytes: Uint8Array }[] = [],
): Promise<Uint8Array> {
  const ajs = await getAssimp()
  const fileList = new ajs.FileList()
  fileList.AddFile(mainFile.name, mainFile.bytes)
  for (const extra of companions) {
    if (extra.name !== mainFile.name) {
      fileList.AddFile(extra.name, extra.bytes)
    }
  }
  const result = ajs.ConvertFileList(fileList, 'glb2')
  if (!result.IsSuccess() || result.FileCount() === 0) {
    throw new Error(`Assimp WASM failed on ${mainFile.name}: ${result.GetErrorCode()}`)
  }
  const out = result.GetFile(0).GetContent()
  return new Uint8Array(out)
}
