import { useEffect, useRef, useState } from 'react'
import { Award, Cloud, Download, Plus, RefreshCw, Terminal, Trash2, Users, Check, X, Radio } from 'lucide-react'
import type { Project, SteamAchievementDef, SteamSettings } from '../../../packages/project-schema/src'
import { SteamManager, type SteamLobby, type SteamLogEntry } from '../../../packages/runtime/src/steam'

export const DEFAULT_STEAM: SteamSettings = {
  enabled: false,
  appId: 480,
  cloudSaves: true,
  richPresence: 'In Main Menu',
  lobbyMaxMembers: 4,
  achievements: [
    { id: 'ACH_FIRST_WIN', name: 'First Victory', description: 'Complete your first match' },
  ],
}

export function SteamStudio({
  p,
  onSave,
  onClose,
}: {
  p: Project
  onSave: (steam: SteamSettings) => void
  onClose: () => void
}) {
  const [tab, setTab] = useState<'settings' | 'lobbies' | 'debug'>('settings')
  const [cfg, setCfg] = useState<SteamSettings>(() => ({
    ...DEFAULT_STEAM,
    ...(p.settings.steam ? structuredClone(p.settings.steam) : {}),
  }))
  const [newAchId, setNewAchId] = useState('')
  const [newAchName, setNewAchName] = useState('')
  const [lobbyName, setLobbyName] = useState('Dev Room 480')
  const [lobbies, setLobbies] = useState<SteamLobby[]>([])
  const [activeLobby, setActiveLobby] = useState<SteamLobby | null>(null)
  const [cloudFile, setCloudFile] = useState('save.json')
  const [cloudData, setCloudData] = useState('{"level":1,"score":250}')
  const [cloudStatus, setCloudStatus] = useState('')
  const [logs, setLogs] = useState<SteamLogEntry[]>([])
  const [unlockedAchs, setUnlockedAchs] = useState<string[]>([])
  const mgrRef = useRef<SteamManager | null>(null)

  const syncDebugState = () => {
    const m = mgrRef.current
    if (!m) return
    setLogs(m.getLogs())
    setActiveLobby(m.getLobby())
    setUnlockedAchs(m.listAchievements())
  }

  useEffect(() => {
    const m = new SteamManager()
    mgrRef.current = m
    void m.init(cfg.appId || 480).then(() => syncDebugState())
    return () => {
      m.dispose()
      mgrRef.current = null
    }
  }, [cfg.appId])

  const patchCfg = (patch: Partial<SteamSettings>) => setCfg((prev) => ({ ...prev, ...patch }))

  const downloadAppIdTxt = () => {
    const blob = new Blob([`${cfg.appId || 480}\n`], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'steam_appid.txt'
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 500)
  }

  const addAchievement = () => {
    const id = newAchId.trim().toUpperCase().replace(/\s+/g, '_')
    if (!id) return
    const list: SteamAchievementDef[] = [...(cfg.achievements || [])]
    if (list.some((x) => x.id === id)) return
    list.push({ id, name: newAchName.trim() || id, description: '' })
    patchCfg({ achievements: list })
    setNewAchId('')
    setNewAchName('')
  }

  return (
    <div
      className="mf-backdrop"
      style={{ zIndex: 1120 }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="mf-dialog mf-hud-dialog" role="dialog" aria-modal="true" aria-label="Steamworks SDK & Debug Panel">
        <header>
          <Radio size={17} />
          <h3>Steamworks SDK &amp; Debug Panel (v3.0)</h3>
          <button type="button" className="mf-close" onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </header>

        <div className="mf-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* Tabs */}
          <div style={{ display: 'flex', gap: 6, borderBottom: '1px solid #242c37', paddingBottom: 8, flexWrap: 'wrap', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <button type="button" className={tab === 'settings' ? 'mf-primary' : 'mf-btn'} style={{ fontSize: 12, padding: '5px 12px' }} onClick={() => setTab('settings')}>
                <Award size={13} /> Steam Settings &amp; Achievements
              </button>
              <button type="button" className={tab === 'lobbies' ? 'mf-primary' : 'mf-btn'} style={{ fontSize: 12, padding: '5px 12px' }} onClick={() => setTab('lobbies')}>
                <Users size={13} /> Lobby Inspector &amp; Cloud Saves
              </button>
              <button type="button" className={tab === 'debug' ? 'mf-primary' : 'mf-btn'} style={{ fontSize: 12, padding: '5px 12px' }} onClick={() => { syncDebugState(); setTab('debug') }}>
                <Terminal size={13} /> Steam API Logs ({logs.length})
              </button>
            </div>
            <button type="button" className="mf-btn" style={{ fontSize: 11.5 }} onClick={downloadAppIdTxt}>
              <Download size={12} /> Download steam_appid.txt ({cfg.appId || 480})
            </button>
          </div>

          {tab === 'settings' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, padding: '8px 10px', borderRadius: 8, background: '#141a22', border: '1px solid #2b323b' }}>
                  <input type="checkbox" checked={cfg.enabled} onChange={(e) => patchCfg({ enabled: e.target.checked })} />
                  <span><strong>Enable Steamworks SDK</strong> (auto-generates <code>steam_appid.txt</code> on Desktop Export)</span>
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12 }}>
                  <span style={{ color: '#94a3b8' }}>Steam AppID (480 = Spacewar test app)</span>
                  <input
                    type="number"
                    min={1}
                    value={cfg.appId || 480}
                    onChange={(e) => patchCfg({ appId: Math.max(1, Number(e.target.value) || 480) })}
                  />
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12 }}>
                  <span style={{ color: '#94a3b8' }}>Default Rich Presence Status</span>
                  <input value={cfg.richPresence || ''} onChange={(e) => patchCfg({ richPresence: e.target.value })} placeholder="In Lobby / Exploring" />
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12 }}>
                  <span style={{ color: '#94a3b8' }}>Default Lobby Max Players</span>
                  <input
                    type="number"
                    min={2}
                    max={32}
                    value={cfg.lobbyMaxMembers ?? 4}
                    onChange={(e) => patchCfg({ lobbyMaxMembers: Math.max(2, Math.min(32, Number(e.target.value) || 4)) })}
                  />
                </label>
              </div>

              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 12 }}>
                <input type="checkbox" checked={cfg.cloudSaves !== false} onChange={(e) => patchCfg({ cloudSaves: e.target.checked })} />
                <Cloud size={13} color="#38bdf8" /> Enable Steam Cloud Saves (<code>api.steam.cloudWrite / cloudRead</code>)
              </label>

              {/* Achievements list + local test unlock */}
              <div style={{ borderTop: '1px solid #242c37', paddingTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <strong style={{ fontSize: 12, color: '#cbd5e1' }}>Steam Achievements ({(cfg.achievements || []).length})</strong>
                <div style={{ display: 'flex', gap: 6 }}>
                  <input value={newAchId} onChange={(e) => setNewAchId(e.target.value)} placeholder="ID (e.g. ACH_BOSS_KILL)" style={{ width: 200 }} />
                  <input value={newAchName} onChange={(e) => setNewAchName(e.target.value)} placeholder="Display Name" style={{ flex: 1 }} />
                  <button type="button" className="mf-btn" onClick={addAchievement}>
                    <Plus size={12} /> Add
                  </button>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5, maxHeight: 200, overflowY: 'auto' }}>
                  {(cfg.achievements || []).map((ach) => {
                    const unlocked = unlockedAchs.includes(ach.id)
                    return (
                      <div
                        key={ach.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: 8,
                          padding: '6px 10px',
                          borderRadius: 6,
                          background: '#11161d',
                          border: '1px solid ' + (unlocked ? 'rgba(74,222,128,0.4)' : '#242c37'),
                          fontSize: 12,
                        }}
                      >
                        <div>
                          <code style={{ color: '#93c5fd' }}>{ach.id}</code> — <span>{ach.name}</span>
                          {unlocked && <span style={{ marginLeft: 8, fontSize: 10.5, color: '#86efac' }}>✓ Unlocked</span>}
                        </div>
                        <div style={{ display: 'flex', gap: 5 }}>
                          <button
                            type="button"
                            className="mf-btn"
                            style={{ fontSize: 11, padding: '2px 8px' }}
                            onClick={async () => {
                              if (unlocked) await mgrRef.current?.clearAchievement(ach.id)
                              else await mgrRef.current?.unlockAchievement(ach.id)
                              syncDebugState()
                            }}
                          >
                            {unlocked ? 'Clear' : 'Test Unlock'}
                          </button>
                          <button
                            type="button"
                            className="mf-btn"
                            style={{ padding: '2px 6px' }}
                            onClick={() => patchCfg({ achievements: (cfg.achievements || []).filter((x) => x.id !== ach.id) })}
                          >
                            <Trash2 size={11} />
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          )}

          {tab === 'lobbies' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              {/* Left: Lobby Inspector */}
              <div style={{ border: '1px solid #2b323b', borderRadius: 8, padding: 10, background: '#141a22', display: 'flex', flexDirection: 'column', gap: 8 }}>
                <strong style={{ fontSize: 12, color: '#f8fafc' }}>Steam Lobby Inspector (AppID {cfg.appId || 480})</strong>
                <div style={{ display: 'flex', gap: 6 }}>
                  <input value={lobbyName} onChange={(e) => setLobbyName(e.target.value)} placeholder="Lobby name" style={{ flex: 1 }} />
                  <button
                    type="button"
                    className="mf-primary"
                    style={{ fontSize: 11.5 }}
                    onClick={async () => {
                      await mgrRef.current?.createLobby({ name: lobbyName, maxMembers: cfg.lobbyMaxMembers || 4 })
                      const list = (await mgrRef.current?.listLobbies()) || []
                      setLobbies(list)
                      syncDebugState()
                    }}
                  >
                    Create Lobby
                  </button>
                  <button
                    type="button"
                    className="mf-btn"
                    title="Refresh lobbies"
                    onClick={async () => {
                      const list = (await mgrRef.current?.listLobbies()) || []
                      setLobbies(list)
                      syncDebugState()
                    }}
                  >
                    <RefreshCw size={12} />
                  </button>
                </div>

                {activeLobby ? (
                  <div style={{ padding: 8, borderRadius: 6, background: '#0d1117', border: '1px solid rgba(74,222,128,0.4)', fontSize: 11.5 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <strong style={{ color: '#86efac' }}>Active: {activeLobby.name}</strong>
                      <button
                        type="button"
                        className="mf-btn"
                        style={{ fontSize: 10.5, padding: '2px 6px' }}
                        onClick={async () => {
                          await mgrRef.current?.leaveLobby()
                          syncDebugState()
                        }}
                      >
                        Leave
                      </button>
                    </div>
                    <div style={{ color: '#94a3b8', marginTop: 4 }}>
                      ID: <code>{activeLobby.id}</code> · Members: {activeLobby.members.length}/{activeLobby.maxMembers}
                    </div>
                  </div>
                ) : (
                  <div style={{ fontSize: 11.5, color: '#8b9bb0' }}>Not in a Steam lobby. Create one or join from the list below.</div>
                )}

                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 190, overflowY: 'auto' }}>
                  {lobbies.map((l) => (
                    <div key={l.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 8px', background: '#0d1117', borderRadius: 6, fontSize: 11.5 }}>
                      <span>
                        <strong>{l.name}</strong> ({l.members.length}/{l.maxMembers})
                      </span>
                      <button
                        type="button"
                        className="mf-btn"
                        style={{ fontSize: 10.5, padding: '2px 7px' }}
                        onClick={async () => {
                          await mgrRef.current?.joinLobby(l.id)
                          syncDebugState()
                        }}
                      >
                        Join
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Right: Cloud Saves Tester */}
              <div style={{ border: '1px solid #2b323b', borderRadius: 8, padding: 10, background: '#141a22', display: 'flex', flexDirection: 'column', gap: 8 }}>
                <strong style={{ fontSize: 12, color: '#f8fafc' }}>Steam Cloud Save Tester</strong>
                <input value={cloudFile} onChange={(e) => setCloudFile(e.target.value)} placeholder="save.json" />
                <textarea
                  rows={5}
                  value={cloudData}
                  onChange={(e) => setCloudData(e.target.value)}
                  style={{ fontFamily: 'ui-monospace, monospace', fontSize: 11.5, background: '#0d1117', color: '#e6edf3', border: '1px solid #2b323b', borderRadius: 6, padding: 8 }}
                />
                <div style={{ display: 'flex', gap: 6 }}>
                  <button
                    type="button"
                    className="mf-primary"
                    style={{ fontSize: 11.5 }}
                    onClick={async () => {
                      const ok = await mgrRef.current?.cloudWrite(cloudFile, cloudData)
                      setCloudStatus(ok ? `Saved "${cloudFile}" to Steam Cloud` : 'Write failed')
                      syncDebugState()
                    }}
                  >
                    Write Cloud File
                  </button>
                  <button
                    type="button"
                    className="mf-btn"
                    style={{ fontSize: 11.5 }}
                    onClick={async () => {
                      const res = await mgrRef.current?.cloudRead(cloudFile)
                      if (res !== null && res !== undefined) {
                        setCloudData(res)
                        setCloudStatus(`Loaded ${res.length} bytes from "${cloudFile}"`)
                      } else {
                        setCloudStatus(`File "${cloudFile}" not found`)
                      }
                      syncDebugState()
                    }}
                  >
                    Read Cloud File
                  </button>
                </div>
                {cloudStatus && <div style={{ fontSize: 11, color: '#7ee787' }}>{cloudStatus}</div>}
              </div>
            </div>
          )}

          {tab === 'debug' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11.5, color: '#94a3b8' }}>
                <span>
                  Mode: <strong style={{ color: '#7ee787' }}>{mgrRef.current?.isNative() ? 'Native Steamworks SDK' : 'Local Debug Bridge (AppID ' + (cfg.appId || 480) + ')'}</strong>
                </span>
                <button
                  type="button"
                  className="mf-btn"
                  style={{ fontSize: 11 }}
                  onClick={() => {
                    mgrRef.current?.clearLogs()
                    syncDebugState()
                  }}
                >
                  Clear Logs
                </button>
              </div>
              <div style={{ maxHeight: 320, overflowY: 'auto', background: '#0d1117', border: '1px solid #2b323b', borderRadius: 8, padding: 10, fontFamily: 'ui-monospace, monospace', fontSize: 11.5 }}>
                {logs.length === 0 ? (
                  <div style={{ color: '#64748b' }}>No Steam API calls recorded yet.</div>
                ) : (
                  logs.map((l, idx) => (
                    <div key={idx} style={{ padding: '2px 0', color: l.level === 'error' ? '#ff7b72' : '#cbd5e1' }}>
                      <span style={{ color: '#64748b' }}>[{new Date(l.ts).toLocaleTimeString()}]</span>{' '}
                      <span style={{ color: '#93c5fd' }}>{l.call}</span> — {l.detail}
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        <footer>
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="mf-primary"
            onClick={() => {
              onSave(cfg)
              onClose()
            }}
          >
            <Check size={14} /> Save Steam Settings
          </button>
        </footer>
      </div>
    </div>
  )
}
