import type { Entity } from '../../project-schema/src'

/** Network Sync field paths: properties.hp, components.light.intensity,
 * components.light[1].color, components.behavior.params.speed.
 * TypeScript/script/asset definitions are intentionally not remotely writable. */
const segment = /^[a-zA-Z_][a-zA-Z0-9_-]{0,63}$/
const unsafe = new Set(['__proto__', 'prototype', 'constructor'])
const immutable = new Set(['type', 'id', 'asset', 'script', 'code', 'data', 'shader', 'enabled'])
const componentHead = /^components\.([a-zA-Z_][a-zA-Z0-9_-]{0,63})(?:\[(\d{1,2})\])?\.(.+)$/
export const MAX_SYNC_PATHS = 32

export function validSyncPath(path: string): boolean {
  if (!path || path.length > 180) return false
  const head = path.match(componentHead)
  const parts = head ? head[3].split('.') : path.startsWith('properties.') ? path.slice(11).split('.') : []
  if (!parts.length || parts.length > 6 || parts.some(p => !segment.test(p) || unsafe.has(p))) return false
  if (head) {
    if (['networkSync', 'script', 'eventGraph', 'rule'].includes(head[1])) return false
    if (immutable.has(parts[0])) return false
    return true
  }
  return path.startsWith('properties.')
}

export function syncPaths(component: { type?: string; syncPaths?: string; syncKeys?: string }): string[] {
  const requested = String(component.syncPaths || '').split(',').map(v => v.trim())
  const legacy = String(component.syncKeys || '').split(',').map(v => v.trim()).filter(Boolean)
    .map(v => v.startsWith('properties.') ? v : `properties.${v}`)
  return [...new Set([...requested, ...legacy].filter(validSyncPath))].slice(0, MAX_SYNC_PATHS)
}

function resolve(entity: Entity, path: string): { root: Record<string, any>; keys: string[] } | undefined {
  if (!validSyncPath(path)) return
  if (path.startsWith('properties.')) return { root: entity.properties || (entity.properties = {}), keys: path.slice(11).split('.') }
  const match = path.match(componentHead)
  if (!match) return
  const list = entity.components.filter(c => c.type === match[1])
  const item = list[Number(match[2] || 0)]
  return item ? { root: item, keys: match[3].split('.') } : undefined
}

export function readSyncPath(entity: Entity, path: string): unknown {
  const resolved = resolve(entity, path)
  if (!resolved) return undefined
  let value: any = resolved.root
  for (const part of resolved.keys) {
    if (!value || typeof value !== 'object' || !Object.prototype.hasOwnProperty.call(value, part)) return undefined
    value = value[part]
  }
  return value
}

/** Never sync functions, prototypes, huge objects, NaN or cyclic data. */
export function safeSyncValue(value: unknown): unknown | undefined {
  if (value === undefined) return undefined
  const finiteInput = (v: any, depth: number): boolean => {
    if (depth > 6) return false
    if (typeof v === 'number') return Number.isFinite(v)
    if (typeof v === 'function' || typeof v === 'symbol' || typeof v === 'bigint') return false
    if (Array.isArray(v)) return v.length <= 128 && v.every(x => finiteInput(x, depth + 1))
    if (v && typeof v === 'object') return Object.keys(v).length <= 64 && Object.entries(v).every(([k, x]) => !unsafe.has(k) && finiteInput(x, depth + 1))
    return true
  }
  if (!finiteInput(value, 0)) return undefined
  try {
    const raw = JSON.stringify(value)
    if (!raw || raw.length > 4096) return undefined
    const clean = JSON.parse(raw)
    const valid = (v: any, depth: number): boolean => {
      if (depth > 6) return false
      if (v === null || typeof v === 'boolean' || typeof v === 'string') return true
      if (typeof v === 'number') return Number.isFinite(v)
      if (Array.isArray(v)) return v.length <= 128 && v.every(x => valid(x, depth + 1))
      if (!v || typeof v !== 'object' || Object.keys(v).length > 64) return false
      return Object.entries(v).every(([k, x]) => segment.test(k) && !unsafe.has(k) && valid(x, depth + 1))
    }
    return valid(clean, 0) ? clean : undefined
  } catch { return undefined }
}

export function writeSyncPath(entity: Entity, path: string, value: unknown): boolean {
  const resolved = resolve(entity, path), clean = safeSyncValue(value)
  if (!resolved || clean === undefined) return false
  let obj = resolved.root
  for (const key of resolved.keys.slice(0, -1)) {
    if (!Object.prototype.hasOwnProperty.call(obj, key)) return false // no arbitrary object graph construction
    const child = obj[key]
    if (!child || Array.isArray(child) || typeof child !== 'object') return false
    obj = child
  }
  const last = resolved.keys[resolved.keys.length - 1]
  if (JSON.stringify(obj[last]) === JSON.stringify(clean)) return false
  obj[last] = clean
  return true
}
