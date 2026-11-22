import type { Vec3 } from '../../project-schema/src'

import type { SteamManager } from './steam'

export type MultiplayerMode = 'singleplayer' | 'local-splitscreen' | 'p2p-webrtc' | 'client-server-ws' | 'steam-p2p'

export interface NetPeer {
  id: string
  name: string
  isHost: boolean
  rttMs: number
  joinedAt: number
}

export interface NetEntitySnapshot {
  id: string
  pos: Vec3
  rot: Vec3
  scale?: Vec3
  animState?: string
  animClip?: string
  vars?: Record<string, any>
}

export interface LanServerInfo {
  localIp: string
  port: number
  url: string
  room: string
  gameName: string
}

export interface LanDiscoveredGame {
  hostIp: string
  port: number
  url: string
  room: string
  gameName: string
  players: number
}

export interface NetChatMessage {
  sender: string
  name: string
  text: string
  ts: number
}

async function invokeLanTauri<T = any>(cmd: string, args?: Record<string, any>): Promise<T | null> {
  const g = typeof window !== "undefined" ? (window as any) : null
  const inv = g?.__TAURI__?.core?.invoke || g?.__TAURI_INTERNALS__?.invoke
  if (typeof inv !== "function") return null
  try {
    const raw = await inv(cmd, args || {})
    return typeof raw === "string" ? (JSON.parse(raw) as T) : (raw as T)
  } catch {
    return null
  }
}

function isLanAddress(url: string): boolean {
  return /(localhost|127\.0\.0\.1|192\.168\.|10\.|172\.(1[6-9]|2\d|3[0-1])\.)/i.test(url)
}

export interface NetPacket {
  type: 'join' | 'welcome' | 'leave' | 'peer-list' | 'snapshot' | 'rpc' | 'world-state' | 'chat' | 'ping' | 'pong' | 'signal'
  from: string
  to?: string
  room?: string
  ts: number
  payload?: any
}

export interface NetStats {
  mode: MultiplayerMode
  connected: boolean
  room: string
  peerId: string
  isHost: boolean
  peerCount: number
  rttMs: number
  txPackets: number
  rxPackets: number
  droppedPackets: number
}

export interface NetConnectOptions {
  mode?: MultiplayerMode
  room?: string
  url?: string
  name?: string
  simulatedLatencyMs?: number
  simulatedPacketLoss?: number
}

type RpcHandler = (payload: any, senderPeerId: string) => void
type PeerHandler = (peerId: string) => void

export class NetManager {
  mode: MultiplayerMode = 'singleplayer'
  peerId: string = 'peer-' + Math.random().toString(36).slice(2, 8)
  peerName: string = 'Player'
  room: string = 'lobby-1'
  isHost: boolean = true
  connected: boolean = false
  simulatedLatencyMs: number = 0
  simulatedPacketLoss: number = 0

  private peers = new Map<string, NetPeer>()
  private bc: BroadcastChannel | null = null
  private parentMsgHandler: ((ev: MessageEvent) => void) | null = null
  private useParentBridge = false
  private steam: SteamManager | null = null
  private unsubSteamP2P: (() => void) | null = null
  private ws: WebSocket | null = null
  private rtcPeers = new Map<string, { pc: RTCPeerConnection; dc?: RTCDataChannel }>()
  private rpcHandlers = new Map<string, Set<RpcHandler>>()
  private joinHandlers = new Set<PeerHandler>()
  private leaveHandlers = new Set<PeerHandler>()
  private snapshotHandlers = new Set<(snaps: NetEntitySnapshot[], from: string) => void>()
  private worldStateHandlers = new Set<(vars: Record<string, any>, from: string) => void>()
  private chatHandlers = new Set<(msg: NetChatMessage) => void>()
  private activeUrl = ""
  private reconnectAttempts = 0
  private manualDisconnect = false

  private txPackets = 0
  private rxPackets = 0
  private droppedPackets = 0
  private rttMs = 0
  private pingTimer: number | null = null

  attachSteam(steamMgr: SteamManager) {
    this.steam = steamMgr
  }

  getPeers(): NetPeer[] {
    return [...this.peers.values()]
  }

