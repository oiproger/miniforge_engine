import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Plus,
  Trash2,
  Paintbrush,
  Orbit,
  Save,
  Layers,
  RotateCcw,
  Copy,
  MousePointerClick,
  ArrowUpFromLine,
  Minimize2,
  FlipHorizontal2,
  Sparkles,
  Move,
} from 'lucide-react'
import { createWorld, type RenderWorld } from '../../../packages/graphics/src'
import { Vector3 } from '../../../packages/graphics/src/scene'
import {
  makeEntity,
  makeProject,
  uid,
  type Asset,
  type Project,
} from '../../../packages/project-schema/src'
import { Field, Numeric, Color } from './Fields'

export type CsgShapeKind = 'box' | 'sphere' | 'cylinder' | 'cone' | 'wedge' | 'stairs'
export type CsgOp = 'union' | 'subtract'
export type UvMode = 'box' | 'planar' | 'cylindrical'
export type MaterialPattern = 'concrete' | 'wood' | 'rust' | 'brick' | 'moss' | 'solid'

export interface MeshBuilderNode {
  id: string
  name: string
  shape: CsgShapeKind
  op: CsgOp
  pos: [number, number, number]
  rot: [number, number, number] // degrees
  scale: [number, number, number]
  slot: number
}

export interface MeshBuilderSlot {
  name: string
  color: string
  roughness: number
  metalness: number
  pattern?: MaterialPattern
  materialId?: string
}

export interface MeshEditOp {
  id: string
  kind: 'extrude' | 'inset' | 'subdivide' | 'mirrorX' | 'groundY'
  faceIndex?: number
  amount?: number
  slot?: number
}

export interface MeshBuilderRecipe {
  nodes: MeshBuilderNode[]
  slots: MeshBuilderSlot[]
  uvMode: UvMode
  uvScale: number
  faceSlots: Record<number, number>
  editOps?: MeshEditOp[]
  paintTexture?: string // 512x512 PNG data URL painted directly onto 3D UV surface
}

export function defaultMeshBuilderRecipe(): MeshBuilderRecipe {
  return {
    nodes: [
      { id: 'mb-1', name: 'Base Block', shape: 'box', op: 'union', pos: [0, 0.5, 0], rot: [0, 0, 0], scale: [1.6, 1, 1.6], slot: 0 },
      { id: 'mb-2', name: 'Roof / Top', shape: 'cone', op: 'union', pos: [0, 1.45, 0], rot: [0, 45, 0], scale: [1.7, 0.9, 1.7], slot: 1 },
    ],
    slots: [
      { name: 'Concrete', color: '#9aa4ad', roughness: 0.88, metalness: 0.05, pattern: 'concrete' },
      { name: 'Roof Rust', color: '#8f4a36', roughness: 0.78, metalness: 0.15, pattern: 'rust' },
      { name: 'Accent Wood', color: '#8c6642', roughness: 0.82, metalness: 0, pattern: 'wood' },
      { name: 'Brick / Trim', color: '#8f5b4a', roughness: 0.85, metalness: 0.05, pattern: 'brick' },
    ],
    uvMode: 'box',
    uvScale: 1,
    faceSlots: {},
    editOps: [],
  }
}

interface Tri {
  v0: [number, number, number]
  v1: [number, number, number]
  v2: [number, number, number]
  n: [number, number, number]
  slot: number
}

function deg2rad(d: number) {
  return (d * Math.PI) / 180
}

function transformPt(
  p: [number, number, number],
  pos: [number, number, number],
  rotDeg: [number, number, number],
  scale: [number, number, number],
): [number, number, number] {
  let x = p[0] * scale[0]
  let y = p[1] * scale[1]
  let z = p[2] * scale[2]
  const rx = deg2rad(rotDeg[0]), ry = deg2rad(rotDeg[1]), rz = deg2rad(rotDeg[2])
  const cy = Math.cos(rx), sy = Math.sin(rx)
  ;[y, z] = [y * cy - z * sy, y * sy + z * cy]
  const cx = Math.cos(ry), sx = Math.sin(ry)
  ;[x, z] = [x * cx + z * sx, -x * sx + z * cx]
  const cz = Math.cos(rz), sz = Math.sin(rz)
  ;[x, y] = [x * cz - y * sz, x * sz + y * cz]
  return [x + pos[0], y + pos[1], z + pos[2]]
}

function triNormal(a: [number, number, number], b: [number, number, number], c: [number, number, number]): [number, number, number] {
  const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2]
  const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2]
  const nx = uy * vz - uz * vy
  const ny = uz * vx - ux * vz
  const nz = ux * vy - uy * vx
  const len = Math.hypot(nx, ny, nz) || 1
  return [nx / len, ny / len, nz / len]
}

function makeTri(
  v0: [number, number, number],
  v1: [number, number, number],
  v2: [number, number, number],
  slot: number,
): Tri {
  return { v0, v1, v2, n: triNormal(v0, v1, v2), slot }
}

function buildPrimitiveTris(node: MeshBuilderNode): Tri[] {
  const raw: [[number, number, number], [number, number, number], [number, number, number]][] = []
  const quad = (
    a: [number, number, number],
    b: [number, number, number],
    c: [number, number, number],
    d: [number, number, number],
  ) => {
    raw.push([a, b, c], [a, c, d])
  }
  const h = 0.5
  if (node.shape === 'box') {
    quad([-h, -h, h], [h, -h, h], [h, h, h], [-h, h, h])
    quad([h, -h, -h], [-h, -h, -h], [-h, h, -h], [h, h, -h])
    quad([h, -h, h], [h, -h, -h], [h, h, -h], [h, h, h])
    quad([-h, -h, -h], [-h, -h, h], [-h, h, h], [-h, h, -h])
    quad([-h, h, h], [h, h, h], [h, h, -h], [-h, h, -h])
    quad([-h, -h, -h], [h, -h, -h], [h, -h, h], [-h, -h, h])
  } else if (node.shape === 'wedge') {
    quad([-h, -h, -h], [h, -h, -h], [h, -h, h], [-h, -h, h])
    quad([-h, -h, -h], [-h, h, -h], [h, h, -h], [h, -h, -h])
    quad([-h, h, -h], [-h, -h, h], [h, -h, h], [h, h, -h])
    raw.push([[-h, -h, -h], [-h, -h, h], [-h, h, -h]])
    raw.push([[h, -h, h], [h, -h, -h], [h, h, -h]])
  } else if (node.shape === 'stairs') {
    const steps = 4
    for (let s = 0; s < steps; s++) {
      const y0 = -h + s / steps
      const y1 = -h + (s + 1) / steps
      const z0 = -h + s / steps
      const z1 = h
      quad([-h, y0, z1], [h, y0, z1], [h, y1, z1], [-h, y1, z1])
      quad([-h, y1, z1], [h, y1, z1], [h, y1, z0], [-h, y1, z0])
      quad([h, y0, z1], [h, y0, z0], [h, y1, z0], [h, y1, z1])
      quad([-h, y0, z0], [-h, y0, z1], [-h, y1, z1], [-h, y1, z0])
    }
    quad([-h, -h, -h], [h, -h, -h], [h, -h, h], [-h, -h, h])
    quad([h, -h, -h], [-h, -h, -h], [-h, h, -h], [h, h, -h])
  } else if (node.shape === 'cylinder' || node.shape === 'cone') {
    const seg = 12
    const topR = node.shape === 'cone' ? 0.001 : 0.5
    for (let i = 0; i < seg; i++) {
      const a0 = (i / seg) * Math.PI * 2
      const a1 = ((i + 1) / seg) * Math.PI * 2
      const bx0 = Math.cos(a0) * 0.5, bz0 = Math.sin(a0) * 0.5
      const bx1 = Math.cos(a1) * 0.5, bz1 = Math.sin(a1) * 0.5
      const tx0 = Math.cos(a0) * topR, tz0 = Math.sin(a0) * topR
      const tx1 = Math.cos(a1) * topR, tz1 = Math.sin(a1) * topR
      quad([bx0, -h, bz0], [bx1, -h, bz1], [tx1, h, tz1], [tx0, h, tz0])
      raw.push([[0, -h, 0], [bx1, -h, bz1], [bx0, -h, bz0]])
      if (topR > 0.01) raw.push([[0, h, 0], [tx0, h, tz0], [tx1, h, tz1]])
    }
  } else if (node.shape === 'sphere') {
    const stacks = 8, slices = 12
    for (let i = 0; i < stacks; i++) {
      const p0 = (i / stacks) * Math.PI
      const p1 = ((i + 1) / stacks) * Math.PI
      for (let j = 0; j < slices; j++) {
        const t0 = (j / slices) * Math.PI * 2
        const t1 = ((j + 1) / slices) * Math.PI * 2
        const pt = (p: number, t: number): [number, number, number] => [
          0.5 * Math.sin(p) * Math.cos(t),
          0.5 * Math.cos(p),
          0.5 * Math.sin(p) * Math.sin(t),
        ]
        quad(pt(p0, t0), pt(p1, t0), pt(p1, t1), pt(p0, t1))
      }
    }
  }
  return raw.map(([a, b, c]) =>
    makeTri(
      transformPt(a, node.pos, node.rot, node.scale),
      transformPt(b, node.pos, node.rot, node.scale),
      transformPt(c, node.pos, node.rot, node.scale),
      node.slot,
    ),
  )
}

