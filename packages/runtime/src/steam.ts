export interface SteamUserInfo {
  steamId: string
  name: string
  appId: number
  native: boolean
}

export interface SteamLobby {
  id: string
  name: string
  ownerId: string
  maxMembers: number
  members: string[]
  type: 'public' | 'friends' | 'private'
  data: Record<string, string>
  createdAt: number
}

export interface SteamLogEntry {
  ts: number
  level: 'info' | 'warn' | 'error'
  call: string
  detail: string
}

type P2PHandler = (packet: any, fromSteamId: string) => void

async function invokeTauri<T = any>(cmd: string, args?: Record<string, any>): Promise<T | null> {
  const g = typeof window !== 'undefined' ? (window as any) : null
  const inv = g?.__TAURI__?.core?.invoke || g?.__TAURI_INTERNALS__?.invoke
  if (typeof inv !== 'function') return null
  try {
    return (await inv(cmd, args || {})) as T
  } catch {
    return null
  }
}

export class SteamManager {
  /** Local mock is strictly opt-in. Never silently emulate Steamworks in a shipped game. */
  private readonly opts: { localDebug?: boolean }
  constructor(opts: { localDebug?: boolean } = {}) { this.opts = opts }

  isDebug(): boolean { return !this.native && this.initialized && Boolean(this.opts.localDebug) }
  getMode(): 'native' | 'local-debug' | 'unavailable' {
    return this.native ? 'native' : this.isDebug() ? 'local-debug' : 'unavailable'
  }
  private nativeAchievements = new Set<string>()
  appId = 480
  initialized = false
  native = false
  user: SteamUserInfo = {
    steamId: '',
    name: 'Steam unavailable',
    appId: 480,
    native: false,
  }
  currentLobby: SteamLobby | null = null
  private richPresence: Record<string, string> = {}
  private logs: SteamLogEntry[] = []
  private p2pHandlers = new Set<P2PHandler>()
  private lobbyChannel: BroadcastChannel | null = null
  private p2pChannel: BroadcastChannel | null = null
  private parentDebugHandler: ((event: MessageEvent) => void) | null = null
  private localCloudFallback = new Map<string, string>()
  private localAchievementsFallback = new Set<string>()
  private knownLobbies = new Map<string, SteamLobby>()
  private pollTimer: number | null = null

  private log(call: string, detail: string, level: 'info' | 'warn' | 'error' = 'info') {
    this.logs.push({ ts: Date.now(), level, call, detail })
    if (this.logs.length > 200) this.logs.shift()
  }

  getLogs(): SteamLogEntry[] {
    return [...this.logs]
  }

  clearLogs() {
    this.logs.length = 0
  }

  async init(appId = 480): Promise<SteamUserInfo> {
    const requestedId = Number(appId)
    this.appId = Number.isInteger(requestedId) && requestedId > 0 ? requestedId : 480
    if (this.native && this.initialized && this.user.appId === this.appId) return this.getUser()
    if (this.initialized && this.isDebug() && this.user.appId === this.appId) return this.getUser()
    const nativeRes = await invokeTauri<SteamUserInfo>('steam_init', { appId: this.appId })
    if (nativeRes && nativeRes.steamId) {
      this.native = true
      this.user = { ...nativeRes, appId: this.appId, native: true }
      this.initialized = true
      this.log('steam_init', `Native Steamworks initialized (AppID ${this.appId}, user ${this.user.name})`)
      this.startNativeP2PPoll()
      return this.user
    }

    this.native = false
    this.user.appId = this.appId
    this.user.native = false
    if (!this.opts.localDebug) {
      this.initialized = false
      this.user.steamId = ''
      this.user.name = 'Steam unavailable'
      this.log('steam_init', 'Native Steamworks is unavailable. Local simulation disabled; achievements/lobbies/cloud will not be faked.', 'warn')
      return this.getUser()
    }
    this.user.steamId ||= 'debug-' + Math.random().toString(36).slice(2, 14)
    this.user.name = this.user.name === 'Steam unavailable' ? 'DevPlayer_' + this.user.steamId.slice(-4) : this.user.name
    this.initialized = true
    this.setupLocalLobbyBus()
    this.log('steam_init', `LOCAL SIMULATION ONLY (AppID ${this.appId}, identity ${this.user.steamId}). Nothing is stored on Steam.`, 'warn')
    return this.getUser()
  }

