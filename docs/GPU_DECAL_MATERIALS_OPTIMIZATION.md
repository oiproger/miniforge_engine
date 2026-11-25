# GPU Projected Decals: materials, culling, and batching

This update extends the working **Surface Projection (GPU / depth)** mode.
It does **not** revert to triangle-clipped overlay geometry. The simple `Plane`
mode is unchanged.

## Features

- **Material overlays:** use the Material Asset's base texture/color, normal
  map and normal scale, roughness and metalness, emissive texture/color and
  intensity, UV transform, opacity and alpha cutoff. An optional separate
  decal texture overrides only the base map. Material Assets also expose
  optional `roughnessMap` and `metalnessMap` (single-channel red-channel maps).
- **Forward lighting:** reconstructs the receiver's world normal from the
  depth texture, applies the normal map, and lights the decal using the scene's
  sun, ambient and up to 8 selected dynamic LittleJS lights. The metallic
  and roughness parameters participate in its specular BRDF.
- **Projector culling:** rejects decal volumes completely outside the clip
  frustum. For projectors inside/intersecting it, computes a conservative
  projected bounding rectangle; the GPU only shades that rectangle, not the
  entire screen. Near-plane intersections use a safe full-screen fallback.
- **GPU batching:** consecutive decals sharing base, normal, roughness,
  metalness, and emissive textures and blending state are submitted with
  `gl.drawArraysInstanced`, up to 64 per draw. Per-projector matrices, bounds,
  UV transforms, tint and material values stay independent. No sorting is done,
  so overlaps keep their original alpha compositing order.
- **Auto-enabled:** culling and batching need no extra scene flags. Empty and
  invisible decal sets skip the GPU pass entirely.

## Known limitations

The engine is a **forward renderer**. Unlike a deferred decal that writes a
material G-buffer, this implementation shades a separate decal overlay on top
of the rendered image. It cannot change the receiver's underlying BRDF or
receive all shadows, GI, SSR, or scene reflection probes identically to the
receiver. Custom Material Asset shader snippets are **not** executed by the
GPU decal overlay. The optional roughness/metalness texture maps currently
apply only to GPU decals, not ordinary mesh materials.

Full decal G-buffer modification requires extending the scene render
pipeline with normal/material render targets and a proper material-composition
pass. Do not represent this forward approximation as equivalent to deferred
PBR decals.

## Performance

Instance batches keep the scene's decal order. If hundreds of footprints have
identical textures and consecutive z-order, they use fewer draw calls, but
transparent overdraw still costs GPU time. Mixed texture groups cannot all be
combined into a single call without atlasing or texture-array packaging.

## Regression checklist

1. `pnpm typecheck`, `pnpm test`, `pnpm build`.
2. In FPS Explorer place a Surface Decal on a round mesh, add a normal-map
   material and verify relief lighting without polygon seams.
3. Change roughness and metalness; specular response should change while the
   receiving mesh and its base material remain unmodified.
4. Use an emissive map and verify alpha/dark-key backgrounds.
5. Place 100 copies of the same decal; inspect draw calls. Move them outside
   the viewport and verify the count drops.
6. Overlap transparent and additive decals with different textures; layer
   order should remain stable.
7. Export the scene and compare the standalone result with the editor.

A GPU visual test was not available in the automated environment; treat
shader compilation and frame-level blending as needing an in-browser test.
