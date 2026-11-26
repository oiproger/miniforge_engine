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
  /** Whether the entity is enabled in the authoritative scene. */
  active?: boolean
  /** Selected properties and declarative component fields, addressed by safe paths. */
  fields?: Record<string, unknown>
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
  try {
    const host = new URL(url).hostname.toLowerCase()
    return host === 'localhost' || host === '127.0.0.1' || host === '[::1]' || /^10\./.test(host) || /^192\.168\./.test(host) || /^172\.(1[6-9]|2\d|3[0-1])\./.test(host)
  } catch { return false }
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
  lastError?: string
}

export interface NetConnectOptions {
  mode?: MultiplayerMode
  room?: string
  url?: string
  /** Optional private relay token for an access-controlled room (not game authentication). */
  token?: string
  name?: string
  simulatedLatencyMs?: number
  simulatedPacketLoss?: number
}

type RpcHandler = (payload: any, senderPeerId: string) => void
type PeerHandler = (peerId: string) => void

export class NetManager {
  mode: MultiplayerMode = 'singleplayer'
  peerId: string = 'peer-' + Date.now().toString(36).padStart(9, '0') + '-' + Math.random().toString(36).slice(2, 6)
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
  private unsubSteamLobby: (() => void) | null = null
  private ws: WebSocket | null = null
  private rtcPeers = new Map<string, { pc: RTCPeerConnection; dc?: RTCDataChannel; pendingIce?: RTCIceCandidateInit[] }>()
  private rpcHandlers = new Map<string, Set<RpcHandler>>()
  private joinHandlers = new Set<PeerHandler>()
  private leaveHandlers = new Set<PeerHandler>()
  private snapshotHandlers = new Set<(snaps: NetEntitySnapshot[], from: string) => void>()
  private worldStateHandlers = new Set<(vars: Record<string, any>, from: string) => void>()
  private chatHandlers = new Set<(msg: NetChatMessage) => void>()
  private activeUrl = ""
  private authToken = ''
  private reconnectAttempts = 0
  private manualDisconnect = false
  private generation = 0
  private reconnectTimer: number | null = null
  lastError = ''

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
      peerCount: this.connected ? Math.max(1, this.peers.size) : 0,
      rttMs: Math.round(this.rttMs),
      txPackets: this.txPackets,
      rxPackets: this.rxPackets,
      droppedPackets: this.droppedPackets,
      lastError: this.lastError || undefined,
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
    const clean = String(text || "").trim().slice(0, 2000)
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
    // A local BroadcastChannel is not a LAN server. Report failure instead of a fake IP.
    this.lastError = "Desktop LAN server is unavailable (requires native Tauri player)"
    return null
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
    this.lastError = ''
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

    if (this.mode === 'steam-p2p') {
      if (!this.steam) { this.lastError = 'Steam transport is not configured'; return Promise.resolve(false) }
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
    this.authToken = opts.token || ''
    // Local preview must be explicit. A missing remote server is a connection error.
    if (!url || url === 'local' || url.startsWith('broadcast://')) {
      if (!url) {
        this.lastError = 'Missing multiplayer server URL. Use local explicitly for editor preview.'
        return Promise.resolve(false)
      }
      return this.connectBroadcastChannel()
    }

    if (this.mode === 'p2p-webrtc') {
      return this.connectWebSocket(url, true)
    }
    return this.connectWebSocket(url, false)
  }

