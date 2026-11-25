# Miniforge: multiple real-time shadow sources

## What changed

The LittleJS 1.30.1 renderer normally has one `shadowLight`: choosing a spotlight replaces the sun's shadow pass. Miniforge now compiles `packages/graphics/multi-shadow.js` into the same lexical scope as the pinned LittleJS release via `packages/graphics/device.mjs`. It retains the **existing solar shadow map** and generates up to **four additional shadow maps** for spotlights. Each light contribution is attenuated by its **own** depth map in the existing physically approximate LittleJS lighting shader. The sun's shadows do not darken the contribution of another spotlight.

No installed dependency or `node_modules` contents are modified. Custom LittleJS shaders that use the standard lighting pipeline receive the same per-light shadows.

## How to use in the editor

1. Enable **Shadows** under scene/environment settings.
2. Choose global **Shadow quality**. This controls the sun's map and is inherited by spotlights by default.
3. Set **Dynamic spotlight shadows** to 1–4 (default 4).
4. On each **Spotlight** enable **Cast shadow (active)**. The renderer **automatically chooses** the most significant on-screen spotlight casters each frame. **Pin shadow slot** is optional and forces a light to occupy one of the available slots; **Shadow priority adjustment** only biases automatic ranking. Optionally override **Shadow resolution**.
5. Press Play, preview, or export the game. The sun and enabled spotlights should now each cast independent shadows.

The scripting method `setShadowLight(id)` *pins* a spot caster rather than replacing the sun. Calling `setShadowLight(null)` clears dynamic spotlight casters (but keeps sun shadows). Setting a spotlight gobo/gel through `setLightGel` also enables its projection.

## Performance / limits

- Up to **one solar directional shadow** plus **four spotlight shadow maps**. Point lights still illuminate dynamically, but **do not cast real-time omnidirectional shadows** (use GI bake for static indirect/occluded light); a correct omnidirectional solution requires a cube depth texture or six passes per point light.
- Every additional spotlight depth map requires an additional geometry draw from that light's viewpoint. Reducing the shadow cap, using 512px maps for secondary lights, and choosing smaller light ranges improves performance.
- WebGL2 uses texture units 1 (sun), 6–9 (spot depth), and 10–13 (spot gel textures). The design fits the WebGL2 minimum fragment texture unit count of 16.
- Four spots are selected from active, eligible spotlights using conservative cone/frustum intersection, estimated screen coverage, proximity, brightness and an optional priority adjustment. Previously selected sources have a 30% score advantage to reduce frame-to-frame flicker. Pinned sources take precedence even when off-screen; pin no more than the configured slot limit. When the eight-light LittleJS cap is reached, selected spots replace lower-priority ordinary lights rather than displacing one another.
- **Receive Shadow** on a material and the scene's global Shadows switch continue to gate shadowing. Depth maps use LittleJS's existing `castShadow` mesh flags.
- This is a renderer extension coupled to LittleJS 1.30.1 internals. It must be revalidated on every LittleJS update, especially the `render3DFragmentSource` shader anchors and shadow pass implementation.

## Validation

Run:

```sh
pnpm install
pnpm test
pnpm typecheck
pnpm build
```

**Manual GPU smoke test required:** create a white floor, two cubes, one directional sun and two spotlights facing them from different directions; switch spot shadows independently; check distinct shadows, scene Shadows toggle, material Receive Shadows toggle, blended alpha-cutout meshes, shadow gels, and scene export. Test with at least 9 local lights and move the camera between groups of spotlights; verify selection changes without flicker. Test pinned lights separately. Inspect WebGL error logs on a real GPU. Node-only unit tests cannot verify WebGL shader compilation or framebuffer completeness.

### Implementation locations

- `packages/graphics/multi-shadow.js`: GLSL lighting extension, four persistent shadow-map resources, per-source uniforms, GL cleanup.
- `packages/graphics/device.mjs`: inject the extension in the generated device alongside LittleJS.
- `packages/graphics/src/index.ts`: collect spot casters and priorities per scene, preserve them through playback, handle scripting API.
- `apps/editor/src/Authoring.tsx`, `apps/editor/src/Inspector.tsx`: quality and priority controls.
- `tests/multi-shadow.test.mjs`: source injection and selection rules.
