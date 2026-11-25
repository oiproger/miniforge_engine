import test from 'node:test'
import assert from 'node:assert/strict'
import { safeSyncValue, validSyncPath, syncPaths, readSyncPath, writeSyncPath } from '../packages/runtime/src/networkSyncFields.ts'
const entity = () => ({ id:'beacon', name:'Beacon', active: true, parent:null,
  transform:{position:[0,0,0],rotation:[0,0,0],scale:[1,1,1]},
  properties:{hp:100, inventory:{gold:5}},
  components:[{type:'mesh',color:'#fff'}, {type:'light',intensity:2,range:9}, {type:'behavior',params:{speed:3}}, {type:'networkSync',owner:'host'}] })
test('selected nested paths read and write',()=>{
 const ent=entity()
 for(const [p,v] of [['properties.hp',75],['properties.inventory.gold',12],['components.light.intensity',4],['components.behavior.params.speed',7]]) {
   assert.equal(validSyncPath(p),true);assert.equal(writeSyncPath(ent,p,v),true);assert.equal(readSyncPath(ent,p),v)
 }
 assert.equal(writeSyncPath(ent,'properties.hp',75),false)
})
test('blocks prototype pollution, executable config and unbounded payloads',()=>{
 const ent=entity()
 for (const p of ['properties.__proto__.evil','components.script.data','components.networkSync.owner','components.mesh.asset','properties.constructor']) {
   assert.equal(validSyncPath(p),false,p);assert.equal(writeSyncPath(ent,p,'bad'),false)
 }
 assert.equal(safeSyncValue({ constructor: 1 }),undefined)
 assert.equal(safeSyncValue('x'.repeat(4100)),undefined)
 assert.equal(safeSyncValue(NaN),undefined)
 assert.equal(({}).evil,undefined)
})
test('parses legacy keys and configured component paths into allowlisted paths',()=>{
 assert.deepEqual(syncPaths({syncKeys:'hp, ammo',syncPaths:'components.light.intensity, properties.hp'}),
   ['components.light.intensity','properties.hp','properties.ammo'])
})
test('does not construct arbitrary nested objects remotely',()=>{
 const ent=entity()
 assert.equal(writeSyncPath(ent,'properties.inventory.diamonds',5),true)
 assert.equal(writeSyncPath(ent,'properties.missing.gold',5),false)
})

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
test('Arena examples configure host authority for the Energy Beacon',()=>{
  for(const name of ['Multiplayer Arena 3D.json','WebRTC Arena 3D (P2P).json']) {
    const json=JSON.parse(readFileSync(resolve('examples',name),'utf8'))
    const beacon=json.scenes[0].entities.find(x=>x.id==='beacon')
    const sync=beacon.components.find(x=>x.type==='networkSync')
    assert.equal(sync.owner,'host');assert.equal(sync.syncActive,true);assert.equal(sync.syncTransform,false)
  }
})
