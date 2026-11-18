import { uid, type Asset, type AssetType } from '../../../packages/project-schema/src'
import { dataUrl } from './io'

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
}

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
  for (const file of files) {
    if (consumed.has(file)) continue
    const type = types[extension(file.name)]
    if (!type) throw Error('Unsupported asset: ' + file.name)
    const data = ['script', 'json', 'shader'].includes(type) ? await file.text() : await encode(file)
    if (type === 'json') JSON.parse(data)
    result.push({ id: uid('asset'), type, name: file.name, data, properties: { size: file.size } })
  }
  return result
}
