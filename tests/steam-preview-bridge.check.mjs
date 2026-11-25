import test from 'node:test'
import assert from 'node:assert/strict'
import { SteamManager } from '../packages/runtime/src/steam.ts'

// Simulate opaque-origin editor previews: BroadcastChannel and localStorage
// unavailable, but postMessage to a trusted parent frame works.
test('Steam Local Debug works across sandbox-style parent bridge without shared storage', async () => {
  const oldWindow=globalThis.window
  const oldBroadcast=globalThis.BroadcastChannel
  const oldStorage=Object.getOwnPropertyDescriptor(globalThis,'localStorage')
  const handlers=new Set()
  const parent={ postMessage(message) {
    queueMicrotask(() => {for(const handler of [...handlers]) handler({source:parent,data:structuredClone(message)})})
  }}
  globalThis.window={ parent, addEventListener(name,handler) {if(name==='message') handlers.add(handler)},
    removeEventListener(name,handler) {if(name==='message') handlers.delete(handler)} }
  globalThis.BroadcastChannel=undefined
  Object.defineProperty(globalThis,'localStorage',{configurable:true,get(){ throw new DOMException('Sandbox origin', 'SecurityError') }})
  const host=new SteamManager({localDebug:true})
  const guest=new SteamManager({localDebug:true})
  try {
    await host.init(480)
    await guest.init(480)
    assert.equal(host.getMode(),'local-debug')
    assert.equal(guest.isAvailable(),false)
    const created=await host.createLobby({name:'Test Sandbox Lobby',maxMembers:2})
    await new Promise(resolve=>setTimeout(resolve,5))
    const list=await guest.listLobbies()
    assert.ok(list.some(l=>l.id===created.id),'second preview sees host lobby')
    const joined=await guest.joinLobby(created.id)
    assert.ok(joined)
    await new Promise(resolve=>setTimeout(resolve,5))
    let packet
    const off=host.onP2PPacket((p,from)=>packet={p,from})
    guest.sendP2P({type:'rpc',payload:{name:'sandbox-test'}})
    await new Promise(resolve=>setTimeout(resolve,5))
    assert.equal(packet?.p?.payload?.name,'sandbox-test')
    assert.equal(packet?.from,guest.getUser().steamId)
    off()
    assert.equal(await guest.cloudWrite('test-save','offline mock'),true)
    assert.equal(await guest.cloudRead('test-save'),'offline mock')
    assert.ok(guest.cloudList().includes('test-save'))
    assert.equal(await guest.unlockAchievement('ACH_TEST'),true)
    assert.equal(guest.hasAchievement('ACH_TEST'),true)
  } finally {
    host.dispose();guest.dispose()
    globalThis.window=oldWindow
    globalThis.BroadcastChannel=oldBroadcast
    if(oldStorage) Object.defineProperty(globalThis,'localStorage',oldStorage)
    else delete globalThis.localStorage
    assert.equal(handlers.size,0,'parent message listeners released')
  }
})