function pointInsideNodeBox(pt: [number, number, number], node: MeshBuilderNode): boolean {
  return (
    Math.abs(pt[0] - node.pos[0]) <= Math.abs(node.scale[0]) * 0.5 &&
    Math.abs(pt[1] - node.pos[1]) <= Math.abs(node.scale[1]) * 0.5 &&
    Math.abs(pt[2] - node.pos[2]) <= Math.abs(node.scale[2]) * 0.5
  )
}

function applyMeshEditOps(tris: Tri[], ops: MeshEditOp[]): Tri[] {
  let out = [...tris]
  for (const op of ops) {
    if (op.kind === 'extrude' && op.faceIndex != null && out[op.faceIndex]) {
      const t = out[op.faceIndex]
      const dist = Number(op.amount ?? 0.35)
      const shift = (p: [number, number, number]): [number, number, number] => [
        p[0] + t.n[0] * dist,
        p[1] + t.n[1] * dist,
        p[2] + t.n[2] * dist,
      ]
      const e0 = shift(t.v0), e1 = shift(t.v1), e2 = shift(t.v2)
      const sl = op.slot ?? t.slot
      out[op.faceIndex] = makeTri(e0, e1, e2, sl)
      out.push(
        makeTri(t.v0, t.v1, e1, sl), makeTri(t.v0, e1, e0, sl),
        makeTri(t.v1, t.v2, e2, sl), makeTri(t.v1, e2, e1, sl),
        makeTri(t.v2, t.v0, e0, sl), makeTri(t.v2, e0, e2, sl),
      )
    } else if (op.kind === 'inset' && op.faceIndex != null && out[op.faceIndex]) {
      const t = out[op.faceIndex]
      const k = Math.max(0.05, Math.min(0.85, Number(op.amount ?? 0.25)))
      const cx = (t.v0[0] + t.v1[0] + t.v2[0]) / 3
      const cy = (t.v0[1] + t.v1[1] + t.v2[1]) / 3
      const cz = (t.v0[2] + t.v1[2] + t.v2[2]) / 3
      const lerpP = (p: [number, number, number]): [number, number, number] => [
        p[0] + (cx - p[0]) * k,
        p[1] + (cy - p[1]) * k,
        p[2] + (cz - p[2]) * k,
      ]
      const i0 = lerpP(t.v0), i1 = lerpP(t.v1), i2 = lerpP(t.v2)
      const sl = op.slot ?? t.slot
      out[op.faceIndex] = makeTri(i0, i1, i2, sl)
      out.push(
        makeTri(t.v0, t.v1, i1, t.slot), makeTri(t.v0, i1, i0, t.slot),
        makeTri(t.v1, t.v2, i2, t.slot), makeTri(t.v1, i2, i1, t.slot),
        makeTri(t.v2, t.v0, i0, t.slot), makeTri(t.v2, i0, i2, t.slot),
      )
    } else if (op.kind === 'subdivide') {
      if (out.length < 4000) {
        const sub: Tri[] = []
        const mid = (a: [number, number, number], b: [number, number, number]): [number, number, number] => [
          (a[0] + b[0]) * 0.5,
          (a[1] + b[1]) * 0.5,
          (a[2] + b[2]) * 0.5,
        ]
        for (const t of out) {
          const m01 = mid(t.v0, t.v1), m12 = mid(t.v1, t.v2), m20 = mid(t.v2, t.v0)
          sub.push(
            makeTri(t.v0, m01, m20, t.slot),
            makeTri(m01, t.v1, m12, t.slot),
            makeTri(m20, m12, t.v2, t.slot),
            makeTri(m01, m12, m20, t.slot),
          )
        }
        out = sub
      }
    } else if (op.kind === 'mirrorX') {
      const mirrored = out.map((t) =>
        makeTri(
          [-t.v0[0], t.v0[1], t.v0[2]],
          [-t.v2[0], t.v2[1], t.v2[2]],
          [-t.v1[0], t.v1[1], t.v1[2]],
          t.slot,
        ),
      )
      out.push(...mirrored)
    } else if (op.kind === 'groundY') {
      let minY = Infinity
      for (const t of out) minY = Math.min(minY, t.v0[1], t.v1[1], t.v2[1])
      if (Number.isFinite(minY)) {
        out = out.map((t) => ({
          ...t,
          v0: [t.v0[0], t.v0[1] - minY, t.v0[2]],
          v1: [t.v1[0], t.v1[1] - minY, t.v1[2]],
          v2: [t.v2[0], t.v2[1] - minY, t.v2[2]],
        }))
      }
    }
  }
  return out
}

function buildRecipeTriangles(recipe: MeshBuilderRecipe): Tri[] {
  let tris: Tri[] = []
  for (const node of recipe.nodes) {
    if (node.op === 'subtract') {
      tris = tris.filter((tr) => {
        const cx = (tr.v0[0] + tr.v1[0] + tr.v2[0]) / 3
        const cy = (tr.v0[1] + tr.v1[1] + tr.v2[1]) / 3
        const cz = (tr.v0[2] + tr.v1[2] + tr.v2[2]) / 3
        return !pointInsideNodeBox([cx, cy, cz], node)
      })
      const cavity = buildPrimitiveTris(node).map((tr) => ({
        v0: tr.v0,
        v1: tr.v2,
        v2: tr.v1,
        n: [-tr.n[0], -tr.n[1], -tr.n[2]] as [number, number, number],
        slot: node.slot,
      }))
      tris.push(...cavity)
    } else {
      tris.push(...buildPrimitiveTris(node))
    }
  }
  if (recipe.editOps?.length) {
    tris = applyMeshEditOps(tris, recipe.editOps)
  }
  return tris.map((tr, idx) =>
    recipe.faceSlots[idx] !== undefined ? { ...tr, slot: recipe.faceSlots[idx] } : tr,
  )
}

function computeUv(
  p: [number, number, number],
  n: [number, number, number],
  mode: UvMode,
  scale: number,
): [number, number] {
  const s = Math.max(0.05, scale || 1)
  if (mode === 'planar') return [p[0] * s * 0.25 + 0.5, p[2] * s * 0.25 + 0.5]
  if (mode === 'cylindrical') {
    const u = (Math.atan2(p[2], p[0]) / (Math.PI * 2) + 0.5) * s
    return [u, p[1] * s * 0.35 + 0.5]
  }
  const ax = Math.abs(n[0]), ay = Math.abs(n[1]), az = Math.abs(n[2])
  if (ay >= ax && ay >= az) return [p[0] * s * 0.25 + 0.5, p[2] * s * 0.25 + 0.5]
  if (ax >= ay && ax >= az) return [p[2] * s * 0.25 + 0.5, p[1] * s * 0.25 + 0.5]
  return [p[0] * s * 0.25 + 0.5, p[1] * s * 0.25 + 0.5]
}