  getStats(): NetStats {
    return {
      mode: this.mode,
      connected: this.connected,
      room: this.room,
      peerId: this.peerId,
      isHost: this.isHost,
      peerCount: Math.max(1, this.peers.size),
      rttMs: Math.round(this.rttMs),
      txPackets: this.txPackets,
      rxPackets: this.rxPackets,
      droppedPackets: this.droppedPackets,
    }
  }

  setSimulation(latencyMs: number, packetLossPct: number) {
    this.simulatedLatencyMs = Math.max(0, Math.min(2000, Number(latencyMs) || 0))
    this.simulatedPacketLoss = Math.max(0, Math.min(90, Number(packetLossPct) || 0))
  }

  onRpc(name: string, handler: RpcHandler): () => void {
    let set = this.rpcHandlers.get(name)
    if (!set) {
      set = new Set()
      this.rpcHandlers.set(name, set)
    }
    set.add(handler)
    return () => set!.delete(handler)
  }

  onPeerJoin(handler: PeerHandler): () => void {
    this.joinHandlers.add(handler)
    return () => this.joinHandlers.delete(handler)
  }

  onPeerLeave(handler: PeerHandler): () => void {
    this.leaveHandlers.add(handler)
    return () => this.leaveHandlers.delete(handler)
  }

  onSnapshot(handler: (snaps: NetEntitySnapshot[], from: string) => void): () => void {
    this.snapshotHandlers.add(handler)
    return () => this.snapshotHandlers.delete(handler)
  }

  onChat(handler: (msg: NetChatMessage) => void): () => void {
    this.chatHandlers.add(handler)
    return () => this.chatHandlers.delete(handler)
  }

  sendChat(text: string) {
    const clean = String(text || "").trim()
    if (!clean) return
    const msg: NetChatMessage = { sender: this.peerId, name: this.peerName, text: clean, ts: Date.now() }
    for (const fn of this.chatHandlers) fn(msg)
    if (this.connected) {
      this.sendRaw({ type: 'chat', from: this.peerId, room: this.room, ts: msg.ts, payload: msg })
    }
  }

  async hostLan(opts: { port?: number; room?: string; gameName?: string; mode?: MultiplayerMode } = {}): Promise<LanServerInfo | null> {
    const port = opts.port || 8765
    const room = (opts.room || this.room || "lobby-1").trim()
    const gameName = (opts.gameName || "Miniforge Game").trim()
    const res = await invokeLanTauri<LanServerInfo>("lan_start_server", { port, room, gameName })
    if (res && res.url) {
      await this.connect({ mode: opts.mode || "client-server-ws", room, url: res.url })
      return res
    }
    // Browser fallback: connect locally via BroadcastChannel
    await this.connect({ mode: opts.mode || "client-server-ws", room, url: "local" })
    return { localIp: "127.0.0.1", port, url: "local", room, gameName }
  }

  async stopLan(): Promise<boolean> {
    this.disconnect()
    const res = await invokeLanTauri<boolean>("lan_stop_server")
    return Boolean(res)
  }

  async discoverLan(timeoutMs = 1400): Promise<LanDiscoveredGame[]> {
    const res = await invokeLanTauri<LanDiscoveredGame[]>("lan_discover", { timeoutMs })
    return Array.isArray(res) ? res : []
  }

  onWorldState(handler: (vars: Record<string, any>, from: string) => void): () => void {
    this.worldStateHandlers.add(handler)
    return () => this.worldStateHandlers.delete(handler)
  }

  connect(opts: NetConnectOptions = {}): Promise<boolean> {
    this.disconnect()
    this.mode = opts.mode || this.mode || 'client-server-ws'
    this.room = (opts.room || this.room || 'lobby-1').trim()
    this.peerName = opts.name || `Player-${this.peerId.slice(-4)}`
    if (opts.simulatedLatencyMs !== undefined) this.simulatedLatencyMs = opts.simulatedLatencyMs
    if (opts.simulatedPacketLoss !== undefined) this.simulatedPacketLoss = opts.simulatedPacketLoss

    this.peers.clear()
    this.peers.set(this.peerId, {
      id: this.peerId,
      name: this.peerName,
      isHost: true,
      rttMs: 0,
      joinedAt: Date.now(),
    })

    if (this.mode === 'steam-p2p' && this.steam) {
      return this.connectSteamP2P(this.room)
    }

    if (this.mode === 'singleplayer' || this.mode === 'local-splitscreen') {
      this.connected = true
      this.isHost = true
      return Promise.resolve(true)
    }

    this.manualDisconnect = false
    this.reconnectAttempts = 0
    const url = (opts.url || '').trim()
    this.activeUrl = url
    // If no external server URL is provided (or running local Host+Client preview), use BroadcastChannel transport
    if (!url || url === 'local' || url.startsWith('broadcast://')) {
      return this.connectBroadcastChannel()
    }

    if (this.mode === 'p2p-webrtc') {
      return this.connectWebSocket(url, true)
    }
    return this.connectWebSocket(url, false)
  }

