import {test,expect,vi} from 'vitest'
import {Events} from '../../runtime/src/lifecycle'
import {bindRule,type RuleAPI} from './rules'
function setup(){
  const events=new Events()
  const api: RuleAPI={events,selfId:'owner',vars:{health:3},sourceTags:id=>id==='ring'?['coin']:[],setActive:vi.fn(),screen:vi.fn(),loadScene:vi.fn(),playAnimation:vi.fn(),spawnPrefab:vi.fn(),playSound:vi.fn()}
  return {api,events}
}
test('filters event source, tag and typed comparison before executing ordered actions',()=>{
  const {api,events}=setup()
  const off=bindRule({type:'rule',event:'pickup',source:'ring',tag:'coin',condition:{key:'health',op:'>=',value:2},
    actions:[{kind:'setVariable',key:'score',value:3},{kind:'addVariable',key:'score',value:4},{kind:'openScreen',target:'inventory'}]},api)
  events.emit('pickup','other')
  expect(api.vars.score).toBeUndefined()
  events.emit('pickup',{source:'ring'})
  expect(api.vars.score).toBe(7)
  expect(api.screen).toHaveBeenCalledWith('inventory',true)
  api.vars.health=1
  events.emit('pickup','ring')
  expect(api.screen).toHaveBeenCalledTimes(1)
  off()
  api.vars.health=3
  events.emit('pickup','ring')
  expect(api.screen).toHaveBeenCalledTimes(1)
})
test('routes actions to scene APIs with owner as default target and spawn anchor',()=>{
  const {api,events}=setup()
  bindRule({type:'rule',event:'door',actions:[
    {kind:'spawnPrefab',target:'chest'},{kind:'playAnimation',clip:'Open'},
    {kind:'setActive',active:false},{kind:'playSound',target:'bell'},
    {kind:'closeScreen',target:'dialog'},{kind:'loadScene',target:'next'}]},api)
  events.emit('door')
  expect(api.spawnPrefab).toHaveBeenCalledWith('chest','owner')
  expect(api.playAnimation).toHaveBeenCalledWith('owner','Open')
  expect(api.setActive).toHaveBeenCalledWith('owner',false)
  expect(api.playSound).toHaveBeenCalledWith('bell')
  expect(api.screen).toHaveBeenCalledWith('dialog',false)
  expect(api.loadScene).toHaveBeenCalledWith('next')
})
test('events can chain rules while cycles cannot recur indefinitely',()=>{
  const {api,events}=setup()
  bindRule({type:'rule',event:'a',actions:[{kind:'addVariable',key:'a',value:1},{kind:'emit',event:'b'}]},api)
  bindRule({type:'rule',event:'b',actions:[{kind:'addVariable',key:'b',value:1},{kind:'emit',event:'a'}]},api)
  events.emit('a')
  expect(api.vars).toMatchObject({a:1,b:1})
  events.emit('a')
  expect(api.vars).toMatchObject({a:2,b:2})
})
