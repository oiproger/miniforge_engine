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
  appId = 480
  initialized = false
  native = false
  user: SteamUserInfo = {
    steamId: '765611980' + Math.floor(10000000 + Math.random() * 89999999),
    name: 'DevPlayer_' + Math.random().toString(36).slice(2, 6),
    appId: 480,
    native: false,
  }
  currentLobby: SteamLobby | null = null
  private richPresence: Record<string, string> = {}
  private logs: SteamLogEntry[] = []
  private p2pHandlers = new Set<P2PHandler>()
  private lobbyChannel: BroadcastChannel | null = null
  private p2pChannel: BroadcastChannel | null = null
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
    this.appId = Number(appId) || 480
    const nativeRes = await invokeTauri<SteamUserInfo>('steam_init', { appId: this.appId })
    if (nativeRes && nativeRes.steamId) {
      this.native = true
      this.user = { ...nativeRes, appId: this.appId, native: true }
      this.initialized = true
      this.log('steam_init', `Native Steamworks initialized (AppID ${this.appId}, user ${this.user.name})`)
      this.startNativeP2PPoll()
      return this.user
    }

    // Browser / Editor local Steamworks debug bridge (AppID 480 Spacewar compatible)
    this.native = false
    this.user.appId = this.appId
    this.user.native = false
    this.initialized = true
    this.setupLocalLobbyBus()
    this.log('steam_init', `Local Steam Debug Mode active (AppID ${this.appId}, mock SteamID ${this.user.steamId})`)
    return this.user
  }

  private setupLocalLobbyBus() {
    if (typeof BroadcastChannel === 'undefined' || this.lobbyChannel) return
    this.lobbyChannel = new BroadcastChannel(`miniforge-steam-lobbies:${this.appId}`)
    this.lobbyChannel.onmessage = (ev) => {
      const msg = ev.data
      if (!msg) return
      if (msg.type === 'lobby-announce' && msg.lobby) {
        this.knownLobbies.set(msg.lobby.id, msg.lobby)
        if (this.currentLobby && this.currentLobby.id === msg.lobby.id) {
          this.currentLobby = msg.lobby
        }
      } else if (msg.type === 'lobby-query' && this.currentLobby && this.currentLobby.ownerId === this.user.steamId) {
        this.lobbyChannel?.postMessage({ type: 'lobby-announce', lobby: this.currentLobby })
      } else if (msg.type === 'lobby-remove' && msg.lobbyId) {
        this.knownLobbies.delete(msg.lobbyId)
      }
    }
    this.lobbyChannel.postMessage({ type: 'lobby-query' })
  }

  private bindLocalP2PChannel(lobbyId: string) {
    if (this.p2pChannel) {
      try { this.p2pChannel.close() } catch {}
      this.p2pChannel = null
    }
    if (typeof BroadcastChannel === 'undefined') return
    this.p2pChannel = new BroadcastChannel(`miniforge-steam-p2p:${lobbyId}`)
    this.p2pChannel.onmessage = (ev) => {
      const msg = ev.data
      if (!msg || msg.from === this.user.steamId) return
      if (msg.to && msg.to !== this.user.steamId) return
      for (const fn of this.p2pHandlers) fn(msg.packet, msg.from)
    }
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
    return this.initialized
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
      return JSON.parse(localStorage.getItem(this.achStorageKey()) || '[]')
    } catch {
      return []
    }
  }

  async unlockAchievement(id: string): Promise<boolean> {
    if (!id) return false
    if (this.native) {
      const ok = await invokeTauri<boolean>('steam_unlock_achievement', { id })
      this.log('unlockAchievement', `${id} -> ${ok ? 'unlocked' : 'failed'}`)
      return Boolean(ok)
    }
    const list = new Set(this.readLocalAchievements())
    list.add(id)
    try { localStorage.setItem(this.achStorageKey(), JSON.stringify([...list])) } catch {}
    this.log('unlockAchievement', `${id} (local debug)`)
    return true
  }

  async clearAchievement(id: string): Promise<boolean> {
    if (!id) return false
    if (this.native) {
      await invokeTauri('steam_clear_achievement', { id })
      this.log('clearAchievement', id)
      return true
    }
    const list = this.readLocalAchievements().filter((x) => x !== id)
    try { localStorage.setItem(this.achStorageKey(), JSON.stringify(list)) } catch {}
    this.log('clearAchievement', `${id} (local debug)`)
    return true
  }

  hasAchievement(id: string): boolean {
    return this.readLocalAchievements().includes(id)
  }

  listAchievements(): string[] {
    return this.readLocalAchievements()
  }

  // ---- Rich Presence ----
  async setRichPresence(key: string, value: string): Promise<boolean> {
    this.richPresence[key] = value
    if (this.native) {
      await invokeTauri('steam_set_rich_presence', { key, value })
    }
    this.log('setRichPresence', `${key} = "${value}"`)
    return true
  }

  async clearRichPresence(): Promise<void> {
    this.richPresence = {}
    if (this.native) await invokeTauri('steam_clear_rich_presence')
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
    if (!filename) return false
    if (this.native) {
      const ok = await invokeTauri<boolean>('steam_cloud_write', { filename, content })
      this.log('cloudWrite', `${filename} (${content.length} bytes)`)
      return Boolean(ok)
    }
    try {
      localStorage.setItem(this.cloudPrefix() + filename, content)
      this.log('cloudWrite', `${filename} (${content.length} bytes, local cloud)`)
      return true
    } catch {
      return false
    }
  }

  async cloudRead(filename: string): Promise<string | null> {
    if (!filename) return null
    if (this.native) {
      const res = await invokeTauri<string | null>('steam_cloud_read', { filename })
      this.log('cloudRead', `${filename} -> ${res ? res.length + ' bytes' : 'null'}`)
      return res
    }
    const val = localStorage.getItem(this.cloudPrefix() + filename)
    this.log('cloudRead', `${filename} -> ${val ? val.length + ' bytes' : 'null'} (local cloud)`)
    return val
  }

  async cloudDelete(filename: string): Promise<boolean> {
    if (!filename) return false
    if (this.native) await invokeTauri('steam_cloud_delete', { filename })
    try { localStorage.removeItem(this.cloudPrefix() + filename) } catch {}
    this.log('cloudDelete', filename)
    return true
  }

  cloudList(): string[] {
    const pref = this.cloudPrefix()
    const files: string[] = []
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i)
        if (k && k.startsWith(pref)) files.push(k.slice(pref.length))
      }
    } catch {}
    return files
  }

  // ---- Steam Lobbies & P2P ----
  async createLobby(opts: { maxMembers?: number; type?: 'public' | 'friends' | 'private'; name?: string; data?: Record<string, string> } = {}): Promise<SteamLobby> {
    if (!this.initialized) await this.init(this.appId)
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
    this.lobbyChannel?.postMessage({ type: 'lobby-announce', lobby })
    this.log('createLobby', `${lobby.id} ("${name}", max ${maxMembers})`)
    return lobby
  }

  async listLobbies(): Promise<SteamLobby[]> {
    if (!this.initialized) await this.init(this.appId)
    if (this.native) {
      const list = await invokeTauri<SteamLobby[]>('steam_list_lobbies')
      if (Array.isArray(list)) {
        this.log('listLobbies', `Found ${list.length} native lobbies`)
        return list
      }
    }
    this.setupLocalLobbyBus()
    this.lobbyChannel?.postMessage({ type: 'lobby-query' })
    const list = [...this.knownLobbies.values()]
    this.log('listLobbies', `Found ${list.length} local lobbies`)
    return list
  }

  async joinLobby(lobbyId: string): Promise<SteamLobby | null> {
    if (!lobbyId) return null
    if (!this.initialized) await this.init(this.appId)
    if (this.native) {
      const joined = await invokeTauri<SteamLobby>('steam_join_lobby', { lobbyId })
      if (joined) {
        this.currentLobby = joined
        this.log('joinLobby', `Joined native lobby ${lobbyId}`)
        return joined
      }
    }
    const existing = this.knownLobbies.get(lobbyId) || {
      id: lobbyId,
      name: lobbyId,
      ownerId: lobbyId,
      maxMembers: 4,
      members: [],
      type: 'public' as const,
      data: {},
      createdAt: Date.now(),
    }
    if (!existing.members.includes(this.user.steamId)) existing.members.push(this.user.steamId)
    this.currentLobby = existing
    this.knownLobbies.set(lobbyId, existing)
    this.bindLocalP2PChannel(lobbyId)
    this.lobbyChannel?.postMessage({ type: 'lobby-announce', lobby: existing })
    this.log('joinLobby', `Joined lobby ${lobbyId}`)
    return existing
  }

  async leaveLobby(): Promise<void> {
    if (!this.currentLobby) return
    const id = this.currentLobby.id
    if (this.native) await invokeTauri('steam_leave_lobby', { lobbyId: id })
    if (this.currentLobby.ownerId === this.user.steamId) {
      this.knownLobbies.delete(id)
      this.lobbyChannel?.postMessage({ type: 'lobby-remove', lobbyId: id })
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
    this.currentLobby.data[key] = value
    if (this.native) await invokeTauri('steam_set_lobby_data', { lobbyId: this.currentLobby.id, key, value })
    else this.lobbyChannel?.postMessage({ type: 'lobby-announce', lobby: this.currentLobby })
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
    if (this.native) {
      void invokeTauri('steam_send_p2p', {
        to: toSteamId || '',
        data: JSON.stringify(packet),
      })
      return
    }
    if (this.p2pChannel) {
      try {
        this.p2pChannel.postMessage({ from: this.user.steamId, to: toSteamId, packet })
      } catch {}
    }
  }

  dispose() {
    if (this.pollTimer) {
      window.clearInterval(this.pollTimer)
      this.pollTimer = null
    }
    void this.leaveLobby()
    if (this.lobbyChannel) {
      try { this.lobbyChannel.close() } catch {}
      this.lobbyChannel = null
    }
  }
}
