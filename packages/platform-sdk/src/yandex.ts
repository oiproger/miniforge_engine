import { adapter, loadScript } from './index'

export function createPlatform(id: string) {
  let sdk: any
  let player: Promise<any> | undefined
  const getPlayer = () => (player ??= sdk?.getPlayer({ scopes: false }).catch(() => undefined))
  return adapter(id, {
    async initialize() {
      if (!(window as any).YaGames) await loadScript('/sdk.js')
      sdk = await (window as any).YaGames.init()
    },
    available: () => Boolean(sdk),
    ready: () => sdk?.features.LoadingAPI?.ready(),
    gameplay: (active) => (active ? sdk?.features.GameplayAPI?.start() : sdk?.features.GameplayAPI?.stop()),
    language: () => sdk?.environment.i18n.lang,
    advertise: (rewarded) =>
      new Promise((resolve) => {
        let earned = false
        const onError = () => resolve(false)
        if (rewarded)
          sdk.adv.showRewardedVideo({
            callbacks: {
              onRewarded: () => {
                earned = true
              },
              onClose: () => resolve(earned),
              onError,
            },
          })
        else
          sdk.adv.showFullscreenAdv({
            callbacks: { onClose: (shown: boolean) => resolve(shown), onError, onOffline: onError },
          })
      }),
    async save(key, value) {
      const account = await getPlayer()
      if (!account) throw new Error('Yandex cloud unavailable')
      await account.setData({ [id + '.' + key]: value }, true)
    },
    async load(key) {
      const k = id + '.' + key
      return (await (await getPlayer())?.getData([k]))?.[k]
    },
  })
}
