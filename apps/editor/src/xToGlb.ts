// Pure TypeScript DirectX .x (text format) -> glTF 2.0 binary (.glb) converter
// Supports Mesh, MeshNormals, MeshTextureCoords, Material color, SkinWeights (bones), and AnimationSet/AnimationKey.

interface XSkinWeight {
  bone: string
  indices: number[]
  weights: number[]
  offsetMatrix: number[] // 16 floats
}

interface XAnimTrack {
  bone: string
  times: number[]
  translations?: number[]
  rotations?: number[]
  scales?: number[]
}

function stripComments(text: string): string {
  return text.replace(/\/\/[^\n]*/g, '').replace(/#[^\n]*/g, '')
}

function extractBlock(text: string, startBrace: number): { body: string; end: number } {
  let depth = 0
  let i = startBrace
  for (; i < text.length; i++) {
    if (text[i] === '{') depth++
    else if (text[i] === '}') {
      depth--
      if (depth === 0) return { body: text.slice(startBrace + 1, i), end: i + 1 }
    }
  }
  return { body: text.slice(startBrace + 1), end: text.length }
}

function nums(s: string): number[] {
  const m = s.match(/[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g)
  return m ? m.map(Number) : []
}

function decomposeMat4(m: number[]): { t: [number, number, number]; r: [number, number, number, number]; s: [number, number, number] } {
  // DirectX row-major 4x4 -> translation in m[12..14], flip Z for glTF RH
  const tx = m[12] || 0, ty = m[13] || 0, tz = -(m[14] || 0)
  const sx = Math.hypot(m[0], m[1], m[2]) || 1
  const sy = Math.hypot(m[4], m[5], m[6]) || 1
  const sz = Math.hypot(m[8], m[9], m[10]) || 1
  const r00 = m[0] / sx, r01 = m[1] / sx, r02 = -m[2] / sx
  const r10 = m[4] / sy, r11 = m[5] / sy, r12 = -m[6] / sy
  const r20 = -m[8] / sz, r21 = -m[9] / sz, r22 = m[10] / sz
  const trace = r00 + r11 + r22
  let qx = 0, qy = 0, qz = 0, qw = 1
  if (trace > 0) {
    const s = Math.sqrt(trace + 1) * 2
    qw = 0.25 * s; qx = (r21 - r12) / s; qy = (r02 - r20) / s; qz = (r10 - r01) / s
  } else if (r00 > r11 && r00 > r22) {
    const s = Math.sqrt(1 + r00 - r11 - r22) * 2
    qw = (r21 - r12) / s; qx = 0.25 * s; qy = (r01 + r10) / s; qz = (r02 + r20) / s
  } else if (r11 > r22) {
    const s = Math.sqrt(1 + r11 - r00 - r22) * 2
    qw = (r02 - r20) / s; qx = (r01 + r10) / s; qy = 0.25 * s; qz = (r12 + r21) / s
  } else {
    const s = Math.sqrt(1 + r22 - r00 - r11) * 2
    qw = (r10 - r01) / s; qx = (r02 + r20) / s; qy = (r12 + r21) / s; qz = 0.25 * s
  }
  const ql = Math.hypot(qx, qy, qz, qw) || 1
  return { t: [tx, ty, tz], r: [qx / ql, qy / ql, qz / ql, qw / ql], s: [sx, sy, sz] }
}

function pad4(buf: Uint8Array, padByte = 0): Uint8Array {
  const rem = buf.byteLength % 4
  if (!rem) return buf
  const out = new Uint8Array(buf.byteLength + (4 - rem))
  out.set(buf)
  out.fill(padByte, buf.byteLength)
  return out
}

export function convertTextXToGlb(rawBytes: Uint8Array, filename: string): Uint8Array {
  const header = new TextDecoder('ascii').decode(rawBytes.slice(0, 16))
  if (!header.startsWith('xof')) {
    throw new Error(`Invalid DirectX .x file: ${filename}`)
  }
  if (!header.includes('txt')) {
    throw new Error('BINARY_X_NEEDS_DESKTOP')
  }

  const text = stripComments(new TextDecoder('utf-8').decode(rawBytes))

  // 1. Find primary Mesh block
  const meshRe = /\bMesh\s*(?:[\w-]+\s*)?\{/g
  const meshMatch = meshRe.exec(text)
  if (!meshMatch) throw new Error(`No Mesh block found in ${filename}`)
  const meshBlock = extractBlock(text, meshMatch.index + meshMatch[0].length - 1)

  // Parse vertices & faces from the top of Mesh body (before nested blocks)
  const firstNested = meshBlock.body.search(/\b(MeshNormals|MeshTextureCoords|MeshMaterialList|XSkinMeshHeader|SkinWeights|MeshVertexColors)\b/)
  const geomHeader = firstNested >= 0 ? meshBlock.body.slice(0, firstNested) : meshBlock.body
  const gNums = nums(geomHeader)
  if (gNums.length < 4) throw new Error(`Malformed Mesh geometry in ${filename}`)

  let cursor = 0
  const vertCount = Math.floor(gNums[cursor++])
  const positions = new Float32Array(vertCount * 3)
  let minX = Infinity, minY = Infinity, minZ = Infinity
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity
  for (let i = 0; i < vertCount; i++) {
    const x = gNums[cursor++] ?? 0
    const y = gNums[cursor++] ?? 0
    const z = -(gNums[cursor++] ?? 0) // DirectX LH -> glTF RH
    positions[i * 3] = x
    positions[i * 3 + 1] = y
    positions[i * 3 + 2] = z
    if (x < minX) minX = x; if (x > maxX) maxX = x
    if (y < minY) minY = y; if (y > maxY) maxY = y
    if (z < minZ) minZ = z; if (z > maxZ) maxZ = z
  }

  const faceCount = Math.floor(gNums[cursor++] ?? 0)
  const triIndices: number[] = []
  for (let f = 0; f < faceCount; f++) {
    const nIdx = Math.floor(gNums[cursor++] ?? 0)
    const poly: number[] = []
    for (let k = 0; k < nIdx; k++) poly.push(Math.floor(gNums[cursor++] ?? 0))
    // Fan triangulate & flip winding for RH
    for (let k = 1; k + 1 < poly.length; k++) {
      triIndices.push(poly[0], poly[k + 1], poly[k])
    }
  }
  if (!triIndices.length) throw new Error(`No triangles found in ${filename}`)

  // 2. Parse UVs (MeshTextureCoords)
  const uvs = new Float32Array(vertCount * 2)
  const uvMatch = /\bMeshTextureCoords\s*\{/.exec(meshBlock.body)
  if (uvMatch) {
    const uvBlock = extractBlock(meshBlock.body, uvMatch.index + uvMatch[0].length - 1)
    const uNums = nums(uvBlock.body)
    const count = Math.min(vertCount, Math.floor(uNums[0] ?? 0))
    for (let i = 0; i < count; i++) {
      uvs[i * 2] = uNums[1 + i * 2] ?? 0
      uvs[i * 2 + 1] = uNums[1 + i * 2 + 1] ?? 0
    }
  }

  // 3. Compute flat/smooth vertex normals (guaranteed valid unit length)
  const normals = new Float32Array(vertCount * 3)
  for (let i = 0; i < triIndices.length; i += 3) {
    const a = triIndices[i], b = triIndices[i + 1], c = triIndices[i + 2]
    const ax = positions[a * 3], ay = positions[a * 3 + 1], az = positions[a * 3 + 2]
    const bx = positions[b * 3] - ax, by = positions[b * 3 + 1] - ay, bz = positions[b * 3 + 2] - az
    const cx = positions[c * 3] - ax, cy = positions[c * 3 + 1] - ay, cz = positions[c * 3 + 2] - az
    const nx = by * cz - bz * cy, ny = bz * cx - bx * cz, nz = bx * cy - by * cx
    for (const vi of [a, b, c]) {
      normals[vi * 3] += nx; normals[vi * 3 + 1] += ny; normals[vi * 3 + 2] += nz
    }
  }
  for (let i = 0; i < vertCount; i++) {
    const l = Math.hypot(normals[i * 3], normals[i * 3 + 1], normals[i * 3 + 2]) || 1
    normals[i * 3] /= l; normals[i * 3 + 1] /= l; normals[i * 3 + 2] /= l
  }

  // 4. Parse primary Material diffuse color
  let baseColor = [0.8, 0.8, 0.8, 1.0]
  const matMatch = /\bMaterial\s*(?:[\w-]+\s*)?\{/.exec(text)
  if (matMatch) {
    const matBlock = extractBlock(text, matMatch.index + matMatch[0].length - 1)
    const mNums = nums(matBlock.body)
    if (mNums.length >= 4) baseColor = [mNums[0], mNums[1], mNums[2], Math.max(0.1, Math.min(1, mNums[3]))]
  }

  // 5. Parse SkinWeights (optional skeletal skinning)
  const skinWeights: XSkinWeight[] = []
  const swRe = /\bSkinWeights\s*\{/g
  let swM: RegExpExecArray | null
  while ((swM = swRe.exec(meshBlock.body)) !== null) {
    const blk = extractBlock(meshBlock.body, swM.index + swM[0].length - 1)
    const nameM = /"([^"]+)"/.exec(blk.body)
    if (!nameM) continue
    const afterName = blk.body.slice(nameM.index + nameM[0].length)
    const swNums = nums(afterName)
    const nInf = Math.floor(swNums[0] ?? 0)
    const idxs = swNums.slice(1, 1 + nInf).map((v) => Math.floor(v))
    const wts = swNums.slice(1 + nInf, 1 + nInf * 2)
    const mat16 = swNums.slice(1 + nInf * 2, 1 + nInf * 2 + 16)
    if (mat16.length === 16) {
      skinWeights.push({ bone: nameM[1], indices: idxs, weights: wts, offsetMatrix: mat16 })
    }
  }

  // 6. Parse AnimationSet / Animation / AnimationKey (optional animations)
  const animTracks: XAnimTrack[] = []
  const animSetM = /\bAnimationSet\s*(?:[\w-]+\s*)?\{/.exec(text)
  if (animSetM) {
    const setBlk = extractBlock(text, animSetM.index + animSetM[0].length - 1)
    const animRe = /\bAnimation\s*(?:[\w-]+\s*)?\{/g
    let am: RegExpExecArray | null
    while ((am = animRe.exec(setBlk.body)) !== null) {
      const aBlk = extractBlock(setBlk.body, am.index + am[0].length - 1)
      const boneRef = /\{\s*([\w-]+)\s*\}/.exec(aBlk.body)
      if (!boneRef) continue
      const boneName = boneRef[1]
      const keyRe = /\bAnimationKey\s*\{/g
      let km: RegExpExecArray | null
      const track: XAnimTrack = { bone: boneName, times: [] }
      while ((km = keyRe.exec(aBlk.body)) !== null) {
        const kBlk = extractBlock(aBlk.body, km.index + km[0].length - 1)
        const kNums = nums(kBlk.body)
        const keyType = Math.floor(kNums[0] ?? -1)
        const keyCount = Math.floor(kNums[1] ?? 0)
        let kc = 2
        if (keyType === 4 && keyCount > 0) {
          // 4x4 matrix keys -> decompose to TRS
          const times: number[] = [], trans: number[] = [], rots: number[] = [], scales: number[] = []
          for (let k = 0; k < keyCount; k++) {
            const tick = kNums[kc++] ?? k
            const nVal = Math.floor(kNums[kc++] ?? 16)
            const mat = kNums.slice(kc, kc + nVal)
            kc += nVal
            if (mat.length === 16) {
              const dec = decomposeMat4(mat)
              times.push(tick / 4800)
              trans.push(...dec.t)
              rots.push(...dec.r)
              scales.push(...dec.s)
            }
          }
          if (times.length) {
            track.times = times
            track.translations = trans
            track.rotations = rots
            track.scales = scales
          }
        }
      }
      if (track.times.length) animTracks.push(track)
    }
  }

  // 7. Pack binary buffers & glTF 2.0 JSON
  const chunks: Uint8Array[] = []
  const bufferViews: any[] = []
  const accessors: any[] = []
  let byteOffset = 0

  const pushBuf = (arr: ArrayBufferView, componentType: number, type: string, count: number, min?: number[], max?: number[], target?: number) => {
    const raw = new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength)
    const padded = pad4(raw, 0)
    const bvIdx = bufferViews.length
    const bv: any = { buffer: 0, byteOffset, byteLength: raw.byteLength }
    if (target) bv.target = target
    bufferViews.push(bv)
    const accIdx = accessors.length
    const acc: any = { bufferView: bvIdx, componentType, count, type }
    if (min) acc.min = min
    if (max) acc.max = max
    accessors.push(acc)
    chunks.push(padded)
    byteOffset += padded.byteLength
    return accIdx
  }

  const idxArr = vertCount > 65535 ? new Uint32Array(triIndices) : new Uint16Array(triIndices)
  const idxAcc = pushBuf(idxArr, vertCount > 65535 ? 5125 : 5123, 'SCALAR', triIndices.length, undefined, undefined, 34963)
  const posAcc = pushBuf(positions, 5126, 'VEC3', vertCount, [minX, minY, minZ], [maxX, maxY, maxZ], 34962)
  const nrmAcc = pushBuf(normals, 5126, 'VEC3', vertCount, undefined, undefined, 34962)
  const uvAcc = pushBuf(uvs, 5126, 'VEC2', vertCount, undefined, undefined, 34962)

  const attributes: Record<string, number> = { POSITION: posAcc, NORMAL: nrmAcc, TEXCOORD_0: uvAcc }
  const nodes: any[] = [{ name: filename.replace(/\.[^.]+$/, ''), mesh: 0 }]
  const gltf: any = {
    asset: { version: '2.0', generator: 'Miniforge Engine .x -> .glb' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes,
    materials: [{ name: 'Material0', pbrMetallicRoughness: { baseColorFactor: baseColor, roughnessFactor: 0.82, metallicFactor: 0.05 } }],
    meshes: [{ name: 'Mesh0', primitives: [{ attributes, indices: idxAcc, material: 0 }] }],
    bufferViews,
    accessors,
    buffers: [{ byteLength: 0 }],
  }

  // Optional Skinning + Animation tracks
  if (skinWeights.length) {
    const jointsArr = new Uint16Array(vertCount * 4)
    const weightsArr = new Float32Array(vertCount * 4)
    const slots = new Uint8Array(vertCount)
    const boneToNode = new Map<string, number>()
    const jointNodeIndices: number[] = []
    const ibm = new Float32Array(skinWeights.length * 16)

    skinWeights.forEach((sw, bIdx) => {
      const nodeIdx = nodes.length
      nodes.push({ name: sw.bone })
      boneToNode.set(sw.bone, nodeIdx)
      jointNodeIndices.push(nodeIdx)
      // Store inverse bind matrix (column-major)
      for (let k = 0; k < 16; k++) ibm[bIdx * 16 + k] = sw.offsetMatrix[k]
      for (let i = 0; i < sw.indices.length; i++) {
        const vi = sw.indices[i]
        const w = sw.weights[i] ?? 0
        if (vi < 0 || vi >= vertCount || w <= 0) continue
        const s = slots[vi]
        if (s < 4) {
          jointsArr[vi * 4 + s] = bIdx
          weightsArr[vi * 4 + s] = w
          slots[vi] = s + 1
        }
      }
    })
    // Normalize vertex weights
    for (let v = 0; v < vertCount; v++) {
      const sum = weightsArr[v * 4] + weightsArr[v * 4 + 1] + weightsArr[v * 4 + 2] + weightsArr[v * 4 + 3]
      if (sum > 1e-5) {
        for (let k = 0; k < 4; k++) weightsArr[v * 4 + k] /= sum
      } else {
        weightsArr[v * 4] = 1
      }
    }
    attributes.JOINTS_0 = pushBuf(jointsArr, 5123, 'VEC4', vertCount, undefined, undefined, 34962)
    attributes.WEIGHTS_0 = pushBuf(weightsArr, 5126, 'VEC4', vertCount, undefined, undefined, 34962)
    const ibmAcc = pushBuf(ibm, 5126, 'MAT4', skinWeights.length)
    nodes[0].skin = 0
    gltf.scenes[0].nodes.push(...jointNodeIndices)
    gltf.skins = [{ joints: jointNodeIndices, inverseBindMatrices: ibmAcc }]

    if (animTracks.length) {
      const channels: any[] = []
      const samplers: any[] = []
      for (const tr of animTracks) {
        const targetNode = boneToNode.get(tr.bone)
        if (targetNode === undefined) continue
        const tArr = new Float32Array(tr.times)
        const tAcc = pushBuf(tArr, 5126, 'SCALAR', tArr.length, [Math.min(...tr.times)], [Math.max(...tr.times)])
        if (tr.translations) {
          const acc = pushBuf(new Float32Array(tr.translations), 5126, 'VEC3', tArr.length)
          const sIdx = samplers.length
          samplers.push({ input: tAcc, output: acc, interpolation: 'LINEAR' })
          channels.push({ sampler: sIdx, target: { node: targetNode, path: 'translation' } })
        }
        if (tr.rotations) {
          const acc = pushBuf(new Float32Array(tr.rotations), 5126, 'VEC4', tArr.length)
          const sIdx = samplers.length
          samplers.push({ input: tAcc, output: acc, interpolation: 'LINEAR' })
          channels.push({ sampler: sIdx, target: { node: targetNode, path: 'rotation' } })
        }
        if (tr.scales) {
          const acc = pushBuf(new Float32Array(tr.scales), 5126, 'VEC3', tArr.length)
          const sIdx = samplers.length
          samplers.push({ input: tAcc, output: acc, interpolation: 'LINEAR' })
          channels.push({ sampler: sIdx, target: { node: targetNode, path: 'scale' } })
        }
      }
      if (channels.length) gltf.animations = [{ name: 'Action', channels, samplers }]
    }
  }

  gltf.buffers[0].byteLength = byteOffset
  const binChunk = new Uint8Array(byteOffset)
  let off = 0
  for (const c of chunks) {
    binChunk.set(c, off)
    off += c.byteLength
  }

  const jsonBytes = pad4(new TextEncoder().encode(JSON.stringify(gltf)), 0x20)
  const totalLen = 12 + 8 + jsonBytes.byteLength + 8 + binChunk.byteLength
  const glb = new Uint8Array(totalLen)
  const dv = new DataView(glb.buffer)
  dv.setUint32(0, 0x46546c67, true) // 'glTF'
  dv.setUint32(4, 2, true) // version 2
  dv.setUint32(8, totalLen, true)
  dv.setUint32(12, jsonBytes.byteLength, true)
  dv.setUint32(16, 0x4e4f534a, true) // 'JSON'
  glb.set(jsonBytes, 20)
  const binHeader = 20 + jsonBytes.byteLength
  dv.setUint32(binHeader, binChunk.byteLength, true)
  dv.setUint32(binHeader + 4, 0x004e4942, true) // 'BIN\0'
  glb.set(binChunk, binHeader + 8)
  return glb
}