  private async connectSteamP2P(lobbyIdOrName: string): Promise<boolean> {
    if (!this.steam) return this.connectBroadcastChannel()
    await this.steam.init(this.steam.appId)
    this.peerId = this.steam.user.steamId
    this.peerName = this.steam.user.name
    this.peers.clear()
    this.peers.set(this.peerId, {
      id: this.peerId,
      name: this.peerName,
      isHost: true,
      rttMs: 0,
      joinedAt: Date.now(),
    })
    if (!this.steam.currentLobby) {
      const lobbies = await this.steam.listLobbies()
      const existing = lobbies.find((l) => l.id === lobbyIdOrName || l.name === lobbyIdOrName)
      if (existing) await this.steam.joinLobby(existing.id)
      else await this.steam.createLobby({ name: lobbyIdOrName })
    }
    this.connected = true
    this.isHost = this.steam.currentLobby?.ownerId === this.peerId
    this.unsubSteamP2P?.()
    this.unsubSteamP2P = this.steam.onP2PPacket((pkt) => {
      if (pkt && pkt.from !== this.peerId) this.deliverIncoming(pkt as NetPacket)
    })
    this.sendRaw({ type: 'join', from: this.peerId, room: this.room, ts: Date.now(), payload: { name: this.peerName } })
    this.startPingLoop()
    return true
  }

  private connectBroadcastChannel(): Promise<boolean> {
    const chName = `miniforge-net:${this.room}`
    if (typeof BroadcastChannel !== 'undefined') {
      try {
        const bc = new BroadcastChannel(chName)
        this.bc = bc
        bc.onmessage = (ev) => {
          const pkt = ev.data as NetPacket
          if (!pkt || pkt.from === this.peerId) return
          this.deliverIncoming(pkt)
        }
      } catch {
        this.bc = null
      }
    }
    // Bridge via window.parent.postMessage for sandboxed Dual Preview iframes (Host + Client)
    if (typeof window !== 'undefined' && window.parent && window.parent !== window) {
      this.useParentBridge = true
      this.parentMsgHandler = (ev: MessageEvent) => {
        const d = ev.data
        if (!d || !d.__miniforgeNet || d.room !== this.room) return
        const pkt = d.pkt as NetPacket
        if (!pkt || pkt.from === this.peerId) return
        this.deliverIncoming(pkt)
      }
      window.addEventListener('message', this.parentMsgHandler)
    }
    this.connected = true
    this.isHost = true
    this.sendRaw({ type: 'join', from: this.peerId, room: this.room, ts: Date.now(), payload: { name: this.peerName } })
    // Re-announce join once after 350ms so a slightly slower second iframe/tab always sees us
    if (typeof window !== 'undefined') {
      window.setTimeout(() => {
        if (this.connected && !this.ws) {
          this.sendRaw({ type: 'join', from: this.peerId, room: this.room, ts: Date.now(), payload: { name: this.peerName } })
        }
      }, 350)
    }
    this.startPingLoop()
    return Promise.resolve(true)
  }

