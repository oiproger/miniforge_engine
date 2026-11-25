import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { resolve, dirname } from 'node:path'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const example = (name) => JSON.parse(readFileSync(resolve(root, 'examples', name), 'utf8'))
const scriptFactory = (p) => {
  const script = p.assets.find(a => a.type === 'script' && /Arena|Lobby/.test(a.name))
  assert.ok(script, 'script asset found')
  // Embedded scripts have no imports and use a conventional default exported factory.
  return new Function(script.data.replace(/^export default function createBehavior/, 'function createBehavior') + '\nreturn createBehavior;')()
}

function fakeDOM() {
  const elements = new Map()
  const selector = (key) => {
    if (!elements.has(key)) {
      elements.set(key, { textContent: '', style: {}, value: '', dataset: {},
        options: [], replaceChildren() { this.options = [] },
        appendChild(x) { this.options.push(x) },
        addEventListener() {}, removeEventListener() {},
        remove() {},
      })
    }
    return elements.get(key)
  }
  return { body: { appendChild() {} }, createElement(tag) {
    if (tag === 'option') return { value: '', textContent: '' }
    return { style: {}, innerHTML: '', dataset: {},
      querySelector: selector,
      querySelectorAll: () => [],
      remove() {},
    }
  } }
}

function apiFake(p) {
  const state = { connected: false, isHost: true, room: 'arena-1', mode: 'client-server-ws', peerCount: 0, peerId: 'host', rttMs: 0 }
  let jump = false
  const record = { rpc: [], unsubscribed: 0 }
  const track = () => () => record.unsubscribed++
  const api = {
    project: p,
    entity: { id: 'player', properties: { hp: 100 } },
    transform: { position: { x: 0, y: 0, z: 0, set(x,y,z) { this.x=x; this.y=y; this.z=z } } },
    input: { pressed(action) { return action === 'Jump' && jump } },
    vars: {},
    events: { on: track },
    net: {
      peerId: () => state.peerId,
      getStats: () => ({ ...state }),
      onRpc: track, onPeerJoin: track, onPeerLeave: track,
      setEntityVar() {},
      rpc(...args) { record.rpc.push(args) },
    },
  }
  return { api, state, record, setJump(v) { jump=v } }
}

const filenames = readdirSync(resolve(root, 'examples')).filter(n => n.endsWith('.json'))

test('all example JSONs have valid scene and script references', () => {
  const ids = new Set()
  for (const filename of filenames) {
    const p = example(filename)
    assert.equal(p.version, 1, filename)
    assert.ok(p.id && !ids.has(p.id), 'unique project ID: ' + filename)
    ids.add(p.id)
    assert.ok(p.scenes.some(s => s.id === p.activeScene), filename + ': valid activeScene')
    const assets = new Set(p.assets.map(a=>a.id))
    for (const s of p.scenes) for (const entity of s.entities) for (const comp of entity.components) {
      if (comp.type === 'script') assert.ok(assets.has(comp.asset), `${filename} missing ${comp.asset}`)
    }
  }
})

test('WebSocket arena uses real relay, not an implicit local fallback', () => {
  const p=example('Multiplayer Arena 3D.json')
  assert.equal(p.settings.multiplayer.mode,'client-server-ws')
  assert.match(p.settings.multiplayer.serverUrl, /^ws:\/\//)
  assert.notEqual(p.settings.multiplayer.serverUrl, 'local')
  assert.equal(p.settings.steam.enabled, false)
  const player=p.scenes[0].entities.find(e=>e.id==='player')
  assert.equal(player.components.find(c=>c.type==='networkSync').owner,'local')
})

test('WebRTC demo uses signaling relay, separate room and player proxies', () => {
  const a=example('Multiplayer Arena 3D.json')
  const b=example('WebRTC Arena 3D (P2P).json')
  assert.equal(b.settings.multiplayer.mode,'p2p-webrtc')
  assert.notEqual(b.settings.multiplayer.roomCode,a.settings.multiplayer.roomCode)
  assert.match(b.settings.multiplayer.serverUrl,/^ws:\/\//)
  assert.ok(b.scenes[0].entities.find(e=>e.id==='player').components.some(c=>c.type==='networkSync'))
})

test('Split-Screen demo does not require any remote networking', () => {
  const p=example('Split-Screen Co-op 3D.json')
  assert.equal(p.settings.multiplayer.mode,'local-splitscreen')
  assert.equal(p.settings.multiplayer.splitScreenPlayers,2)
  assert.ok(!p.settings.multiplayer.serverUrl)
})

test('Multiplayer Arena script gates RPC on connected state and cleans up subscriptions', () => {
  const p=example('Multiplayer Arena 3D.json')
  const make=scriptFactory(p)
  const {api,state,record,setJump}=apiFake(p)
  const original=globalThis.document
  globalThis.document=fakeDOM()
  try {
    const lifecycle=make(api)
    lifecycle.onStart()
    setJump(true);lifecycle.onUpdate(0.3)
    assert.equal(record.rpc.length,0,'no RPC before room admission')
    setJump(false);lifecycle.onUpdate(0.3)
    state.connected=true;state.peerCount=2
    setJump(true);lifecycle.onUpdate(0.3)
    assert.equal(record.rpc.length,1,'one local pulse after joining')
    assert.equal(record.rpc[0][0],'arena:pulse')
    lifecycle.onDestroy()
    assert.equal(record.unsubscribed,4,'all network hooks removed')
  } finally { globalThis.document=original }
})

test('WebRTC Arena script compiles and uses the same guarded network lifecycle', () => {
  const p=example('WebRTC Arena 3D (P2P).json')
  assert.equal(typeof scriptFactory(p),'function')
  assert.match(p.assets.find(a=>a.type==='script').data,/p2p-webrtc/)
})

test('Steam example explicitly opts into editor-only local debug and requires lobby selection', () => {
  const p=example('Steam Lobby & P2P (Debug).json')
  assert.equal(p.settings.multiplayer.mode,'singleplayer')
  assert.equal(p.settings.steam.localDebug,true)
  assert.equal(p.settings.steam.enabled,true)
  const source=p.assets.find(a=>a.id==='script-steam-lobby-demo').data
  for(const name of ['createLobby','listLobbies','joinLobby','leaveLobby','cloudWrite','cloudRead','steam-demo:pulse']) {
    assert.ok(source.includes(name),name)
  }
  assert.equal(typeof scriptFactory(p),'function')
})
