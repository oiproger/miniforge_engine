import { expect, test } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { strFromU8, unzipSync } from 'fflate'
import type { Project } from '../../packages/project-schema/src'

test('widget studio completes HTML, CSS and bridge code, previews snippets and saves the asset', async ({ page }, info) => {
  await page.goto('/editor/')
  await page.getByRole('button', { name: 'New Project', exact: true }).click()
  await page.getByRole('button', { name: 'Create Project', exact: true }).click()
  await page.getByRole('button', { name: 'Assets', exact: true }).first().click()
  await page.getByRole('button', { name: 'New HTML widget', exact: true }).click()

  const studio = page.getByRole('dialog', { name: 'HTML / CSS / JS Widget Studio' })
  const preview = studio.frameLocator('iframe')
  const selectTab = (name: string) => studio.getByRole('tab', { name, exact: true }).click()
  const code = () => studio.getByRole('tabpanel').locator('.monaco-editor .view-lines')
  const replaceCode = async (text: string) => {
    await code().click()
    await page.keyboard.press('Control+a')
    await page.keyboard.insertText(text)
  }
  const suggestion = (name: string) => studio.getByRole('option', { name: new RegExp('^' + name + '\\b') })
  await studio.getByRole('checkbox', { name: 'Live' }).uncheck()
  await replaceCode('<button data-')
  await page.keyboard.press('Control+Space')
  await expect(suggestion('data-event')).toBeVisible()
  await page.keyboard.press('Escape')

  await replaceCode('mf-but')
  await page.keyboard.press('Control+Space')
  await expect(suggestion('mf-button')).toBeVisible()
  await page.keyboard.press('Enter')
  await page.keyboard.press('Tab')
  await page.keyboard.insertText('Use widget')
  await page.keyboard.press('Tab')
  await expect(code()).toContainText('Use widget')
  await replaceCode(`<button type="button" data-event="inventory.use" data-payload='{"icon":"messages"}'>
  Use widget <svg width="16" height="16" viewBox="0 0 16 16"><path d="M0 0h16v16H0z" /></svg>
</button>
<button type="button" data-action="close">Close</button>
<button type="button" data-action="phone.custom" data-target="tasks">Tasks</button>`)

  await selectTab('CSS')
  await replaceCode('button {\n  display: gr')
  await page.keyboard.press('Control+Space')
  await expect(suggestion('grid')).toBeVisible()
  await page.keyboard.press('Escape')
  await replaceCode('/* Widget styles */\n')
  await studio.getByLabel('Insert snippet').selectOption('mf-grid')
  await expect(code()).toContainText('grid-template-columns')
  await page.keyboard.press('Escape')

  await selectTab('JS')
  await replaceCode('miniforge.')
  await page.keyboard.press('Control+Space')
  await expect(suggestion('emit')).toBeVisible()
  await expect(suggestion('setVar')).toBeVisible()
  await page.keyboard.press('Escape')
  await replaceCode(`miniforge.on("inventory.use", (data) => console.log("Opened", data.icon));
miniforge.on("phone.custom", (target) => console.log("Custom action", target));
miniforge.on("studio.test", (data) => console.log(data.text));
// trailing comment`)
  await expect(preview.getByRole('button', { name: 'Use widget' })).toHaveCount(0)
  await studio.getByRole('button', { name: 'Run', exact: true }).click()
  await preview.getByRole('button', { name: 'Use widget' }).locator('svg path').dispatchEvent('click')
  await expect(studio.getByText('emit("inventory.use")', { exact: true })).toBeVisible()
  await expect(studio.getByText('Opened messages', { exact: true })).toBeVisible()
  await preview.getByRole('button', { name: 'Tasks' }).press('Enter')
  await expect(studio.getByText('Custom action tasks', { exact: true })).toBeVisible()
  await preview.getByRole('button', { name: 'Close' }).press('Enter')
  await expect(studio.getByText('action("close") · game only', { exact: true })).toBeVisible()

  await studio.getByLabel('Test event name').fill('studio.test')
  await studio.getByLabel('Test event payload (JSON or text)').fill('{"text":"bridge round trip"}')
  await studio.getByRole('button', { name: 'Send', exact: true }).click()
  await expect(studio.getByText('bridge round trip', { exact: true })).toBeVisible()

  await studio.getByLabel('Widget template').selectOption('phone')
  await expect(studio.getByRole('button', { name: 'Replace code' })).toBeVisible()
  await studio.getByRole('button', { name: 'Keep code', exact: true }).click()
  await selectTab('HTML')
  await expect(code()).toContainText('Use widget')
  await studio.getByRole('button', { name: 'Save changes' }).click()

  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'File', exact: true }).click()
  await page.getByRole('button', { name: 'Export archive (.miniforge)', exact: true }).click()
  const path = info.outputPath('widget.miniforge')
  await (await download).saveAs(path)
  const model = JSON.parse(strFromU8(unzipSync(await readFile(path))['project.json'])) as Project
  const asset = model.assets.find((item) => item.type === 'html')
  expect(asset?.data).toContain('Use widget')
  expect(asset?.properties.css).toContain('grid-template-columns')
  expect(asset?.properties.js).toContain('studio.test')
})