  // Editor Preview iframes intentionally have opaque origins: their BroadcastChannel
  // storage partitions and localStorage may be unavailable. Only explicit LOCAL DEBUG
  // may route through the trusted editor parent; no exported Steam client uses this.
  private attachParentDebugBridge() {
    if (!this.opts.localDebug || this.parentDebugHandler || typeof window === 'undefined' ||
        !window.parent || window.parent === window) return
    this.parentDebugHandler = (event: MessageEvent) => {
      if (event.source !== window.parent) return
      const envelope = event.data
      if (!envelope || envelope.__miniforgeSteam !== true || envelope.appId !== this.appId) return
      if (envelope.channel === 'lobbies') this.receiveLocalLobbyMessage(envelope.message)
      if (envelope.channel === 'p2p' && envelope.lobbyId === this.currentLobby?.id)
        this.receiveLocalP2PMessage(envelope.message)
    }
    window.addEventListener('message', this.parentDebugHandler)
  }

  private sendLocalDebug(channel: 'lobbies' | 'p2p', message: any, lobbyId?: string) {
    if (!this.opts.localDebug) return
    const bc = channel === 'lobbies' ? this.lobbyChannel : this.p2pChannel
    try { bc?.postMessage(message) } catch {}
    if (typeof window !== 'undefined' && window.parent && window.parent !== window) {
      try { window.parent.postMessage({ __miniforgeSteam: true, appId: this.appId, channel, lobbyId, message }, '*') } catch {}
    }
  }

  private receiveLocalLobbyMessage(msg: any) {
    if (!msg || typeof msg !== 'object') return
    if (msg.type === 'lobby-announce' && msg.lobby && typeof msg.lobby.id === 'string') {
      this.knownLobbies.set(msg.lobby.id, msg.lobby)
      if (this.currentLobby?.id === msg.lobby.id) this.currentLobby = msg.lobby
    } else if (msg.type === 'lobby-query' && this.currentLobby?.ownerId === this.user.steamId) {
      this.sendLocalDebug('lobbies', { type: 'lobby-announce', lobby: this.currentLobby })
    } else if (msg.type === 'lobby-remove' && typeof msg.lobbyId === 'string') {
      this.knownLobbies.delete(msg.lobbyId)
    }
  }

  private setupLocalLobbyBus() {
    if (!this.opts.localDebug) return
    this.attachParentDebugBridge()
    if (this.lobbyChannel) return
    if (typeof BroadcastChannel !== 'undefined') {
      try {
        this.lobbyChannel = new BroadcastChannel(`miniforge-steam-lobbies:${this.appId}`)
        this.lobbyChannel.onmessage = ev => this.receiveLocalLobbyMessage(ev.data)
      } catch { this.lobbyChannel = null }
    }
    this.sendLocalDebug('lobbies', { type: 'lobby-query' })
  }

  private receiveLocalP2PMessage(msg: any) {
    if (!msg || msg.from === this.user.steamId) return
    if (!this.currentLobby?.members.includes(msg.from)) return
    if (msg.to && msg.to !== this.user.steamId) return
    for (const fn of this.p2pHandlers) fn(msg.packet, msg.from)
  }

  private bindLocalP2PChannel(lobbyId: string) {
    if (this.p2pChannel) {
      try { this.p2pChannel.close() } catch {}
      this.p2pChannel = null
    }
    this.attachParentDebugBridge()
    if (typeof BroadcastChannel === 'undefined') return
    try {
      this.p2pChannel = new BroadcastChannel(`miniforge-steam-p2p:${lobbyId}`)
      this.p2pChannel.onmessage = ev => this.receiveLocalP2PMessage(ev.data)
    } catch { this.p2pChannel = null }
  }

  private startNativeP2PPoll() {
    if (this.pollTimer) window.clearInterval(this.pollTimer)
    this.pollTimer = window.setInterval(async () => {
      if (!this.native) return
      const packets = await invokeTauri<Array<{ from: string; data: string }>>('steam_poll_p2p')
      if (!Array.isArray(packets)) return
      for (const p of packets) {
        try {
          const parsed = JSON.parse(p.data)
          for (const fn of this.p2pHandlers) fn(parsed, p.from)
        } catch {}
      }
    }, 16)
  }

