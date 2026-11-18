import { adapter, loadScript } from './index'

export function createPlatform(id: string) {
  let sdk: any
  return adapter(id, {
    async initialize() {
      if (!(window as any).PokiSDK) await loadScript('https://game-cdn.poki.com/scripts/v2/poki-sdk.js')
      const api = (window as any).PokiSDK
      await api.init()
      sdk = api
    },
    available: () => Boolean(sdk),
    ready: () => sdk?.gameLoadingFinished(),
    gameplay: (active) => (active ? sdk?.gameplayStart() : sdk?.gameplayStop()),
    language: () => sdk?.getLanguage?.(),
    async advertise(rewarded) {
      if (rewarded) return (await sdk.rewardedBreak()) === true
      await sdk.commercialBreak()
      return true
    },
  })
}