  private async connectSteamP2P(lobbyIdOrName: string): Promise<boolean> {
    const steam = this.steam
    if (!steam) return false
    const generation = this.generation
    try {
      const user = await steam.init(steam.appId)
      if (generation !== this.generation) return false
      if (!user.steamId) throw new Error('Steam identity unavailable')
      let lobby = steam.currentLobby
      if (!lobby || (lobby.id !== lobbyIdOrName && lobby.name !== lobbyIdOrName)) {
        if (steam.isNative() && /^\d{16,20}$/.test(lobbyIdOrName)) {
          lobby = await steam.joinLobby(lobbyIdOrName)
        } else {
          const lobbies = await steam.listLobbies()
          if (generation !== this.generation) return false
          const existing = lobbies.find(l => l.id === lobbyIdOrName || l.name === lobbyIdOrName)
          lobby = existing ? await steam.joinLobby(existing.id) : await steam.createLobby({ name: lobbyIdOrName })
        }
      }
      if (generation !== this.generation) return false
      if (!lobby) throw new Error('Could not join Steam lobby')
      this.peerId = user.steamId
      this.peerName = user.name
      this.room = lobby.id
      this.peers.clear()
      this.peers.set(this.peerId, { id: this.peerId, name: this.peerName, isHost: true, rttMs: 0, joinedAt: Date.now() })
      this.connected = true
      this.recomputeHost()
      this.unsubSteamLobby = steam.onLobbyChanged((updated) => {
        if (!updated || updated.id !== this.room) {
          this.disconnect()
          return
        }
        for (const id of this.peers.keys()) {
          if (updated.members.includes(id)) continue
          this.peers.delete(id)
          for (const handler of this.leaveHandlers) handler(id)
        }
        this.recomputeHost()
        for (const id of updated.members) {
          if (this.peers.has(id)) continue
          this.sendRaw({ type: 'join', from: this.peerId, to: id, room: this.room,
            ts: Date.now(), payload: { name: this.peerName } })
        }
      })
      this.unsubSteamP2P = steam.onP2PPacket((pkt, fromSteamId) => {
        if (!this.connected || fromSteamId === this.peerId) return
        // Native IPC already validates the sender against current Steam membership.
        // Its lobby snapshot can arrive after an otherwise valid initial packet.
        if (!steam.isNative() && !steam.currentLobby?.members.includes(fromSteamId)) return
        if (!pkt || typeof pkt !== 'object') return
        this.deliverIncoming({ ...pkt, from: fromSteamId } as NetPacket)
      })
      this.sendRaw({ type: 'join', from: this.peerId, room: this.room, ts: Date.now(), payload: { name: this.peerName } })
      this.startPingLoop()
      return true
    } catch (err) {
      if (generation !== this.generation) return false
      this.lastError = `Steam lobby connection failed: ${String(err)}`
      this.connected = false
      return false
    }
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
    this.connected = Boolean(this.bc || this.useParentBridge)
    if (!this.connected) { this.lastError = 'BroadcastChannel is not supported'; return Promise.resolve(false) }
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
    const generation = this.generation
    return new Promise((resolve) => {
      let ws: WebSocket
      let settled = false
      let opened = false
      let accepted = false
      const done = (ok: boolean) => { if (!settled) { settled = true; resolve(ok) } }
      try {
        ws = new WebSocket(url)
      } catch (err) {
        this.lastError = `Invalid WebSocket URL: ${String(err)}`
        done(false)
        return
      }
      this.ws = ws
      const timeout = window.setTimeout(() => {
        if (!accepted && this.ws === ws) {
          this.lastError = `WebSocket room join timed out: ${url}`
          try { ws.close() } catch {}
          done(false)
        }
      }, 5000)
      ws.onopen = () => {
        if (generation !== this.generation || this.manualDisconnect) { ws.close(); done(false); return }
        opened = true
        // A WebSocket TCP upgrade is not a successful room join. Wait for the
        // server's authoritative roster, so invalid rooms/tokens return false.
        const pkt: NetPacket = { type: 'join', from: this.peerId, room: this.room, ts: Date.now(), payload: { name: this.peerName, webrtc: enableWebRTC, token: this.authToken } }
        try { ws.send(JSON.stringify(pkt)); this.txPackets++ }
        catch (err) { this.lastError = `Failed to send room join: ${String(err)}`; ws.close(); done(false) }
      }
      ws.onmessage = ev => {
        try {
          const pkt = JSON.parse(String(ev.data)) as NetPacket
          if (!accepted) {
            const ids = pkt?.payload?.peers
            if (pkt?.type !== 'peer-list' || pkt.from !== 'server' || pkt.room !== this.room || !Array.isArray(ids) || !ids.includes(this.peerId)) return
            accepted = true
            this.connected = true
            this.lastError = ''
            this.reconnectAttempts = 0
            this.peers.clear()
            this.peers.set(this.peerId, { id: this.peerId, name: this.peerName, isHost: true, rttMs: 0, joinedAt: Date.now() })
            window.clearTimeout(timeout)
            this.startPingLoop()
            done(true)
          }
          if (pkt && pkt.from !== this.peerId) this.deliverIncoming(pkt)
        } catch { this.droppedPackets++ }
      }
      ws.onerror = () => {
        if (!accepted) {
          this.lastError = `WebSocket connection or room join failed: ${url}`
          window.clearTimeout(timeout)
          if (this.ws === ws) this.ws = null
          done(false)
          try { ws.close() } catch {}
        }
        // onclose handles retries only for previously established connections.
      }
      ws.onclose = () => {
        window.clearTimeout(timeout)
        if (this.ws !== ws) { done(false); return }
        this.ws = null
        this.connected = false
        if (this.pingTimer !== null) { window.clearInterval(this.pingTimer); this.pingTimer = null }
        for (const entry of this.rtcPeers.values()) { try { entry.dc?.close(); entry.pc.close() } catch {} }
        this.rtcPeers.clear()
        for (const pid of [...this.peers.keys()]) if (pid !== this.peerId) {
          this.peers.delete(pid)
          for (const fn of this.leaveHandlers) fn(pid)
        }
        this.recomputeHost()
        if (!accepted && !this.lastError) this.lastError = opened ? `Server rejected room join: ${url}` : `WebSocket closed before connection: ${url}`
        done(false)
        if (accepted && !this.manualDisconnect && generation === this.generation) this.scheduleReconnect(enableWebRTC)
      }
    })
  }

