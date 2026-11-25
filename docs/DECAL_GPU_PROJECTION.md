# Surface Decals: screen-space projection (3.0.4 fix)

`Surface Projection` now uses a GPU full-screen depth reconstruction pass instead of generating clipped triangles. A decal is defined by an oriented volume and an optional Material/Texture asset. The pass runs after the LittleJS render and before Miniforge postprocessing; it reconstructs the visible world position from the depth texture, tests the position against the decal volume and samples the material base texture using projector-local UVs. The old `Plane` mode stays available.

**Behavior:** no decal geometry is generated; circular models and slopes no longer display seams from triangle clipping or normal offsets. The projected material supports base color/texture, alpha transparency, UV tiling/offset, emissive texture/tint and alpha/additive blending. On opaque models the projection follows the visible surface, even when its geometry moves and participates in the depth pass.

**Limitations:** this is a forward colour-overlay decal pass, not a deferred G-buffer decal. It does not override the receiving surface's roughness/metalness or apply a normal map to the underlying lighting. Surfaces that do not contribute to opaque depth (e.g. transparency with depthWrite=false) cannot receive screen-space projection. Because the pass runs after transparent rendering, its order against foreground transparent objects is not guaranteed. Cost scales with viewport resolution and number of projectors. No GPU-level integration test could run in this environment.

**Why the black square may remain:** alpha-blended projections respect the supplied PNG's alpha. If every pixel is opaque, the entire projected footprint remains visible. Use a transparent PNG or material alpha, or enable `Dark background transparent` with a suitable threshold for art with a black background. The dark-key option is intentionally off by default: legitimate black artwork must remain possible.

**Check in editor:** select the decal, choose `Surface Projection (GPU / depth)`, place the projection volume so it intersects an opaque mesh (for a box 1–2 units large start with depth 2), and test with a transparent PNG. Rotate or animate the receiver to verify projection follows its visible surface. Compare against `Plane` mode, which should retain a flat quad.

Before publishing, run `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm export:demo`, and visually verify shader compilation in WebGL2. The new render path relies on LittleJS's `cameraDepthTexture` and `viewProjection` fields.
