import { validateProject, type Project } from '../../../packages/project-schema/src'

let db: Promise<IDBDatabase> | undefined
function database() {
  return (db ??= new Promise((resolve, reject) => {
    const req = indexedDB.open('miniforge-studio', 1)
    req.onupgradeneeded = () => req.result.createObjectStore('projects')
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  }))
}
export async function restore() {
  const store = (await database()).transaction('projects').objectStore('projects')
  return new Promise<Project | null>((resolve, reject) => {
    const req = store.get('current')
    req.onsuccess = () => {
      try {
        resolve(req.result ? validateProject(req.result) : null)
      } catch (e) {
        reject(e)
      }
    }
    req.onerror = () => reject(req.error)
  })
}
export async function persist(project: Project) {
  const tx = (await database()).transaction('projects', 'readwrite')
  tx.objectStore('projects').put(project, 'current')
  return new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = tx.onabort = () => reject(tx.error)
  })
}
export async function download(blob: Blob, name: string) {
  const shell = (window as unknown as { __TAURI__?: { core: { invoke: Function } } }).__TAURI__
  if (shell) {
    return Boolean(await shell.core.invoke('save_bytes', {
      name,
      bytes: Array.from(new Uint8Array(await blob.arrayBuffer())),
    }))
  }
  const url = URL.createObjectURL(blob),
    a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 30000)
  return true
}
export async function dataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}
