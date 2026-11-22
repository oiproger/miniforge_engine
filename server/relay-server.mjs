#!/usr/bin/env node
/**
 * Miniforge Engine v3.0 — Zero-Dependency WebSocket Room & WebRTC Signaling Server
 * Usage: node server/relay-server.mjs [port]
 * Default port: 8765 (ws://localhost:8765)
 */
import http from 'node:http'
import crypto from 'node:crypto'

const PORT = Number(process.argv[2] || process.env.PORT || 8765)
const rooms = new Map() // roomName -> Set<{ socket, peerId, room }>

function encodeFrame(text) {
  const payload = Buffer.from(text, 'utf8')
  const len = payload.length
  let header
  if (len < 126) {
    header = Buffer.from([0x81, len])
  } else if (len < 65536) {
    header = Buffer.alloc(4)
    header[0] = 0x81
    header[1] = 126
    header.writeUInt16BE(len, 2)
  } else {
    header = Buffer.alloc(10)
    header[0] = 0x81
    header[1] = 127
    header.writeBigUInt64BE(BigInt(len), 2)
  }
  return Buffer.concat([header, payload])
}

function sendJson(client, obj) {
  if (!client.socket.writable) return
  try {
    client.socket.write(encodeFrame(JSON.stringify(obj)))
  } catch {}
}

function broadcastRoom(roomName, packet, excludeClient = null) {
  const set = rooms.get(roomName)
  if (!set) return
  for (const c of set) {
    if (c === excludeClient) continue
    if (packet.to && c.peerId && c.peerId !== packet.to) continue
    sendJson(c, packet)
  }
}

function removeClient(client) {
  if (!client.room) return
  const set = rooms.get(client.room)
  if (!set) return
  set.delete(client)
  const remaining = [...set].map((c) => c.peerId).filter(Boolean)
  broadcastRoom(client.room, {
    type: 'peer-list',
    from: 'server',
    room: client.room,
    ts: Date.now(),
    payload: { peers: remaining },
  })
  if (set.size === 0) rooms.delete(client.room)
}

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' })
  const summary = {}
  for (const [name, set] of rooms.entries()) summary[name] = set.size
  res.end(JSON.stringify({ engine: 'Miniforge Relay Server v3.0', rooms: summary }))
})

server.on('upgrade', (req, socket) => {
  const key = req.headers['sec-websocket-key']
  if (!key) {
    socket.destroy()
    return
  }
  const accept = crypto
    .createHash('sha1')
    .update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11')
    .digest('base64')
  socket.write(
    'HTTP/1.1 101 Switching Protocols\r\n' +
      'Upgrade: websocket\r\n' +
      'Connection: Upgrade\r\n' +
      `Sec-WebSocket-Accept: ${accept}\r\n\r\n`,
  )

  const client = { socket, peerId: '', room: '' }
  let buf = Buffer.alloc(0)

  socket.on('data', (chunk) => {
    buf = Buffer.concat([buf, chunk])
    while (buf.length >= 2) {
      const opcode = buf[0] & 0x0f
      const masked = (buf[1] & 0x80) !== 0
      let payloadLen = buf[1] & 0x7f
      let offset = 2
      if (payloadLen === 126) {
        if (buf.length < 4) return
        payloadLen = buf.readUInt16BE(2)
        offset = 4
      } else if (payloadLen === 127) {
        if (buf.length < 10) return
        payloadLen = Number(buf.readBigUInt64BE(2))
        offset = 10
      }
      const maskLen = masked ? 4 : 0
      if (buf.length < offset + maskLen + payloadLen) return
      const mask = masked ? buf.subarray(offset, offset + 4) : null
      const raw = Buffer.from(buf.subarray(offset + maskLen, offset + maskLen + payloadLen))
      buf = buf.subarray(offset + maskLen + payloadLen)

      if (opcode === 0x8) {
        socket.end()
        return
      }
      if (opcode === 0x9) {
        // Pong
        try { socket.write(Buffer.from([0x8a, 0x00])) } catch {}
        continue
      }
      if (opcode !== 0x1) continue
      if (mask) for (let i = 0; i < raw.length; i++) raw[i] ^= mask[i % 4]

      try {
        const pkt = JSON.parse(raw.toString('utf8'))
        const roomName = String(pkt.room || client.room || 'lobby-1')
        if (pkt.from) client.peerId = String(pkt.from)
        if (client.room !== roomName) {
          removeClient(client)
          client.room = roomName
          if (!rooms.has(roomName)) rooms.set(roomName, new Set())
          rooms.get(roomName).add(client)
        }
        broadcastRoom(roomName, pkt, client)
      } catch {}
    }
  })

  socket.on('close', () => removeClient(client))
  socket.on('error', () => removeClient(client))
})

server.listen(PORT, () => {
  console.log(`[Miniforge Relay] Listening on ws://localhost:${PORT} (HTTP status: http://localhost:${PORT})`)
})
