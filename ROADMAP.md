# Miniforge Engine Roadmap

## v3.0 (Current Release) — Materials, Shaders, Gameplay Accelerators, Multiplayer & Steamworks

* **Live 3D PBR Material Editor & Shader Studio**: side-by-side 3D PBR preview (Sphere/Cube/Torus/Plane + lighting presets) in both Material Editor and Inspector, clean preset replacement, LittleJS `mainImage`/`mainVertex` Shader Studio with 5 presets + classic templates, runtime `api.materials.setShaderUniform/s`, and Event Graph shader nodes.
* **Scene Profiler**: real-time FPS/frame-time sparkline, draw calls with static-batching savings, triangles, entities, and texture/asset memory breakdown directly from the **Performance** tab.
* **Animation State Machine**: interactive pan/zoom visual transition graph (`Idle -> Walk -> Run -> Jump`), parameters (`float`/`bool`/`trigger`), `api.animation.setParam / setTrigger / playState / getCurrentState`, and 4 Event Graph + AOT nodes.
* **Standalone Prop / Foliage Scatter Brush**: dedicated viewport tool docked in the right sidebar that paints/erases Prefabs & 3D Models across both **Terrain** heightmaps and **any 3D Mesh** with automatic static batching.
* **Unified Input, Gamepad & Touch Manager**: rebindable Keyboard, Mouse, W3C Gamepad API (`GP0..GP15`, sticks + deadzone), and Touch / Virtual Controls in one modal, plus 2–4 player local profiles.
* **Multiplayer & Steamworks SDK**: unified `NetManager` (`Singleplayer`, `Local Split-Screen`, `P2P WebRTC`, `Client-Server WebSocket`, `Steam P2P + Lobbies`), `Network Sync` component with `Sync Keys` delta-synced entity variables, 11 Multiplayer/RPC Event Graph nodes, 1-click **Launch Host + Client** Net Debugger, zero-dependency `server/relay-server.mjs`, `api.steam.*` (Lobbies, Achievements, Cloud Saves, Rich Presence, `steam_appid.txt` auto-export), **12 Starter Templates**, and **11 Auto-Discovered Examples**.

## v3.1 — Community Showcase & Ecosystem

* **Community Plugins & Games Page**: curated catalog page on the engine website updated periodically with community plugins and games.
* **Visual Node-Based Post-Processing & Shader Graph**: optional node editor on top of Shader Studio.