  private connectWebSocket(url: string, enableWebRTC: boolean): Promise<boolean> {
    return new Promise((resolve) => {
      try {
        const ws = new WebSocket(url)
        this.ws = ws
        const timeout = window.setTimeout(() => {
          if (!this.connected) {
            // Fallback gracefully to BroadcastChannel for local multi-tab testing
            try { ws.close() } catch {}
            this.ws = null
            void this.connectBroadcastChannel().then(resolve)
          }
        }, 1000)
        ws.onopen = () => {
          window.clearTimeout(timeout)
          this.connected = true
          this.sendRaw({
            type: 'join',
            from: this.peerId,
            room: this.room,
            ts: Date.now(),
            payload: { name: this.peerName, webrtc: enableWebRTC },
          })
          this.startPingLoop()
          resolve(true)
        }
        ws.onmessage = (ev) => {
          try {
            const pkt = JSON.parse(String(ev.data)) as NetPacket
            if (!pkt || pkt.from === this.peerId) return
            this.deliverIncoming(pkt)
          } catch {}
        }
        ws.onerror = () => {
          window.clearTimeout(timeout)
          if (!this.connected) {
            this.ws = null
            void this.connectBroadcastChannel().then(resolve)
          }
        }
        ws.onclose = () => {
          if (this.ws === ws) {
            this.ws = null
            this.connected = false
            if (!this.manualDisconnect && this.reconnectAttempts < 5 && this.activeUrl && this.activeUrl !== "local") {
              this.reconnectAttempts++
              const delay = Math.min(5000, 600 * this.reconnectAttempts)
              window.setTimeout(() => {
                if (!this.manualDisconnect && !this.connected) void this.connectWebSocket(this.activeUrl, enableWebRTC)
              }, delay)
            }
          }
        }
      } catch {
        void this.connectBroadcastChannel().then(resolve)
      }
    })
  }

  private startPingLoop() {
    if (this.pingTimer) window.clearInterval(this.pingTimer)
    this.pingTimer = window.setInterval(() => {
      if (!this.connected) return
      this.sendRaw({ type: 'ping', from: this.peerId, room: this.room, ts: performance.now() })
    }, 2000)
  }

