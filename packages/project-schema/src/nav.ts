import type { Component, Scene, Transform, Vec3 } from './index'
import { sampleTerrainGridHeight, type Terrain } from './terrain'

export interface NavLink {
  id: string
  from: Vec3
  to: Vec3
  bidirectional?: boolean
  cost?: number
  enabled?: boolean
}

export interface NavZone extends Component {
  type: 'navZone'
  size: [number, number]
  cellSize: number
  agentRadius: number
  maxSlope: number
  stepHeight: number
  cols: number
  rows: number
  /** 0 = blocked, 1 = normal walkable, 2..10 = higher traversal cost (mud, snow, etc.). */
  walkable: number[]
  heights: number[]
  links?: NavLink[]
  showOverlay?: boolean
}

export function makeNavZone(size: [number, number] = [24, 24], cellSize = 0.75): NavZone {
  const cols = Math.max(4, Math.min(160, Math.round(size[0] / cellSize)))
  const rows = Math.max(4, Math.min(160, Math.round(size[1] / cellSize)))
  return {
    type: 'navZone',
    size: [...size],
    cellSize,
    agentRadius: 0.35,
    maxSlope: 42,
    stepHeight: 0.65,
    cols,
    rows,
    walkable: Array(cols * rows).fill(1),
    heights: Array(cols * rows).fill(0),
    links: [],
    showOverlay: true,
  }
}

export function navCellToWorld(zone: NavZone, tr: Transform | undefined, col: number, row: number): Vec3 {
  const px = tr?.position[0] ?? 0
  const py = tr?.position[1] ?? 0
  const pz = tr?.position[2] ?? 0
  const wx = px - zone.size[0] * 0.5 + (col + 0.5) * (zone.size[0] / Math.max(1, zone.cols))
  const wz = pz - zone.size[1] * 0.5 + (row + 0.5) * (zone.size[1] / Math.max(1, zone.rows))
  const idx = row * zone.cols + col
  const wy = zone.heights[idx] ?? py
  return [wx, wy, wz]
}

export function worldToNavCell(zone: NavZone, tr: Transform | undefined, pos: Vec3): [number, number] {
  const px = tr?.position[0] ?? 0
  const pz = tr?.position[2] ?? 0
  const u = (pos[0] - (px - zone.size[0] * 0.5)) / Math.max(0.01, zone.size[0])
  const v = (pos[2] - (pz - zone.size[1] * 0.5)) / Math.max(0.01, zone.size[1])
  const col = Math.max(0, Math.min(zone.cols - 1, Math.floor(u * zone.cols)))
  const row = Math.max(0, Math.min(zone.rows - 1, Math.floor(v * zone.rows)))
  return [col, row]
}

