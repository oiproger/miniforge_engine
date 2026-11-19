import { serializeProject, validateProject, type Project } from '../../../packages/project-schema/src'

let db: Promise<IDBDatabase> | undefined
let linkedPath: string | null = null
let linkedFileHandle: any = null

function tauriInvoke(): ((cmd: string, args?: Record<string, unknown>) => Promise<any>) | undefined {
  return (window as unknown as { __TAURI__?: { core: { invoke: (c: string, a?: any) => Promise<any> } } })
    .__TAURI__?.core?.invoke
}

function database() {
  return (db ??= new Promise((resolve, reject) => {
    const req = indexedDB.open('miniforge-studio', 1)
    req.onupgradeneeded = () => req.result.createObjectStore('projects')
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  }))
}

export function canSaveToDisk(): boolean {
  return Boolean(tauriInvoke() || typeof (window as any).showSaveFilePicker === 'function')
}

export function getLinkedDiskPath(): string | null {
  return linkedPath ?? linkedFileHandle?.name ?? null
}

export function clearLinkedDiskPath() {
  linkedPath = null
  linkedFileHandle = null
}

export async function openProjectFromDisk(): Promise<{ project: Project; label: string } | null> {
  const invoke = tauriInvoke()
  if (invoke) {
    const res = (await invoke('open_project_file')) as [string, string] | null
    if (!res) return null
    linkedPath = res[0]
    linkedFileHandle = null
    return { project: validateProject(JSON.parse(res[1])), label: res[0] }
  }
  const win = window as any
  if (typeof win.showOpenFilePicker === 'function') {
    const [handle] = await win.showOpenFilePicker({
      multiple: false,
      types: [{ description: 'Miniforge Project (.json)', accept: { 'application/json': ['.json'] } }],
    })
    if (!handle) return null
    const file = await handle.getFile()
    const text = await file.text()
    linkedFileHandle = handle
    linkedPath = null
    return { project: validateProject(JSON.parse(text)), label: handle.name }
  }
  return null
}

/** Save project directly to the linked filesystem file (silent overwrite on Ctrl+S) without triggering browser downloads. */
export async function saveProjectToDisk(project: Project, forcePick = false): Promise<string | null> {
  const json = serializeProject(project)
  const defaultName = (project.name || 'project').replace(/[^\w.-]+/g, '_') + '.json'
  const invoke = tauriInvoke()
  if (invoke) {
    if (!linkedPath || forcePick) {
      const chosen = (await invoke('pick_project_file', { defaultName })) as string | null
      if (!chosen) return null
      linkedPath = chosen
    }
    await invoke('write_project_file', { path: linkedPath, content: json })
    return linkedPath
  }
  const win = window as any
  if (typeof win.showSaveFilePicker === 'function') {
    if (!linkedFileHandle || forcePick) {
      linkedFileHandle = await win.showSaveFilePicker({
        suggestedName: defaultName,
        types: [{ description: 'Miniforge Project (.json)', accept: { 'application/json': ['.json'] } }],
      })
    }
    const writable = await linkedFileHandle.createWritable()
    await writable.write(json)
    await writable.close()
    return linkedFileHandle.name as string
  }
  return null
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
  const invoke = tauriInvoke()
  if (invoke) {
    return Boolean(
      await invoke('save_bytes', {
        name,
        bytes: Array.from(new Uint8Array(await blob.arrayBuffer())),
      }),
    )
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
