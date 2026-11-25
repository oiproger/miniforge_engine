import { afterEach, expect, it, vi } from 'vitest'
import { SaveManager, type SaveSystemContext } from './saveSystem'

afterEach(() => vi.unstubAllGlobals())

it.each([[true, true], [true, false], [false, true], [false, false]])(
  'reports the durable stores when device=%s and cloud=%s',
  async (device, cloud) => {
    const emit = vi.fn()
    vi.stubGlobal('localStorage', {
      getItem: () => null,
      setItem() { if (!device) throw Error('quota') },
    })
    const manager = new SaveManager({
      projectId: 'demo', events: { emit }, getScene: () => ({ entities: [] }),
      getWorld: () => ({}), getVars: () => ({}), getWorldState: () => ({}),
      getPlayer: () => ({}), getCamera: () => ({}), getSceneId: () => 'room',
      platform: { saveCloud: async () => { if (!cloud) throw Error('offline') } },
    } as unknown as SaveSystemContext)
    expect(await manager.save()).toMatchObject({ localSaved: device, cloudSaved: cloud })
    expect(emit.mock.lastCall?.[0]).toBe(device || cloud ? 'save.completed' : 'save.failed')
  },
)