function hexToRgbLinear(hex: string): [number, number, number, number] {
  const clean = (hex || '#ffffff').replace('#', '')
  const r = parseInt(clean.slice(0, 2) || 'ff', 16) / 255
  const g = parseInt(clean.slice(2, 4) || 'ff', 16) / 255
  const b = parseInt(clean.slice(4, 6) || 'ff', 16) / 255
  const toLin = (c: number) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4))
  return [toLin(r), toLin(g), toLin(b), 1]
}

function hexToRgb255(hex: string): [number, number, number] {
  const clean = (hex || '#ffffff').replace('#', '')
  return [
    parseInt(clean.slice(0, 2) || 'ff', 16),
    parseInt(clean.slice(2, 4) || 'ff', 16),
    parseInt(clean.slice(4, 6) || 'ff', 16),
  ]
}

function dataUrlToBytes(url: string): Uint8Array | null {
  const idx = url.indexOf(',')
  if (idx < 0) return null
  const bin = atob(url.slice(idx + 1))
  const arr = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i)
  return arr
}

/** Generate a 128x128 tileable procedural material pattern canvas for rich 3D material brush painting */
function buildProceduralMaterialTile(colorHex: string, pattern: MaterialPattern): HTMLCanvasElement {
  const size = 128
  const c = document.createElement('canvas')
  c.width = size
  c.height = size
  const ctx = c.getContext('2d')!
  const [r, g, b] = hexToRgb255(colorHex)
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)))
  const rgba = (dr: number, dg: number, db: number, a = 1) =>
    `rgba(${clamp(r + dr)},${clamp(g + dg)},${clamp(b + db)},${a})`

  ctx.fillStyle = colorHex
  ctx.fillRect(0, 0, size, size)

  // Deterministic pseudo-random helper
  let seed = (r * 73856093) ^ (g * 19349663) ^ (b * 83492791) ^ pattern.length
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0
    return seed / 4294967296
  }

  if (pattern === 'concrete') {
    for (let i = 0; i < 650; i++) {
      const d = (rand() - 0.5) * 46
      ctx.fillStyle = rgba(d, d, d, 0.35 + rand() * 0.35)
      const s = 1 + rand() * 3.5
      ctx.fillRect(rand() * size, rand() * size, s, s)
    }
    ctx.strokeStyle = rgba(-35, -35, -35, 0.25)
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(0, 64); ctx.lineTo(size, 64)
    ctx.stroke()
  } else if (pattern === 'wood') {
    for (let y = 0; y < size; y += 2) {
      const wave = Math.sin(y * 0.22) * 18 + (rand() - 0.5) * 14
      ctx.fillStyle = rgba(wave, wave * 0.85, wave * 0.6, 0.45)
      ctx.fillRect(0, y, size, 2)
    }
    ctx.strokeStyle = rgba(-45, -38, -28, 0.55)
    ctx.lineWidth = 1.5
    for (const py of [32, 64, 96]) {
      ctx.beginPath(); ctx.moveTo(0, py); ctx.lineTo(size, py); ctx.stroke()
    }
  } else if (pattern === 'rust') {
    for (let i = 0; i < 180; i++) {
      const x = rand() * size, y = rand() * size, rad = 3 + rand() * 11
      const warm = rand() > 0.45
      ctx.fillStyle = warm ? rgba(38, -8, -24, 0.32) : rgba(-32, -26, -22, 0.34)
      ctx.beginPath(); ctx.arc(x, y, rad, 0, Math.PI * 2); ctx.fill()
    }
  } else if (pattern === 'brick') {
    const bh = 16, bw = 32
    ctx.fillStyle = rgba(-42, -40, -38, 0.7)
    ctx.fillRect(0, 0, size, size)
    for (let row = 0; row < size / bh; row++) {
      const off = (row % 2) * (bw / 2)
      for (let col = -1; col <= size / bw; col++) {
        const shade = (rand() - 0.5) * 28
        ctx.fillStyle = rgba(shade, shade * 0.7, shade * 0.5, 1)
        ctx.fillRect(col * bw + off + 1.5, row * bh + 1.5, bw - 3, bh - 3)
      }
    }
  } else if (pattern === 'moss') {
    for (let i = 0; i < 420; i++) {
      const d = (rand() - 0.45) * 44
      ctx.fillStyle = rgba(d * 0.5, d + 12, d * 0.4, 0.45)
      ctx.beginPath()
      ctx.arc(rand() * size, rand() * size, 1.5 + rand() * 4.5, 0, Math.PI * 2)
      ctx.fill()
    }
  }
  return c
}

/** Encode built multi-material triangles + optional painted 512x512 PNG texture directly into binary .glb */
export function buildRecipeToGlbDataUrl(recipe: MeshBuilderRecipe): string {
  const tris = buildRecipeTriangles(recipe)
  const bySlot = new Map<number, Tri[]>()
  for (const t of tris) {
    const k = Math.max(0, Math.min(recipe.slots.length - 1, t.slot))
    const list = bySlot.get(k) || []
    list.push(t)
    bySlot.set(k, list)
  }

  const binChunks: Uint8Array[] = []
  let byteOffset = 0
  const bufferViews: any[] = []
  const accessors: any[] = []
  const primitives: any[] = []

  const pushRawBytes = (bytes: Uint8Array, target?: number) => {
    const pad = (4 - (bytes.byteLength % 4)) % 4
    const bvIdx = bufferViews.length
    const bv: any = { buffer: 0, byteOffset, byteLength: bytes.byteLength }
    if (target) bv.target = target
    bufferViews.push(bv)
    binChunks.push(bytes)
    if (pad) binChunks.push(new Uint8Array(pad))
    byteOffset += bytes.byteLength + pad
    return bvIdx
  }

  const pushTyped = (arr: Float32Array, target: number, type: string, withBounds = false) => {
    const bytes = new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength)
    const bvIdx = pushRawBytes(bytes, target)
    const acc: any = {
      bufferView: bvIdx,
      componentType: 5126,
      count: arr.length / (type === 'VEC3' ? 3 : 2),
      type,
    }
    if (withBounds && arr.length >= 3) {
      const min = [Infinity, Infinity, Infinity]
      const max = [-Infinity, -Infinity, -Infinity]
      for (let i = 0; i < arr.length; i += 3) {
        for (let k = 0; k < 3; k++) {
          if (arr[i + k] < min[k]) min[k] = arr[i + k]
          if (arr[i + k] > max[k]) max[k] = arr[i + k]
        }
      }
      acc.min = min
      acc.max = max
    }
    const accIdx = accessors.length
    accessors.push(acc)
    return accIdx
  }

  for (const [slotIdx, list] of bySlot.entries()) {
    const pos = new Float32Array(list.length * 9)
    const norm = new Float32Array(list.length * 9)
    const uv = new Float32Array(list.length * 6)
    list.forEach((tr, ti) => {
      const verts = [tr.v0, tr.v1, tr.v2]
      verts.forEach((v, vi) => {
        const o3 = (ti * 3 + vi) * 3
        pos[o3] = v[0]; pos[o3 + 1] = v[1]; pos[o3 + 2] = v[2]
        norm[o3] = tr.n[0]; norm[o3 + 1] = tr.n[1]; norm[o3 + 2] = tr.n[2]
        const u = computeUv(v, tr.n, recipe.uvMode, recipe.uvScale)
        const o2 = (ti * 3 + vi) * 2
        uv[o2] = u[0]; uv[o2 + 1] = u[1]
      })
    })
    primitives.push({
      attributes: {
        POSITION: pushTyped(pos, 34962, 'VEC3', true),
        NORMAL: pushTyped(norm, 34962, 'VEC3', false),
        TEXCOORD_0: pushTyped(uv, 34962, 'VEC2', false),
      },
      material: slotIdx,
    })
  }

  const images: any[] = []
  const textures: any[] = []
  let paintTexIndex: number | undefined
  if (recipe.paintTexture) {
    const pngBytes = dataUrlToBytes(recipe.paintTexture)
    if (pngBytes && pngBytes.byteLength > 16) {
      const bvIdx = pushRawBytes(pngBytes)
      images.push({ bufferView: bvIdx, mimeType: 'image/png' })
      textures.push({ source: 0 })
      paintTexIndex = 0
    }
  }

  const materials = recipe.slots.map((s) => ({
    name: s.name,
    pbrMetallicRoughness: {
      baseColorFactor: paintTexIndex !== undefined ? [1, 1, 1, 1] : hexToRgbLinear(s.color),
      ...(paintTexIndex !== undefined ? { baseColorTexture: { index: paintTexIndex } } : {}),
      roughnessFactor: s.roughness,
      metallicFactor: s.metalness,
    },
  }))

  const gltf: any = {
    asset: { version: '2.0', generator: 'Miniforge Mesh Builder v2.3' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ name: 'LowPolyMesh', mesh: 0 }],
    meshes: [{ name: 'LowPolyMesh', primitives }],
    materials,
    buffers: [{ byteLength: byteOffset }],
    bufferViews,
    accessors,
  }
  if (images.length) {
    gltf.images = images
    gltf.textures = textures
  }

  const jsonBytesRaw = new TextEncoder().encode(JSON.stringify(gltf))
  const jsonPad = (4 - (jsonBytesRaw.byteLength % 4)) % 4
  const jsonLen = jsonBytesRaw.byteLength + jsonPad
  const totalLen = 12 + 8 + jsonLen + 8 + byteOffset
  const out = new Uint8Array(totalLen)
  const dv = new DataView(out.buffer)
  dv.setUint32(0, 0x46546c67, true)
  dv.setUint32(4, 2, true)
  dv.setUint32(8, totalLen, true)
  dv.setUint32(12, jsonLen, true)
  dv.setUint32(16, 0x4e4f534a, true)
  out.set(jsonBytesRaw, 20)
  for (let i = 0; i < jsonPad; i++) out[20 + jsonBytesRaw.byteLength + i] = 0x20
  const binOff = 20 + jsonLen
  dv.setUint32(binOff, byteOffset, true)
  dv.setUint32(binOff + 4, 0x004e4942, true)
  let cursor = binOff + 8
  for (const ch of binChunks) {
    out.set(ch, cursor)
    cursor += ch.byteLength
  }

  let binary = ''
  for (let i = 0; i < out.length; i++) binary += String.fromCharCode(out[i])
  return 'data:model/gltf-binary;base64,' + btoa(binary)
}