  private sendRaw(pkt: NetPacket) {
    if (this.simulatedPacketLoss > 0 && Math.random() * 100 < this.simulatedPacketLoss) {
      this.droppedPackets++
      return
    }
    this.txPackets++
    const dispatch = () => {
      if (this.mode === 'p2p-webrtc' && this.rtcPeers.size > 0 && pkt.type !== 'signal' && pkt.type !== 'join') {
        const serialized = JSON.stringify(pkt)
        for (const [pid, entry] of this.rtcPeers.entries()) {
          if (pkt.to && pkt.to !== pid) continue
          if (entry.dc && entry.dc.readyState === 'open') {
            try { entry.dc.send(serialized) } catch {}
          }
        }
      }
      if (this.mode === 'steam-p2p' && this.steam) {
        this.steam.sendP2P(pkt, pkt.to)
        return
      }
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        try { this.ws.send(JSON.stringify(pkt)) } catch {}
      } else {
        if (this.bc) {
          try { this.bc.postMessage(pkt) } catch {}
        }
        if (this.useParentBridge && typeof window !== 'undefined' && window.parent && window.parent !== window) {
          try { window.parent.postMessage({ __miniforgeNet: true, room: this.room, pkt }, '*') } catch {}
        }
      }
    }
    if (this.simulatedLatencyMs > 0) {
      const jitter = (Math.random() - 0.5) * this.simulatedLatencyMs * 0.2
      window.setTimeout(dispatch, Math.max(1, this.simulatedLatencyMs * 0.5 + jitter))
    } else {
      dispatch()
    }
  }

  private deliverIncoming(pkt: NetPacket) {
    if (this.simulatedPacketLoss > 0 && Math.random() * 100 < this.simulatedPacketLoss) {
      this.droppedPackets++
      return
    }
    const handle = () => {
      this.rxPackets++
      if (pkt.to && pkt.to !== this.peerId) return
      switch (pkt.type) {
        case 'join': {
          const isNew = !this.peers.has(pkt.from)
          this.peers.set(pkt.from, {
            id: pkt.from,
            name: pkt.payload?.name || pkt.from,
            isHost: false,
            rttMs: 0,
            joinedAt: Date.now(),
          })
          // Deterministic host election: lexicographically smallest peerId is host
          this.recomputeHost()
          this.sendRaw({
            type: 'welcome',
            from: this.peerId,
            to: pkt.from,
            room: this.room,
            ts: Date.now(),
            payload: { name: this.peerName, isHost: this.isHost },
          })
          if (this.mode === 'p2p-webrtc' && this.peerId < pkt.from) {
            void this.initiateWebRTC(pkt.from)
          }
          if (isNew) for (const fn of this.joinHandlers) fn(pkt.from)
          break
        }
        case 'welcome': {
          const isNew = !this.peers.has(pkt.from)
          this.peers.set(pkt.from, {
            id: pkt.from,
            name: pkt.payload?.name || pkt.from,
            isHost: Boolean(pkt.payload?.isHost),
            rttMs: 0,
            joinedAt: Date.now(),
          })
          this.recomputeHost()
          if (isNew) for (const fn of this.joinHandlers) fn(pkt.from)
          break
        }
        case 'leave': {
          if (this.peers.delete(pkt.from)) {
            this.recomputeHost()
            for (const fn of this.leaveHandlers) fn(pkt.from)
          }
          break
        }
        case 'peer-list': {
          const ids: string[] = Array.isArray(pkt.payload?.peers) ? pkt.payload.peers : []
          for (const existing of [...this.peers.keys()]) {
            if (existing !== this.peerId && !ids.includes(existing)) {
              this.peers.delete(existing)
              for (const fn of this.leaveHandlers) fn(existing)
            }
          }
          this.recomputeHost()
          break
        }
        case 'signal': {
          void this.handleWebRTCSignal(pkt.from, pkt.payload)
          break
        }
        case 'ping': {
          this.sendRaw({ type: 'pong', from: this.peerId, to: pkt.from, room: this.room, ts: pkt.ts })
          break
        }
        case 'pong': {
          const elapsed = Math.max(0, performance.now() - pkt.ts)
          this.rttMs = this.rttMs ? this.rttMs * 0.7 + elapsed * 0.3 : elapsed
          break
        }
        case 'snapshot': {
          const snaps = Array.isArray(pkt.payload) ? (pkt.payload as NetEntitySnapshot[]) : []
          for (const fn of this.snapshotHandlers) fn(snaps, pkt.from)
          break
        }
        case 'chat': {
          const msg = pkt.payload as NetChatMessage
          if (msg && msg.text) for (const fn of this.chatHandlers) fn(msg)
          break
        }
        case 'world-state': {
          if (pkt.payload && typeof pkt.payload === 'object') {
            for (const fn of this.worldStateHandlers) fn(pkt.payload, pkt.from)
          }
          break
        }
        case 'rpc': {
          const { name, payload } = pkt.payload || {}
          if (!name) break
          const set = this.rpcHandlers.get(name)
          if (set) for (const fn of set) fn(payload, pkt.from)
          const anySet = this.rpcHandlers.get('*')
          if (anySet) for (const fn of anySet) fn({ name, payload }, pkt.from)
          break
        }
      }
    }
    if (this.simulatedLatencyMs > 0) {
      window.setTimeout(handle, Math.max(1, this.simulatedLatencyMs * 0.5))
    } else {
      handle()
    }
  }

  private recomputeHost() {
    const ids = [...this.peers.keys()].sort()
    const hostId = ids[0] || this.peerId
    this.isHost = hostId === this.peerId
    for (const p of this.peers.values()) p.isHost = p.id === hostId
  }

  private async initiateWebRTC(remotePeerId: string) {
    if (typeof RTCPeerConnection === 'undefined' || this.rtcPeers.has(remotePeerId)) return
    const pc = new RTCPeerConnection({ iceServers: isLanAddress(this.activeUrl) ? [] : [{ urls: 'stun:stun.l.google.com:19302' }] })
    const dc = pc.createDataChannel('miniforge-net', { ordered: false, maxRetransmits: 0 })
    this.rtcPeers.set(remotePeerId, { pc, dc })
    dc.onmessage = (ev) => {
      try {
        const pkt = JSON.parse(String(ev.data)) as NetPacket
        if (pkt && pkt.from !== this.peerId) this.deliverIncoming(pkt)
      } catch {}
    }
    pc.onicecandidate = (ev) => {
      if (ev.candidate) {
        this.sendRaw({ type: 'signal', from: this.peerId, to: remotePeerId, room: this.room, ts: Date.now(), payload: { candidate: ev.candidate } })
      }
    }
    const offer = await pc.createOffer()
    await pc.setLocalDescription(offer)
    this.sendRaw({ type: 'signal', from: this.peerId, to: remotePeerId, room: this.room, ts: Date.now(), payload: { sdp: offer } })
  }

  private async handleWebRTCSignal(remotePeerId: string, signal: any) {
    if (typeof RTCPeerConnection === 'undefined' || !signal) return
    let entry = this.rtcPeers.get(remotePeerId)
    if (!entry) {
      const pc = new RTCPeerConnection({ iceServers: isLanAddress(this.activeUrl) ? [] : [{ urls: 'stun:stun.l.google.com:19302' }] })
      entry = { pc }
      this.rtcPeers.set(remotePeerId, entry)
      pc.ondatachannel = (ev) => {
        entry!.dc = ev.channel
        ev.channel.onmessage = (m) => {
          try {
            const pkt = JSON.parse(String(m.data)) as NetPacket
            if (pkt && pkt.from !== this.peerId) this.deliverIncoming(pkt)
          } catch {}
        }
      }
      pc.onicecandidate = (ev) => {
        if (ev.candidate) {
          this.sendRaw({ type: 'signal', from: this.peerId, to: remotePeerId, room: this.room, ts: Date.now(), payload: { candidate: ev.candidate } })
        }
      }
    }
    if (signal.sdp) {
      await entry.pc.setRemoteDescription(new RTCSessionDescription(signal.sdp))
      if (signal.sdp.type === 'offer') {
        const answer = await entry.pc.createAnswer()
        await entry.pc.setLocalDescription(answer)
        this.sendRaw({ type: 'signal', from: this.peerId, to: remotePeerId, room: this.room, ts: Date.now(), payload: { sdp: answer } })
      }
    } else if (signal.candidate) {
      try {
        await entry.pc.addIceCandidate(new RTCIceCandidate(signal.candidate))
      } catch {}
    }
  }

  sendSnapshot(snaps: NetEntitySnapshot[]) {
    if (!this.connected || !snaps.length) return
    this.sendRaw({ type: 'snapshot', from: this.peerId, room: this.room, ts: Date.now(), payload: snaps })
  }

  sendWorldState(vars: Record<string, any>) {
    if (!this.connected) return
    this.sendRaw({ type: 'world-state', from: this.peerId, room: this.room, ts: Date.now(), payload: vars })
  }

  rpc(name: string, payload?: any, target: 'all' | 'others' | 'host' | string = 'all') {
    if (!name) return
    if (target === 'all' || target === this.peerId || (target === 'host' && this.isHost)) {
      const set = this.rpcHandlers.get(name)
      if (set) for (const fn of set) fn(payload, this.peerId)
      const anySet = this.rpcHandlers.get('*')
      if (anySet) for (const fn of anySet) fn({ name, payload }, this.peerId)
      if (target === this.peerId || (target === 'host' && this.isHost)) return
    }
    if (!this.connected) return
    const hostPeer = [...this.peers.values()].find((p) => p.isHost)?.id
    const to = target === 'all' || target === 'others' ? undefined : target === 'host' ? hostPeer : target
    this.sendRaw({ type: 'rpc', from: this.peerId, to, room: this.room, ts: Date.now(), payload: { name, payload } })
  }

  disconnect() {
    if (this.connected) {
      try { this.sendRaw({ type: 'leave', from: this.peerId, room: this.room, ts: Date.now() }) } catch {}
    }
    this.manualDisconnect = true
    if (this.parentMsgHandler && typeof window !== 'undefined') {
      window.removeEventListener('message', this.parentMsgHandler)
      this.parentMsgHandler = null
    }
    this.useParentBridge = false
    if (this.pingTimer) {
      window.clearInterval(this.pingTimer)
      this.pingTimer = null
    }
    if (this.unsubSteamP2P) {
      this.unsubSteamP2P()
      this.unsubSteamP2P = null
    }
    if (this.bc) {
      try { this.bc.close() } catch {}
      this.bc = null
    }
    if (this.ws) {
      try { this.ws.close() } catch {}
      this.ws = null
    }
    for (const entry of this.rtcPeers.values()) {
      try { entry.dc?.close() } catch {}
      try { entry.pc.close() } catch {}
    }
    this.rtcPeers.clear()
    this.peers.clear()
    this.connected = false
  }
}