  private scheduleReconnect(enableWebRTC: boolean) {
    if (this.reconnectAttempts >= 5 || this.reconnectTimer !== null || this.manualDisconnect) return
    const attempt = ++this.reconnectAttempts
    const delay = Math.min(8000, 450 * 2 ** (attempt - 1))
    const generation = this.generation
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null
      if (generation !== this.generation || this.manualDisconnect || this.connected) return
      void this.connectWebSocket(this.activeUrl, enableWebRTC).then(ok => {
        if (!ok && generation === this.generation && !this.manualDisconnect) this.scheduleReconnect(enableWebRTC)
      })
    }, delay)
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
    const generation = this.generation
    const dispatch = () => {
      if (generation !== this.generation || (!this.connected && pkt.type !== 'leave')) return
      this.txPackets++
      if (this.mode === 'steam-p2p' && this.steam) {
        this.steam.sendP2P(pkt, pkt.to)
        return
      }
      if (this.mode === 'p2p-webrtc' && pkt.type !== 'signal' && pkt.type !== 'join') {
        const serialized = JSON.stringify(pkt)
        const targets = pkt.to ? [pkt.to] : [...this.peers.keys()].filter(p => p !== this.peerId)
        for (const pid of targets) {
          const dc = this.rtcPeers.get(pid)?.dc
          if (dc?.readyState === 'open') {
            try { dc.send(serialized); continue } catch {}
          }
          // Use the relay only for peers without an established data channel.
          if (this.ws?.readyState === WebSocket.OPEN) {
            try { this.ws.send(JSON.stringify({ ...pkt, to: pid })) } catch { this.droppedPackets++ }
          }
        }
        return
      }
      if (this.ws?.readyState === WebSocket.OPEN) {
        try { this.ws.send(JSON.stringify(pkt)) } catch { this.droppedPackets++ }
      } else {
        if (this.bc) { try { this.bc.postMessage(pkt) } catch { this.droppedPackets++ } }
        if (this.useParentBridge && typeof window !== 'undefined' && window.parent && window.parent !== window) {
          try { window.parent.postMessage({ __miniforgeNet: true, room: this.room, pkt }, '*') } catch { this.droppedPackets++ }
        }
      }
    }
    if (this.simulatedLatencyMs > 0) {
      const jitter = (Math.random() - 0.5) * this.simulatedLatencyMs * 0.2
      window.setTimeout(dispatch, Math.max(1, this.simulatedLatencyMs * 0.5 + jitter))
    } else dispatch()
  }

  private deliverIncoming(pkt: NetPacket) {
    if (!pkt || typeof pkt !== 'object' || pkt.room !== this.room || !pkt.from || typeof pkt.type !== 'string') {
      this.droppedPackets++
      return
    }
    if (this.simulatedPacketLoss > 0 && Math.random() * 100 < this.simulatedPacketLoss) {
      this.droppedPackets++
      return
    }
    const handle = () => {
      if (pkt.to && pkt.to !== this.peerId) return
      this.rxPackets++
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
            const entry = this.rtcPeers.get(pkt.from)
            if (entry) { try { entry.dc?.close(); entry.pc.close() } catch {}; this.rtcPeers.delete(pkt.from) }
            this.recomputeHost()
            for (const fn of this.leaveHandlers) fn(pkt.from)
          }
          break
        }
        case 'peer-list': {
          // Only the trusted relay can publish authoritative room membership.
          if (pkt.from !== 'server' || !this.ws) break
          const ids: string[] = Array.isArray(pkt.payload?.peers) ? pkt.payload.peers.filter((id: unknown) => typeof id === 'string') : []
          const members: { id: string; name: string }[] = Array.isArray(pkt.payload?.members) ? pkt.payload.members : []
          for (const id of ids) {
            if (id === this.peerId) continue
            const name = members.find(m => m?.id === id)?.name || id
            const isNew = !this.peers.has(id)
            this.peers.set(id, { id, name, isHost: false, rttMs: 0, joinedAt: this.peers.get(id)?.joinedAt || Date.now() })
            if (isNew) for (const fn of this.joinHandlers) fn(id)
            if (isNew && this.mode === 'p2p-webrtc' && this.peerId < id) void this.initiateWebRTC(id)
          }
          for (const existing of [...this.peers.keys()]) {
            if (existing !== this.peerId && !ids.includes(existing)) {
              this.peers.delete(existing)
              const entry = this.rtcPeers.get(existing)
              if (entry) { try { entry.dc?.close(); entry.pc.close() } catch {}; this.rtcPeers.delete(existing) }
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
          if (typeof pkt.ts !== 'number' || !Number.isFinite(pkt.ts)) break
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
          const text = typeof pkt.payload?.text === 'string' ? pkt.payload.text.slice(0, 2000) : ''
          if (!text) break
          const msg: NetChatMessage = {
            sender: pkt.from,
            name: this.peers.get(pkt.from)?.name || pkt.from,
            text,
            ts: Number.isFinite(pkt.ts) ? pkt.ts : Date.now(),
          }
          for (const fn of this.chatHandlers) fn(msg)
          break
        }
        case 'world-state': {
          if (pkt.payload && typeof pkt.payload === 'object' && !Array.isArray(pkt.payload)) {
            for (const fn of this.worldStateHandlers) fn(pkt.payload, pkt.from)
          }
          break
        }
        case 'rpc': {
          const { name, payload } = pkt.payload || {}
          if (typeof name !== 'string' || !name || name.length > 128) break
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
    const lobbyOwner = this.mode === 'steam-p2p' ? this.steam?.currentLobby?.ownerId : undefined
    const ids = [...this.peers.keys()].sort()
    const hostId = lobbyOwner || ids[0] || this.peerId
    this.isHost = hostId === this.peerId
    for (const p of this.peers.values()) p.isHost = p.id === hostId
  }

  private async initiateWebRTC(remotePeerId: string) {
    if (typeof RTCPeerConnection === 'undefined' || this.rtcPeers.has(remotePeerId)) return
    const pc = new RTCPeerConnection({ iceServers: isLanAddress(this.activeUrl) ? [] : [{ urls: 'stun:stun.l.google.com:19302' }] })
    const dc = pc.createDataChannel('miniforge-net', { ordered: true })
    this.rtcPeers.set(remotePeerId, { pc, dc })
    dc.onmessage = (ev) => {
      try {
        const pkt = JSON.parse(String(ev.data)) as NetPacket
        if (pkt && pkt.from !== this.peerId) this.deliverIncoming({ ...pkt, from: remotePeerId })
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
            if (pkt && pkt.from !== this.peerId) this.deliverIncoming({ ...pkt, from: remotePeerId })
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
      for (const candidate of entry.pendingIce || []) {
        try { await entry.pc.addIceCandidate(new RTCIceCandidate(candidate)) } catch {}
      }
      entry.pendingIce = []
      if (signal.sdp.type === 'offer') {
        const answer = await entry.pc.createAnswer()
        await entry.pc.setLocalDescription(answer)
        this.sendRaw({ type: 'signal', from: this.peerId, to: remotePeerId, room: this.room, ts: Date.now(), payload: { sdp: answer } })
      }
    } else if (signal.candidate) {
      if (!entry.pc.remoteDescription) (entry.pendingIce ||= []).push(signal.candidate)
      else try { await entry.pc.addIceCandidate(new RTCIceCandidate(signal.candidate)) } catch {}
    }
  }

  sendSnapshot(snaps: NetEntitySnapshot[]) {
    if (!this.connected || !snaps.length) return
    // Keep packets comfortably below the relay's maximum, even in scenes with
    // hundreds of synchronized entities. A single oversized entity is skipped.
    let batch: NetEntitySnapshot[] = []
    let bytes = 0
    const flush = () => {
      if (batch.length) this.sendRaw({ type: 'snapshot', from: this.peerId, room: this.room, ts: Date.now(), payload: batch })
      batch = []
      bytes = 0
    }
    for (const snap of snaps) {
      let size = 0
      try { size = new TextEncoder().encode(JSON.stringify(snap)).length } catch { continue }
      if (size > 64 * 1024) { this.droppedPackets++; continue }
      if (batch.length >= 128 || bytes + size > 128 * 1024) flush()
      batch.push(snap)
      bytes += size
    }
    flush()
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
    if (target === 'host' && !hostPeer) return
    const to = target === 'all' || target === 'others' ? undefined : target === 'host' ? hostPeer : target
    this.sendRaw({ type: 'rpc', from: this.peerId, to, room: this.room, ts: Date.now(), payload: { name, payload } })
  }

  disconnect() {
    ++this.generation
    if (this.reconnectTimer !== null) { window.clearTimeout(this.reconnectTimer); this.reconnectTimer = null }
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
    this.unsubSteamLobby?.()
    this.unsubSteamLobby = null
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
    this.reconnectAttempts = 0
  }
}
