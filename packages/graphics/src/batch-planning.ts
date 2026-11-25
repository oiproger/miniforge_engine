/** Pure, renderer-independent batch planning constraints shared by runtime and profiler. */
export const SPATIAL_BATCH_CELL_SIZE = 16
export function spatialBatchCell(position: readonly number[], size = SPATIAL_BATCH_CELL_SIZE): string {
  return position.map(v => Math.floor(v / size)).join(',')
}
export function opaqueMaterialBatchKey(props: Record<string, any>, doubleSided = false): string | null {
  if (props.normalMap || props.emissiveMap || props.shader || props.alphaTest || props.additive ||
      props.depthTest===false || props.depthWrite===false || props.tiling || props.offset ||
      (props.opacity??1)<1 || (props.emissive && props.emissive!=='#000000')) return null
  // Base colors are encoded into vertex colors, and diffuse textures into one
  // shared atlas. All other render-state differences must split the draw.
  const {color: _color, map: _map, ...state}=props
  return JSON.stringify({state,doubleSided})
}
