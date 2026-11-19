import type { Asset, Vec3 } from '../packages/project-schema/src'

/** Generate a self-contained, editable glTF example with two animated hinges. */
export function makeVaultDoor(): Asset {
  const positions: number[] = [],
    normals: number[] = []
  for (const [axis, u, v, sign] of [
    [0, 1, 2, 1],
    [0, 2, 1, -1],
    [1, 2, 0, 1],
    [1, 0, 2, -1],
    [2, 0, 1, 1],
    [2, 1, 0, -1],
  ]) {
    for (const [x, y] of [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, -1],
      [1, 1],
      [-1, 1],
    ]) {
      const xyz = [0, 0, 0],
        normal = [0, 0, 0]
      xyz[axis] = sign / 2
      xyz[u] = x / 2
      xyz[v] = y / 2
      normal[axis] = sign
      positions.push(...xyz)
      normals.push(...normal)
    }
  }
  const bufferViews: { buffer: number; byteOffset: number; byteLength: number }[] = []
  const accessors: {
    bufferView: number
    componentType: number
    type: string
    count: number
    min?: number[]
    max?: number[]
  }[] = []
  const bytes: number[] = []
  function channel(values: number[], type: string, width: number, min?: number[], max?: number[]) {
    const start = bytes.length
    bytes.push(...new Uint8Array(new Float32Array(values).buffer))
    const bufferView =
      bufferViews.push({ buffer: 0, byteOffset: start, byteLength: bytes.length - start }) - 1
    return (
      accessors.push({ bufferView, componentType: 5126, type, count: values.length / width, min, max }) - 1
    )
  }
  const POSITION = channel(positions, 'VEC3', 3, [-0.5, -0.5, -0.5], [0.5, 0.5, 0.5]),
    NORMAL = channel(normals, 'VEC3', 3)
  const times = channel([0, 0.18, 0.74, 0.9], 'SCALAR', 1, [0], [0.9])
  function turn(angles: number[]) {
    return channel(
      angles.flatMap((deg) => [0, Math.sin((deg * Math.PI) / 360), 0, Math.cos((deg * Math.PI) / 360)]),
      'VEC4',
      4,
    )
  }
  const leftRot = turn([0, -6, -89, -94]),
    rightRot = turn([0, 6, 89, 94])
  const materials = [
    { name: 'Basalt', color: [0.078, 0.117, 0.137, 1] },
    { name: 'Bronze', color: [0.64, 0.35, 0.11, 1] },
    { name: 'Enamel', color: [0.048, 0.23, 0.21, 1] },
    { name: 'Gold', color: [1, 0.64, 0.21, 1] },
  ].map(({ name, color }) => ({
    name,
    pbrMetallicRoughness: { baseColorFactor: color, metallicFactor: 0.16, roughnessFactor: 0.64 },
  }))
  const meshes = materials.map((mat, material) => ({
    name: mat.name,
    primitives: [{ attributes: { POSITION, NORMAL }, material }],
  }))
  const nodes: {
    name: string
    children?: number[]
    mesh?: number
    translation?: Vec3
    scale?: Vec3
    rotation?: number[]
  }[] = []
  function group(name: string, translation: Vec3, parent?: number) {
    const id = nodes.push({ name, translation, children: [] }) - 1
    if (parent !== undefined) nodes[parent].children!.push(id)
    return id
  }
  function box(parent: number, name: string, mesh: number, translation: Vec3, scale: Vec3, roll = 0) {
    nodes[parent].children!.push(
      nodes.push({
        name,
        mesh,
        translation,
        scale,
        rotation: [0, 0, Math.sin(roll / 2), Math.cos(roll / 2)],
      }) - 1,
    )
  }
  const root = group('Vault gate', [0, 0, 0])
  const hinges: number[] = []
  for (const side of [-1, 1]) {
    const prefix = side < 0 ? 'West' : 'East'
    box(root, prefix + ' pillar', 0, [side * 1.36, 1.1, 0], [0.18, 2.2, 0.28])
    box(root, prefix + ' cap', 1, [side * 1.36, 2.17, 0], [0.21, 0.11, 0.32])
    const hinge = group(prefix + ' hinge', [side * 1.26, 0, 0], root)
    hinges.push(hinge)
    const center = -side * 0.62
    box(hinge, prefix + ' door', 0, [center, 1.04, 0], [1.23, 2.08, 0.14])
    box(hinge, prefix + ' panel', 2, [center, 1.04, 0.084], [1.02, 1.85, 0.045])
    for (const y of [0.18, 1.91])
      box(hinge, prefix + ' horizontal inlay', 1, [center, y, 0.12], [1.13, 0.065, 0.06])
    for (const x of [-0.5, 0.5])
      box(hinge, prefix + ' vertical inlay', 1, [center + x, 1.04, 0.12], [0.042, 1.69, 0.06])
    box(hinge, prefix + ' seal', 1, [center, 1.18, 0.13], [0.32, 0.32, 0.075], Math.PI / 4)
    box(hinge, prefix + ' inset', 3, [center, 1.18, 0.173], [0.14, 0.14, 0.025], Math.PI / 4)
  }
  box(root, 'Lintel', 0, [0, 2.22, 0], [2.9, 0.16, 0.31])
  box(root, 'Lintel inlay', 1, [0, 2.23, 0.16], [2.67, 0.042, 0.024])
  const doc = {
    asset: { version: '2.0', generator: 'Miniforge Engine' },
    scene: 0,
    scenes: [{ nodes: [root] }],
    nodes,
    meshes,
    materials,
    buffers: [
      {
        byteLength: bytes.length,
        uri: 'data:application/octet-stream;base64,' + btoa(String.fromCharCode(...bytes)),
      },
    ],
    bufferViews,
    accessors,
    animations: [
      {
        name: 'Open',
        samplers: [leftRot, rightRot].map((output) => ({ input: times, output, interpolation: 'LINEAR' })),
        channels: hinges.map((node, sampler) => ({ sampler, target: { node, path: 'rotation' } })),
      },
    ],
  }
  const data = 'data:model/gltf+json;base64,' + btoa(JSON.stringify(doc))
  return {
    id: 'gate-model',
    name: 'Vault Gate.gltf',
    type: 'model',
    data,
    properties: { size: JSON.stringify(doc).length },
  }
}
