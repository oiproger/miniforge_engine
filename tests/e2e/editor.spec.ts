import { test, expect } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { unzipSync, strFromU8 } from 'fflate'
import type { Project } from '../../packages/project-schema/src'

test('GUI authors a scene, attaches a TS script, previews, saves, opens, and builds platform ZIPs', async ({
  page,
}, info) => {
  test.setTimeout(180000)
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  const button = (name: string) => page.getByRole('button', { name, exact: true })
  await page.goto('/editor/')
  await expect(page.getByText('Saved locally', { exact: true })).toBeVisible()
  await button('File').click()
  await button('New project').click()
  await page.getByLabel('Project name').fill('QA Workshop')
  await button('Create project').click()
  await button('Add entity').click()
  await button('Box').click()
  await page.getByLabel('Object name').fill('Signal cube')
  await page.getByLabel('position X', { exact: true }).fill('1.5')
  await page.getByLabel('position X', { exact: true }).press('Enter')
  await button('Add component').click()
  await page.locator('.mf-component-menu').getByRole('button', { name: 'Behavior', exact: true }).click()
  await expect(page.getByLabel('Behavior', { exact: true })).toHaveValue('rotate')
  await button('Add component').click()
  await page.locator('.mf-component-menu').getByRole('button', { name: 'Script', exact: true }).click()
  await expect(page.getByLabel('Script', { exact: true })).not.toHaveValue('')
  await button('Project').click()
  await button('UI editor').click()
  await button('Add element').click()
  await page.getByLabel('Text / locale key').fill('Workshop HUD')
  await button('Save changes').click()
  await button('Play').click()
  const preview = page.frameLocator('iframe.preview')
  await expect(preview.getByText('Workshop HUD')).toBeVisible()
  await preview.getByRole('button', { name: /Pause/ }).click()
  await preview.getByRole('button', { name: 'Resume', exact: true }).click()
  await expect(preview.getByRole('button', { name: /Pause/ })).toBeVisible()
  await button('Stop').click()

  const archivePromise = page.waitForEvent('download')
  await button('Save project').click()
  const archive = await archivePromise
  const path = info.outputPath('workshop.miniforge')
  await archive.saveAs(path)
  const entries = unzipSync(await readFile(path))
  const model = JSON.parse(strFromU8(entries['project.json'])) as Project
  const cube = model.scenes[0].entities.find((e) => e.name === 'Signal cube')
  expect(cube?.transform.position[0]).toBe(1.5)
  expect(cube?.components.map((c) => c.type)).toEqual(expect.arrayContaining(['mesh', 'behavior', 'script']))
  const script = cube?.components.find((c) => c.type === 'script')
  expect(model.assets.find((a) => a.id === script?.asset)?.data).toContain('onUpdate')
  await page.reload()
  await expect(page.getByText('Signal cube', { exact: true })).toBeVisible()
  await button('File').click()
  const open = page.waitForEvent('filechooser')
  await button('Open project').click()
  await (await open).setFiles(path)
  await expect(page.getByText('Project opened', { exact: true })).toBeVisible()

  for (const profile of ['yandex', 'poki']) {
    await button('Export').click()
    await page.getByLabel('Build profile').selectOption(profile)
    const zipPromise = page.waitForEvent('download')
    await button('Build & download').click()
    const zip = await zipPromise
    const zipPath = info.outputPath(profile + '.zip')
    await zip.saveAs(zipPath)
    const files = unzipSync(await readFile(zipPath))
    expect(files['index.html']).toBeDefined()
    const modulePath = JSON.parse(strFromU8(files['project.json'])).modules[script!.asset].replace(
      /^\.\//,
      '',
    )
    expect(strFromU8(files[modulePath])).toContain('onUpdate')
    const js = strFromU8(files['game.js'])
    expect(js).toContain(profile === 'yandex' ? 'YaGames' : 'PokiSDK')
    expect(js).not.toContain(profile === 'yandex' ? 'PokiSDK' : 'YaGames')
  }
  expect(errors).toEqual([])
})

test('Coin Rush preview plays in an isolated frame and native profiles include build sources', async ({
  page,
}, info) => {
  await page.goto('/editor/')
  await page.getByRole('button', { name: 'Play', exact: true }).click()
  const frame = page.frameLocator('iframe.preview')
  await expect(frame.getByRole('heading', { name: 'Coin Rush 3D' })).toBeVisible()
  await frame.getByRole('button', { name: 'Play', exact: true }).click()
  await page.keyboard.down('KeyW')
  await expect(frame.locator('output')).toContainText(/Coins\s+1/)
  await page.keyboard.up('KeyW')
  await page.getByRole('button', { name: 'Stop', exact: true }).click()
  for (const target of ['linux', 'windows']) {
    await page.getByRole('button', { name: 'Export', exact: true }).click()
    await page.getByLabel('Build profile').selectOption(target)
    const pending = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Build & download', exact: true }).click()
    const file = await pending,
      path = info.outputPath(target + '.zip')
    await file.saveAs(path)
    const files = unzipSync(await readFile(path))
    expect(files['game/index.html']).toBeDefined()
    expect(files['src-tauri/Cargo.lock']).toBeDefined()
    expect(JSON.parse(strFromU8(files['src-tauri/tauri.conf.json'])).bundle.targets).toEqual([
      target === 'linux' ? 'deb' : 'nsis',
    ])
  }
})
