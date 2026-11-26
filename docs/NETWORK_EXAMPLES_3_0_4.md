# Miniforge 3.0.4 — Network example projects

The example picker automatically imports `examples/*.json`; no registration or plugin is required.

## 1. Multiplayer Arena 3D (WebSocket)

- `settings.multiplayer.mode = client-server-ws`; `serverUrl = ws://127.0.0.1:8765`; `roomCode = arena-1`.
- Start a local relay in the repository root: `node server/relay-server.mjs 8765`.
- Open the example in two browser tabs or use separate machines. On another machine change `serverUrl` to the host's reachable LAN address (and open its firewall). An exported build served over HTTPS will require `wss://`.
- The HUD shows CONNECTED only after relay admission; missing relay reports the actual connection error.
- Move both players, press Space to send one `arena:pulse` RPC, press E to change the local player's synchronized HP; remote players appear as colored `NetworkSync` proxies. Stop/restart the relay to check reconnection.
- In **Multiplayer & Net Debugger → Launch Host + Client**, the editor deliberately overrides the transport to `local` (BroadcastChannel), so this is *not* a test of a real WebSocket server.

## 2. WebRTC Arena 3D (P2P)

- `mode = p2p-webrtc`; `serverUrl = ws://127.0.0.1:8765`; `roomCode = webrtc-arena-1`.
- Requires the same WebSocket relay for signaling/room admission. WebRTC DataChannels carry traffic after they open; relay fallback is used before channels are ready.
- Verify between two browser tabs and, for a real NAT test, two separate networks. The public STUN configuration is not a TURN service: connections across restrictive NATs can fail.
- The editor's two-pane local preview explicitly bypasses WebRTC and only tests shared gameplay logic.

## 3. Split-Screen Co-op 3D

- Purely local play: `mode = local-splitscreen` with two local players (WASD/Space and Arrows/Enter, gamepads 1–2).
- Does not require relay, Steam or Internet. The **Launch Host + Client** debugger is *not* split-screen; use the normal game preview for this example.

## 4. Steam Lobby & P2P (Debug)

- `settings.multiplayer.mode = singleplayer` to avoid automatic network joining **before** selecting a lobby.
- `settings.steam.enabled = true`, `localDebug = true`: the mock is allowed **only in editor preview** and uses `BroadcastChannel` + `localStorage`, *not Steam*.
- Open the game preview in two tabs at the same origin and under the same AppID. In tab A press **Create lobby**; in tab B press **Find lobbies**, select the announced lobby and press **Join selected**. Test **Send RPC**, **Cloud write** and **Cloud read**.
- **Leave** disconnects `NetManager` and leaves the local mock lobby. Controls show errors instead of a misleading native success when Steamworks is unavailable.
- Local Debug is available in editor preview. For a project with both Local Debug and a native Desktop test path, use **Steam Relay Lab**.

## 5. Steam Relay Lab

Open **Steam Relay Lab** to test lobby creation and discovery, member and owner updates, an acknowledged RPC round trip, invitations, Steam Cloud, achievements, stat reads, and DLC checks. Launch two clients through **Multiplayer & Net Debugger** for the editor simulation. Desktop export produces a Steamworks source package with a depot build command. [Steam Relay Lab walkthrough](STEAM_NATIVE.md)

## Regression commands

```bash
node --experimental-strip-types --test tests/network-steam.check.mjs tests/steam-preview-bridge.check.mjs
node --test tests/network-examples.check.mjs
pnpm typecheck
pnpm test
pnpm build
```

`test:network` covers the real relay, transport contracts and opaque-origin preview bridge. `test:examples` checks JSON projects, embedded scripts and runtime lifecycle via dependency-free stubs. Full editor/Steam native E2E still requires a browser and Steamworks SDK, respectively.
