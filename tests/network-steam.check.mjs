import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createRelayServer } from '../server/relay-server.mjs'
import { NetManager } from '../packages/runtime/src/net.ts'
import { SteamManager } from '../packages/runtime/src/steam.ts'

// Run with `node --experimental-strip-types --test tests/network-steam.node.test.mjs`.
// node:test is intentionally separate from Vitest discovery (filename ends .node.test.mjs).
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
const waitUntil = async (fn, ms = 1500) => {
  const until = Date.now() + ms
  while (Date.now() < until) { if (fn()) return; await sleep(10) }
  throw new Error('Condition not met within ' + ms + 'ms')
}
async function start() {
  const server = createRelayServer()
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  return { server, url: `ws://127.0.0.1:${server.address().port}` }
}
const connect = url => new Promise((resolve, reject) => {
  const ws = new WebSocket(url)
  ws.addEventListener('open', () => resolve(ws), { once: true })
  ws.addEventListener('error', reject, { once: true })
})
const recv = (ws, predicate, timeout = 1500) => new Promise((resolve, reject) => {
  const timer = setTimeout(() => { ws.removeEventListener('message', handler); reject(new Error('message timeout')) }, timeout)
  const handler = e => {
    let packet
    try { packet = JSON.parse(e.data) } catch { return }
    if (predicate(packet)) { clearTimeout(timer); ws.removeEventListener('message', handler); resolve(packet) }
  }
  ws.addEventListener('message', handler)
})
const join = (ws, id, room = 'test-room') => ws.send(JSON.stringify({ type: 'join', from: id, room, ts: Date.now(), payload: { name: id } }))
const closeServer = server => new Promise(resolve => server.close(resolve))

test('relay authenticates room membership, peer IDs and targeted messages', async () => {
  const { server, url } = await start()
  const sockets = []
  try {
    const a = await connect(url); sockets.push(a)
    const first = recv(a, p => p.type === 'peer-list')
    join(a, 'alpha')
    assert.deepEqual((await first).payload.peers, ['alpha'])
    const b = await connect(url); sockets.push(b)
    const notification = recv(a, p => p.type === 'join')
    const roster = recv(b, p => p.type === 'peer-list')
    join(b, 'beta')
    assert.equal((await notification).from, 'beta')
    assert.deepEqual((await roster).payload.peers, ['alpha', 'beta'])

    const target = recv(b, p => p.type === 'rpc')
    a.send(JSON.stringify({ type: 'rpc', from: 'alpha', to: 'beta', room: 'test-room', ts: Date.now(), payload: { name: 'once', payload: 9 } }))
    assert.equal((await target).payload.payload, 9)

    const forgedClosed = new Promise(resolve => a.addEventListener('close', resolve, { once: true }))
    a.send(JSON.stringify({ type: 'rpc', from: 'beta', room: 'test-room', ts: Date.now() }))
    await forgedClosed

    const wrongRoom = await connect(url); sockets.push(wrongRoom)
    const removed = new Promise(resolve => wrongRoom.addEventListener('close', resolve, { once: true }))
    join(wrongRoom, 'gamma', 'test-room')
    await recv(wrongRoom, p => p.type === 'peer-list')
    wrongRoom.send(JSON.stringify({ type: 'chat', from: 'gamma', room: 'other-room', ts: Date.now() }))
    await removed

    const duplicate = await connect(url); sockets.push(duplicate)
    const rejected = new Promise(resolve => duplicate.addEventListener('close', resolve, { once: true }))
    join(duplicate, 'beta')
    await rejected
  } finally {
    for (const ws of sockets) try { ws.close() } catch {}
    await closeServer(server)
  }
})

test('NetManager connects two real WebSockets and does not duplicate RPC', async () => {
  globalThis.window = globalThis
  const { server, url } = await start()
  const a = new NetManager(), b = new NetManager()
  a.peerId = 'alpha'; b.peerId = 'beta'
  let calls = 0
  const unsubscribe = b.onRpc('hello', payload => { assert.equal(payload, 'world'); calls++ })
  try {
    assert.equal(await a.connect({ mode: 'client-server-ws', room: 'game', url }), true)
    assert.equal(await b.connect({ mode: 'client-server-ws', room: 'game', url }), true)
    await waitUntil(() => a.getPeers().length === 2 && b.getPeers().length === 2)
    a.rpc('hello', 'world', 'others')
    await waitUntil(() => calls === 1)
    await sleep(60)
    assert.equal(calls, 1)
    assert.equal(a.getStats().connected, true)
  } finally {
    unsubscribe(); a.disconnect(); b.disconnect()
    await closeServer(server)
  }
})

