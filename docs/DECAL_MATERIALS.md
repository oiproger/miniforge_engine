# Decal Surface Projection and Materials

## Inspector

Select an entity with the **3D Decal** component. The **Projection mode** selector offers:

- **Surface Projection (follow geometry)** (default for new decals): the projector clips triangles of static Mesh, GLB and Terrain receivers and creates an overlay mesh that follows their relief. Set **Projection depth** to cover the target surface, and **Minimum surface facing** to exclude glancing surfaces. The projection is along the decal's local Z axis; adjust rotation to aim at the target.
- **Plane (flat quad)**: inexpensive flat decal, without geometry projection. This also remains the behavior of the runtime `spawnDecal` API.

Projection does not modify the underlying surface's geometry or material and does not support skinned/animated receivers.

## Materials

Choose an existing **Material** asset, or click **Create decal material**. Decals use the same LittleJS-backed material options as Mesh renderers: base color/map, normal map, emissive map and tint, roughness-to-shininess mapping, reflectivity/metalness, custom shader, tiling and offset.

The **Texture override** field is optional. If set, it replaces the material's *base color texture only*; normal and emissive textures still come from the material. The **Tint color** multiplies the material's base color. The **Opacity** multiplies the material's opacity.

For correct overlay behavior decals always remain blended, depth-tested, depth-write-disabled, and do not cast shadows, irrespective of the chosen material's depth and casting defaults. They can receive shadows unless disabled by their material. Alpha vs additive is selected on the decal itself.

This is a **geometry-backed forward-rendered overlay**, not a deferred DBuffer decal. The decal's own normal/roughness/reflectivity affects how its generated overlay is shaded, but it does not directly rewrite the underlying surface's G-buffer attributes. Materials on decals cannot currently make a true per-pixel roughness-only modification to the underlying material without rendering an overlay.

## Test procedure

1. Add a static Box or Terrain and place a 3D Decal so that its volume intersects the surface.
2. Choose **Surface Projection**, use adequate Projection depth and rotate the projector until it faces the target.
3. Select an existing material with a base texture and a normal/emissive map. Verify lighting and UV tiling.
4. Toggle to **Plane** and verify the decal becomes flat.
5. Clear the material and set a texture directly: older texture-only decals should still render.
6. Export the game and check that the decal's material and its textures are included.
