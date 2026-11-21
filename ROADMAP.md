# Miniforge Engine Roadmap

## v2.6 (Current Release)
- **Project Hub, 10 Starter Templates & 8 Auto-Discovered `/examples/`** with automatic WebGL2 3D screenshots (Blank, Mobile Touch, Coin Rush, Runner, FPS, TPS, RPG, Shooter, Key Vault, Clicker).
- **Event Graph (Blueprints) + Collections & Nativization**: runtime interpreter + AOT JS Nativization on export (CSP-safe, zero `eval()`), `array`/`enum`/`map`/`object` types, Hierarchy/Component nodes, and full Tag System (`GameAPI` + Event Graph + Prefabs).
- **Mesh Builder**: interactive mouse-drag `Drag Extrude` / `Drag Inset`, 60 FPS GPU-direct 3D Material Brush, unlimited slots, `.glb` export.
- **All-in-One Studios**: 2D Paint (layers + seamless 3×3 wrap), Sound/SFX/16-Step Music Synth, Dialogue & Quest Graph, Keyframe Sequencer, Model Editor + Animation Slicer, Plugin System (`.mfplugin.json`).
- **Export Settings & 1-Click Export Templates**: instant Windows (`.exe`), macOS (`.app`), and Linux builds (~15 MB editor / ~8–25 MB game) + HTML5, Yandex Games, Poki.

## v2.7 — Materials, Shaders & Editor Polish
- **Material Editor with Live 3D Preview**: rotatable sphere/cube/plane preview with lighting toggle and real-time PBR response (Albedo, Roughness, Metalness, Emissive, Normal Map).
- **Shader Editor with Live Preview**: side-by-side GLSL editor + live preview canvas, auto-generated uniform sliders, inline compile error highlights, and presets (Water, Toon Outline, Hologram, Foliage Wind, PS1 Dither).
- **Scene Profiler & Template Icons**: draw-call / triangle / texture memory overlay and automatic `.ico`/`.icns` embedding in Export Templates.

## v2.8 — Gameplay Accelerators & Web Workers (Multithreading)
- **Web Workers Offloading (Selective Multithreading)**: move heavy CPU tasks off the main render thread without breaking WebGL2/CSP compatibility — NavGrid A* pathfinding worker, background Light Baking / Terrain / CSG worker, and optional Rapier3D Physics Worker (`Float32Array` transferable sync for 300+ rigid bodies).
- **Animation State Machine**: visual transition graph (`Idle -> Walk -> Run -> Jump`) on top of Model Editor timeline clips.
- **Prop / Foliage Scatter Brush**: paint trees, rocks, and grass onto terrain/meshes with randomized scale/rotation and static batching.
- **Input Action & Gamepad Manager**: rebindable keyboard/mouse actions and Gamepad API support.

## v3.0 — Multiplayer (Local, WebSocket / WebRTC & Lobbies)
- **Unified `NetTransport` Architecture & Multiplayer Settings**: `Singleplayer`, `Local Split-Screen`, `P2P (WebRTC)`, and `Client-Server (WebSocket)`.
- **`NetworkSync` Component & RPC Nodes**: inspector checkboxes for interpolated Transform, Animation, Variables/WorldState, and Event Graph RPCs.
- **Local Multiplayer**: 2–4 player Split-Screen cameras and multi-gamepad / shared-keyboard input.
- **Lobbies & In-Editor Net Debugger**: lightweight Node.js room/signaling server template, latency/packet-loss simulator, and 1-click "Launch Host + Client" testing.

## v3.1 — Steamworks Integration & Community Ecosystem
- **Steamworks SDK (Tauri Desktop / `steamworks-rs`)**: Steam Lobbies, P2P Steam Networking Sockets, Achievements, Cloud Saves, and Rich Presence over the shared `NetTransport` layer.
- **Steam Debug Panel**: local testing with `steam_appid.txt` (`480`), lobby inspector, and API logs inside the editor.
- **Community Plugin Browser**: discover and install verified `.mfplugin.json` plugins directly from GitHub.
