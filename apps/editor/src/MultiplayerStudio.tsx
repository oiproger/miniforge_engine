import { useEffect, useRef, useState } from 'react'
import { Wifi, Users, Play, Square, Copy, Check, X, Server, Activity } from 'lucide-react'
import type { MultiplayerMode, MultiplayerSettings, Project } from '../../../packages/project-schema/src'
import { previewGame } from '../../../packages/exporter/src'

export const DEFAULT_MULTIPLAYER: MultiplayerSettings = {
  mode: 'singleplayer',
  maxPlayers: 4,
  serverUrl: 'ws://localhost:8765',
  roomCode: 'lobby-1',
  tickRate: 20,
  interpolationDelayMs: 60,
  simulatedLatencyMs: 0,
  simulatedPacketLoss: 0,
  splitScreenPlayers: 2,
  splitScreenLayout: 'horizontal',
}

export function MultiplayerStudio({
  p,
  onSave,
  onClose,
}: {
  p: Project
  onSave: (cfg: MultiplayerSettings) => void
  onClose: () => void
}) {
  const [tab, setTab] = useState<'settings' | 'debugger' | 'server'>('settings')
  const [cfg, setCfg] = useState<MultiplayerSettings>(() => ({
    ...DEFAULT_MULTIPLAYER,
    ...(p.settings.multiplayer || {}),
  }))
  const [copied, setCopied] = useState(false)
  const [dualRunning, setDualRunning] = useState(false)
  const hostFrameRef = useRef<HTMLIFrameElement | null>(null)
  const clientFrameRef = useRef<HTMLIFrameElement | null>(null)

  const patchCfg = (patch: Partial<MultiplayerSettings>) => setCfg((prev) => ({ ...prev, ...patch }))

  useEffect(() => {
    if (!dualRunning || !hostFrameRef.current || !clientFrameRef.current) return
    let dead = false
    let cleanupHost: (() => void) | undefined
    let cleanupClient: (() => void) | undefined

    const baseCfg: MultiplayerSettings = {
      ...cfg,
      mode: cfg.mode === 'singleplayer' || cfg.mode === 'local-splitscreen' ? 'client-server-ws' : cfg.mode,
      serverUrl: 'local',
      roomCode: (cfg.roomCode || 'lobby-1').trim() || 'lobby-1',
    }
    const hostProj = structuredClone(p)
    hostProj.settings.multiplayer = { ...baseCfg, preferredRole: 'host' }
    const clientProj = structuredClone(p)
    clientProj.settings.multiplayer = { ...baseCfg, preferredRole: 'client' }

    const relayNetMessage = (ev: MessageEvent) => {
      const d = ev.data
      if (!d || !d.__miniforgeNet) return
      const hostWin = hostFrameRef.current?.contentWindow
      const clientWin = clientFrameRef.current?.contentWindow
      if (ev.source === hostWin && clientWin) {
        try { clientWin.postMessage(d, '*') } catch {}
      } else if (ev.source === clientWin && hostWin) {
        try { hostWin.postMessage(d, '*') } catch {}
      }
    }
    window.addEventListener('message', relayNetMessage)

    void previewGame(hostProj, hostFrameRef.current).then((fn) => {
      if (dead) fn()
      else cleanupHost = fn
    })
    void previewGame(clientProj, clientFrameRef.current).then((fn) => {
      if (dead) fn()
      else cleanupClient = fn
    })

    return () => {
      dead = true
      window.removeEventListener('message', relayNetMessage)
      cleanupHost?.()
      cleanupClient?.()
    }
  }, [dualRunning])

  const launchHostAndClient = () => {
    const effectiveCfg: MultiplayerSettings = {
      ...cfg,
      mode: cfg.mode === 'singleplayer' || cfg.mode === 'local-splitscreen' ? 'client-server-ws' : cfg.mode,
    }
    setCfg(effectiveCfg)
    onSave(effectiveCfg)
    setTab('debugger')
    setDualRunning(true)
  }

  return (
    <div
      className="mf-backdrop"
      style={{ zIndex: 1100 }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) {
          setDualRunning(false)
          onClose()
        }
      }}
    >
      <div className="mf-dialog mf-hud-dialog" role="dialog" aria-modal="true" aria-label="Multiplayer & Net Debugger">
        <header>
          <Wifi size={17} />
          <h3>Multiplayer &amp; Net Debugger (v3.0)</h3>
          <button
            type="button"
            className="mf-close"
            onClick={() => {
              setDualRunning(false)
              onClose()
            }}
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </header>

        <div className="mf-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* Tabs */}
          <div style={{ display: 'flex', gap: 6, borderBottom: '1px solid #242c37', paddingBottom: 8, flexWrap: 'wrap', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <button type="button" className={tab === 'settings' ? 'mf-primary' : 'mf-btn'} style={{ fontSize: 12, padding: '5px 12px' }} onClick={() => setTab('settings')}>
                <Users size={13} /> Multiplayer Settings
              </button>
              <button type="button" className={tab === 'debugger' ? 'mf-primary' : 'mf-btn'} style={{ fontSize: 12, padding: '5px 12px' }} onClick={() => setTab('debugger')}>
                <Activity size={13} /> Net Debugger &amp; Host + Client
              </button>
              <button type="button" className={tab === 'server' ? 'mf-primary' : 'mf-btn'} style={{ fontSize: 12, padding: '5px 12px' }} onClick={() => setTab('server')}>
                <Server size={13} /> Relay / Signaling Server
              </button>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              {dualRunning ? (
                <button type="button" className="mf-btn" style={{ fontSize: 12, padding: '5px 12px', color: '#ff7b72' }} onClick={() => setDualRunning(false)}>
                  <Square size={12} /> Stop Host + Client
                </button>
              ) : (
                <button type="button" className="mf-primary" style={{ fontSize: 12, padding: '5px 12px' }} onClick={launchHostAndClient}>
                  <Play size={12} /> Launch Host + Client
                </button>
              )}
            </div>
          </div>

          {tab === 'settings' && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12 }}>
                <span style={{ color: '#94a3b8' }}>Multiplayer Mode</span>
                <select value={cfg.mode} onChange={(e) => patchCfg({ mode: e.target.value as MultiplayerMode })}>
                  <option value="singleplayer">Singleplayer (Offline)</option>
                  <option value="local-splitscreen">Local Split-Screen (2–4 Players)</option>
                  <option value="p2p-webrtc">P2P (WebRTC DataChannel)</option>
                  <option value="client-server-ws">Client-Server (WebSocket)</option>
                  <option value="steam-p2p">Steam P2P + Steam Lobbies (Steamworks)</option>
                </select>
              </label>

              <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12 }}>
                <span style={{ color: '#94a3b8' }}>Max Players</span>
                <input
                  type="number"
                  min={2}
                  max={16}
                  value={cfg.maxPlayers ?? 4}
                  onChange={(e) => patchCfg({ maxPlayers: Math.max(2, Math.min(16, Number(e.target.value) || 4)) })}
                />
              </label>

              <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12 }}>
                <span style={{ color: '#94a3b8' }}>Default Room / Lobby Code</span>
                <input value={cfg.roomCode ?? 'lobby-1'} onChange={(e) => patchCfg({ roomCode: e.target.value })} />
              </label>

              <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12 }}>
                <span style={{ color: '#94a3b8' }}>Relay / Signaling Server URL</span>
                <input
                  value={cfg.serverUrl ?? 'ws://localhost:8765'}
                  placeholder="ws://localhost:8765 or local"
                  onChange={(e) => patchCfg({ serverUrl: e.target.value })}
                />
              </label>

              <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12 }}>
                <span style={{ color: '#94a3b8' }}>Embedded LAN Server Port (Desktop)</span>
                <input
                  type="number"
                  min={1024}
                  max={65535}
                  value={cfg.lanPort ?? 8765}
                  onChange={(e) => patchCfg({ lanPort: Math.max(1024, Math.min(65535, Number(e.target.value) || 8765)) })}
                />
              </label>

              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, padding: '8px 10px', borderRadius: 8, background: '#141a22', border: '1px solid #2b323b' }}>
                <input
                  type="checkbox"
                  checked={Boolean(cfg.autoStartLanServer)}
                  onChange={(e) => patchCfg({ autoStartLanServer: e.target.checked })}
                />
                <span><strong>Auto-start embedded LAN server</strong> (Desktop builds auto-host WebSocket + UDP LAN discovery with zero Node.js)</span>
              </label>

              <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12 }}>
                <span style={{ color: '#94a3b8' }}>Network Tick Rate ({cfg.tickRate ?? 20} Hz)</span>
                <input
                  type="range"
                  min={10}
                  max={60}
                  step={5}
                  value={cfg.tickRate ?? 20}
                  onChange={(e) => patchCfg({ tickRate: Number(e.target.value) })}
                />
              </label>

              <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12 }}>
                <span style={{ color: '#94a3b8' }}>Interpolation Buffer ({cfg.interpolationDelayMs ?? 60} ms)</span>
                <input
                  type="range"
                  min={0}
                  max={200}
                  step={10}
                  value={cfg.interpolationDelayMs ?? 60}
                  onChange={(e) => patchCfg({ interpolationDelayMs: Number(e.target.value) })}
                />
              </label>

              {cfg.mode === 'local-splitscreen' && (
                <>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12 }}>
                    <span style={{ color: '#94a3b8' }}>Local Players (2–4)</span>
                    <select
                      value={cfg.splitScreenPlayers ?? 2}
                      onChange={(e) => patchCfg({ splitScreenPlayers: Number(e.target.value) })}
                    >
                      <option value={2}>2 Players (WASD + Arrows / Pad 1–2)</option>
                      <option value={3}>3 Players (+ IJKL / Pad 3)</option>
                      <option value={4}>4 Players (+ Numpad / Pad 4)</option>
                    </select>
                  </label>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12 }}>
                    <span style={{ color: '#94a3b8' }}>Split-Screen Layout</span>
                    <select
                      value={cfg.splitScreenLayout ?? 'horizontal'}
                      onChange={(e) => patchCfg({ splitScreenLayout: e.target.value as any })}
                    >
                      <option value="horizontal">Horizontal Split</option>
                      <option value="vertical">Vertical Split</option>
                      <option value="grid">2×2 Grid</option>
                    </select>
                  </label>
                </>
              )}
            </div>
          )}

          {tab === 'debugger' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {/* Lag & Packet Loss Simulator */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: 12,
                  padding: '10px 12px',
                  borderRadius: 8,
                  background: '#141a22',
                  border: '1px solid #2b323b',
                  fontSize: 12,
                }}
              >
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <span style={{ color: '#cbd5e1' }}>
                    Simulated Latency (RTT): <strong style={{ color: '#f59e0b' }}>{cfg.simulatedLatencyMs ?? 0} ms</strong>
                  </span>
                  <input
                    type="range"
                    min={0}
                    max={500}
                    step={10}
                    value={cfg.simulatedLatencyMs ?? 0}
                    onChange={(e) => patchCfg({ simulatedLatencyMs: Number(e.target.value) })}
                  />
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <span style={{ color: '#cbd5e1' }}>
                    Simulated Packet Loss: <strong style={{ color: '#ff7b72' }}>{cfg.simulatedPacketLoss ?? 0}%</strong>
                  </span>
                  <input
                    type="range"
                    min={0}
                    max={30}
                    step={1}
                    value={cfg.simulatedPacketLoss ?? 0}
                    onChange={(e) => patchCfg({ simulatedPacketLoss: Number(e.target.value) })}
                  />
                </label>
              </div>

              {dualRunning ? (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, height: 390 }}>
                  <div style={{ display: 'flex', flexDirection: 'column', border: '1px solid #2e4a38', borderRadius: 8, overflow: 'hidden' }}>
                    <div style={{ padding: '4px 10px', background: '#14261c', color: '#86efac', fontSize: 11.5, fontWeight: 600 }}>
                      HOST · Room: {cfg.roomCode || 'lobby-1'} (click inside · WASD)
                    </div>
                    <iframe ref={hostFrameRef} tabIndex={0} title="Multiplayer Host" style={{ flex: 1, border: 'none', background: '#000' }} />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', border: '1px solid #2c3e5a', borderRadius: 8, overflow: 'hidden' }}>
                    <div style={{ padding: '4px 10px', background: '#152033', color: '#93c5fd', fontSize: 11.5, fontWeight: 600 }}>
                      CLIENT · Room: {cfg.roomCode || 'lobby-1'} (click inside · WASD)
                    </div>
                    <iframe ref={clientFrameRef} tabIndex={0} title="Multiplayer Client" style={{ flex: 1, border: 'none', background: '#000' }} />
                  </div>
                </div>
              ) : (
                <div style={{ padding: 20, borderRadius: 8, background: '#11161d', border: '1px dashed #2e3846', textAlign: 'center', color: '#94a3b8', fontSize: 12.5 }}>
                  Click <strong>Launch Host + Client</strong> above to spawn two live synchronized game instances side-by-side over local <code>BroadcastChannel</code> (no external server required). Add a <strong>Network Sync</strong> component to any entity to test transform/animation sync and RPCs!
                </div>
              )}
            </div>
          )}

          {tab === 'server' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 12.5, color: '#cbd5e1' }}>
              <p style={{ margin: 0, color: '#94a3b8' }}>
                Miniforge v3.0 includes a zero-dependency Node.js WebSocket room relay &amp; WebRTC signaling server at <code>server/relay-server.mjs</code>.
              </p>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', background: '#0d1117', border: '1px solid #2b323b', borderRadius: 8, padding: '8px 12px', fontFamily: 'ui-monospace, monospace' }}>
                <span style={{ flex: 1, color: '#7ee787' }}>node server/relay-server.mjs 8765</span>
                <button
                  type="button"
                  className="mf-btn"
                  style={{ fontSize: 11 }}
                  onClick={() => {
                    void navigator.clipboard?.writeText('node server/relay-server.mjs 8765')
                    setCopied(true)
                    setTimeout(() => setCopied(false), 1500)
                  }}
                >
                  {copied ? <Check size={12} /> : <Copy size={12} />} {copied ? 'Copied' : 'Copy'}
                </button>
              </div>
              <pre
                style={{
                  margin: 0,
                  padding: 12,
                  borderRadius: 8,
                  background: '#0d1117',
                  border: '1px solid #2b323b',
                  fontSize: 11.5,
                  color: '#e6edf3',
                  overflowX: 'auto',
                }}
              >{`// Scripting API example:
api.net.onRpc('score', (payload, sender) => {
  api.log('Score RPC from ' + sender + ':', payload)
})
api.net.rpc('score', { points: 10 }, 'all')

// Local 2-4 player input (Split-Screen):
const [p1x, p1z] = api.net.getLocalPlayerMove(0) // WASD + Pad 1
const [p2x, p2z] = api.net.getLocalPlayerMove(1) // Arrows + Pad 2`}</pre>
            </div>
          )}
        </div>

        <footer>
          <button
            type="button"
            onClick={() => {
              setDualRunning(false)
              onClose()
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            className="mf-primary"
            onClick={() => {
              onSave(cfg)
              setDualRunning(false)
              onClose()
            }}
          >
            <Check size={14} /> Save Multiplayer Settings
          </button>
        </footer>
      </div>
    </div>
  )
}
