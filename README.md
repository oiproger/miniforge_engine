# Miniforge Engine

**Read in Russian:** [README.ru.md](./README.ru.md)

A lightweight, browser-based 3D game engine and all-in-one prototyping studio built on **LittleJS 1.30.1** (WebGL2 3D), **Rapier3D** (WASM physics), **React 19 + TypeScript 5.9**, and **Tauri v2** (optional desktop builds).

Designed for solo indie developers and game jams: model low-poly props, paint 2D/3D textures, synthesize SFX/music, wire gameplay with visual Blueprints, write dialogues/cutscenes, and export standalone HTML5 or desktop games without leaving the editor.

- **Live Web Editor:** `https://YOUR_GITHUB_USERNAME.github.io/miniforge-engine/editor/`
- **Interactive Documentation (v2.2):** `https://YOUR_GITHUB_USERNAME.github.io/miniforge-engine/docs/`

## Built-in Tools

- **Scene Editor & Live Prefabs:** 3D viewport, transform gizmos, terrain sculpting, NavGrid pathfinding, lighting/post-processing, and 3D scene entity pipette.
- **Event Graph (Blueprints):** node-based visual scripting with typed Exec/Data pins, exposed instance variables, and custom functions alongside TypeScript scripting.
- **Low-Poly CSG Mesh Builder:** CSG primitives (`Union`/`Subtract`), face operations (`Extrude`, `Inset`, `Subdivide`, `Mirror X`), quick UV unwrap, unlimited material slots, and a 512×512 3D surface texture brush with `.glb` export.
- **Model Editor:** `assimpjs` WASM import, per-part material overrides, and non-destructive animation timeline slicing.
- **2D Paint Editor:** layers, symmetry, seamless tiling preview, and PNG export.
- **Sound / SFX / Music Synth:** presets, 16-step sequencer, `.wav` export, and runtime audio modulation (`setSemitones`, `setSpeed`, `setLowpass`).
- **Dialogue & Quest Graph + Keyframe Sequencer:** branching dialogues, quest states, and multi-track timelines.
- **Plugin System (v2.2):** create, edit, enable/disable, and import/export `.mfplugin.json` plugins extending both Editor menus and Runtime behaviors/services (includes 4 built-in examples).
- **Exporters:** standalone HTML5 bundle, Yandex Games / Poki SDK adapters, and Tauri v2 desktop builds (Windows/macOS/Linux).

## Quick Start

Requirements: **Node.js 20+** and **pnpm 10+**.

```bash
pnpm install
pnpm dev
```

Open the local URL printed by Vite (default `http://localhost:5173`).

### Common Commands

```bash
pnpm typecheck     # TypeScript check (tsc --noEmit)
pnpm build         # Build web editor into dist/editor/
pnpm build:site    # Build landing + docs + web editor into dist/pages/
pnpm test          # Unit tests (Vitest)
pnpm desktop:editor # Tauri desktop build of the editor
```

## Plugin Example (`.mfplugin.json`)

```js
exports.registerRuntime = function (ctx) {
  ctx.registerBehavior('spinner', function (api, params) {
    var speed = (params && params.speed) || 1.5
    return {
      onUpdate: function (dt) {
        api.transform.rotation[1] += speed * dt
      },
    }
  })
}
```

## Known Limitations

- Focused on **low-poly / stylized 3D** and rapid prototyping rather than AAA PBR pipelines.
- WebGL2 is required; very large scenes on low-end mobile browsers may need manual static batching and cull distances.
- Editor UI and some documentation sections are currently Russian-first, with English localization expanding incrementally.
- Plugin sandboxing is lightweight (`new Function`) and intended for trusted user/community plugins.

## Support & Donations

Miniforge Engine is free and open-source under the MIT License. If it saved you time on a prototype or game jam, you can support ongoing development:

- **Boosty (RU / cards):** `https://boosty.to/YOUR_USERNAME`
- **CloudTips (RU one-time tips):** `https://pay.cloudtips.ru/p/YOUR_CODE`
- **Tribute (Telegram / crypto):** `https://t.me/tribute/app?startapp=YOUR_LINK`
- **Lava.top (International):** `https://app.lava.top/YOUR_USERNAME`

## License

Licensed under the [MIT License](./LICENSE). Built with open-source libraries including [LittleJS](https://github.com/KilledByAPixel/LittleJS) (MIT) and [Rapier](https://rapier.rs/) (Apache 2.0).
