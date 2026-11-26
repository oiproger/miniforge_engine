# Miniforge 3.0.4 — Networking and Steam audit

**Current implementation**

This document records the earlier transport audit. The current native feature set and depot instructions are in [Native Steamworks export](STEAM_NATIVE.md).

## Summary

This update hardens the existing transports and fixes misleading Steam debug behavior. **It does not claim to implement native Steamworks**: the supplied Tauri `steam.rs` contains only unavailable stubs, is not wired into `main.rs`, and no Steamworks SDK is linked in Cargo. Implementing native Steamworks requires a separate, tested Steamworks SDK adapter and a legitimate AppID; AppID 480 (Spacewar) is only a development example.

## Networking: repaired

- Node WebSocket relay now binds to `127.0.0.1` by default, unless explicitly passed a public bind address. Each connected socket owns an immutable peer ID and room. A forged `from`, a room switch or a duplicate peer ID is rejected.
- Native Tauri LAN WebSocket relay uses the same join-first, immutable peer/room and authoritative peer-list semantics. The old code forwarded every message to every LAN client, ignoring rooms.
- Relays reject oversized packets (256 KiB), unmasked text frames and unsupported frame fragmentation. The Node server additionally validates the handshake, limits packet rate and supports optional shared access token on `join`.
- The Node status endpoint no longer lists arbitrary room names. Remote deployments should use `wss://` behind a TLS reverse proxy and configure authentication appropriate for the game. **A shared token embedded in a publicly downloaded web game is not a secure secret or proof of player identity.**
- A WS upgrade no longer counts as a connected player. `NetManager.connect()` now returns `true` only after the server sends a peer-list acknowledging that the player was admitted to the room.
- No more silent fallback from failed remote WebSocket to `BroadcastChannel`. `url: 'local'` remains explicit, for editor previews / multiple tabs only. `hostLan()` in a browser now returns `null` rather than pretending to host a LAN server.
- Remote WebSocket reconnection preserves peer ID, room, and token; reconnect timers and DataChannels are cleaned up; peer join/leave notifications are refreshed.
- WebRTC uses one reliable ordered DataChannel. Messages to recipients with an open DataChannel are not redundantly sent over WebSocket; recipients still connecting use the signaling relay. ICE candidates arriving before remote SDP are queued.
- Sender identity on DataChannel and Steam P2P packets is taken from the transport, not from the untrusted packet body.
- Game runtime rejects invalid/NaN position and rotation snapshots and enforces host ownership of host-owned snapshots and global state. Remote dynamic entity property names are constrained.
- Packet room, chat sender, RPC name and pong RTT values are checked. The relay is **not** a server-authoritative anti-cheat layer; game rule validation remains a responsibility of the game/server.

## Steam: repaired contract, native SDK still missing

- `SteamManager` is now honest by default: without native `steam_init`, `initialized = false`, `isAvailable() = false`, `getMode() = 'unavailable'`. Achievements/Cloud/lobbies return failures, not fake success.
- `Local Debug Simulation` is opt-in in Steam Studio. It uses `BroadcastChannel` and `localStorage`, does not connect to Steam, and `isAvailable()` still returns `false` in debug; `isDebug()` or `getMode()` show its mode.
- Game runtime passes `localDebug` only when `GameOptions.preview` is true. The exporter bootloader sets this flag **only** for editor preview, so shipped web or Tauri builds cannot accidentally simulate Steam.
- Native IPC failures never fall back to fake Steam lobbies or report a successful achievement/cloud deletion; local lobby discovery checks membership/capacity and no longer invents arbitrary nonexistent lobbies.
- Local owner leaving a lobby transfers ownership to remaining members; native sends target actual lobby members rather than passing an empty recipient ID.
- Steam Studio shows explicit mode and disables unavailable test controls. Native `hasAchievement()`/`listAchievements()` only reflect achievements confirmed during this session until a native query method is implemented.

### What is required for real Steamworks integration

1. A genuine Steamworks SDK available on the target platforms, with redistributable native libraries, an AppID that the developer controls, and a game launched under Steam for end-to-end verification.
2. A native Rust/Tauri Steamworks adapter (`steamworks-rs` is an option), registration of commands in the Tauri player, callback pumping and correct Steam Networking Messages / matchmaking / RemoteStorage / UserStats handling.
3. Signed-in Steam test users on **two machines** for lobby discovery, invitations, NAT traversal, ownership migration, P2P delivery, achievements, Cloud, and offline recovery. The existing Tauri `steam.rs` is a stub and **must not be shipped as a working integration**.
4. Add `wss://`/authentication and game-authoritative rules for public multiplayer: this relay only validates routing and envelope identity, not game cheats.

## Verification

- `npm run test:network` (or `node --experimental-strip-types --test tests/network-steam.check.mjs`) runs self-contained Node 22+ integration checks with actual WebSockets and BroadcastChannel, without requiring npm dependencies.
- `pnpm typecheck`, `pnpm test`, `pnpm build` must still be run with the project's full dependency installation. These were unavailable in the patch environment.
- A real Tauri desktop LAN session is also required: Rust Cargo/rustc were unavailable in the patch environment. The native LAN code is upgraded but **not build-verified**.
- **Steam native runtime testing was not possible**, and is intentionally not claimed.

## Follow-up: working network example previews

See [`NETWORK_EXAMPLES_3_0_4.md`](NETWORK_EXAMPLES_3_0_4.md). Local Steam Debug across isolated editor preview iframes is now explicitly bridged by the parent editor via a same-origin BroadcastChannel. Exported builds do not use this bridge. When `localStorage` is blocked in an opaque-origin iframe, debug cloud and achievement data use volatile memory; this is **not** real Steam Cloud or persistent storage.
