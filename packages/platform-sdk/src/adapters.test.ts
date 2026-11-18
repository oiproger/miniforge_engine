import { afterEach, expect, test, vi } from 'vitest'
import { createPlatform as createYandex } from './yandex'
import { createPlatform as createPoki } from './poki'
afterEach(() => vi.unstubAllGlobals())
function globals(windowMock: unknown) {
  vi.stubGlobal('window', windowMock)
  vi.stubGlobal('document', { dispatchEvent: vi.fn(), hidden: false })
}
test('Yandex grants only confirmed rewards, prevents simultaneous ads and duplicate lifecycle calls', async () => {
  let callbacks: any
  const sdk = {
    environment: { i18n: { lang: 'ru' } },
    adv: {
      showRewardedVideo: (request: any) => {
        callbacks = request.callbacks
      },
    },
    features: { LoadingAPI: { ready: vi.fn() }, GameplayAPI: { start: vi.fn(), stop: vi.fn() } },
  }
  globals({ YaGames: { init: async () => sdk } })
  const platform = createYandex('test')
  await platform.initialize()
  platform.loadingReady()
  platform.loadingReady()
  platform.gameplayStart()
  platform.gameplayStart()
  expect(sdk.features.LoadingAPI.ready).toHaveBeenCalledTimes(1)
  expect(sdk.features.GameplayAPI.start).toHaveBeenCalledTimes(1)
  expect(platform.getLanguage()).toBe('ru')
  const canceled = platform.showRewarded()
  expect(await platform.showRewarded()).toBe(false)
  callbacks.onClose()
  expect(await canceled).toBe(false)
  const completed = platform.showRewarded()
  callbacks.onRewarded()
  callbacks.onClose()
  expect(await completed).toBe(true)
})
test('Poki calls loading, gameplay and rewarded APIs; blocked SDK remains playable', async () => {
  const sdk = {
    init: vi.fn(async () => {}),
    gameLoadingFinished: vi.fn(),
    gameplayStart: vi.fn(),
    gameplayStop: vi.fn(),
    rewardedBreak: vi.fn(async () => false),
  }
  globals({ PokiSDK: sdk })
  const p = createPoki('test')
  await p.initialize()
  p.loadingReady()
  p.gameplayStart()
  p.gameplayStart()
  expect(sdk.gameplayStart).toHaveBeenCalledTimes(1)
  expect(await p.showRewarded()).toBe(false)
  expect(sdk.rewardedBreak).toHaveBeenCalledOnce()
  sdk.init.mockRejectedValueOnce(new Error('offline'))
  const offline = createPoki('offline')
  await offline.initialize()
  expect(offline.isAvailable()).toBe(false)
  expect(await offline.showRewarded()).toBe(false)
})
