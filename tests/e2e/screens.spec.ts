import { expect, test } from '@playwright/test'
import { build } from 'esbuild'
import { compileEventGraphToScript } from '../../packages/exporter/src/nativizeEventGraph'
import type { EventGraphData } from '../../packages/project-schema/src'

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
      {id:'bag-grid',type:'container',screen:'shop',x:10,y:40,width:40,height:22,cellWidth:80,rowHeight:42,itemsVariable:'wares'},
      {id:'blinking',type:'label',screen:'bag',text:'Marker',x:60,y:20},
      {id:'grid-label',type:'text',text:'Stock',parentId:'bag-grid',screen:'shop',x:0,y:0},
      button('back','Previous','shop','back',null,20,20),button('exit','Exit','shop','close',null,30,30),
      {id:'gold',text:'Gold',screen:'bag',type:'counter',variable:'gold',anchor:'bottom-right',x:4,y:8}]
    const signal=new AbortController()
    window.edges=[];const input=new Input(signal.signal,()=>overlay.back(),(name,down)=>window.edges.push([name,down]))
    const actions={ play:()=>overlay.render('playing',3,42,7,'en',true),pause:()=>overlay.render('paused',3,42,7,'en',true),retry(){},reward(){},language(){},emit(){} }
    const overlay=new Overlay(project,actions,input,k=>translate(project,'en',k))
    let frame = 0
    const ui = overlay.scriptAPI(() => undefined)
    function updateHud() {
      ui.updateWidget('gold', { visible: true, text: 'Gold' })
      ui.setVisible('bag-grid', true)
      ui.setVisible('blinking', frame++ % 2 === 0)
    }
    window.hudTicks = () => frame
    setInterval(updateHud, 16)
    window.held=()=>input.pressed('Jump');window.movement=()=>input.move;document.body.append(overlay.host)
    overlay.render('menu',3,42,7,'en',true);overlay.update(3,42,{gold:12,wares:Array.from({length:10},(_,i)=>'Item '+(i+1))})
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
  const shop = btn('Shop')
  await shop.hover()
  await page.mouse.down()
  const pressedAt = await page.evaluate(() => (window as any).hudTicks())
  await expect.poll(() => page.evaluate(() => (window as any).hudTicks())).toBeGreaterThan(pressedAt)
  await page.mouse.up()
  await expect(btn('Previous')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(gold).toBeVisible()
  await btn('Shop').click()
  await page.setViewportSize({ width: 360, height: 640 })
  const grid = page.locator('[data-ui-id=bag-grid]')
  await expect(grid.getByText('Stock')).toBeVisible()
  const tenth = grid.getByText('Item 10', { exact: true })
  await tenth.scrollIntoViewIfNeeded()
  expect(await grid.evaluate((el) => el.scrollTop)).toBeGreaterThan(0)
  await expect(tenth).toBeInViewport()
  await page.setViewportSize({ width: 1440, height: 900 })
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

test('HUD graph actions work in both preview and compiled scripts', async ({ page }) => {
  const nodes = [
    { id: 'start', type: 'event.start' },
    { id: 'move', type: 'ui.setPosition', inputs: { id: 'meter', x: 18, y: 23 } },
    { id: 'resize', type: 'ui.setSize', inputs: { id: 'meter', width: 45, height: 8 } },
    { id: 'maximum', type: 'ui.setProgressMax', inputs: { id: 'meter', max: 200 } },
    { id: 'value', type: 'ui.setValue', inputs: { id: 'meter' } },
    { id: 'opacity', type: 'ui.setOpacity', inputs: { id: 'meter', opacity: 0.4 } },
    { id: 'inactive', type: 'ui.setValue', inputs: { id: 'coins', value: 0 } },
    { id: 'text', type: 'ui.setText', inputs: { id: 'coins', text: 'Gold' } },
    { id: 'bind', type: 'ui.bindValue', inputs: { id: 'mirror', variable: 'gold' } },
    { id: 'copy', type: 'ui.setValue', inputs: { id: 'mirror' } },
    { id: 'color', type: 'ui.setColors', inputs: { id: 'mirror', color: '#ffffff', background: '#000000' } },
    { id: 'show', type: 'ui.setVisible', inputs: { id: 'mirror' } },
    { id: 'projected', type: 'ui.setPosition', inputs: { id: 'mirror' } },
    { id: 'activeLabel', type: 'ui.setText', inputs: { id: 'mirror' } },
    { id: 'hideMarker', type: 'ui.setVisible', inputs: { id: 'marker' } },
  ].map((node) => ({ ...node, x: 0, y: 0 }))
  const graph: EventGraphData = {
    version: 1, variables: [], functions: [],
    nodes: [...nodes, { id: 'amount', type: 'math.op', x: 0, y: 0, inputs: { a: 100, b: 30 } },
      { id: 'read', type: 'ui.getValue', x: 0, y: 0, inputs: { id: 'meter' } },
      { id: 'exists', type: 'ui.hasWidget', x: 0, y: 0, inputs: { id: 'coins' } },
      { id: 'projection', type: 'camera.worldToScreen', x: 0, y: 0 },
      { id: 'activeScreen', type: 'ui.current', x: 0, y: 0 },
      { id: 'shown', type: 'ui.isWidgetVisible', x: 0, y: 0, inputs: { id: 'mirror' } }],
    edges: [
      ...nodes.slice(1).map((next, i) => ({
        id: 'edge' + i, fromNode: nodes[i].id, fromPin: 'exec', toNode: next.id, toPin: 'exec',
      })),
      { id: 'projection-x', fromNode: 'projection', fromPin: 'xPercent', toNode: 'projected', toPin: 'x' },
      { id: 'projection-y', fromNode: 'projection', fromPin: 'yPercent', toNode: 'projected', toPin: 'y' },
      { id: 'active-screen', fromNode: 'activeScreen', fromPin: 'screenId', toNode: 'activeLabel', toPin: 'text' },
      { id: 'shown-marker', fromNode: 'shown', fromPin: 'visible', toNode: 'hideMarker', toPin: 'visible' },
      { id: 'copy-value', fromNode: 'read', fromPin: 'value', toNode: 'copy', toPin: 'value' },
      { id: 'exists-link', fromNode: 'exists', fromPin: 'value', toNode: 'show', toPin: 'visible' },
      { id: 'amount-link', fromNode: 'amount', fromPin: 'result', toNode: 'value', toPin: 'value' },
    ],
  }
  const compiled = compileEventGraphToScript(graph, 'HUD test').replace('export default function', 'const compiled = function')
  const { outputFiles } = await build({
    bundle: true, write: false, format: 'iife',
    stdin: { resolveDir: process.cwd(), loader: 'ts', contents: `
      import { makeProject } from './packages/project-schema/src'
      import { createEventGraphLifecycle } from './packages/runtime/src/eventGraph'
      import { Overlay } from './packages/runtime/src/overlay'
      import { Input } from './packages/runtime/src/input'
      ${compiled}
      const graph = ${JSON.stringify(graph)} as const
      window.setup = (useCompiled) => {
        const project = makeProject('Graph HUD')
        project.screens = [{id: 'bag', name: 'Inventory', phase: 'window'}, {id: 'game', name: 'Game', phase: 'playing'}]
        project.ui = [
          {id: 'marker', type: 'label', text: 'Marker', x: 0, y: 0},
          {id: 'meter', type: 'progress', text: '', variable: 'health', x: 0, y: 0},
          {id: 'mirror', type: 'counter', text: '', screen: 'bag', x: 0, y: 0},
          {id: 'coins', type: 'counter', text: 'Coins', x: 5, y: 5, screen: 'bag'},
        ]
        const input = new Input(new AbortController().signal)
        const noop = () => {}
        const overlay = new Overlay(project, {play: noop, pause: noop, retry: noop, reward: noop, language: noop, emit: noop}, input, (text) => text)
        document.body.append(overlay.host)
        overlay.render('playing', 0, 0, 0, 'en', false)
        const meter = overlay.get('meter')
        const vars = {health: 10, gold: 12}
        const api = { ui: overlay.scriptAPI((name) => vars[name]), camera: { worldToScreen: () => ({
          x: 400, y: 100, xPercent: 40, yPercent: 20, depth: 5, visible: true
        }) } }
        const lifecycle = useCompiled ? compiled(api) : createEventGraphLifecycle(graph, api)
        lifecycle.onStart()
        overlay.update(0, 0, vars)
        const result = {sameElement: meter === overlay.get('meter'), value: meter.value, max: meter.max, markerHidden: !api.ui.isWidgetVisible('marker'),
          styles: [meter.style.left, meter.style.top, meter.style.width, meter.style.height, meter.style.opacity]}
        overlay.open('bag')
        const counter = overlay.get('coins').textContent
        api.ui.createWidget({ id: 'card', type: 'html', screen: 'bag', html: '<b>Initial</b>' })
        api.ui.setHtml('card', '<strong>Updated card</strong>')
        const htmlUpdated = overlay.get('card').querySelector('iframe').srcdoc.includes('<strong>Updated card</strong>')
        api.ui.createWidget({ id: 'grid', type: 'container', screen: 'bag' })
        api.ui.createWidget({ id: 'cell', type: 'label', screen: 'bag', parentId: 'grid' })
        api.ui.setVisible('grid', false)
        api.ui.setVisible('grid', true)
        api.ui.setSize('cell', 50, 20)
        const gridStyles = [overlay.get('grid').style.display, overlay.get('cell').style.width]
        const mirror = overlay.get('mirror')
        const mirrored = [mirror.textContent, mirror.style.background, mirror.style.display, mirror.style.left, mirror.style.top]
        api.ui.bindValue('coins', 'gold')
        overlay.update(0, 0, vars)
        const bound = overlay.get('coins').textContent
        api.ui.setValue('coins', 0)
        api.ui.setColors('coins', '#ffffff', '#000000')
        const read = api.ui.getValue('coins')
        const exists = api.ui.hasWidget('coins')
        overlay.dispose()
        return { ...result, counter, bound, read, exists, htmlUpdated, mirrored, gridStyles }
      }
    ` },
  })
  await page.setContent('<body></body>')
  await page.addScriptTag({ content: outputFiles[0].text })
  for (const compiled of [false, true]) {
    expect(await page.evaluate((compiled) => (window as any).setup(compiled), compiled)).toEqual({
      sameElement: true, markerHidden: true, value: 130, max: 200, styles: ['18%', '23%', '45%', '8%', '0.4'], counter: 'Gold 0', bound: 'Gold 12', read: 0, exists: true, htmlUpdated: true, gridStyles: ['grid', '100%'], mirrored: ['game 130', 'rgb(0, 0, 0)', '', '40%', '20%'],
    })
  }
})
