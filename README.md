# Miniforge Engine

**Read in Russian:** [README.ru.md](./README.ru.md) · **Roadmap:** [ROADMAP.md](./ROADMAP.md)

A lightweight (~15 MB desktop build), browser-based 3D game engine and all-in-one prototyping studio built on **LittleJS 1.30.1** (WebGL2 3D), **Rapier3D** (WASM physics), **React 19 + TypeScript 5.9**, and **Tauri v2**.

Designed for solo indie developers, web portals, and game jams: model low-poly assets, paint 2D/3D materials, synthesize SFX/music, wire gameplay with visual Blueprints, write dialogues/cutscenes, and export playable Web or Desktop builds without leaving the editor.

- **Live Web Editor:** `https://oiproger.github.io/miniforge_engine/editor/`
- **Interactive Documentation (v3.0.0):** `https://oiproger.github.io/miniforge_engine/docs/`


## What's New in v3.0.0

- **Materials, Shaders & Profiler**: Live interactive 3D PBR Material Preview in both Material Editor and Inspector, LittleJS `mainImage`/`mainVertex` Shader Studio with runtime `api.materials.setShaderUniform(target, name, value)` + Event Graph nodes, and Scene Profiler inside the **Performance** tab.
- **Animation State Machine**: Visual pan/zoom transition graph (`Idle -> Walk -> Run -> Jump`) on top of Model Editor clips with `api.animation.setParam / setTrigger / playState / getCurrentState` and Event Graph nodes.
- **Prop / Foliage Scatter Brush**: Standalone viewport tool (next to Transform/Snap) docked in the right sidebar; paints across both **Terrain** heightmaps and **3D Meshes** with automatic `staticBatch`.
- **Unified Input, Gamepad & Touch Manager**: Rebindable Keyboard, Mouse, W3C Gamepad API, and Touch controls in one studio, plus Perspective view by default.
- **Multiplayer & Steamworks SDK**: Local Split-Screen (2–4 players), WebSocket (`server/relay-server.mjs`), WebRTC P2P, and Steam P2P + Lobbies (`AppID 480` debug bridge + `steam_appid.txt` export), `Network Sync` component with `Sync Keys` delta variable sync, 1-click **Launch Host + Client** Net Debugger, **12 Starter Templates**, and **11 Examples**.

## Built-in Tools

- **Project Hub & Auto-Discovered Examples:** automatically loads `.json` projects from `/examples/` with auto-generated 3D scene thumbnails, project descriptions, and 1-click return via the topbar **Projects** button.
- **Scene Editor & Live Prefabs:** 3D viewport, gizmos, terrain sculpting, NavGrid pathfinding, lighting/post-processing, and 3D scene entity pipette.
- **Event Graph (Blueprints):** node-based visual scripting with typed Exec/Data pins, exposed instance variables, and custom functions alongside TypeScript scripting.
- **Low-Poly CSG Mesh Builder:** CSG primitives (`Union`/`Subtract`), interactive mouse-drag `Drag Extrude` / `Drag Inset`, `Subdivide`/`Mirror X`, quick UV unwrap, unlimited material slots, and instant 60 FPS GPU-direct **3D Material Brush** painting with `.glb` export.
- **Model Editor:** `assimpjs` WASM import, per-part material overrides, and non-destructive animation timeline slicing.
- **2D Paint Editor:** layers, symmetry, seamless 3×3 tiling preview, and PNG export.
- **Sound / SFX / Music Synth:** presets, 16-step sequencer, `.wav` export, and runtime audio modulation (`setSemitones`, `setSpeed`, `setLowpass`).
- **Dialogue & Quest Graph + Keyframe Sequencer:** branching dialogues, quest states, and multi-track cutscenes.
- **Plugin System (v2.2):** create, edit, enable/disable, and import/export `.mfplugin.json` plugins extending both Editor menus and Runtime behaviors/services (includes 4 built-in examples).
- **Dynamic UI API & 95+ Event Graph Nodes (v2.7):** create/update/remove UI screens & basic widgets (`label`, `button`, `bar`, `panel`, `image`, `html`) and mount custom HTML (`ui.mount`) from both TypeScript and Event Graph (interpreter + AOT nativizer), plus Audio, Dialogue/Quest, Sequencer, Particles, NavGrid, Touch, and Tween nodes.
- **Export Settings & 1-Click Export Templates (v3.0.0):** configure app name, version, bundle ID, icon, and window settings; export standalone HTML5, Yandex Games / Poki builds, or instant Windows/macOS/Linux executables via prebuilt Tauri Export Templates (with automatic Tauri source fallback).

## Quick Start

Requirements: **Node.js 20+** and **pnpm 10+**.

```bash
pnpm install
pnpm dev
```

### Common Commands

```bash
pnpm typecheck      # TypeScript check (tsc --noEmit)
pnpm build          # Build web editor into dist/editor/
pnpm build:site     # Build landing + docs + web editor into dist/pages/
pnpm test           # Unit tests (Vitest)
pnpm desktop:editor # Tauri desktop build of the editor (~15 MB)
```

## Roadmap Highlights

See [ROADMAP.md](./ROADMAP.md) for the full plan:

- **v2.8:** Live 3D Material Editor preview, Live GLSL Shader Editor preview with uniform sliders & presets, scene profiler.
- **v2.9:** Animation State Machine, Prop / Foliage Scatter brush, Input Action & Gamepad Manager.
- **v3.0:** Multiplayer (Local Split-Screen, WebSocket & WebRTC P2P), `NetworkSync` component, Lobbies & in-editor Host+Client debugger.
- **v3.1:** Steamworks SDK integration for Tauri desktop builds (Steam Lobbies, Steam Networking Sockets, Achievements, Cloud Saves) & Steam Debug Panel.

## Known Limitations

- Focused on **low-poly / stylized 3D** and rapid prototyping rather than heavy AAA PBR pipelines.
- WebGL2 is required; large scenes on low-end mobile browsers benefit from static batching and cull distances.
- Plugin execution uses lightweight isolation (`new Function`) intended for trusted user/community plugins.

## Support & Donations

Miniforge Engine is free and open-source under the MIT License. If it helped with your prototype or game jam, you can support ongoing development:

- **Boosty (RU / cards):** `https://boosty.to/oipdever`
- **CloudTips (RU one-time tips):** `https://pay.cloudtips.ru/p/93fbe76b`
- **Tribute (Telegram / crypto):** `https://t.me/tribute/app?startapp=dUBS`
- **Lava.top (International):** `https://app.lava.top/oipdever`

## Credits & Development Note

Architecture, product direction, testing, and maintenance by [@oiproger](https://github.com/oiproger) using AI-assisted development workflows.

## License

Licensed under the [MIT License](./LICENSE). Built with open-source libraries including [LittleJS](https://github.com/KilledByAPixel/LittleJS) (MIT) and [Rapier](https://rapier.rs/) (Apache 2.0).
