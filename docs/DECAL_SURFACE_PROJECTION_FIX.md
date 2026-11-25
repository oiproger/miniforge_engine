# Surface Decals — receiver and offset fix

This patch fixes three problems that prevented projected decals from appearing on nearby 3D meshes:

1. The projection receiver filter incorrectly treated any entity with `Behavior`, `Script`, or `EventGraph` as dynamic. These components alone do **not** imply that a mesh is moving. Static mesh receivers with these components are now eligible. Animated, nav-agent and dynamic/kinematic physics geometry remains excluded.
2. The generated geometry previously used a fixed local `+Z` normal offset. This can push the decal *inside* the model, depending on projector rotation. The projection now receives the mesh's outward normals, transformed with the inverse-transpose normal matrix for nonuniform scales, and offsets along the real surface normal.
3. Alpha-blended mesh materials are no longer automatically excluded as receivers. Additive effects remain excluded.

## Placing a decal on a model

Surface Projection is an **oriented 3D volume**, not a ray cast that searches the entire scene. Width and height cover its local XY rectangle. `Projection Depth` is the **total** depth, with half in each direction from the decal's transform origin. The projector must overlap the target mesh.

For example, in the **FPS Explorer** demo, Energy Beacon is centered at Y = 0.8 with a Y scale of 0.75. With the decal at approximately Y = 0 and depth = 0.8, the vertical extent of its volume is only approximately [-0.4, 0.4]. It does not quite reach the beacon's lowest point (approximately Y = 0.425). Move the decal toward the beacon, and/or increase depth to cover it. The supplied screenshot also places the decal about 0.54 units to the left of the beacon, so increasing width may help.

Surface projection onto a flat floor **still looks flat**, correctly; try covering the edge of a crate, pillar or beacon to confirm actual conformity. `Minimum Surface Facing` restricts projection onto nearly perpendicular faces; lower it for curved surfaces. Use `Normal Offset` to avoid z-fighting, not to extend the volume.

## Limitations

This is triangle-clipped mesh decal projection, not a deferred/G-buffer decal. It does not deform onto a skeletal animated mesh, project through occluders using a depth buffer, or update skinned geometry each frame. Dynamic physics bodies and animated geometry remain intentionally excluded.

## Checks

The `projected-decal.test.ts` suite now covers receivers with behavior/scripts, dynamic exclusions, orientation-independent normal offsets, slopes, clipping, and transforms.
