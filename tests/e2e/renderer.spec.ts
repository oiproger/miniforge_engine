import { test, expect } from '@playwright/test'
import { build } from 'esbuild'

test('Render3D renders textured geometry, picks its owner and compiles every editor shader preset', async ({
  page,
}) => {
  const { outputFiles } = await build({
    bundle: true,
    write: false,
    format: 'iife',
    stdin: {
      resolveDir: process.cwd(),
      contents: `
    import {createWorld} from './packages/graphics/src'
    import {makeProject,makeEntity,makeMaterial} from './packages/project-schema/src'
    import {checkShader,shaders} from './apps/editor/src/shaderTemplates'
    window.verify=async()=>{
      for(const shader of Object.values(shaders))checkShader(shader.vertex,shader.fragment)
      const p=makeProject(),box=makeEntity('Box','box'),mat=makeMaterial('Stone','#55cc99')
      const image=document.createElement('canvas');image.width=image.height=2
      const ctx=image.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,2,2)
      mat.properties.map='pattern'
      p.assets.push(mat,{id:'pattern',name:'pattern.png',type:'texture',properties:{},data:image.toDataURL()})
      box.components[0].material=mat.id;p.scenes[0].entities.push(box)
      const host=document.createElement('div');host.style.cssText='width:320px;height:240px';document.body.append(host)
      const world=createWorld(host,p)
      try{
        await world.ready();world.camera.position.set(0,0,4);world.camera.rotation.set(0,0,0);world.camera.height=4
        world.render()
        const hit=world.pick(160,120),canvas=world.renderer.domElement,gl=canvas.getContext('webgl2'),pixel=new Uint8Array(4)
        gl.readPixels(160,120,1,1,gl.RGBA,gl.UNSIGNED_BYTE,pixel);const objectColor=[...pixel]
        world.setEntityActive(box.id,false);world.render();gl.readPixels(160,120,1,1,gl.RGBA,gl.UNSIGNED_BYTE,pixel)
        return {hit:hit===box.id,hidden:world.pick(160,120)===undefined,changed:objectColor.some((v,i)=>v!==pixel[i]),renderer:canvas.dataset.renderer}
      }finally{world.dispose();host.remove()}
    }`,
    },
  })
  await page.setContent('<html><body></body></html>')
  await page.addScriptTag({ content: outputFiles[0].text })
  expect(await page.evaluate(() => (window as any).verify())).toEqual({
    hit: true,
    hidden: true,
    changed: true,
    renderer: 'littlejs-render3d',
  })
})

test('WebGL2 composes projected decals, local shadows and post-processing in one scene', async ({ page }) => {
  const { outputFiles } = await build({
    bundle: true, write: false, format: 'iife',
    stdin: { resolveDir: process.cwd(), contents: `
      import { createWorld } from './packages/graphics/src'
      import { makeEntity, makeMaterial, makeProject } from './packages/project-schema/src'
      window.verifyEffects = async () => {
        const project = makeProject()
        const scene = project.scenes[0]
        scene.environment.shadows = true
        scene.environment.shadowQuality = 'low'
        const wall = makeEntity('Decal receiver', 'box')
        const point = makeEntity('Local shadow light')
        point.transform.position = [1, 2, 3]
        point.components = [{type: 'light', kind: 'point', intensity: 2, range: 7, castShadow: true, shadowResolution: 256}]
        const paint = makeMaterial('Paint', '#ff1420')
        const decal = makeEntity('Projected paint')
        decal.transform.position = [0, 0, 0.5]
        decal.components = [{type: 'decal', material: paint.id, projection: 'surface', projectionDepth: 1, width: 1, height: 1}]
        project.assets.push(paint)
        scene.entities.push(wall, point, decal)
        const host = document.createElement('div')
        host.style.cssText = 'width:320px;height:240px'
        document.body.append(host)
        const world = createWorld(host, project)
        try {
          await world.ready()
          world.camera.position.set(0, 0, 4)
          world.camera.rotation.set(0, 0, 0)
          world.camera.height = 3
          world.setPostProcess({vignette: 0.65})
          const canvas = world.renderer.domElement
          const gl = canvas.getContext('webgl2')
          const sample = () => {
            world.render()
            const pixel = new Uint8Array(4)
            gl.readPixels(canvas.width / 2, canvas.height / 2, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel)
            return [...pixel]
          }
          const painted = sample()
          world.setEntityActive(decal.id, false)
          const bare = sample()
          return {changed: painted.some((value, i) => value !== bare[i]), error: gl.getError(), canvases: host.querySelectorAll('canvas').length}
        } finally {
          world.dispose()
          host.remove()
        }
      }
    ` },
  })
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()) })
  await page.setContent('<body></body>')
  await page.addScriptTag({ content: outputFiles[0].text })
  expect(await page.evaluate(() => (window as any).verifyEffects())).toEqual({ changed: true, error: 0, canvases: 1 })
  expect(errors).toEqual([])
})
