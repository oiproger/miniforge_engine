import { expect, test } from '@playwright/test'
import { makeEntity, makeProject } from '../../packages/project-schema/src'

test('phone HUD toggles a child spotlight and both scripts log to the editor console', async ({ page }) => {
  test.setTimeout(120_000)
  const project = makeProject('Phone flashlight')
  const player = makeEntity('Player')
  player.properties.tags = ['player']
  player.components.push({ type: 'script', asset: 'phone-script', params: {} })
  const light = makeEntity('Flashlight')
  light.active = false
  light.parent = player.id
  light.components.push({ type: 'light', kind: 'spot', intensity: 4, range: 15, angle: 0.5 })
  project.scenes[0].entities.push(player, light)
  project.assets.push(
    {
      id: 'phone-script', name: 'Phone Controller.ts', type: 'script', properties: {},
      data: `export default function (api: GameAPI) {
        let off: (() => void) | undefined
        return {
          onStart() {
            console.log('Flashlight controller ready')
            off = api.events.on('hud.flashlight', () => {
              const playerId = api.findByTag('player')[0]
              const id = playerId && api.getChildByName(playerId, 'Flashlight')
              const light = id && api.find(id)
              if (!light) throw new Error('Missing Flashlight')
              api.setActive(light.id, !light.visible)
              console.log('Flashlight active:', light.active)
              api.ui.sendEvent('phone-widget', 'hud.flashlight.state', light.active)
            })
          },
          onDestroy() { off?.() },
        }
      }`,
    },
    {
      id: 'phone-asset', name: 'Phone.html', type: 'html',
      data: `<button aria-label="Flashlight" data-event="phone.openIcon" data-payload='{"icon":"flashlight"}'>
        <svg width="24" height="24" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="gold"/></svg>
      </button><output>Off</output>`,
      properties: {
        js: `miniforge.on('phone.openIcon', data => {
          console.log('Phone clicked:', data.icon)
          if (data.icon === 'flashlight') miniforge.emit('hud.flashlight')
        })
        miniforge.on('hud.flashlight.state', active => {
          document.querySelector('output').textContent = active ? 'On' : 'Off'
        })`,
      },
    },
  )
  project.ui.push({ id: 'phone-widget', type: 'html', asset: 'phone-asset', x: 10, y: 10, width: 40, height: 25 })

  await page.goto('/editor/')
  await page.locator('input[accept=".miniforge,.json,.zip"]').setInputFiles({
    name: 'phone-flashlight.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(project)),
  })
  await page.getByRole('button', { name: 'Play', exact: true }).click()
  const phone = page.frameLocator('iframe.preview').frameLocator('[data-ui-id="phone-widget"] iframe')
  const icon = phone.getByRole('button', { name: 'Flashlight', exact: true }).locator('svg')
  await expect(icon).toBeVisible({ timeout: 40_000 })
  await icon.click()
  await expect(phone.locator('output')).toHaveText('On')
  await icon.click()
  await expect(phone.locator('output')).toHaveText('Off')
  await page.getByRole('button', { name: 'Console', exact: true }).click()
  await expect(page.getByText('Flashlight controller ready', { exact: true })).toHaveCount(1)
  await expect(page.getByText('Flashlight active: true', { exact: true })).toHaveCount(1)
  await expect(page.getByText('Flashlight active: false', { exact: true })).toHaveCount(1)
  await expect(page.getByText('[HUD phone-widget] Phone clicked: flashlight', { exact: true })).toHaveCount(2)
})
