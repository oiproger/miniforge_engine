# Advanced lighting, local reflections & surface decals (experimental)

This change extends the **3.0.3 Render Optimization + TypeScript Fix** build.
It retains the LittleJS 1.30.1 renderer and injects changes through
`packages/graphics/multi-shadow.js` when `device.mjs` creates the renderer.

## Lighting and dynamic shadows

- Directional light (sun): original shadow map.
- Spotlight: up to 4 separate maps with automatic selection, maintained from the
  previous Adaptive Shadows change.
- Point Light: **new** six-face 3×2 depth atlas per selected light, supporting
  0–2 active point-light shadow casters. A point light shadows in all directions.
- Set **Cast Shadow** on a Point Light in its inspector. The engine automatically
  chooses lights using viewport intersection, distance, intensity and range.
  `Shadow priority` and `Pin shadow slot` are optional overrides.
- Scene lighting **Max point-light shadows** controls the GPU budget (default 1).
  Point lights use 6 depth passes each, in addition to the sun and spot passes.
- Point shadow resolution: low 128 px/face, medium 256, high 512.
- LittleJS still shades at most 8 dynamic lights at once (including selected
  shadow lights). All local light sources can contribute to static GI bakes, but
  8 remains the direct-light limit for a rendered frame.
- Ambient/Skylight does not have a direction and therefore does not cast a
  standard directional shadow. Static skylight occlusion remains part of GI.

## Local reflection zones

- Bake Zones now carry a box for *parallax-corrected* cubemap lookup.
  Both **baked** and **realtime** cubemaps use the same local correction.
- Smaller overlapping enabled zones win over larger zones. Outside the zone,
  the global environment cubemap is used.
- Zones follow their transform and parents. `Capture height offset` moves the
  cubemap capture point up or down without moving the zone bounds.
- Reflection cubemap sizes include 512 for sharper reflections; it costs
  substantially more memory and 6 faces to capture each update.
- The Water surface has `Reflection strength` and `Reflection sharpness`.
  It now participates in environment reflections, including nearby zone probes.
- **Limitation:** a parallax-corrected cubemap is an approximation, NOT a true
  mirror-plane render. A close-up puddle at grazing angles may still have
  incorrect occlusion, displaced nearby objects and missing moving reflections
  between realtime refreshes. A separate planar reflection/SSR pass is needed
  for physically faithful mirror puddles.

## Geometry-conforming decals

- Select a Decal and use `Projection: surface` to clip neighboring static
  triangle meshes to the oriented decal volume. A generated patch receives the
  original decal UVs and texture; it follows slopes and uneven surfaces.
- `Projection depth` controls the thickness of the projection box and limits
  bleed-through. `Minimum surface facing` rejects near-perpendicular walls.
- Existing `Projection: plane` remains as a lightweight alternative.
- The projector must face the target; rotate the decal to match the wall or
  floor, and set its depth to cover the relief.
- Projection is capped at 12,000 generated triangles per decal. Reprojection
  happens after model loading and when the decal moves in the editor (throttled).
- **Limitations:** projection is for static triangle geometry. Moving/skinned
  targets, overlapping UV atlases and extremely large triangle meshes are not
  a substitute for GPU deferred decals or a terrain decal material pass.
  Dynamic `spawnDecal` still uses the inexpensive flat quad.

## Recommended verification

1. Run `pnpm test`, `pnpm typecheck`, `pnpm build`.
2. Sun + two Spotlights + a shadowed Point Light: verify 3 independent shadows.
3. Move camera among 3 point lights with budget 1: selected point changes without
   affecting sunlight. Repeat with shadows disabled and `Receive Shadow` off.
4. Place a Water plane inside a small Bake Zone. Position the cubemap near the
   water using capture height offset. Compare baked vs realtime mode as moving
   objects enter the view. Compare 128/512 px.
5. Project a textured decal onto uneven terrain and a stair model; vary depth,
   angle and offset. Ensure no projection on a mesh outside its box.
6. Export the game and repeat tests in the autonomous runtime.

**Verification status in the prepared artifact:** JavaScript syntax, TypeScript
transpile syntax, and isolated geometry/selection tests have been checked.
A full `pnpm typecheck`, Vitest run, WebGL shader compilation, and exported-game
GPU regression run were not available in the authoring environment due to
missing dependencies and unavailable headless WebGL2.
