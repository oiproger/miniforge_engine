# CPU diffuse GI precomputation (3.0.x patch)

## What changed

`graphics.bakeLighting(zoneId?)` now runs an **asynchronous CPU diffuse GI calculation** rather than assigning one distance-based emissive color to every object.

- Reads world-space triangles from LittleJS primitive and glTF meshes, including packed `vertexData` meshes.
- Builds a triangle BVH and tests visibility before using light from directional, point and spot sources.
- Traces cosine-weighted diffuse rays for bounced light and color bleeding from albedo; up to 3 diffuse bounces.
- Samples emissive maps and base-color maps (including CPU-readable embedded glTF `TextureInfo.image`) at hit UV coordinates. Emissive geometry and emissive textures can therefore illuminate nearby static surfaces.
- Produces diffuse-light textures per static mesh/part in the existing UV channel and composes them with the original emissive-map contribution. The original LittleJS `obj.emissive` intensity is **not** changed: doing so would turn off realtime lighting.
- Direct light is **not** baked into the output; LittleJS already draws direct light and shadows. Baking the same direct light again would make scenes overly bright. Indirect light is baked as an additive emissive-map contribution.
- Honors Bake Zone bounds and `lightBounce` strength. Reflection probes are refreshed after baking.
- Uses generation/revision guards to cancel stale jobs when scenes change.

## Settings

In **Environment > Global Light Baking & Reflections**, enable `Bake static lighting` and optionally tune:

| Field | Default | Effect |
|---|---:|---|
| GI lightmap resolution | 24 px | Per-mesh UV-space output size (8–64 allowed by runtime) |
| GI hemisphere samples | 8 | Diffuse rays per populated texel (2–64) |
| Diffuse bounces | 2 | Maximum diffuse path depth (1–3) |

Higher values can slow startup considerably in complex scenes. `await api.graphics.bakeLighting()` triggers another bake from the current static scene state. `api.graphics.bakeLighting(zoneId)` limits receivers to the named Bake Zone.

## Current limitations (important)

1. **Runtime precomputation, not exported/offline lightmaps.** This patch recalculates GI when loading a scene with baking enabled. It does **not** serialize baked texture pixels into the project ZIP. For large games, an editor-side offline bake/export pipeline should be added next.
2. **Only LittleJS's original UV channel is available.** Overlapping / tiled UV islands share output texels, so per-face shadow detail can blend together. Proper atlas unwrap with a separate `UV2` channel requires a renderer/shader change; avoid assuming that this patch delivers production-grade lightmaps on arbitrary models.
3. Imported glTF emissive maps are sampled when `TextureInfo.image` is CPU-readable. If a source image cannot be read (e.g. cross-origin), that material's original GPU emission is preserved and **no replacement map** is installed on it.
4. Transparent objects, custom shaders, animated and dynamic objects are not baked as static geometry. Dynamic lights still affect direct lighting, but their indirect contributions are frozen until a new bake.
5. The diffuse Monte Carlo solution is approximate: finite low-resolution samples, simplified Lambertian BRDF, approximate ambient sky and no mirror/specular GI. This is **not** an unbiased production path tracer or a volumetric light-field solver.
6. UV outputs are LDR (8-bit), so very bright HDR emissive colors can clip. Keep source emission calibrated.
7. Batching is disabled on scenes where GI baking is active, because the current single-UV-channel static mesh merger would discard each object's individual lightmap. Restoring efficient batches needs lightmap atlas packing/instancing-aware material keys.

## Validation

- Fast CPU tests: `node --experimental-strip-types --test tests/baked-gi.node.test.mjs` (Node 22+).
- Regular build/typecheck (requires installed project dependencies): `pnpm typecheck && pnpm test && pnpm build`.
- Manually validate scenes with separate red/blue emissive map patches, a thin occluding wall, enclosed corners and light-emitting mesh parts. Compare direct light with baking enabled/disabled to ensure it is not doubled.
