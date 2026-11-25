import { afterEach, expect, it, vi } from 'vitest'
import { makeProject } from '../../../packages/project-schema/src'
import { clearLinkedDiskPath, openProjectFromDisk, saveProjectToDisk } from './io'

afterEach(() => { clearLinkedDiskPath(); vi.unstubAllGlobals() })

it('keeps the last valid file linked after a failed open', async () => {
  const project = makeProject('First')
  const invoke = vi.fn()
    .mockResolvedValueOnce(['first.json', JSON.stringify(project)])
    .mockResolvedValueOnce(['broken.json', '{'])
    .mockResolvedValueOnce(undefined)
  vi.stubGlobal('window', { __TAURI__: { core: { invoke } } })
  await openProjectFromDisk()
  await expect(openProjectFromDisk()).rejects.toThrow()
  await saveProjectToDisk(project)
  expect(invoke.mock.lastCall).toEqual(['write_project_file', { path: 'first.json', content: expect.any(String) }])
})

it('preserves the browser file handle after opening malformed JSON', async () => {
  const first = { name: 'first.json', getFile: async () => new Blob([JSON.stringify(makeProject('First'))]) }
  const broken = { name: 'broken.json', getFile: async () => new Blob(['{']) }
  const write = vi.fn()
  const handle = { ...first, createWritable: async () => ({ write, close: async () => {} }) }
  vi.stubGlobal('window', {
    showOpenFilePicker: vi.fn().mockResolvedValueOnce([handle]).mockResolvedValueOnce([broken]),
    showSaveFilePicker: vi.fn(),
  })
  const opened = await openProjectFromDisk()
  await expect(openProjectFromDisk()).rejects.toThrow()
  await saveProjectToDisk(opened!.project)
  expect(write).toHaveBeenCalledOnce()
})