test('remote connection failure does not masquerade as successful local multiplayer', async () => {
  globalThis.window = globalThis
  const m = new NetManager()
  const { server, url } = await start()
  await closeServer(server)
  try {
    assert.equal(await m.connect({ mode: 'client-server-ws', room: 'missing', url }), false)
    assert.equal(m.connected, false)
    assert.match(m.lastError, /WebSocket|Connection|timeout/i)
  } finally { m.disconnect() }
})

test('Steam mock is opt-in and never pretends to be native', async () => {
  const real = new SteamManager()
  const user = await real.init(480)
  assert.equal(user.native, false)
  assert.equal(user.steamId, '')
  assert.equal(real.isAvailable(), false)
  assert.equal(real.isDebug(), false)
  assert.equal(await real.unlockAchievement('ACH_TEST'), false)
  assert.deepEqual(await real.listLobbies(), [])
  await assert.rejects(() => real.createLobby({ name: 'wrong' }), /unavailable/i)
  real.dispose()
})

test('Steam explicit local simulation honors lobby membership and capacity', async () => {
  const a = new SteamManager({ localDebug: true })
  const b = new SteamManager({ localDebug: true })
  const c = new SteamManager({ localDebug: true })
  try {
    await Promise.all([a.init(480), b.init(480), c.init(480)])
    assert.equal(a.isDebug(), true)
    assert.equal(a.isAvailable(), false)
    const lobby = await a.createLobby({ name: 'test', maxMembers: 2 })
    await b.listLobbies()
    assert.equal((await b.joinLobby(lobby.id))?.members.length, 2)
    await c.listLobbies()
    assert.equal(await c.joinLobby(lobby.id), null)
    assert.equal(await b.joinLobby('unknown-lobby'), null)
  } finally { a.dispose(); b.dispose(); c.dispose(); await sleep(15) }
})

test('relay never sends messages between unrelated rooms', async () => {
  const { server, url } = await start()
  const sockets = []
  try {
    const a = await connect(url); sockets.push(a)
    const b = await connect(url); sockets.push(b)
    const aReady = recv(a, p => p.type === 'peer-list')
    join(a, 'alpha', 'room-one')
    await aReady
    const bReady = recv(b, p => p.type === 'peer-list')
    join(b, 'beta', 'room-two')
    await bReady
    const received = []
    b.addEventListener('message', e => received.push(JSON.parse(e.data)))
    a.send(JSON.stringify({ type: 'chat', from: 'alpha', room: 'room-one', ts: Date.now(), payload: { text: 'private' } }))
    await sleep(60)
    assert.equal(received.some(p => p.type === 'chat'), false)
  } finally {
    for (const ws of sockets) try { ws.close() } catch {}
    await closeServer(server)
  }
})

test('optional relay access token refuses unauthenticated joins', async () => {
  const server = createRelayServer({ token: 'local-test-token' })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const url = `ws://127.0.0.1:${server.address().port}`
  const sockets = []
  try {
    const bad = await connect(url); sockets.push(bad)
    const rejected = new Promise(resolve => bad.addEventListener('close', resolve, { once: true }))
    join(bad, 'bad')
    await rejected
    const good = await connect(url); sockets.push(good)
    const roster = recv(good, p => p.type === 'peer-list')
    good.send(JSON.stringify({ type: 'join', from: 'good', room: 'test-room', ts: Date.now(), payload: { name: 'good', token: 'local-test-token' } }))
    assert.deepEqual((await roster).payload.peers, ['good'])
  } finally {
    for (const ws of sockets) try { ws.close() } catch {}
    await closeServer(server)
  }
})

