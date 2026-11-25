# Render optimization pass (Miniforge 3.0.3)

## P0: static batching safety

Batchable primitive and model objects are kept alive, with the original mesh, renderer, scene node and pick data intact. Only their **render pass** is suppressed while the derived merged/instanced object exists. Editing color, material, emission, shader or visibility releases the affected entity back to individual rendering; all other entities retain their batch. `SceneNode` world transforms (including parent changes) are checked in `sync()` and trigger release on change. `playAnimation()` and live textures also release instances.

## P0: Scene Profiler

When Preview runs, the profiler uses actual runtime FPS, frame time and draw-call counts sent by runtime; draw calls include shadow passes. Without Preview, the profiler explicitly displays an estimate that accounts for spatial batching and repeat GLB candidates. **Estimated** draws treat each GLB as a single mesh; actual files can contain multiple submeshes. Triangle telemetry excludes hidden original meshes and includes instanced copies.

## P1: GLB GPU instancing

Repeated compatible non-animated, opaque GLBs sharing the same model asset and material overrides inside a spatial cell can be placed in LittleJS `InstancedMesh3D` buffers, once for each GLB part. Matrices are taken from the full GLTF world transform. Animated and skinned GLBs, models with custom shaders, transparent parts and individually distance-culled models are excluded. Runtime changes release an instance back to its original GLTFObject. The `staticBatching` performance switch gates the feature. Per-model `properties.instancing=false` opts out; the primitive-specific `staticBatch` flag does not disable GLB instancing (auto-static-batching marks all models `staticBatch=false`).

## P1: spatial mesh batching

Static mesh parts are grouped in world-space 16-unit cells with no more than 128 entities per draw. Each chunk is positioned near its own geometry rather than the world origin so LittleJS frustum culling operates with reasonable bounds. Mesh normals use inverse-transpose transforms and negative determinants reverse triangle winding. Any enabled per-entity distance culling disables spatial batching rather than breaking individual visibility.

## P1: same-context post processing

Post-FX now takes the **existing** WebGL2 context from the device. Immediately after the 3D frame is drawn, a GPU framebuffer copy (`gl.copyTexSubImage2D`) creates a source snapshot and a fullscreen triangle composites the result to the original canvas. There is no second canvas, context or CPU canvas re-upload. This is still an extra full-frame GPU copy; an FBO-based render graph can remove that copy in a later change.

## P2: multi-material batching

Compatible opaque materials may differ by **base color and diffuse texture**, which are baked into vertex colors and a padded per-chunk diffuse atlas. Remaining material parameters (roughness, metallic response, normal maps, emissive maps, shaders, alpha testing, depth/blend state) must match for one draw. Materials with normal/emissive maps, custom shaders, tiling/offset, transparency or special blending currently retain individual draws. This is a real multi-*diffuse*-material draw, **not** arbitrary physically based multi-material merging.

## Validation and compatibility

1. `pnpm test` and `pnpm typecheck`.
2. Preview/export with `settings.performance.staticBatching=true`; inspect console and actual draw calls with/without batching.
3. Test 200 static cubes in nearby and distant chunks, materials with solid colors and diffuse textures.
4. Test two static GLBs with different transforms. Confirm originals can still be picked and runtime animation/movement restores normal draw behavior.
5. Test active/parent visibility, mutations, negative scales, cull distance, shadow casting and GI Baking.
6. Turn on bloom/DOF while moving camera, verify one WebGL2 context and absence of WebGL errors.

**Limitations:** GI Lighting intentionally disables static merging and GLB instancing to preserve per-object baked maps. The profiler's fallback estimate is approximate. This change was prepared without npm dependencies or a GPU test environment, so browser/WebGL and full project CI checks remain necessary.
