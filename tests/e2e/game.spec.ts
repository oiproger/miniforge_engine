import { test, expect } from '@playwright/test'
import { writeFile } from 'node:fs/promises'

test('standalone game on a subpath, cold and repeat load, language, input and pause', async ({
  page,
}, info) => {
  const errors: string[] = []
  page.on('pageerror', (err) => errors.push(err.message))
  const samples = []
  for (const run of ['cold', 'repeat']) {
    await page.goto('/games/web/')
    await expect(page.getByRole('heading', { name: 'Coin Rush 3D', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeEnabled()
    const metrics = await page.evaluate(() => {
      const transfers = performance.getEntriesByType('resource') as PerformanceResourceTiming[]
      const marks = performance.getEntriesByType('mark')
      const sdkStart = marks.find((m) => m.name === 'miniforge-sdk-start')
      const sdkEnd = marks.find((m) => m.name === 'miniforge-sdk-ready')
      return {
        readyMs: Math.round(marks.find((m) => m.name === 'miniforge-game-ready')!.startTime),
        menuObservedMs: Math.round(performance.now()),
        transferBytes: transfers.reduce((n, r) => n + r.transferSize, 0),
        sdkMs: sdkStart && sdkEnd ? +(sdkEnd.startTime - sdkStart.startTime).toFixed(2) : null,
        hardwareConcurrency: navigator.hardwareConcurrency,
        userAgent: navigator.userAgent,
      }
    })
    samples.push({ run, ...metrics })
  }
  const metricsPath = info.outputPath('browser-timing.json')
  await writeFile(metricsPath, JSON.stringify(samples, null, 2))
  await info.attach('browser-timing', { path: metricsPath })
  await page.getByRole('button', { name: 'EN', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Играть', exact: true })).toBeVisible()
  await page.reload()
  await page.getByRole('button', { name: 'Играть', exact: true }).click()
  const hud = page.locator('output[data-role=score]')
  await expect(hud).toContainText('Время')
  await page.keyboard.down('KeyW')
  await expect(hud).toContainText(/Монеты\s+1/)
  await page.keyboard.up('KeyW')
  await page.keyboard.press('Escape')
  await expect(page.getByRole('button', { name: 'Продолжить', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Продолжить', exact: true }).click()
  await expect(hud).toBeVisible()
  expect(errors).toEqual([])
})

test('time limit, saved best score, skipped and completed test ads', async ({ page }) => {
  // Change only the public duration setting to exercise a complete timed round quickly.
  await page.route('**/games/web/project.json', async (route) => {
    const response = await route.fetch()
    const data = await response.json()
    data.project.settings.duration = 3
    await route.fulfill({ response, json: data })
  })
  await page.setViewportSize({ width: 640, height: 400 })
  await page.goto('/games/web/')
  await page.getByRole('button', { name: 'Play', exact: true }).click()
  await page.keyboard.down('KeyW')
  await expect(page.locator('output')).toContainText(/Coins\s+1/)
  await page.keyboard.up('KeyW')
  await expect(page.getByRole('heading', { name: 'Results' })).toBeVisible({ timeout: 30000 })
  await expect(page.locator('section p')).toContainText(/Personal best\s+1/)
  await page.getByRole('button', { name: 'Watch ad · +15 seconds' }).click()
  await page.getByRole('button', { name: 'Skip' }).click()
  await expect(page.getByRole('heading', { name: 'Results' })).toBeVisible()
  await page.getByRole('button', { name: 'Watch ad · +15 seconds' }).click()
  await page.getByRole('button', { name: 'Complete ad' }).click()
  await expect(page.locator('output')).toContainText(/Time\s+1[345]/)
  await page.reload()
  await page.getByRole('button', { name: 'Play', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Results' })).toBeVisible({ timeout: 30000 })
  await expect(page.locator('section p')).toContainText(/Coins\s+0.*Personal best\s+1/)
})

for (const platform of ['poki', 'yandex']) {
  test(platform + ' exported game boots with the local test adapter', async ({ page }) => {
    const requests: string[] = []
    page.on('request', (r) => requests.push(r.url()))
    await page.goto('/games/' + platform + '/?mock=1')
    await page.getByRole('button', { name: 'Play', exact: true }).click()
    await expect(page.locator('output')).toContainText('Time')
    expect(requests.filter((url) => !url.startsWith('http://127.0.0.1:4179/'))).toEqual([])
  })
}

test('an exported TS script receives a collision callback when a wall blocks the player', async ({
  page,
}) => {
  const { createTemplate } = await import('../../templates')
  const { getScene, makeEntity } = await import('../../packages/project-schema/src')
  const { buildGame } = await import('../../packages/exporter/src')
  const { readFile } = await import('node:fs/promises')
  const project = createTemplate('coin-rush')
  const scene = getScene(project)
  const wall = makeEntity('Test wall', 'box')
  wall.transform.position = [0, 0.6, 1.73]
  wall.transform.scale = [4, 1.2, 0.2]
  wall.components.push({ type: 'collider', shape: 'box' })
  scene.entities.push(wall)
  project.assets.push({
    id: 'contact-script',
    name: 'contact.ts',
    type: 'script',
    properties: {},
    data: 'export default function(api: GameAPI){ return {onCollisionEnter(other: string){api.vars.lastContact = other}} }',
  })
  scene.entities.find((e) => e.id === 'player')!.components.push({ type: 'script', asset: 'contact-script' })
  project.ui.push({
    id: 'contact-display',
    type: 'counter',
    text: 'Contact',
    variable: 'lastContact',
    x: 5,
    y: 20,
  })
  const { files } = await buildGame(project, 'web', (name) =>
    readFile('apps/editor/public/engine/' + name, 'utf8'),
  )
  await page.route('**/collision/**', (route) => {
    const key = new URL(route.request().url()).pathname.slice('/collision/'.length) || 'index.html'
    const content = files[key]
    return route.fulfill({
      status: content ? 200 : 404,
      body: content ? Buffer.from(content) : undefined,
      contentType: key.endsWith('.js')
        ? 'text/javascript'
        : key.endsWith('.json')
          ? 'application/json'
          : key.endsWith('.css')
            ? 'text/css'
            : 'text/html',
    })
  })
  await page.goto('/collision/')
  await page.getByRole('button', { name: 'Play', exact: true }).click()
  await page.keyboard.down('KeyW')
  await expect(page.getByText('Contact ' + wall.id, { exact: true })).toBeVisible()
  await expect(page.locator('output')).toContainText(/Coins\s+0/)
  await page.keyboard.up('KeyW')
})
