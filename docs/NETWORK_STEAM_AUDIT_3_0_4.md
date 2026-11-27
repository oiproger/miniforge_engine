# Miniforge 3.0.4 — Networking and Steam audit

**Historical audit**

This document records the relay hardening that preceded native Steamworks. The Rust Steamworks bridge now ships in the Desktop editor and Steam-enabled depot exports. See [Steamworks setup](STEAM_NATIVE.md) and the [current network roadmap](NETWORKING.md).

## Summary

The initial audit hardened the existing relays and made the Local Debug simulation explicit. The notes below describe the routing and preview contracts that are still relevant.

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

## Steam and verification

- Local Debug remains an editor simulation. In a Desktop editor built with Steamworks, **Play with Steam** opens a native session using the installed SDK. Native initialization errors surface in the editor.
- Exported Steam games use the native bridge when Steam initialization succeeds. Browser exports require another transport for online play.
- `pnpm test:network` covers real WebSocket and BroadcastChannel sessions, routing rules and the sandboxed preview simulation. Native IPC mocks and archive checks cover the build and launch contracts. Check Steam accounts, remote networks and LAN discovery in separate acceptance runs.

## Follow-up: working network example previews

See [`NETWORK_EXAMPLES_3_0_4.md`](NETWORK_EXAMPLES_3_0_4.md). Local Steam Debug across isolated editor preview iframes is now explicitly bridged by the parent editor via a same-origin BroadcastChannel. Exported builds do not use this bridge. When `localStorage` is blocked in an opaque-origin iframe, debug cloud and achievement data use volatile memory; this is **not** real Steam Cloud or persistent storage.
