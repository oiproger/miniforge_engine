import { expect, test } from '@playwright/test'
import { build } from 'esbuild'

test('authored HUD navigates windows and sends held input through the real overlay', async ({ page }) => {
  const code = await build({
    stdin: {
      resolveDir: process.cwd(),
      contents: `
    import {makeProject} from './packages/project-schema/src'
    import {Overlay,translate} from './packages/runtime/src/overlay'
    import {Input} from './packages/runtime/src/input'
    const project=makeProject('Inventory test')
    project.screens=[{id:'menu',name:'Start',phase:'menu'},{id:'bag',name:'Bag',phase:'window'},{id:'shop',name:'Shop',phase:'window'}]
    const button=(id,text,screen,action,target,x,y)=>({id,type:'button',text,screen,action,target,x,y})
    project.ui=[button('start','Enter vault','menu','play',null,10,10),button('inv','Inventory',undefined,'open','bag',10,20),
      button('jump','Jump',undefined,'input','Jump',20,40),button('store','Shop','bag','open','shop',10,10),
      button('back','Previous','shop','back',null,20,20),button('exit','Exit','shop','close',null,30,30),
      {id:'gold',text:'Gold',screen:'bag',type:'counter',variable:'gold',anchor:'bottom-right',x:4,y:8}]
    const signal=new AbortController()
    window.edges=[];const input=new Input(signal.signal,()=>overlay.back(),(name,down)=>window.edges.push([name,down]))
    const actions={ play:()=>overlay.render('playing',3,42,7,'en',true),pause:()=>overlay.render('paused',3,42,7,'en',true),retry(){},reward(){},language(){},emit(){} }
    const overlay=new Overlay(project,actions,input,k=>translate(project,'en',k))
    window.held=()=>input.pressed('Jump');window.movement=()=>input.move;document.body.append(overlay.host)
    overlay.render('menu',3,42,7,'en',true);overlay.update(3,42,{gold:12})
  `,
    },
    bundle: true,
    write: false,
    format: 'iife',
  })
  await page.setContent('<!doctype html><html><body></body></html>')
  await page.addScriptTag({ content: code.outputFiles[0].text })
  const btn = (name: string) => page.getByRole('button', { name, exact: true })
  await btn('Enter vault').click()
  await btn('Inventory').click()
  await page.keyboard.down('KeyD')
  expect(await page.evaluate(() => (window as any).movement())).toEqual([0, 0])
  await page.keyboard.up('KeyD')
  const gold = page.locator('[data-ui-id=gold]')
  await expect(gold).toHaveText('Gold 12')
  const rect = await gold.boundingBox()
  expect(rect!.x).toBeGreaterThan(1000)
  await btn('Shop').click()
  await page.keyboard.press('Escape')
  await expect(gold).toBeVisible()
  await btn('Shop').click()
  await btn('Previous').click()
  await expect(gold).toBeVisible()
  await btn('Shop').click()
  await btn('Exit').click()
  await expect(btn('Inventory')).toBeVisible()
  const jump = btn('Jump')
  await jump.hover()
  await page.mouse.down()
  expect(await page.evaluate(() => (window as any).held())).toBe(true)
  await page.keyboard.down('Space')
  await page.mouse.up()
  expect(await page.evaluate(() => (window as any).held())).toBe(true)
  await page.keyboard.up('Space')
  expect(
    await page.evaluate(() => (window as any).edges.filter(([name]: [string]) => name === 'Jump')),
  ).toEqual([
    ['Jump', true],
    ['Jump', false],
  ])
  expect(await page.evaluate(() => (window as any).held())).toBe(false)
  await page.getByRole('button', { name: 'Paused' }).click()
  await expect(btn('Resume')).toBeVisible()
})
