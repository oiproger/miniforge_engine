# Miniforge Engine Roadmap

## v3.0 (Current Release) — Materials, Shaders, Gameplay Accelerators, Multiplayer, Embedded LAN & Steamworks

* **Live 3D PBR Material Editor & Shader Studio**: side-by-side 3D PBR preview (Sphere/Cube/Torus/Plane + lighting presets) in both Material Editor and Inspector, clean preset replacement, LittleJS `mainImage`/`mainVertex` Shader Studio with 5 presets + classic templates, runtime `api.materials.setShaderUniform/s`, and Event Graph shader nodes.
* **Scene Profiler**: real-time FPS/frame-time sparkline, draw calls with static-batching savings, triangles, entities, and texture/asset memory breakdown directly from the **Performance** tab.
* **Animation State Machine**: interactive pan/zoom visual transition graph (`Idle -> Walk -> Run -> Jump`), parameters (`float`/`bool`/`trigger`), `api.animation.setParam / setTrigger / playState / getCurrentState`, and 4 Event Graph + AOT nodes.
* **Standalone Prop / Foliage Scatter Brush**: dedicated viewport tool docked in the right sidebar that paints/erases Prefabs & 3D Models across both **Terrain** heightmaps and **any 3D Mesh** with automatic static batching.
* **Unified Input, Gamepad & Touch Manager**: rebindable Keyboard, Mouse, W3C Gamepad API (`GP0..GP15`, sticks + deadzone), and Touch / Virtual Controls in one modal, plus 2–4 player local profiles.
* **Multiplayer, Embedded Rust LAN Server & Steamworks SDK**:
  * Unified `NetManager` (`Singleplayer`, `Local Split-Screen`, `P2P WebRTC`, `Client-Server WebSocket`, `Steam P2P + Lobbies`) with offline LAN WebRTC, auto-reconnect, shortest-arc lerp, lobby chat, and 1-click **Launch Host + Client** Dual Preview.
  * Zero-dependency embedded Rust LAN WebSocket server + UDP discovery beacon (port `41234`) in both Editor and exported Desktop games (`api.net.hostLan`, `stopLan`, `discoverLan`), plus standalone `server/relay-server.mjs`.
  * `Network Sync` component with automatic colored remote proxy avatars for `owner: "local"`, delta-synced `Sync Keys` with late-join refresh, `animState` + `animClip` crossfade replication, and 14 Multiplayer/RPC/Chat Event Graph + AOT nodes.
  * `api.steam.*` (Lobbies, Steam P2P, Achievements, Cloud Saves, Rich Presence, AppID `480` debug mode, automatic `steam_appid.txt` export), **12 Starter Templates**, and **11 Auto-Discovered Examples**.

## v3.1 (Next) — Editor QoL & Level Design Polish

* **Faster Viewport Level Design**: box/multi-selection (`Shift+Click`) with group transform/delete, `Snap to Ground`, `Align to Surface`, and `Align Camera to View`.
* **Instant Navigation & Asset Workflow**: unified Command Palette (`Ctrl+K` / `Cmd+K`), search & folders/tags in Scene Tree and Assets, and Drag-and-Drop of Prefabs, Models, and Materials directly into the 3D viewport.
* **Inspector & Play Mode Comfort**: visual Undo/Redo history stack, `Copy / Paste Component`, `Play from Here` (spawn at editor camera), quick scene reload (`R`), and an integrated **Console** tab next to Performance with clickable script error links.

## v3.2 — Lightweight Visual & Gameplay Accelerators

* **Visual HUD Layout Editor**: drag-and-drop HUD anchor positioning with 16:9 / 9:16 preview guides instead of manual percentage inputs.
* **1-Click Atmosphere & Lighting Presets**: curated `Environment + Sky + Fog + Post-FX` presets (Sunny Day, Noir Night, Sunset, Retro PS1, Foggy Horror).
* **Audio, Physics & Gizmo Clarity**: 3D spatial audio radius visualization in viewport, reverb/music trigger zones, and clear wireframe gizmos for Colliders, Triggers, and NavGrid.
* **Multiplayer Lobby QoL**: ready-to-use in-game Lobby / Server Browser UI widget (Create/Join/Ready/Start) plus `maxPlayers` slot limits, room passwords, and public room listing on the WebSocket/LAN relay.

## v3.3 — Community Showcase & Publishing

* **Community Plugins & Games Showcase**: curated catalog on the engine website with 1-click `.mfplugin.json` install by URL inside Plugin Manager.
* **Pre-Export Audit**: automatic check for broken asset links, unused textures (optional cleanup/compression), icons, and Steam/Web settings before building.
* **Interactive Onboarding**: concise contextual tips in Project Hub and commented starter mini-projects.
