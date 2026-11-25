#!/usr/bin/env node
/**
 * Miniforge WebSocket room relay + WebRTC signaling server.
 * This is a trusted-room relay, NOT an authoritative multiplayer game server.
 * Browser clients must use masked RFC6455 text frames. Optional room token:
 * MINIFORGE_RELAY_TOKEN=secret node server/relay-server.mjs 8765 0.0.0.0
 */
import http from 'node:http'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'

const MAX_PACKET_BYTES = 256 * 1024
const MAX_BUFFER_BYTES = MAX_PACKET_BYTES + 32
const MAX_MESSAGES_PER_SECOND = 180
const ROOM_RE = /^[a-zA-Z0-9_.-]{1,80}$/
const PEER_RE = /^[a-zA-Z0-9_.:-]{1,100}$/
const TYPES = new Set(['join', 'leave', 'ping', 'pong', 'rpc', 'snapshot', 'world-state', 'chat', 'signal'])

function frame(opcode, payload = Buffer.alloc(0)) {
  const len = payload.length
  const h = len < 126 ? Buffer.from([0x80 | opcode, len]) : len < 65536 ? Buffer.from([0x80 | opcode, 126, len >> 8, len & 255]) : Buffer.alloc(10)
  if (len >= 65536) { h[0] = 0x80 | opcode; h[1] = 127; h.writeBigUInt64BE(BigInt(len), 2) }
  return Buffer.concat([h, payload])
}
const encoded = (obj) => frame(1, Buffer.from(JSON.stringify(obj), 'utf8'))

