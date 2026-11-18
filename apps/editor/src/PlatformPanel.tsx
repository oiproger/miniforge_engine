import { useMemo, useState } from 'react'
import { createPlatform } from '../../../packages/platform-sdk/src/web'

export default function PlatformPanel({ id }: { id: string }) {
  const adapter = useMemo(() => createPlatform(id + '.sdk-test'), [id])
  const [result, setResult] = useState(''),
    [pending, setPending] = useState(false)
  async function run(action: string) {
    setPending(true)
    try {
      await adapter.initialize()
      if (action === 'language') setResult('Language · ' + adapter.getLanguage())
      if (action === 'interstitial') {
        await adapter.showInterstitial()
        setResult('Interstitial closed')
      }
      if (action === 'reward') setResult((await adapter.showRewarded()) ? 'Reward granted' : 'Ad skipped')
      if (action === 'storage') {
        const now = Date.now()
        await adapter.saveData('check', now)
        setResult((await adapter.loadData('check')) === now ? 'Save and load passed' : 'Save and load failed')
      }
    } catch (error) {
      setResult(String(error))
    } finally {
      setPending(false)
    }
  }
  return (
    <>
      <p>Test the local adapter used in Preview.</p>
      <div className="entity-grid">
        {[
          ['language', 'Read language'],
          ['storage', 'Test storage'],
          ['interstitial', 'Interstitial'],
          ['reward', 'Rewarded ad'],
        ].map(([action, title]) => (
          <button key={action} disabled={pending} onClick={() => run(action)}>
            {title}
          </button>
        ))}
      </div>
      <p role="status">{result}</p>
    </>
  )
}