export function MeshBuilder({
  a,
  p,
  changeA,
}: {
  a: Asset
  p: Project
  changeA: (fn: (asset: Asset) => void) => void
}) {
  const recipe: MeshBuilderRecipe = useMemo(() => {
    const r = a.properties?.meshBuilder as MeshBuilderRecipe | undefined
    return r && Array.isArray(r.nodes) && Array.isArray(r.slots) ? r : defaultMeshBuilderRecipe()
  }, [a.properties?.meshBuilder])

  const [selectedNodeId, setSelectedNodeId] = useState<string>(recipe.nodes[0]?.id ?? '')
  const [toolMode, setToolMode] = useState<'orbit' | 'face' | 'paint'>('orbit')
  const [faceDragTool, setFaceDragTool] = useState<'extrude' | 'inset' | 'select'>('extrude')
  const [selectedFace, setSelectedFace] = useState<number | null>(null)
  const [extrudeDist, setExtrudeDist] = useState(0.35)
  const [insetAmt, setInsetAmt] = useState(0.25)
  const [dragHud, setDragHud] = useState<string>('')

  // 3D Material / Texture Brush state
  const [paintMode, setPaintMode] = useState<'material' | 'color' | 'faceSlot'>('material')
  const [brushColor, setBrushColor] = useState('#d96b38')
  const [brushPx, setBrushPx] = useState(24)
  const [brushOpacity, setBrushOpacity] = useState(0.92)
  const [brushSlot, setBrushSlot] = useState(0)
  const [savedMsg, setSavedMsg] = useState('')

  const hostRef = useRef<HTMLDivElement | null>(null)
  const worldRef = useRef<RenderWorld | null>(null)
  const orbitRef = useRef({ yaw: 0.65, pitch: 0.42, dist: 4.8, dragging: false, lx: 0, ly: 0 })
  const texCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const paintDirtyRef = useRef(false)
  const lastPaintUvRef = useRef<[number, number] | null>(null)
  const skipNextWorldReloadRef = useRef(false)
  const loadedMatTexMapRef = useRef<Map<string, HTMLImageElement>>(new Map())

  // Interactive mouse-drag face modeling state
  const faceDragRef = useRef<{
    active: boolean
    kind: 'extrude' | 'inset'
    faceIndex: number
    startX: number
    startY: number
    amount: number
    lastPreviewMs: number
  } | null>(null)

  const matAssets = useMemo(() => p.assets.filter((x) => x.type === 'material'), [p.assets])
  const texAssets = useMemo(() => p.assets.filter((x) => x.type === 'texture'), [p.assets])

  // Preload project material textures so Material Brush can stamp real textures synchronously at 60fps
  useEffect(() => {
    for (const m of matAssets) {
      const mapId = m.properties?.map
      const texAsset = mapId ? texAssets.find((t) => t.id === mapId) : null
      const src = texAsset?.data || (typeof mapId === 'string' && mapId.startsWith('data:') ? mapId : '')
      if (src && !loadedMatTexMapRef.current.has(m.id)) {
        const img = new Image()
        img.src = src
        loadedMatTexMapRef.current.set(m.id, img)
      }
    }
  }, [matAssets, texAssets])

  // Cache procedural material pattern tile for the active brushSlot
  const activeSlot = recipe.slots[brushSlot] ?? recipe.slots[0]
  const activeMaterialTile = useMemo(() => {
    if (!activeSlot) return null
    const linkedMat = activeSlot.materialId ? matAssets.find((m) => m.id === activeSlot.materialId) : null
    const col = linkedMat?.properties?.color || activeSlot.color || '#9aa4ad'
    const pat: MaterialPattern = activeSlot.pattern || 'concrete'
    return buildProceduralMaterialTile(col, pat)
  }, [activeSlot?.color, activeSlot?.pattern, activeSlot?.materialId, matAssets])

  // Initialize 512x512 offscreen UV texture canvas
  useEffect(() => {
    const c = document.createElement('canvas')
    c.width = 512
    c.height = 512
    const ctx = c.getContext('2d')!
    ctx.fillStyle = recipe.slots[0]?.color || '#ffffff'
    ctx.fillRect(0, 0, 512, 512)
    texCanvasRef.current = c
    if (recipe.paintTexture) {
      const img = new Image()
      img.onload = () => {
        ctx.clearRect(0, 0, 512, 512)
        ctx.drawImage(img, 0, 0, 512, 512)
        worldRef.current?.setEntityLiveCanvasTexture('mb-preview', c)
      }
      img.src = recipe.paintTexture
    }
  }, [])

  const commitRecipe = (fn: (r: MeshBuilderRecipe) => void, skipReload = false) => {
    const next = structuredClone(recipe)
    fn(next)
    const glb = buildRecipeToGlbDataUrl(next)
    const partMaterials: Record<string, string> = {}
    next.slots.forEach((s, idx) => {
      if (s.materialId) partMaterials[String(idx)] = s.materialId
    })
    if (skipReload) skipNextWorldReloadRef.current = true
    changeA((asset) => {
      asset.data = glb
      asset.properties = {
        ...(asset.properties || {}),
        meshBuilder: next,
        partMaterials,
      }
    })
  }

  // Fast non-React preview load for live mouse-drag Extrude/Inset
  const loadPreviewRecipe = (previewRecipe: MeshBuilderRecipe) => {
    const w = worldRef.current
    if (!w) return
    const glb = buildRecipeToGlbDataUrl(previewRecipe)
    const tempAsset: Asset = { ...a, data: glb }
    const sample = makeProject('Mesh Builder Preview')
    sample.assets = p.assets.map((x) => (x.id === a.id ? tempAsset : x))
    if (!sample.assets.some((x) => x.id === a.id)) sample.assets.push(tempAsset)
    sample.scenes[0].environment.background = '#171d26'
    sample.scenes[0].environment.ambient = 1.5
    const ent = makeEntity('BuiltMesh')
    ent.id = 'mb-preview'
    ent.components = [{ type: 'mesh', shape: 'model', asset: a.id }]
    sample.scenes[0].entities = [ent]
    w.load(sample)
    w.setGrid(true, -0.01)
  }

  const tris = useMemo(() => buildRecipeTriangles(recipe), [recipe])

  // Live 3D WebGL2 preview
  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    const buildSample = () => {
      const sample = makeProject('Mesh Builder Preview')
      sample.assets = p.assets.map((x) => (x.id === a.id ? a : x))
      if (!sample.assets.some((x) => x.id === a.id)) sample.assets.push(a)
      sample.scenes[0].environment.background = '#171d26'
      sample.scenes[0].environment.ambient = 1.5
      const ent = makeEntity('BuiltMesh')
      ent.id = 'mb-preview'
      ent.components = [{ type: 'mesh', shape: 'model', asset: a.id }]
      sample.scenes[0].entities = [ent]
      return sample
    }
    let w: RenderWorld
    try {
      w = createWorld(host, buildSample(), undefined, { editor: true })
    } catch {
      return
    }
    worldRef.current = w
    w.setGrid(true, -0.01)
    let raf = 0
    const loop = () => {
      raf = requestAnimationFrame(loop)
      const o = orbitRef.current
      w.camera.position.set(
        Math.sin(o.yaw) * Math.cos(o.pitch) * o.dist,
        Math.sin(o.pitch) * o.dist + 0.7,
        Math.cos(o.yaw) * Math.cos(o.pitch) * o.dist,
      )
      w.camera.lookAt(new Vector3(0, 0.7, 0))
      w.camera.fov = 42
      w.render()
    }
    raf = requestAnimationFrame(loop)
    return () => {
      cancelAnimationFrame(raf)
      worldRef.current = null
      w.dispose()
    }
  }, [])

  useEffect(() => {
    if (skipNextWorldReloadRef.current) {
      skipNextWorldReloadRef.current = false
      return
    }
    const w = worldRef.current
    if (!w) return
    const sample = makeProject('Mesh Builder Preview')
    sample.assets = p.assets.map((x) => (x.id === a.id ? a : x))
    if (!sample.assets.some((x) => x.id === a.id)) sample.assets.push(a)
    sample.scenes[0].environment.background = '#171d26'
    sample.scenes[0].environment.ambient = 1.5
    const ent = makeEntity('BuiltMesh')
    ent.id = 'mb-preview'
    ent.components = [{ type: 'mesh', shape: 'model', asset: a.id }]
    sample.scenes[0].entities = [ent]
    w.load(sample)
    w.setGrid(true, -0.01)
  }, [a.data, a.properties?.partMaterials])

  const raycastMesh = (clientX: number, clientY: number) => {
    const host = hostRef.current
    if (!host) return null
    const rect = host.getBoundingClientRect()
    const nx = ((clientX - rect.left) / rect.width) * 2 - 1
    const ny = 1 - ((clientY - rect.top) / rect.height) * 2
    const o = orbitRef.current
    const camPos: [number, number, number] = [
      Math.sin(o.yaw) * Math.cos(o.pitch) * o.dist,
      Math.sin(o.pitch) * o.dist + 0.7,
      Math.cos(o.yaw) * Math.cos(o.pitch) * o.dist,
    ]
    const norm3 = (v: [number, number, number]): [number, number, number] => {
      const l = Math.hypot(v[0], v[1], v[2]) || 1
      return [v[0] / l, v[1] / l, v[2] / l]
    }
    const cross3 = (a3: [number, number, number], b3: [number, number, number]): [number, number, number] => [
      a3[1] * b3[2] - a3[2] * b3[1],
      a3[2] * b3[0] - a3[0] * b3[2],
      a3[0] * b3[1] - a3[1] * b3[0],
    ]
    const fwd = norm3([-camPos[0], 0.7 - camPos[1], -camPos[2]])
    const right = norm3(cross3(fwd, [0, 1, 0]))
    const up = norm3(cross3(right, fwd))
    const tanFov = Math.tan((42 * Math.PI) / 360)
    const aspect = rect.width / Math.max(1, rect.height)
    const dir = norm3([
      fwd[0] + right[0] * nx * aspect * tanFov + up[0] * ny * tanFov,
      fwd[1] + right[1] * nx * aspect * tanFov + up[1] * ny * tanFov,
      fwd[2] + right[2] * nx * aspect * tanFov + up[2] * ny * tanFov,
    ])

    let best: { faceIndex: number; t: number; u: number; v: number } | null = null
    for (let i = 0; i < tris.length; i++) {
      const tr = tris[i]
      const e1 = [tr.v1[0] - tr.v0[0], tr.v1[1] - tr.v0[1], tr.v1[2] - tr.v0[2]]
      const e2 = [tr.v2[0] - tr.v0[0], tr.v2[1] - tr.v0[1], tr.v2[2] - tr.v0[2]]
      const pvec = [dir[1] * e2[2] - dir[2] * e2[1], dir[2] * e2[0] - dir[0] * e2[2], dir[0] * e2[1] - dir[1] * e2[0]]
      const det = e1[0] * pvec[0] + e1[1] * pvec[1] + e1[2] * pvec[2]
      if (Math.abs(det) < 1e-6) continue
      const inv = 1 / det
      const tvec = [camPos[0] - tr.v0[0], camPos[1] - tr.v0[1], camPos[2] - tr.v0[2]]
      const u = (tvec[0] * pvec[0] + tvec[1] * pvec[1] + tvec[2] * pvec[2]) * inv
      if (u < 0 || u > 1) continue
      const qvec = [tvec[1] * e1[2] - tvec[2] * e1[1], tvec[2] * e1[0] - tvec[0] * e1[2], tvec[0] * e1[1] - tvec[1] * e1[0]]
      const v = (dir[0] * qvec[0] + dir[1] * qvec[1] + dir[2] * qvec[2]) * inv
      if (v < 0 || u + v > 1) continue
      const t = (e2[0] * qvec[0] + e2[1] * qvec[1] + e2[2] * qvec[2]) * inv
      if (t > 0.05 && (!best || t < best.t)) {
        best = { faceIndex: i, t, u, v }
      }
    }
    return best
  }

  // Stamp single brush dab onto 512x512 canvas using either Material Pattern/Texture or Solid Color
  const stampBrushDab = (ctx: CanvasRenderingContext2D, px: number, py: number) => {
    ctx.save()
    ctx.globalAlpha = brushOpacity
    if (paintMode === 'material') {
      // Soft circular clip so material texture stamps seamlessly with feathered edge
      ctx.beginPath()
      ctx.arc(px, py, brushPx, 0, Math.PI * 2)
      ctx.clip()
      const linkedImg = activeSlot?.materialId ? loadedMatTexMapRef.current.get(activeSlot.materialId) : undefined
      const sourceTex = linkedImg && linkedImg.complete && linkedImg.naturalWidth > 0 ? linkedImg : activeMaterialTile
      if (sourceTex) {
        const pat = ctx.createPattern(sourceTex, 'repeat')
        if (pat) {
          ctx.fillStyle = pat
          ctx.fillRect(px - brushPx, py - brushPx, brushPx * 2, brushPx * 2)
        }
      } else {
        ctx.fillStyle = activeSlot?.color || brushColor
        ctx.fillRect(px - brushPx, py - brushPx, brushPx * 2, brushPx * 2)
      }
    } else {
      const grad = ctx.createRadialGradient(px, py, 0, px, py, brushPx)
      grad.addColorStop(0, brushColor)
      grad.addColorStop(0.65, brushColor)
      grad.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.fillStyle = grad
      ctx.beginPath()
      ctx.arc(px, py, brushPx, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.restore()
  }

  // Instant 60 FPS GPU-direct 3D brush painting (zero 2-second lag!)
  const paintUvAtPointer = (clientX: number, clientY: number, isStart = false) => {
    const hit = raycastMesh(clientX, clientY)
    if (!hit) return

    if (paintMode === 'faceSlot') {
      if (recipe.faceSlots[hit.faceIndex] !== brushSlot) {
        commitRecipe((r) => {
          r.faceSlots[hit.faceIndex] = brushSlot
        })
      }
      return
    }

    const c = texCanvasRef.current
    if (!c) return
    const tr = tris[hit.faceIndex]
    const uv0 = computeUv(tr.v0, tr.n, recipe.uvMode, recipe.uvScale)
    const uv1 = computeUv(tr.v1, tr.n, recipe.uvMode, recipe.uvScale)
    const uv2 = computeUv(tr.v2, tr.n, recipe.uvMode, recipe.uvScale)
    const w0 = 1 - hit.u - hit.v
    const rawU = w0 * uv0[0] + hit.u * uv1[0] + hit.v * uv2[0]
    const rawV = w0 * uv0[1] + hit.u * uv1[1] + hit.v * uv2[1]
    const uu = ((rawU % 1) + 1) % 1
    const vv = ((rawV % 1) + 1) % 1
    const px = uu * 512
    const py = vv * 512

    const ctx = c.getContext('2d')!
    const prev = isStart ? null : lastPaintUvRef.current
    if (prev) {
      const dx = px - prev[0]
      const dy = py - prev[1]
      const dist = Math.hypot(dx, dy)
      // Interpolate continuous dabs unless UV jumped across a seam
      if (dist > 2 && dist < 140) {
        const steps = Math.min(24, Math.ceil(dist / Math.max(3, brushPx * 0.35)))
        for (let s = 1; s <= steps; s++) {
          stampBrushDab(ctx, prev[0] + (dx * s) / steps, prev[1] + (dy * s) / steps)
        }
      } else {
        stampBrushDab(ctx, px, py)
      }
    } else {
      stampBrushDab(ctx, px, py)
    }
    lastPaintUvRef.current = [px, py]
    paintDirtyRef.current = true

    // Upload canvas straight to GPU WebGL2 texture via texSubImage2D (<0.3ms, instant feedback!)
    worldRef.current?.setEntityLiveCanvasTexture('mb-preview', c)
  }

  const flushPaintTexture = () => {
    lastPaintUvRef.current = null
    if (!paintDirtyRef.current || !texCanvasRef.current) return
    paintDirtyRef.current = false
    const url = texCanvasRef.current.toDataURL('image/png')
    // Skip redundant world.load() flash since GPU texture already matches the canvas!
    commitRecipe((r) => {
      r.paintTexture = url
    }, true)
  }

  const curNode = recipe.nodes.find((n) => n.id === selectedNodeId) ?? recipe.nodes[0]

  return (
    <div className="mf-bp-editor">
      <div className="mf-bp-toolbar">
        <div className="mf-bp-tabs">
          <button type="button" className={'mf-bp-tab' + (toolMode === 'orbit' ? ' active' : '')} onClick={() => setToolMode('orbit')}>
            <Orbit size={13} /> Orbit / CSG
          </button>
          <button type="button" className={'mf-bp-tab' + (toolMode === 'face' ? ' active' : '')} onClick={() => setToolMode('face')}>
            <MousePointerClick size={13} /> Face Edit (Drag Extrude / Inset)
          </button>
          <button type="button" className={'mf-bp-tab' + (toolMode === 'paint' ? ' active' : '')} onClick={() => setToolMode('paint')}>
            <Paintbrush size={13} /> 3D Material Brush
          </button>
          <span style={{ fontSize: 11, color: '#9aa7b8', marginLeft: 8 }}>
            {tris.length} tris · {recipe.slots.length} materials
          </span>
        </div>
        <div className="mf-bp-actions">
          {savedMsg && <span style={{ fontSize: 11, color: '#7ee787' }}>{savedMsg}</span>}
          <button
            type="button"
            className="mf-primary"
            style={{ padding: '4px 10px', fontSize: 11.5 }}
            onClick={() => {
              commitRecipe(() => {})
              setSavedMsg('Baked to .glb')
              setTimeout(() => setSavedMsg(''), 1800)
            }}
          >
            <Save size={12} /> Bake .glb
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(340px, 1.05fr) minmax(420px, 1.15fr)', flex: 1, minHeight: 0 }}>
        {/* Left: Live 3D Viewport */}
        <div style={{ display: 'flex', flexDirection: 'column', borderRight: '1px solid #2b323b', background: '#141920', position: 'relative' }}>
          {dragHud && (
            <div
              style={{
                position: 'absolute',
                top: 12,
                left: 12,
                zIndex: 10,
                padding: '5px 10px',
                borderRadius: 6,
                background: 'rgba(13,17,23,0.88)',
                border: '1px solid #f59e0b',
                color: '#fbbf24',
                fontSize: 12,
                fontWeight: 700,
                pointerEvents: 'none',
              }}
            >
              {dragHud}
            </div>
          )}
          <div
            ref={hostRef}
            style={{
              flex: 1,
              minHeight: 440,
              cursor: toolMode === 'orbit' ? 'grab' : toolMode === 'face' && faceDragTool !== 'select' ? 'ns-resize' : 'crosshair',
              overflow: 'hidden',
            }}
            onContextMenu={(e) => e.preventDefault()}
            onPointerDown={(e) => {
              if (e.button === 2 || e.button === 1 || (toolMode === 'orbit' && e.button === 0)) {
                e.currentTarget.setPointerCapture(e.pointerId)
                orbitRef.current.dragging = true
                orbitRef.current.lx = e.clientX
                orbitRef.current.ly = e.clientY
                return
              }
              if (toolMode === 'face' && e.button === 0) {
                const hit = raycastMesh(e.clientX, e.clientY)
                if (!hit) return
                setSelectedFace(hit.faceIndex)
                if (faceDragTool === 'extrude' || faceDragTool === 'inset') {
                  e.currentTarget.setPointerCapture(e.pointerId)
                  faceDragRef.current = {
                    active: true,
                    kind: faceDragTool,
                    faceIndex: hit.faceIndex,
                    startX: e.clientX,
                    startY: e.clientY,
                    amount: faceDragTool === 'extrude' ? 0.05 : 0.15,
                    lastPreviewMs: 0,
                  }
                  setDragHud(faceDragTool === 'extrude' ? 'Extrude: +0.05' : 'Inset: 0.15')
                }
                return
              }
              if (toolMode === 'paint' && e.button === 0) {
                e.currentTarget.setPointerCapture(e.pointerId)
                orbitRef.current.dragging = true
                paintUvAtPointer(e.clientX, e.clientY, true)
              }
            }}
            onPointerMove={(e) => {
              // Live mouse-drag Extrude / Inset
              const fd = faceDragRef.current
              if (fd?.active) {
                const dy = fd.startY - e.clientY
                const dx = e.clientX - fd.startX
                const delta = Math.abs(dy) >= Math.abs(dx) ? dy : dx
                const amt =
                  fd.kind === 'extrude'
                    ? Math.max(-2, Math.min(4, Math.round(delta * 0.012 * 100) / 100))
                    : Math.max(0.05, Math.min(0.85, Math.round((0.15 + delta * 0.004) * 100) / 100))
                fd.amount = amt
                setDragHud(fd.kind === 'extrude' ? `Extrude: ${amt >= 0 ? '+' : ''}${amt.toFixed(2)}` : `Inset: ${amt.toFixed(2)}`)
                const now = performance.now()
                if (now - fd.lastPreviewMs > 45) {
                  fd.lastPreviewMs = now
                  const preview = structuredClone(recipe)
                  preview.editOps = [
                    ...(preview.editOps || []),
                    { id: 'live-drag', kind: fd.kind, faceIndex: fd.faceIndex, amount: amt, slot: brushSlot },
                  ]
                  loadPreviewRecipe(preview)
                }
                return
              }

              const o = orbitRef.current
              if (!o.dragging) return
              if (toolMode === 'paint' && e.buttons === 1) {
                paintUvAtPointer(e.clientX, e.clientY, false)
                return
              }
              o.yaw -= (e.clientX - o.lx) * 0.01
              o.pitch = Math.max(-1.2, Math.min(1.4, o.pitch + (e.clientY - o.ly) * 0.01))
              o.lx = e.clientX
              o.ly = e.clientY
            }}
            onPointerUp={(e) => {
              const fd = faceDragRef.current
              if (fd?.active) {
                faceDragRef.current = null
                setDragHud('')
                if (fd.kind === 'extrude') setExtrudeDist(fd.amount)
                else setInsetAmt(fd.amount)
                if (Math.abs(fd.amount) > 0.02) {
                  commitRecipe((r) => {
                    r.editOps = [
                      ...(r.editOps || []),
                      { id: uid('op'), kind: fd.kind, faceIndex: fd.faceIndex, amount: fd.amount, slot: brushSlot },
                    ]
                  })
                }
              }
              orbitRef.current.dragging = false
              if (toolMode === 'paint') flushPaintTexture()
              try {
                e.currentTarget.releasePointerCapture(e.pointerId)
              } catch {}
            }}
            onWheel={(e) => {
              orbitRef.current.dist = Math.max(1.2, Math.min(25, orbitRef.current.dist * (1 + e.deltaY * 0.0012)))
            }}
          />
          <div style={{ padding: '7px 10px', borderTop: '1px solid #2b323b', fontSize: 11, color: '#9aa7b8' }}>
            {toolMode === 'paint'
              ? `Instant 3D Brush (${paintMode === 'material' ? `Material: ${activeSlot?.name}` : paintMode === 'faceSlot' ? `Face Slot #${brushSlot}` : 'Color'}) · Left-drag to paint · Right-drag to orbit`
              : toolMode === 'face'
                ? faceDragTool === 'select'
                  ? `Click face to select (${selectedFace !== null ? `Face #${selectedFace}` : 'none'}) · Right-drag to orbit`
                  : `Click & drag any face on mesh to ${faceDragTool === 'extrude' ? 'Extrude' : 'Inset'} interactively · Right-drag to orbit`
                : 'Drag to orbit · Scroll to zoom'}
          </div>
        </div>

        {/* Right: Modeling Tools, Brushes, UV, Material Paint & Unlimited Materials */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: 12, overflowY: 'auto' }}>
          {/* Face Modeling Tools (Interactive Drag + Numeric) */}
          <div style={{ border: '1px solid #2b323b', borderRadius: 6, padding: 9, background: '#192028', display: 'flex', flexDirection: 'column', gap: 7 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <strong style={{ fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                <Sparkles size={12} color="#f3a05d" /> Face Modeling Tools
              </strong>
              <span style={{ fontSize: 11, color: selectedFace !== null ? '#7ee787' : '#8b9bb0' }}>
                {selectedFace !== null ? `Face #${selectedFace}` : 'Click/Drag face in 3D'}
              </span>
            </div>
            {/* Direct Mouse Drag Tool Selector */}
            <div style={{ display: 'flex', gap: 5 }}>
              {([
                ['extrude', 'Drag Extrude', ArrowUpFromLine],
                ['inset', 'Drag Inset', Minimize2],
                ['select', 'Select Only', Move],
              ] as const).map(([id, label, Icon]) => (
                <button
                  key={id}
                  type="button"
                  className={toolMode === 'face' && faceDragTool === id ? 'mf-primary' : 'mf-btn'}
                  style={{ flex: 1, fontSize: 11, padding: '4px 6px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}
                  onClick={() => {
                    setToolMode('face')
                    setFaceDragTool(id)
                  }}
                >
                  <Icon size={11} /> {label}
                </button>
              ))}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 78px 1fr 78px', gap: 6, alignItems: 'center' }}>
              <button
                type="button"
                className="mf-btn"
                disabled={selectedFace === null}
                onClick={() => {
                  if (selectedFace === null) return
                  commitRecipe((r) => {
                    r.editOps = [...(r.editOps || []), { id: uid('op'), kind: 'extrude', faceIndex: selectedFace, amount: extrudeDist, slot: brushSlot }]
                  })
                }}
              >
                <ArrowUpFromLine size={12} /> Extrude
              </button>
              <Numeric label="Dist" value={extrudeDist} min={-2} max={5} step={0.05} change={setExtrudeDist} />
              <button
                type="button"
                className="mf-btn"
                disabled={selectedFace === null}
                onClick={() => {
                  if (selectedFace === null) return
                  commitRecipe((r) => {
                    r.editOps = [...(r.editOps || []), { id: uid('op'), kind: 'inset', faceIndex: selectedFace, amount: insetAmt, slot: brushSlot }]
                  })
                }}
              >
                <Minimize2 size={12} /> Inset
              </button>
              <Numeric label="Inset" value={insetAmt} min={0.05} max={0.85} step={0.05} change={setInsetAmt} />
            </div>
            <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
              <button
                type="button"
                className="mf-btn"
                style={{ fontSize: 11 }}
                onClick={() => commitRecipe((r) => (r.editOps = [...(r.editOps || []), { id: uid('op'), kind: 'subdivide' }]))}
              >
                Subdivide ×4
              </button>
              <button
                type="button"
                className="mf-btn"
                style={{ fontSize: 11 }}
                onClick={() => commitRecipe((r) => (r.editOps = [...(r.editOps || []), { id: uid('op'), kind: 'mirrorX' }]))}
              >
                <FlipHorizontal2 size={11} /> Mirror X
              </button>
              <button
                type="button"
                className="mf-btn"
                style={{ fontSize: 11 }}
                onClick={() => commitRecipe((r) => (r.editOps = [...(r.editOps || []), { id: uid('op'), kind: 'groundY' }]))}
              >
                Ground Y=0
              </button>
              {(recipe.editOps?.length ?? 0) > 0 && (
                <button
                  type="button"
                  className="mf-btn"
                  style={{ fontSize: 11 }}
                  onClick={() => commitRecipe((r) => (r.editOps = (r.editOps || []).slice(0, -1)))}
                >
                  <RotateCcw size={11} /> Undo Edit ({recipe.editOps?.length})
                </button>
              )}
            </div>
          </div>

          {/* 3D Material & Texture Paint Brush Settings */}
          <div style={{ border: '1px solid #2b323b', borderRadius: 6, padding: 9, background: '#192028', display: 'flex', flexDirection: 'column', gap: 7 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <strong style={{ fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                <Paintbrush size={12} color="#58b8ff" /> 3D Material &amp; Texture Brush
              </strong>
              <button
                type="button"
                className="mf-btn"
                style={{ fontSize: 10.5 }}
                onClick={() => {
                  if (texCanvasRef.current) {
                    const ctx = texCanvasRef.current.getContext('2d')!
                    ctx.fillStyle = recipe.slots[0]?.color || '#ffffff'
                    ctx.fillRect(0, 0, 512, 512)
                    worldRef.current?.setEntityLiveCanvasTexture('mb-preview', texCanvasRef.current)
                  }
                  commitRecipe((r) => {
                    delete r.paintTexture
                  })
                }}
              >
                <RotateCcw size={11} /> Clear Paint
              </button>
            </div>
            <div style={{ display: 'flex', gap: 5 }}>
              {([
                ['material', 'Material Brush'],
                ['color', 'Color Brush'],
                ['faceSlot', 'Face Material'],
              ] as const).map(([m, label]) => (
                <button
                  key={m}
                  type="button"
                  className={toolMode === 'paint' && paintMode === m ? 'mf-primary' : 'mf-btn'}
                  style={{ flex: 1, fontSize: 11, padding: '4px 6px' }}
                  onClick={() => {
                    setToolMode('paint')
                    setPaintMode(m)
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
              {paintMode === 'color' ? (
                <Field label="Brush Color">
                  <Color label="Brush Color" value={brushColor} change={(v) => { setBrushColor(v); setToolMode('paint') }} />
                </Field>
              ) : (
                <Field label="Active Material">
                  <select
                    value={brushSlot}
                    onChange={(e) => {
                      setBrushSlot(Number(e.target.value))
                      setToolMode('paint')
                    }}
                  >
                    {recipe.slots.map((s, idx) => (
                      <option key={idx} value={idx}>
                        #{idx} {s.name} ({s.pattern || 'concrete'})
                      </option>
                    ))}
                  </select>
                </Field>
              )}
              <Field label="Size (px)">
                <Numeric label="Size" value={brushPx} min={3} max={96} step={2} change={setBrushPx} />
              </Field>
              <Field label="Opacity">
                <Numeric label="Opacity" value={brushOpacity} min={0.05} max={1} step={0.05} change={setBrushOpacity} />
              </Field>
            </div>
          </div>

          {/* CSG Brushes List */}
          <div style={{ border: '1px solid #2b323b', borderRadius: 6, padding: 9, background: '#161b22', display: 'flex', flexDirection: 'column', gap: 7 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 4 }}>
              <strong style={{ fontSize: 12 }}>CSG Brushes ({recipe.nodes.length})</strong>
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                {(['box', 'wedge', 'stairs', 'cylinder', 'cone', 'sphere'] as CsgShapeKind[]).map((sh) => (
                  <button
                    key={sh}
                    type="button"
                    className="mf-btn"
                    style={{ fontSize: 11, padding: '2px 7px' }}
                    onClick={() => {
                      const id = uid('mb')
                      commitRecipe((r) => {
                        r.nodes.push({
                          id,
                          name: `${sh} ${r.nodes.length + 1}`,
                          shape: sh,
                          op: 'union',
                          pos: [0, 0.5, 0],
                          rot: [0, 0, 0],
                          scale: [1, 1, 1],
                          slot: brushSlot,
                        })
                      })
                      setSelectedNodeId(id)
                    }}
                  >
                    <Plus size={10} /> {sh}
                  </button>
                ))}
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minHeight: 130, maxHeight: 200, overflowY: 'auto' }}>
              {recipe.nodes.map((n) => (
                <div
                  key={n.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 6,
                    padding: '6px 9px',
                    borderRadius: 5,
                    border: curNode?.id === n.id ? '1px solid #4c9aff' : '1px solid #262e38',
                    background: curNode?.id === n.id ? '#222c3a' : '#1b222c',
                    fontSize: 12,
                  }}
                >
                  <button
                    type="button"
                    style={{ flex: 1, textAlign: 'left', background: 'none', border: 'none', color: '#e6edf3', cursor: 'pointer' }}
                    onClick={() => setSelectedNodeId(n.id)}
                  >
                    <b>{n.op === 'subtract' ? '−' : '+'}</b> {n.name}{' '}
                    <small style={{ color: '#8b9bb0' }}>({n.shape} · slot #{n.slot})</small>
                  </button>
                  <button
                    type="button"
                    className="mf-bp-icon-btn"
                    title="Duplicate brush"
                    onClick={() => {
                      const id = uid('mb')
                      commitRecipe((r) => {
                        const copy = structuredClone(n)
                        copy.id = id
                        copy.name = n.name + ' copy'
                        copy.pos[0] += 0.5
                        r.nodes.push(copy)
                      })
                      setSelectedNodeId(id)
                    }}
                  >
                    <Copy size={11} />
                  </button>
                  {recipe.nodes.length > 1 && (
                    <button
                      type="button"
                      className="mf-bp-icon-btn"
                      title="Delete brush"
                      onClick={() => commitRecipe((r) => (r.nodes = r.nodes.filter((x) => x.id !== n.id)))}
                    >
                      <Trash2 size={11} />
                    </button>
                  )}
                </div>
              ))}
            </div>

            {curNode && (
              <div style={{ borderTop: '1px solid #2b323b', paddingTop: 7, display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                  <Field label="Operation">
                    <select
                      value={curNode.op}
                      onChange={(e) =>
                        commitRecipe((r) => {
                          const x = r.nodes.find((k) => k.id === curNode.id)
                          if (x) x.op = e.target.value as CsgOp
                        })
                      }
                    >
                      <option value="union">Union (Add)</option>
                      <option value="subtract">Subtract (Carve)</option>
                    </select>
                  </Field>
                  <Field label="Material Slot">
                    <select
                      value={curNode.slot}
                      onChange={(e) =>
                        commitRecipe((r) => {
                          const x = r.nodes.find((k) => k.id === curNode.id)
                          if (x) x.slot = Number(e.target.value)
                        })
                      }
                    >
                      {recipe.slots.map((s, idx) => (
                        <option key={idx} value={idx}>
                          #{idx} {s.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                </div>
                {(['pos', 'rot', 'scale'] as const).map((prop) => (
                  <div key={prop} style={{ display: 'grid', gridTemplateColumns: '48px 1fr 1fr 1fr', gap: 4, alignItems: 'center', fontSize: 11 }}>
                    <span style={{ color: '#9aa7b8', textTransform: 'uppercase' }}>{prop}</span>
                    {[0, 1, 2].map((ax) => (
                      <Numeric
                        key={ax}
                        label={`${prop}${ax}`}
                        value={curNode[prop][ax]}
                        step={prop === 'rot' ? 15 : 0.1}
                        change={(v) =>
                          commitRecipe((r) => {
                            const x = r.nodes.find((k) => k.id === curNode.id)
                            if (x) x[prop][ax] = v
                          })
                        }
                      />
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Quick UV Unwrap */}
          <div style={{ border: '1px solid #2b323b', borderRadius: 6, padding: 8, background: '#192028', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
            <Field label="UV Unwrap">
              <select value={recipe.uvMode} onChange={(e) => commitRecipe((r) => (r.uvMode = e.target.value as UvMode))}>
                <option value="box">Box / Triplanar</option>
                <option value="planar">Planar (Top-Down)</option>
                <option value="cylindrical">Cylindrical</option>
              </select>
            </Field>
            <Field label="UV Scale">
              <Numeric label="UV Scale" value={recipe.uvScale} min={0.1} max={10} step={0.1} change={(v) => commitRecipe((r) => (r.uvScale = v))} />
            </Field>
          </div>

          {/* Unlimited Material Slots with Procedural Pattern + Project Material Link */}
          <div style={{ border: '1px solid #2b323b', borderRadius: 6, padding: 8, background: '#192028', display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 11.5, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                <Layers size={12} /> Material Slots ({recipe.slots.length})
              </span>
              <button
                type="button"
                className="mf-btn"
                style={{ fontSize: 11 }}
                onClick={() =>
                  commitRecipe((r) => {
                    r.slots.push({
                      name: `Material ${r.slots.length + 1}`,
                      color: '#7c8a99',
                      roughness: 0.8,
                      metalness: 0,
                      pattern: 'concrete',
                    })
                  })
                }
              >
                <Plus size={11} /> Add Material
              </button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {recipe.slots.map((sl, idx) => (
                <div
                  key={idx}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '20px 1fr 82px 104px 40px 20px',
                    gap: 4,
                    alignItems: 'center',
                    padding: '4px 6px',
                    borderRadius: 4,
                    border: brushSlot === idx ? '1px solid #f3a05d' : '1px solid #28303a',
                    background: brushSlot === idx ? 'rgba(243,160,93,0.12)' : '#141920',
                  }}
                >
                  <button
                    type="button"
                    onClick={() => { setBrushSlot(idx); setToolMode('paint'); setPaintMode('material') }}
                    style={{ width: 18, height: 18, borderRadius: 4, background: sl.color, border: '1px solid #fff', cursor: 'pointer' }}
                    title={`Paint with Material Slot #${idx}`}
                  />
                  <input
                    style={{ fontSize: 11.5 }}
                    value={sl.name}
                    onChange={(e) => commitRecipe((r) => (r.slots[idx].name = e.target.value))}
                  />
                  <select
                    style={{ fontSize: 10.5 }}
                    title="Procedural brush surface pattern"
                    value={sl.pattern || 'concrete'}
                    onChange={(e) => commitRecipe((r) => (r.slots[idx].pattern = e.target.value as MaterialPattern))}
                  >
                    <option value="concrete">Concrete</option>
                    <option value="wood">Wood</option>
                    <option value="rust">Rust</option>
                    <option value="brick">Brick</option>
                    <option value="moss">Moss</option>
                    <option value="solid">Solid</option>
                  </select>
                  <select
                    style={{ fontSize: 10.5 }}
                    value={sl.materialId || ''}
                    onChange={(e) => commitRecipe((r) => (r.slots[idx].materialId = e.target.value || undefined))}
                  >
                    <option value="">Procedural</option>
                    {matAssets.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                  <Color label={`Slot ${idx}`} value={sl.color} change={(v) => commitRecipe((r) => (r.slots[idx].color = v))} />
                  {recipe.slots.length > 1 ? (
                    <button
                      type="button"
                      className="mf-bp-icon-btn"
                      title="Delete material slot"
                      onClick={() =>
                        commitRecipe((r) => {
                          r.slots.splice(idx, 1)
                          for (const nd of r.nodes) {
                            if (nd.slot >= r.slots.length) nd.slot = Math.max(0, r.slots.length - 1)
                          }
                        })
                      }
                    >
                      <Trash2 size={11} />
                    </button>
                  ) : (
                    <span />
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
