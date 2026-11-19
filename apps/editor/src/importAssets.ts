import { uid, type Asset, type AssetType } from '../../../packages/project-schema/src'
import { convertModelWithAssimpWasm } from './assimpConverter'
import { convertModelViaDesktop, dataUrl, isDesktopApp } from './io'
import { convertTextXToGlb } from './xToGlb'

const types: Record<string, AssetType> = {
  glb: 'model',
  gltf: 'model',
  png: 'texture',
  jpg: 'texture',
  jpeg: 'texture',
  webp: 'texture',
  mp3: 'audio',
  ogg: 'audio',
  wav: 'audio',
  ts: 'script',
  js: 'script',
  glsl: 'shader',
  json: 'json',
  html: 'html',
  md: 'text',
  txt: 'text',
  ini: 'text',
  cfg: 'text',
  csv: 'text',
  toml: 'text',
  yml: 'text',
  yaml: 'text',
  xml: 'text',
}

const CONVERTIBLE_3D_EXTS = new Set([
  'x',
  'fbx',
  'smd',
  'obj',
  'dae',
  '3ds',
  'ms3d',
  'b3d',
  'ply',
  'stl',
  'mdl',
  'md2',
  'md3',
  'md5mesh',
])
const COMPANION_EXTS = new Set(['mtl', 'tga', 'bmp', 'png', 'jpg', 'jpeg', 'webp', 'md5anim'])

export async function readAssets(files: File[]): Promise<Asset[]> {
  const result: Asset[] = []
  const consumed = new Set<File>()
  const encoded = new Map<File, Promise<string>>()
  const extension = (name: string) => name.split('.').pop()!.toLowerCase()
  const encode = (file: File) => {
    if (!encoded.has(file)) encoded.set(file, dataUrl(file))
    return encoded.get(file)!
  }

  for (const file of files.filter((f) => extension(f.name) === 'gltf')) {
    const model = JSON.parse(await file.text())
    if (model.asset?.version !== '2.0') throw Error('Expected glTF 2.0: ' + file.name)
    for (const resource of [...(model.buffers ?? []), ...(model.images ?? [])]) {
      if (!resource.uri || resource.uri.startsWith('data:')) continue
      const path = decodeURIComponent(resource.uri)
      const matches = files.filter((f) => f.name === path.split('/').at(-1))
      if (matches.length !== 1) throw Error('Import ' + file.name + ' together with its dependency ' + path)
      resource.uri = await encode(matches[0])
      consumed.add(matches[0])
    }
    const data = await dataUrl(new File([JSON.stringify(model)], file.name, { type: 'model/gltf+json' }))
    result.push({ id: uid('asset'), name: file.name, type: 'model', data, properties: { size: file.size } })
    consumed.add(file)
  }

  const companionFiles = files.filter((f) => COMPANION_EXTS.has(extension(f.name)))
  const companionBuffers = await Promise.all(
    companionFiles.map(async (f) => ({ name: f.name, bytes: new Uint8Array(await f.arrayBuffer()) })),
  )

  for (const file of files) {
    if (consumed.has(file)) continue
    const ext = extension(file.name)
    if (CONVERTIBLE_3D_EXTS.has(ext)) {
      const raw = new Uint8Array(await file.arrayBuffer())
      const glbName = file.name.replace(/\.[^.]+$/, '') + '.glb'
      let glbBytes: Uint8Array | null = null
      let lastErr: unknown

      // 1. Primary universal path (bundled AssimpJS WASM — works on Web, Linux, Windows, macOS!)
      try {
        glbBytes = await convertModelWithAssimpWasm({ name: file.name, bytes: raw }, companionBuffers)
      } catch (err) {
        lastErr = err
      }

      // 2. Desktop native fallback (system assimp CLI if available)
      if (!glbBytes && isDesktopApp()) {
        try {
          glbBytes = await convertModelViaDesktop(file.name, raw)
        } catch (err) {
          lastErr = err
        }
      }

      // 3. Built-in pure-TS fallback for textual DirectX .x files
      if (!glbBytes && ext === 'x') {
        try {
          glbBytes = convertTextXToGlb(raw, file.name)
        } catch (err) {
          lastErr = err
        }
      }

      if (!glbBytes) {
        throw new Error(`Failed to convert ${file.name} to .glb: ${String(lastErr)}`)
      }

      // Consume companion .mtl / .md5anim files so they don't fail as unsupported standalone assets
      for (const cf of companionFiles) {
        if (['mtl', 'md5anim', 'tga', 'bmp'].includes(extension(cf.name))) consumed.add(cf)
      }

      const glbFile = new File([glbBytes.slice() as BlobPart], glbName, { type: 'model/gltf-binary' })
      const data = await dataUrl(glbFile)
      result.push({
        id: uid('asset'),
        type: 'model',
        name: glbName,
        data,
        properties: { size: glbBytes.byteLength, convertedFrom: file.name },
      })
      continue
    }

    const type = types[ext]
    if (!type) throw Error('Unsupported asset: ' + file.name)
    const data = ['script', 'json', 'shader', 'text', 'html'].includes(type) ? await file.text() : await encode(file)
    if (type === 'json') JSON.parse(data)
    result.push({ id: uid('asset'), type, name: file.name, data, properties: { size: file.size } })
  }
  return result
}