  isAvailable(): boolean {
    return this.initialized && this.native
  }

  isNative(): boolean {
    return this.native
  }

  getUser(): SteamUserInfo {
    return { ...this.user }
  }

  // ---- Achievements ----
  private achStorageKey() {
    return `miniforge_steam_ach_${this.appId}`
  }

  private readLocalAchievements(): string[] {
    try {
      return [...new Set([...JSON.parse(localStorage.getItem(this.achStorageKey()) || '[]'), ...this.localAchievementsFallback])]
    } catch { return [...this.localAchievementsFallback] }
  }

  async unlockAchievement(id: string): Promise<boolean> {
    if (!id || !this.initialized) return false
    if (this.native) {
      const ok = await invokeTauri<boolean>('steam_unlock_achievement', { id })
      if (ok) this.nativeAchievements.add(id)
      this.log('unlockAchievement', `${id} -> ${ok ? 'unlocked' : 'failed'}`, ok ? 'info' : 'error')
      return Boolean(ok)
    }
    const list = new Set(this.readLocalAchievements())
    list.add(id)
    this.localAchievementsFallback.add(id)
    try { localStorage.setItem(this.achStorageKey(), JSON.stringify([...list])) } catch {}
    this.log('unlockAchievement', `${id} (local debug)`)
    return true
  }

  async clearAchievement(id: string): Promise<boolean> {
    if (!id || !this.initialized) return false
    if (this.native) {
      const ok = await invokeTauri<boolean>('steam_clear_achievement', { id })
      if (ok) this.nativeAchievements.delete(id)
      this.log('clearAchievement', `${id} -> ${Boolean(ok)}`, ok ? 'info' : 'error')
      return Boolean(ok)
    }
    const list = this.readLocalAchievements().filter((x) => x !== id)
    this.localAchievementsFallback.delete(id)
    try { localStorage.setItem(this.achStorageKey(), JSON.stringify(list)) } catch {}
    this.log('clearAchievement', `${id} (local debug)`)
    return true
  }

  hasAchievement(id: string): boolean {
    return this.native ? this.nativeAchievements.has(id) : this.initialized && this.readLocalAchievements().includes(id)
  }

  listAchievements(): string[] {
    // Native achievements are only those confirmed in this session; reading the full
    // native achievement list requires a separate SteamUserStats query bridge.
    return this.native ? [...this.nativeAchievements] : this.initialized ? this.readLocalAchievements() : []
  }

  // ---- Rich Presence ----
  async setRichPresence(key: string, value: string): Promise<boolean> {
    if (!this.initialized) return false
    if (this.native && !await invokeTauri<boolean>('steam_set_rich_presence', { key, value })) return false
    this.richPresence[key] = value
    this.log('setRichPresence', `${key} = "${value}"`)
    return true
  }

  async clearRichPresence(): Promise<void> {
    if (!this.initialized) return
    if (this.native && !await invokeTauri<boolean>('steam_clear_rich_presence')) return
    this.richPresence = {}
    this.log('clearRichPresence', 'cleared')
  }

  getRichPresence(): Record<string, string> {
    return { ...this.richPresence }
  }

  // ---- Steam Cloud Saves ----
  private cloudPrefix() {
    return `miniforge_steam_cloud_${this.appId}:`
  }

  async cloudWrite(filename: string, content: string): Promise<boolean> {
    if (!filename || !this.initialized) return false
    if (this.native) {
      const ok = await invokeTauri<boolean>('steam_cloud_write', { filename, content })
      this.log('cloudWrite', `${filename} (${content.length} bytes)`)
      return Boolean(ok)
    }
    this.localCloudFallback.set(filename, content)
    try { localStorage.setItem(this.cloudPrefix() + filename, content) } catch {
      // Isolated editor previews have no localStorage; use volatile debug memory.
    }
    this.log('cloudWrite', `${filename} (${content.length} bytes, local debug storage)`)
    return true
  }