test('local BroadcastChannel remains an explicit preview transport', async () => {
  globalThis.window = globalThis
  const a = new NetManager(), b = new NetManager()
  a.peerId = 'local-one'; b.peerId = 'local-two'
  let received = 0
  const unsubscribe = b.onRpc('local', () => { received++ })
  try {
    assert.equal(await a.connect({ mode: 'client-server-ws', room: 'local-demo', url: 'local' }), true)
    assert.equal(await b.connect({ mode: 'client-server-ws', room: 'local-demo', url: 'local' }), true)
    await waitUntil(() => a.getPeers().length === 2 && b.getPeers().length === 2)
    a.rpc('local', {}, 'others')
    await waitUntil(() => received === 1)
  } finally { unsubscribe(); a.disconnect(); b.disconnect() }
})

test('NetManager waits for room admission and rejects a missing relay token', async () => {
  globalThis.window = globalThis
  const server = createRelayServer({ token: 'password' })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const url = `ws://127.0.0.1:${server.address().port}`
  const bad = new NetManager(), good = new NetManager()
  try {
    assert.equal(await bad.connect({ mode: 'client-server-ws', room: 'private', url }), false)
    assert.equal(bad.getStats().connected, false)
    assert.match(bad.lastError, /Server rejected|join/i)
    assert.equal(await good.connect({ mode: 'client-server-ws', room: 'private', url, token: 'password' }), true)
    assert.equal(good.getStats().connected, true)
  } finally { bad.disconnect(); good.disconnect(); await closeServer(server) }
})

test('large entity snapshot arrays are chunked into relay-safe messages', async () => {
  globalThis.window = globalThis
  const { server, url } = await start()
  const a = new NetManager(), b = new NetManager()
  a.peerId = 'large-a'; b.peerId = 'large-b'
  let snapsReceived = 0
  const stop = b.onSnapshot(snaps => { snapsReceived += snaps.length })
  try {
    await a.connect({ mode: 'client-server-ws', room: 'large-room', url })
    await b.connect({ mode: 'client-server-ws', room: 'large-room', url })
    await waitUntil(() => a.getPeers().length === 2)
    a.sendSnapshot(Array.from({ length: 400 }, (_, i) => ({ id: String(i), pos: [i, 0, 0], rot: [0, 0, 0] })))
    await waitUntil(() => snapsReceived === 400)
    assert.equal(snapsReceived, 400)
  } finally { stop(); a.disconnect(); b.disconnect(); await closeServer(server) }
})

test('unexpected WebSocket closure reconnects and reannounces the same peer identity', async () => {
  globalThis.window = globalThis
  const { server, url } = await start()
  const a = new NetManager(), b = new NetManager()
  a.peerId = 'stable-a'; b.peerId = 'stable-b'
  try {
    assert.equal(await a.connect({ mode: 'client-server-ws', room: 'reconnect', url }), true)
    assert.equal(await b.connect({ mode: 'client-server-ws', room: 'reconnect', url }), true)
    await waitUntil(() => a.getPeers().length === 2)
    a.ws.close() // simulate a transport loss, not manual NetManager.disconnect()
    await waitUntil(() => !a.connected)
    await waitUntil(() => a.connected && a.getPeers().length === 2 && b.getPeers().length === 2, 2500)
    assert.equal(a.peerId, 'stable-a')
    assert.equal(a.getStats().lastError, undefined)
  } finally { a.disconnect(); b.disconnect(); await closeServer(server) }
})

test('explicit Steam local debug P2P messages carry sender identity', async () => {
  const a = new SteamManager({ localDebug: true })
  const b = new SteamManager({ localDebug: true })
  try {
    await a.init(480); await b.init(480)
    const lobby = await a.createLobby({ name: 'p2p-test', maxMembers: 2 })
    await b.listLobbies()
    assert.ok(await b.joinLobby(lobby.id))
    let received
    b.onP2PPacket((packet, sender) => { received = { packet, sender } })
    a.sendP2P({ type: 'rpc', payload: 'demo' })
    await waitUntil(() => Boolean(received))
    assert.equal(received.sender, a.user.steamId)
    assert.equal(received.packet.payload, 'demo')
    assert.equal(a.getMode(), 'local-debug')
  } finally { a.dispose(); b.dispose() }
})
