import { adapter } from './index'

function mockAd(rewarded: boolean) {
  return new Promise<boolean>((resolve) => {
    const dialog = document.createElement('dialog')
    dialog.style.cssText =
      'border:1px solid #456;background:#172428;color:#eef9f5;border-radius:12px;padding:24px;font:16px system-ui;text-align:center;z-index:10000'
    const title = document.createElement('p')
    title.textContent = rewarded ? 'Rewarded ad · Local test' : 'Interstitial · Local test'
    dialog.append(title)
    const finish = (result: boolean) => {
      dialog.close()
      dialog.remove()
      resolve(result)
    }
    for (const label of rewarded ? ['Complete ad', 'Skip'] : ['Close ad']) {
      const button = document.createElement('button')
      button.textContent = label
      button.onclick = () => finish(label !== 'Skip')
      button.style.cssText = 'margin:5px;padding:8px 14px;cursor:pointer'
      dialog.append(button)
    }
    dialog.addEventListener('cancel', (e) => {
      e.preventDefault()
      finish(false)
    })
    document.body.append(dialog)
    dialog.showModal()
  })
}
export const createPlatform = (id: string) =>
  adapter(id, {
    initialize: async () => {},
    available: () => true,
    advertise: mockAd,
  })