  async cloudRead(filename: string): Promise<string | null> {
    if (!filename || !this.initialized) return null
    if (this.native) {
      const res = await invokeTauri<string | null>('steam_cloud_read', { filename })
      this.log('cloudRead', `${filename} -> ${res ? res.length + ' bytes' : 'null'}`)
      return res
    }
    let val: string | null = null
    try { val = localStorage.getItem(this.cloudPrefix() + filename) } catch {}
    val ??= this.localCloudFallback.get(filename) ?? null
    this.log('cloudRead', `${filename} -> ${val ? val.length + ' bytes' : 'null'} (local debug storage)`)
    return val
  }

  async cloudDelete(filename: string): Promise<boolean> {
    if (!filename || !this.initialized) return false
    if (this.native) {
      const ok = await invokeTauri<boolean>('steam_cloud_delete', { filename })
      this.log('cloudDelete', `${filename} -> ${Boolean(ok)}`, ok ? 'info' : 'error')
      return Boolean(ok)
    }
    this.localCloudFallback.delete(filename)
    try { localStorage.removeItem(this.cloudPrefix() + filename) } catch {}
    this.log('cloudDelete', filename)
    return true
  }

  cloudList(): string[] {
    if (!this.initialized || this.native) return [] // native listing is not implemented, never substitute local files
    const pref = this.cloudPrefix()
    const files: string[] = []
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i)
        if (k && k.startsWith(pref)) files.push(k.slice(pref.length))
      }
    } catch {}
    return [...new Set([...files, ...this.localCloudFallback.keys()])]
  }

  // ---- Steam Lobbies & P2P ----
  async createLobby(opts: { maxMembers?: number; type?: 'public' | 'friends' | 'private'; name?: string; data?: Record<string, string> } = {}): Promise<SteamLobby> {
    if (!this.initialized) await this.init(this.appId)
    if (!this.initialized) throw new Error('Steamworks unavailable. Enable Local Debug explicitly for simulation.')
    const maxMembers = Math.max(2, Math.min(32, Number(opts.maxMembers) || 4))
    const lobbyType = opts.type || 'public'
    const name = (opts.name || `${this.user.name}'s Lobby`).trim()
    if (this.native) {
      const nativeLobby = await invokeTauri<SteamLobby>('steam_create_lobby', { maxMembers, lobbyType, name })
      if (nativeLobby) {
        this.currentLobby = nativeLobby
        this.log('createLobby', `Native lobby ${nativeLobby.id} (max ${maxMembers})`)
        return nativeLobby
      }
      throw new Error('Native Steamworks failed to create lobby')
    }
    const lobby: SteamLobby = {
      id: 'steam-lobby-' + Math.random().toString(36).slice(2, 9),
      name,
      ownerId: this.user.steamId,
      maxMembers,
      members: [this.user.steamId],
      type: lobbyType,
      data: { name, ...(opts.data || {}) },
      createdAt: Date.now(),
    }
    this.currentLobby = lobby
    this.knownLobbies.set(lobby.id, lobby)
    this.setupLocalLobbyBus()
    this.bindLocalP2PChannel(lobby.id)
    this.sendLocalDebug('lobbies', { type: 'lobby-announce', lobby })
    this.log('createLobby', `${lobby.id} ("${name}", max ${maxMembers})`)
    return lobby
  }

  async listLobbies(): Promise<SteamLobby[]> {
    if (!this.initialized) await this.init(this.appId)
    if (!this.initialized) return []
    if (this.native) {
      const list = await invokeTauri<SteamLobby[]>('steam_list_lobbies')
      if (Array.isArray(list)) {
        this.log('listLobbies', `Found ${list.length} native lobbies`)
        return list
      }
      this.log('listLobbies', 'Native Steamworks lobby discovery failed', 'error')
      return []
    }
    this.setupLocalLobbyBus()
    this.sendLocalDebug('lobbies', { type: 'lobby-query' })
    // BroadcastChannel announcements are asynchronous across tabs.
    await new Promise<void>(resolve => setTimeout(resolve, 120))
    const list = [...this.knownLobbies.values()]
    this.log('listLobbies', `Found ${list.length} local lobbies`)
    return list
  }

  async joinLobby(lobbyId: string): Promise<SteamLobby | null> {
    if (!lobbyId) return null
    if (!this.initialized) await this.init(this.appId)
    if (!this.initialized) return null
    if (this.native) {
      const joined = await invokeTauri<SteamLobby>('steam_join_lobby', { lobbyId })
      if (joined) {
        this.currentLobby = joined
        this.log('joinLobby', `Joined native lobby ${lobbyId}`)
        return joined
      }
      this.log('joinLobby', `Native join failed for ${lobbyId}`, 'error')
      return null
    }
    const existing = this.knownLobbies.get(lobbyId)
    if (!existing || existing.members.length >= existing.maxMembers && !existing.members.includes(this.user.steamId)) {
      this.log('joinLobby', `Lobby ${lobbyId} missing or full`, 'warn')
      return null
    }
    if (!existing.members.includes(this.user.steamId)) existing.members.push(this.user.steamId)
    this.currentLobby = existing
    this.knownLobbies.set(lobbyId, existing)
    this.bindLocalP2PChannel(lobbyId)
    this.sendLocalDebug('lobbies', { type: 'lobby-announce', lobby: existing })
    this.log('joinLobby', `Joined lobby ${lobbyId}`)
    return existing
  }

  async leaveLobby(): Promise<void> {
    if (!this.currentLobby) return
    const id = this.currentLobby.id
    if (this.native) await invokeTauri('steam_leave_lobby', { lobbyId: id })
    if (!this.native) {
      const lobby = this.currentLobby
      lobby.members = lobby.members.filter(m => m !== this.user.steamId)
      if (!lobby.members.length) {
        this.knownLobbies.delete(id)
        this.sendLocalDebug('lobbies', { type: 'lobby-remove', lobbyId: id })
      } else {
        if (lobby.ownerId === this.user.steamId) lobby.ownerId = lobby.members[0]
        this.sendLocalDebug('lobbies', { type: 'lobby-announce', lobby })
      }
    }
    if (this.p2pChannel) {
      try { this.p2pChannel.close() } catch {}
      this.p2pChannel = null
    }
    this.currentLobby = null
    this.log('leaveLobby', `Left lobby ${id}`)
  }

  async setLobbyData(key: string, value: string): Promise<boolean> {
    if (!this.currentLobby || !key) return false
    if (this.native && !await invokeTauri<boolean>('steam_set_lobby_data', { lobbyId: this.currentLobby.id, key, value })) {
      this.log('setLobbyData', `Failed: ${key}`, 'error')
      return false
    }
    this.currentLobby.data[key] = value
    if (!this.native) this.sendLocalDebug('lobbies', { type: 'lobby-announce', lobby: this.currentLobby })
    this.log('setLobbyData', `${key} = "${value}"`)
    return true
  }

  getLobby(): SteamLobby | null {
    return this.currentLobby ? structuredClone(this.currentLobby) : null
  }

  onP2PPacket(handler: P2PHandler): () => void {
    this.p2pHandlers.add(handler)
    return () => this.p2pHandlers.delete(handler)
  }

  sendP2P(packet: any, toSteamId?: string) {
    if (!this.initialized || !this.currentLobby) return
    if (this.native) {
      // Steam transport sends to actual peers, not an empty recipient ID.
      const targets = toSteamId ? [toSteamId] : this.currentLobby.members.filter(m => m !== this.user.steamId)
      for (const to of targets) {
        if (!this.currentLobby.members.includes(to)) continue
        void invokeTauri<boolean>('steam_send_p2p', { to, data: JSON.stringify(packet) }).then(ok => {
          if (!ok) this.log('sendP2P', `Failed to send to ${to}`, 'error')
        })
      }
      return
    }
    this.sendLocalDebug('p2p', { from: this.user.steamId, to: toSteamId, packet }, this.currentLobby.id)
  }

  dispose() {
    if (this.pollTimer) {
      window.clearInterval(this.pollTimer)
      this.pollTimer = null
    }
    void this.leaveLobby()
    this.initialized = false
    if (this.lobbyChannel) {
      try { this.lobbyChannel.close() } catch {}
      this.lobbyChannel = null
    }
    if (this.parentDebugHandler && typeof window !== 'undefined') {
      window.removeEventListener('message', this.parentDebugHandler)
      this.parentDebugHandler = null
    }
    this.localCloudFallback.clear()
    this.localAchievementsFallback.clear()
  }
}
