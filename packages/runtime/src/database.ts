import { isDbRecord, isDbValue, parseDbAsset, writeDbField, type Asset, type DbRecord, type DbRow, type DbValue } from '../../project-schema/src'

/** A path of field names or array indices. Use segments for field names that contain dots. */
export type DbPath = string | readonly (string | number)[]

export interface DbAPI {
  /** List the names of all databases included in this game. */
  list(): string[]
  /** Return a snapshot of every row in the database. */
  rows(db: string): DbRow[]
  /** Read a row or one of its fields. Missing values return undefined. */
  get(db: string, row: string, path?: DbPath): DbValue | undefined
  /** Check if a row or field exists. A stored null counts as present. */
  has(db: string, row: string, path?: DbPath): boolean
  /** Set a field on a row, creating the row and missing containers as needed. */
  set(db: string, row: string, path: DbPath, value: DbValue): boolean
  /** Remove a field from a row. An array element is removed with splice. */
  delete(db: string, row: string, path: DbPath): boolean
  /** Insert or replace a row using a JSON object. */
  upsertRow(db: string, row: string, values: DbRecord): boolean
  /** Remove a row from this game session. */
  removeRow(db: string, row: string): boolean
  /** Restore this database to its original asset data. */
  reset(db: string): boolean
}

function segments(path: DbPath): string[] | undefined {
  if (typeof path === 'string') return path ? path.split('.') : []
  if (Array.isArray(path) && path.every(key => typeof key === 'string' || Number.isSafeInteger(key))) {
    return path.map(String)
  }
}
function index(key: string) {
  return /^(0|[1-9]\d*)$/.test(key) ? Number(key) : -1
}
function read(value: DbValue | undefined, key: string): DbValue | undefined {
  if (Array.isArray(value)) {
    const offset = index(key)
    return offset < 0 ? undefined : value[offset]
  }
  return isDbRecord(value) && Object.hasOwn(value, key) ? value[key] : undefined
}
function write(value: DbValue, key: string, child: DbValue) {
  if (Array.isArray(value)) {
    const offset = index(key)
    if (offset < 0 || offset > value.length) return false
    value[offset] = child
    return true
  }
  if (!isDbRecord(value)) return false
  writeDbField(value, key, child)
  return true
}

export function createDatabaseRuntime(assets: readonly Asset[], emit: (name: string, payload: unknown) => void): DbAPI {
  const databases = new Map(assets.filter(asset => asset.type === 'db').map(asset => {
    const initial = parseDbAsset(asset.data).rows
    return [asset.id, { name: asset.name.trim(), initial, rows: new Map(initial.map(row => [row.id, row.values])) }]
  }))
  const names = new Map([...databases].map(([id, db]) => [db.name, id]))
  const find = (key: string) => databases.get(key) ?? databases.get(names.get(key.trim()) ?? '')
  const changed = (db: string, operation: string, row?: string, path?: DbPath) => {
    emit('db.changed', { db, operation, row, path })
    return true
  }
  const get = (db: string, row: string, path: DbPath = '') =>
    segments(path)?.reduce<DbValue | undefined>(read, find(db)?.rows.get(row))

  return {
    list: () => [...names.keys()],
    rows: db => [...(find(db)?.rows ?? [])].map(([id, values]) => ({ id, values: structuredClone(values) })),
    get: (db, row, path) => structuredClone(get(db, row, path)),
    has: (db, row, path) => get(db, row, path) !== undefined,
    set(db, row, path, value) {
      const target = find(db)
      const keys = segments(path)
      if (!target || !row.trim() || !keys?.length || !isDbValue(value)) return false
      const values = structuredClone(target.rows.get(row) ?? {})
      let parent: DbValue = values
      for (let i = 0; i < keys.length - 1; i++) {
        const key = keys[i]
        let child = read(parent, key)
        if (child === undefined) {
          child = index(keys[i + 1]) >= 0 ? [] : {}
          if (!write(parent, key, child)) return false
        }
        parent = child
      }
      if (!write(parent, keys[keys.length - 1], structuredClone(value))) return false
      target.rows.set(row, values)
      return changed(target.name, 'set', row, path)
    },
    delete(db, row, path) {
      const target = find(db)
      const previous = target?.rows.get(row)
      const keys = segments(path)
      const last = keys?.pop()
      if (!target || !previous || !keys || last === undefined) return false
      const values = structuredClone(previous)
      const parent = keys.reduce<DbValue | undefined>(read, values)
      if (read(parent, last) === undefined) return false
      if (Array.isArray(parent)) parent.splice(index(last), 1)
      else if (isDbRecord(parent)) delete parent[last]
      target.rows.set(row, values)
      return changed(target.name, 'delete', row, path)
    },
    upsertRow(db, row, values) {
      const target = find(db)
      if (!target || !row.trim() || !isDbRecord(values) || !isDbValue(values)) return false
      target.rows.set(row, structuredClone(values))
      return changed(target.name, 'upsertRow', row)
    },
    removeRow(db, row) {
      const target = find(db)
      return Boolean(target?.rows.delete(row) && changed(target.name, 'removeRow', row))
    },
    reset(db) {
      const target = find(db)
      if (!target) return false
      target.rows = new Map(target.initial.map(row => [row.id, row.values]))
      return changed(target.name, 'reset')
    },
  }
}
