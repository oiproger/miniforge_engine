import { test, expect } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { strFromU8, unzipSync } from 'fflate'

test('Steam Relay Lab confirms an RPC round trip in Local Debug and exports Steam depot sources', async ({ page }, info) => {
  test.setTimeout(180_000)
  await page.goto('/editor/')
  await page.getByRole('button', { name: 'Open example Steam Relay Lab', exact: true }).click()
  await page.getByRole('button', { name: 'Project', exact: true }).click()
  await page.getByRole('button', { name: 'Multiplayer & Net Debugger', exact: true }).click()
  await page.getByRole('button', { name: 'Launch Host + Client' }).click()

  const dialog = page.getByRole('dialog', { name: 'Multiplayer & Net Debugger' })
  const host = dialog.frameLocator('iframe').nth(0)
  const client = dialog.frameLocator('iframe').nth(1)
  const button = (frame: typeof host, name: string) => frame.getByRole('button', { name, exact: true })
  await expect(host.locator('[data-field="mode"]')).toHaveText('Local Debug simulation', { timeout: 45_000 })
  await expect(client.locator('[data-field="mode"]')).toHaveText('Local Debug simulation', { timeout: 45_000 })
  await button(host, 'Create lobby').click()
  await expect(host.getByRole('status')).toContainText('Joined lobby')
  await button(client, 'Find lobbies').click()
  await expect(client.getByRole('status')).toContainText('Found 1 demo lobbies')
  await button(client, 'Join lobby').click()
  await expect(client.getByRole('status')).toContainText('Joined lobby')
  await expect(host.getByText(/steam-p2p · 2 connected/)).toBeVisible()
  await button(host, 'Update lobby metadata').click()
  await expect(client.locator('[data-field="metadata"]')).toContainText(/\d{4}-\d{2}-\d{2}T/)
  await button(host, 'Ping peer').click()
  await expect(host.getByRole('status')).toContainText('Round trip confirmed')
  await expect(client.getByRole('status')).toContainText('Received ping')
  await button(client, 'Cloud write').click()
  await expect(client.getByRole('status')).toContainText('Cloud probe written')
  await button(client, 'Cloud read').click()
  await expect(client.getByRole('status')).toContainText('savedAt')
  await button(client, 'Cloud list').click()
  await expect(client.getByRole('status')).toContainText('Cloud probe listed: yes')
  const achievement = client.getByRole('textbox', { name: 'Achievement API name' })
  await achievement.fill('')
  await achievement.pressSequentially('ACH_LOBBY_JOINED')
  await expect(achievement).toHaveValue('ACH_LOBBY_JOINED')
  await button(client, 'Test achievement').click()
  await expect(client.getByRole('status')).toContainText('Achievement confirmed')
  await button(client, 'Leave').click()
  await expect(client.getByRole('status')).toContainText('Left the lobby')
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()

  await page.getByRole('button', { name: 'Export', exact: true }).click()
  await page.getByLabel('Build profile').selectOption('linux')
  const pending = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Build & download', exact: true }).click()
  const path = info.outputPath('steam-relay-lab.zip')
  await (await pending).saveAs(path)
  const files = unzipSync(await readFile(path))
  expect(files['steam-depot.mjs']).toBeDefined()
  expect(files['src-tauri/src/steam.rs']).toBeDefined()
  const { project } = JSON.parse(strFromU8(files['game/project.json']))
  expect(project.settings.steam).toMatchObject({ enabled: true, appId: 480 })
  expect(files['steam_appid.txt']).toBeUndefined()
})

test('Desktop Steam preview uses the selected AppID and releases the session on Stop', async ({ page }) => {
  test.setTimeout(150_000)
  const calls: { command: string; args?: { appId: number } }[] = []
  await page.exposeBinding('desktopSteam', ({ frame }, command, args) => {
    expect(frame).toBe(page.mainFrame())
    calls.push({ command, args })
    if (command === 'steam_preview_supported') return true
    if (command === 'steam_init') {
      return { native: true, steamId: '76561198000000001', appId: args.appId, name: 'Preview tester' }
    }
    if (command === 'steam_relay_status') return 'Current: OK'
    if (command === 'steam_poll_p2p') return { packets: [] }
    return true
  })
  await page.addInitScript(() => {
    if (window === window.top) {
      const desktop = window as unknown as { desktopSteam: unknown; __TAURI__: unknown }
      desktop.__TAURI__ = { core: { invoke: desktop.desktopSteam } }
    }
  })
  await page.goto('/editor/')
  await page.getByRole('button', { name: 'Open example Steam Relay Lab', exact: true }).click()
  const game = page.frameLocator('iframe.preview')
  const launch = async () => {
    await page.getByRole('button', { name: 'Project', exact: true }).click()
    await page.getByRole('button', { name: 'Steamworks & Debug Panel', exact: true }).click()
    await page.getByRole('button', { name: 'Play with Steam', exact: true }).click()
    await expect(game.locator('[data-field="mode"]')).toHaveText('Native Steamworks', { timeout: 40_000 })
  }

  await launch()
  expect(calls).toContainEqual({ command: 'steam_init', args: { appId: 480 } })
  await expect(game.getByText(/Preview tester · 76561198000000001/)).toBeVisible()
  await game.getByRole('button', { name: 'Relay status', exact: true }).click()
  await expect(game.getByRole('status')).toContainText('SDR status: Current: OK')
  await page.getByRole('button', { name: 'Stop', exact: true }).click()
  await expect.poll(() => calls.filter(c => c.command === 'steam_preview_end').length).toBe(1)

  await launch()
  await page.getByRole('button', { name: 'Stop', exact: true }).click()
  await expect.poll(() => calls.filter(c => c.command === 'steam_preview_end').length).toBe(2)
  await page.getByRole('button', { name: 'Play', exact: true }).click()
  await expect(game.locator('[data-field="mode"]')).toHaveText('Local Debug simulation', { timeout: 40_000 })
  expect(calls.filter(c => c.command === 'steam_init')).toHaveLength(2)
})