export function bakeNavZone(
  zone: NavZone,
  zoneTransform: Transform | undefined,
  scene: Scene,
): { walkableCount: number; blockedCount: number; total: number } {
  const cellSize = Math.max(0.25, Math.min(4, Number(zone.cellSize || 0.75)))
  const cols = Math.max(4, Math.min(160, Math.round(zone.size[0] / cellSize)))
  const rows = Math.max(4, Math.min(160, Math.round(zone.size[1] / cellSize)))
  zone.cols = cols
  zone.rows = rows
  const total = cols * rows
  const walkable = new Array<number>(total).fill(1)
  const heights = new Array<number>(total).fill(zoneTransform?.position[1] ?? 0)

  const terrains = scene.entities
    .filter((e) => e.active)
    .map((e) => ({ entity: e, terrain: e.components.find((c) => c.type === 'terrain' && c.enabled !== false) as Terrain | undefined }))
    .filter((x): x is { entity: (typeof scene.entities)[number]; terrain: Terrain } => Boolean(x.terrain))

  const obstacles = scene.entities
    .filter((e) => e.active)
    .map((e) => {
      const col = e.components.find((c) => c.type === 'collider' && c.enabled !== false && !c.trigger)
      const body = e.components.find((c) => c.type === 'body' && c.enabled !== false)
      const isPlayerOrNpc = e.components.some(
        (c) => c.type === 'navAgent' || (c.type === 'behavior' && ['player', 'first-person', 'npc'].includes(c.kind)),
      )
      if (!col || isPlayerOrNpc || (body && body.kind === 'dynamic')) return null
      const size = Array.isArray(col.size) ? col.size : e.transform.scale
      return {
        x: e.transform.position[0],
        y: e.transform.position[1],
        z: e.transform.position[2],
        hx: Math.abs(size[0] ?? 1) * 0.5,
        hy: Math.abs(size[1] ?? 1) * 0.5,
        hz: Math.abs(size[2] ?? 1) * 0.5,
      }
    })
    .filter((x): x is NonNullable<typeof x> => Boolean(x))

  const agentR = Math.max(0.05, Number(zone.agentRadius ?? 0.35))
  const maxTan = Math.tan(((zone.maxSlope ?? 42) * Math.PI) / 180)
  const stepH = Math.max(0.1, Number(zone.stepHeight ?? 0.65))
  const px = zoneTransform?.position[0] ?? 0
  const py = zoneTransform?.position[1] ?? 0
  const pz = zoneTransform?.position[2] ?? 0
  const cw = zone.size[0] / cols
  const ch = zone.size[1] / rows

  let walkableCount = 0
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const idx = r * cols + c
      const wx = px - zone.size[0] * 0.5 + (c + 0.5) * cw
      const wz = pz - zone.size[1] * 0.5 + (r + 0.5) * ch
      let groundY = py
      let slopeBlocked = false

      for (const { entity, terrain } of terrains) {
        const tp = entity.transform.position
        const ts = entity.transform.scale
        const lx = (wx - tp[0]) / (ts[0] || 1)
        const lz = (wz - tp[2]) / (ts[2] || 1)
        const half = terrain.size * 0.5
        if (lx >= -half && lx <= half && lz >= -half && lz <= half) {
          const gx = (lx / terrain.size + 0.5) * terrain.segments
          const gz = (lz / terrain.size + 0.5) * terrain.segments
          const h0 = sampleTerrainGridHeight(terrain, gx, gz) * (ts[1] || 1)
          const hx = sampleTerrainGridHeight(terrain, gx + 0.5, gz) * (ts[1] || 1)
          const hz = sampleTerrainGridHeight(terrain, gx, gz + 0.5) * (ts[1] || 1)
          const cellWorld = (terrain.size / terrain.segments) * 0.5
          const slope = Math.hypot((hx - h0) / Math.max(0.05, cellWorld), (hz - h0) / Math.max(0.05, cellWorld))
          groundY = tp[1] + h0
          if (slope > maxTan) slopeBlocked = true
        }
      }

      heights[idx] = Math.round(groundY * 100) / 100
      if (slopeBlocked) {
        walkable[idx] = 0
        continue
      }

      let blocked = false
      for (const ob of obstacles) {
        if (Math.abs(wx - ob.x) <= ob.hx + agentR && Math.abs(wz - ob.z) <= ob.hz + agentR) {
          const obBottom = ob.y - ob.hy
          const obTop = ob.y + ob.hy
          // Obstacle blocks agent if it occupies vertical clearance above ground + stepHeight
          if (obTop > groundY + stepH && obBottom < groundY + 1.8) {
            blocked = true
            break
          }
        }
      }
      walkable[idx] = blocked ? 0 : 1
      if (!blocked) walkableCount++
    }
  }

  zone.walkable = walkable
  zone.heights = heights
  return { walkableCount, blockedCount: total - walkableCount, total }
}

function findNearestWalkable(zone: NavZone, col: number, row: number): [number, number] | null {
  const { cols, rows, walkable } = zone
  if (walkable[row * cols + col] > 0) return [col, row]
  for (let rad = 1; rad <= 6; rad++) {
    for (let dz = -rad; dz <= rad; dz++) {
      for (let dx = -rad; dx <= rad; dx++) {
        if (Math.abs(dx) !== rad && Math.abs(dz) !== rad) continue
        const nc = col + dx, nr = row + dz
        if (nc >= 0 && nc < cols && nr >= 0 && nr < rows && walkable[nr * cols + nc] > 0) {
          return [nc, nr]
        }
      }
    }
  }
  return null
}