export function createRelayServer({ token = process.env.MINIFORGE_RELAY_TOKEN || '', maxPeersPerRoom = 32 } = {}) {
  const rooms = new Map()
  const clients = new Set()
  const send = (c, pkt) => {
    if (c.closed || !c.socket.writable || c.socket.writableLength > MAX_BUFFER_BYTES * 4) return
    try { c.socket.write(encoded(pkt)) } catch { close(c, 1011) }
  }
  const broadcast = (room, pkt, exclude) => {
    for (const c of rooms.get(room)?.values() || []) {
      if (c === exclude || pkt.to && c.peerId !== pkt.to) continue
      send(c, pkt)
    }
  }
  const peerList = (room) => [...(rooms.get(room)?.values() || [])].map(({ peerId, name }) => ({ id: peerId, name }))
  const notifyPeers = (room) => broadcast(room, { type: 'peer-list', from: 'server', room, ts: Date.now(), payload: { peers: peerList(room).map(p => p.id), members: peerList(room) } })
  const remove = (c) => {
    if (c.closed) return
    c.closed = true
    clients.delete(c)
    if (!c.room) return
    const room = c.room
    const members = rooms.get(room)
    if (!members) return
    members.delete(c.peerId)
    if (!members.size) rooms.delete(room)
    else {
      broadcast(room, { type: 'leave', from: c.peerId, room, ts: Date.now() })
      notifyPeers(room)
    }
    c.room = ''
  }
  const close = (c, code = 1000) => {
    if (c.closed) return
    try { const b = Buffer.alloc(2); b.writeUInt16BE(code); c.socket.write(frame(8, b)) } catch {}
    remove(c)
    try { c.socket.end() } catch {}
    setTimeout(() => { if (!c.socket.destroyed) c.socket.destroy() }, 2000).unref()
  }
  const handlePacket = (c, pkt) => {
    if (!pkt || typeof pkt !== 'object' || !TYPES.has(pkt.type)) return
    if (pkt.type === 'join') {
      if (c.room) return close(c, 1008)
      const room = String(pkt.room || '')
      const peerId = String(pkt.from || '')
      if (!ROOM_RE.test(room) || !PEER_RE.test(peerId) || (token && pkt.payload?.token !== token)) return close(c, 1008)
      let members = rooms.get(room)
      if (!members) { members = new Map(); rooms.set(room, members) }
      if (members.has(peerId) || members.size >= maxPeersPerRoom) return close(c, 1008)
      c.room = room
      c.peerId = peerId
      c.name = typeof pkt.payload?.name === 'string' ? pkt.payload.name.slice(0, 60) : peerId
      members.set(peerId, c)
      // Tell existing players about new player, and give newcomer an authoritative roster.
      broadcast(room, { type: 'join', from: peerId, room, ts: Date.now(), payload: { name: c.name, webrtc: Boolean(pkt.payload?.webrtc) } }, c)
      send(c, { type: 'peer-list', from: 'server', room, ts: Date.now(), payload: { peers: peerList(room).map(p => p.id), members: peerList(room) } })
      return
    }
    if (!c.room || pkt.room !== c.room || pkt.from !== c.peerId) return close(c, 1008)
    if (pkt.type === 'leave') return close(c)
    // Only server creates membership rosters, and only transport-origin peerId may be forwarded.
    if (pkt.to !== undefined && (typeof pkt.to !== 'string' || !PEER_RE.test(pkt.to))) return
    broadcast(c.room, { ...pkt, from: c.peerId, room: c.room }, c)
  }
  const server = http.createServer((req, res) => {
    if (req.url !== '/health' && req.url !== '/') { res.writeHead(404); res.end(); return }
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
    res.end(JSON.stringify({ service: 'miniforge-relay', clients: clients.size, rooms: rooms.size }))
  })
  server.on('upgrade', (req, socket, head) => {
    const key = req.headers['sec-websocket-key']
    const validKey = typeof key === 'string' && /^[A-Za-z0-9+/]{22}==$/.test(key) && Buffer.from(key, 'base64').length === 16
    if (req.method !== 'GET' || req.headers.upgrade?.toLowerCase() !== 'websocket' || req.headers['sec-websocket-version'] !== '13' || !validKey) {
      socket.write('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n')
      socket.destroy()
      return
    }
    const accept = crypto.createHash('sha1').update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64')
    socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`)
    const c = { socket, peerId: '', room: '', name: '', closed: false, buffer: Buffer.alloc(0), rate: 0, rateAt: Date.now() }
    clients.add(c)
    const parseChunk = (chunk) => {
      if (c.closed) return
      if (c.buffer.length + chunk.length > MAX_BUFFER_BYTES) return close(c, 1009)
      c.buffer = Buffer.concat([c.buffer, chunk])
      while (c.buffer.length >= 2 && !c.closed) {
        const a = c.buffer[0], b = c.buffer[1], opcode = a & 0x0f, fin = (a & 0x80) !== 0, masked = (b & 0x80) !== 0
        if (!fin || !masked || (opcode !== 1 && opcode !== 8 && opcode !== 9 && opcode !== 10)) return close(c, 1002)
        let len = b & 0x7f, off = 2
        if (len === 126) { if (c.buffer.length < 4) break; len = c.buffer.readUInt16BE(2); off = 4 }
        if (len === 127) { if (c.buffer.length < 10) break; const wide = c.buffer.readBigUInt64BE(2); if (wide > BigInt(MAX_PACKET_BYTES)) return close(c, 1009); len = Number(wide); off = 10 }
        if (len > MAX_PACKET_BYTES) return close(c, 1009)
        if (c.buffer.length < off + 4 + len) break
        const mask = c.buffer.subarray(off, off + 4)
        const raw = Buffer.from(c.buffer.subarray(off + 4, off + 4 + len))
        c.buffer = c.buffer.subarray(off + 4 + len)
        for (let i = 0; i < len; i++) raw[i] ^= mask[i & 3]
        if (opcode === 8) return close(c)
        if (opcode === 9) { try { socket.write(frame(10, raw)) } catch {}; continue }
        if (opcode === 10) continue
        const now = Date.now()
        if (now - c.rateAt >= 1000) { c.rateAt = now; c.rate = 0 }
        if (++c.rate > MAX_MESSAGES_PER_SECOND) return close(c, 1008)
        try { handlePacket(c, JSON.parse(raw.toString('utf8'))) } catch { close(c, 1007) }
      }
    }
    socket.on('data', parseChunk)
    socket.on('close', () => remove(c))
    socket.on('error', () => remove(c))
    if (head?.length) parseChunk(head)
  })
  server.on('close', () => { for (const c of clients) { remove(c); c.socket.destroy() } })
  return server
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const port = Number(process.argv[2] || process.env.PORT || 8765)
  const host = process.argv[3] || process.env.HOST || '127.0.0.1'
  createRelayServer().listen(port, host, () => console.log(`[Miniforge Relay] ws://${host}:${port} (health: http://${host}:${port}/health)`))
}
