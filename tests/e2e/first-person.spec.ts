import { expect, test } from '@playwright/test'
import { build } from 'esbuild'

test('first-person mouse look updates rendered frames between physics steps', async ({ page }) => {
  const { outputFiles } = await build({
    bundle: true, write: false, format: 'iife',
    stdin: { resolveDir: process.cwd(), contents: `
      import { createTemplate } from './templates'
      import { startGame } from './packages/runtime/src'
      import createPhysics from './packages/runtime/src/physics'
      import { createPlatform } from './packages/platform-sdk/src/web'

      window.start = async () => {
        const project = createTemplate('first-person')
        project.scenes[0].entities[0].components.push({ type: 'script', asset: 'camera-probe' })
        let clock = 0, nextFrame, camera, frameRotation, fixedSteps = 0
        Object.defineProperty(performance, 'now', { value: () => clock })
        window.requestAnimationFrame = (callback) => { nextFrame = callback; return 1 }
        const session = await startGame(document.querySelector('#game'), project, {
          platform: createPlatform('first-person-test'),
          physics: createPhysics,
          scripts: { 'camera-probe': (api) => {
            camera = api.camera
            return {
              onFixedUpdate() { fixedSteps++ },
              onUpdate() { frameRotation = [camera.rotation.x, camera.rotation.y] },
            }
          } },
        })
        const canvas = document.querySelector('#game canvas')
        window.look = (dx, dy) => {
          canvas.dispatchEvent(new MouseEvent('mousemove', {
            bubbles: true, movementX: dx, movementY: dy,
          }))
        }
        window.step = (ms) => {
          clock += ms
          nextFrame(clock)
          return { frameRotation, fixedSteps }
        }
        window.resetLook = () => camera.setLook(0, 0)
        window.pause = () => session.pause()
      }
    ` },
  })
  await page.goto('/games/web/project.json')
  await page.setContent('<div id="game" style="width:480px;height:300px"></div>')
  await page.addScriptTag({ content: outputFiles[0].text })
  await page.evaluate(() => (window as any).start())

  const beforeLock = await page.evaluate(() => {
    const game = window as any
    game.look(10, -5)
    return game.step(0)
  })
  expect(beforeLock).toEqual({ frameRotation: [0, 0], fixedSteps: 0 })

  const canvas = page.locator('#game canvas[data-renderer]')
  await canvas.click()
  await expect.poll(() => canvas.evaluate((el) => document.pointerLockElement === el)).toBe(true)

  const steps = await page.evaluate(() => {
    const game = window as any
    game.resetLook()
    return [4, 4, 4, 5].map((ms) => {
      game.look(10, -5)
      return game.step(ms)
    })
  })
  expect(steps.map(({ fixedSteps }) => fixedSteps)).toEqual([0, 0, 0, 1])
  for (const [i, { frameRotation }] of steps.entries()) {
    expect(frameRotation[0]).toBeCloseTo(0.01 * (i + 1))
    expect(frameRotation[1]).toBeCloseTo(-0.02 * (i + 1))
  }

  await page.evaluate(() => (window as any).pause())
  await expect.poll(() => page.evaluate(() => document.pointerLockElement === null)).toBe(true)
})