function lineOfSight(zone: NavZone, c0: number, r0: number, c1: number, r1: number): boolean {
  let x0 = c0, y0 = r0
  const dx = Math.abs(c1 - c0), dy = Math.abs(r1 - r0)
  const sx = c0 < c1 ? 1 : -1, sy = r0 < r1 ? 1 : -1
  let err = dx - dy
  const stepH = Math.max(0.1, Number(zone.stepHeight ?? 0.65))
  let prevH = zone.heights[y0 * zone.cols + x0] ?? 0
  while (true) {
    const idx = y0 * zone.cols + x0
    if (!zone.walkable[idx] || zone.walkable[idx] > 1) return false
    const curH = zone.heights[idx] ?? prevH
    if (Math.abs(curH - prevH) > stepH) return false
    prevH = curH
    if (x0 === c1 && y0 === r1) return true
    const e2 = 2 * err
    if (e2 > -dy) { err -= dy; x0 += sx }
    if (e2 < dx) { err += dx; y0 += sy }
  }
}

export function findNavPath(
  zone: NavZone,
  zoneTransform: Transform | undefined,
  start: Vec3,
  goal: Vec3,
  opts?: { smooth?: boolean; maxIterations?: number },
): Vec3[] {
  const { cols, rows, walkable, heights } = zone
  if (!cols || !rows || walkable.length !== cols * rows) return []
  const rawS = worldToNavCell(zone, zoneTransform, start)
  const rawG = worldToNavCell(zone, zoneTransform, goal)
  const sCell = findNearestWalkable(zone, rawS[0], rawS[1])
  const gCell = findNearestWalkable(zone, rawG[0], rawG[1])
  if (!sCell || !gCell) return []

  const startIdx = sCell[1] * cols + sCell[0]
  const goalIdx = gCell[1] * cols + gCell[0]
  if (startIdx === goalIdx) return [navCellToWorld(zone, zoneTransform, gCell[0], gCell[1])]

  // Map off-mesh links to grid cells
  const linkEdges = new Map<number, { to: number; cost: number }[]>()
  for (const lnk of zone.links ?? []) {
    if (lnk.enabled === false) continue
    const a = findNearestWalkable(zone, ...worldToNavCell(zone, zoneTransform, lnk.from))
    const b = findNearestWalkable(zone, ...worldToNavCell(zone, zoneTransform, lnk.to))
    if (!a || !b) continue
    const ia = a[1] * cols + a[0], ib = b[1] * cols + b[0]
    const cost = Math.max(0.5, Number(lnk.cost ?? 1.5))
    if (!linkEdges.has(ia)) linkEdges.set(ia, [])
    linkEdges.get(ia)!.push({ to: ib, cost })
    if (lnk.bidirectional !== false) {
      if (!linkEdges.has(ib)) linkEdges.set(ib, [])
      linkEdges.get(ib)!.push({ to: ia, cost })
    }
  }

  const total = cols * rows
  const gScore = new Float32Array(total).fill(Infinity)
  const cameFrom = new Int32Array(total).fill(-1)
  const closed = new Uint8Array(total)
  gScore[startIdx] = 0

  // Lightweight binary min-heap of [fScore, cellIdx]
  const heapF: number[] = [Math.hypot(gCell[0] - sCell[0], gCell[1] - sCell[1])]
  const heapI: number[] = [startIdx]
  const push = (f: number, i: number) => {
    let k = heapF.length
    heapF.push(f); heapI.push(i)
    while (k > 0) {
      const p = (k - 1) >> 1
      if (heapF[p] <= heapF[k]) break
      ;[heapF[p], heapF[k]] = [heapF[k], heapF[p]]
      ;[heapI[p], heapI[k]] = [heapI[k], heapI[p]]
      k = p
    }
  }
  const pop = () => {
    const top = heapI[0]
    const lastF = heapF.pop()!, lastI = heapI.pop()!
    if (heapF.length) {
      heapF[0] = lastF; heapI[0] = lastI
      let k = 0
      const len = heapF.length
      while (true) {
        let best = k
        const l = k * 2 + 1, r = l + 1
        if (l < len && heapF[l] < heapF[best]) best = l
        if (r < len && heapF[r] < heapF[best]) best = r
        if (best === k) break
        ;[heapF[k], heapF[best]] = [heapF[best], heapF[k]]
        ;[heapI[k], heapI[best]] = [heapI[best], heapI[k]]
        k = best
      }
    }
    return top
  }

  const dirs = [
    [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
    [1, 1, 1.4142], [-1, 1, 1.4142], [1, -1, 1.4142], [-1, -1, 1.4142],
  ]
  const stepH = Math.max(0.1, Number(zone.stepHeight ?? 0.65))
  const maxIter = opts?.maxIterations ?? 4000
  let iter = 0
  let found = false

  while (heapI.length && iter++ < maxIter) {
    const cur = pop()
    if (cur === goalIdx) { found = true; break }
    if (closed[cur]) continue
    closed[cur] = 1
    const cx = cur % cols, cy = Math.floor(cur / cols)
    const curH = heights[cur] ?? 0

    for (const [dx, dy, dist] of dirs) {
      const nx = cx + dx, ny = cy + dy
      if (nx < 0 || nx >= cols || ny < 0 || ny >= rows) continue
      const nIdx = ny * cols + nx
      const w = walkable[nIdx]
      if (!w || closed[nIdx]) continue
      // Prevent diagonal corner cutting
      if (dx !== 0 && dy !== 0 && (!walkable[cy * cols + nx] || !walkable[ny * cols + cx])) continue
      if (Math.abs((heights[nIdx] ?? curH) - curH) > stepH) continue
      const tentative = gScore[cur] + dist * w
      if (tentative < gScore[nIdx]) {
        gScore[nIdx] = tentative
        cameFrom[nIdx] = cur
        push(tentative + Math.hypot(gCell[0] - nx, gCell[1] - ny), nIdx)
      }
    }

    const extras = linkEdges.get(cur)
    if (extras) {
      for (const edge of extras) {
        if (closed[edge.to]) continue
        const tentative = gScore[cur] + edge.cost
        if (tentative < gScore[edge.to]) {
          gScore[edge.to] = tentative
          cameFrom[edge.to] = cur
          const tx = edge.to % cols, ty = Math.floor(edge.to / cols)
          push(tentative + Math.hypot(gCell[0] - tx, gCell[1] - ty), edge.to)
        }
      }
    }
  }

  if (!found) return []
  const cells: [number, number][] = []
  for (let cur = goalIdx; cur !== -1; cur = cameFrom[cur]) {
    cells.push([cur % cols, Math.floor(cur / cols)])
  }
  cells.reverse()

  if (opts?.smooth !== false && cells.length > 2) {
    const smoothed: [number, number][] = [cells[0]]
    let anchor = 0
    while (anchor < cells.length - 1) {
      let furthest = anchor + 1
      for (let i = cells.length - 1; i > anchor + 1; i--) {
        if (lineOfSight(zone, cells[anchor][0], cells[anchor][1], cells[i][0], cells[i][1])) {
          furthest = i
          break
        }
      }
      smoothed.push(cells[furthest])
      anchor = furthest
    }
    return smoothed.map(([c, r]) => navCellToWorld(zone, zoneTransform, c, r))
  }
  return cells.map(([c, r]) => navCellToWorld(zone, zoneTransform, c, r))
}

export function setNavAreaState(
  zone: NavZone,
  zoneTransform: Transform | undefined,
  center: Vec3,
  radius: number,
  value: number,
) {
  const { cols, rows, walkable } = zone
  const cw = zone.size[0] / Math.max(1, cols)
  const ch = zone.size[1] / Math.max(1, rows)
  const px = zoneTransform?.position[0] ?? 0
  const pz = zoneTransform?.position[2] ?? 0
  const v = Math.max(0, Math.min(10, Math.round(value)))
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const wx = px - zone.size[0] * 0.5 + (c + 0.5) * cw
      const wz = pz - zone.size[1] * 0.5 + (r + 0.5) * ch
      if (Math.hypot(wx - center[0], wz - center[2]) <= radius) {
        walkable[r * cols + c] = v
      }
    }
  }
}
