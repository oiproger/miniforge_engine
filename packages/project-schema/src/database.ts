export type DbValue = null | boolean | number | string | DbValue[] | { [key: string]: DbValue }
export type DbRecord = { [key: string]: DbValue }
export interface DbRow { id: string; values: DbRecord }
export interface DbAssetData { version: 1; columns: string[]; rows: DbRow[] }

export function isDbRecord(value: unknown): value is DbRecord {
  if (value === null || typeof value !== 'object') return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

export function isDbValue(value: unknown, ancestors = new Set<object>()): value is DbValue {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true
  if (typeof value === 'number') return Number.isFinite(value)
  if ((!Array.isArray(value) && !isDbRecord(value)) || ancestors.has(value)) return false
  ancestors.add(value)
  const values = Object.values(value)
  const valid = (!Array.isArray(value) || (values.length === value.length && Object.keys(value).every((key, i) => key === String(i)))) &&
    values.every(child => isDbValue(child, ancestors))
  ancestors.delete(value)
  return valid
}

export function parseDbAsset(raw: string): DbAssetData {
  const value = JSON.parse(raw) as DbAssetData
  if (!value || value.version !== 1 || !Array.isArray(value.columns) || !Array.isArray(value.rows)) {
    throw new Error('Expected a version 1 database with columns and rows.')
  }
  const columns = new Set<string>()
  for (const column of value.columns) {
    if (typeof column !== 'string' || !column.trim() || columns.has(column)) throw new Error('Column names must be nonempty and unique.')
    columns.add(column)
  }
  const ids = new Set<string>()
  for (const row of value.rows) {
    if (!row || typeof row.id !== 'string' || !row.id.trim() || ids.has(row.id) || !isDbRecord(row.values) || !isDbValue(row.values)) {
      throw new Error('Rows must have unique IDs and JSON objects.')
    }
    ids.add(row.id)
    for (const key of Object.keys(row.values)) {
      if (!columns.has(key)) throw new Error('Missing column for field ' + key)
    }
  }
  return value
}

export function dbNameProblem(assets: readonly { id: string; type: string; name: string }[], id: string, name: string): string {
  if (!name.trim()) return 'Enter a database name.'
  return assets.some(a => a.type === 'db' && a.id !== id && (a.name.trim() === name.trim() || a.id === name.trim() || a.name.trim() === id))
    ? 'Database names must be unique.'
    : ''
}

export function writeDbField(record: DbRecord, key: string, value: DbValue) {
  Object.defineProperty(record, key, { value, enumerable: true, configurable: true, writable: true })
}

/** Decode a JSON literal entered in an editor, including strings and null. */
export function parseDbJson(literal: string): DbValue | undefined {
  try {
    const value: unknown = JSON.parse(literal)
    return isDbValue(value) ? value : undefined
  } catch { return undefined }
}

/** Decode an editor path. A JSON array can address field names containing dots. */
export function parseDbPathText(text: string): string | (string | number)[] | undefined {
  if (!text.trim()) return undefined
  if (!text.trimStart().startsWith('[')) return text
  const value = parseDbJson(text)
  return Array.isArray(value) && value.length && value.every(
    (part): part is string | number => typeof part === 'string' || (typeof part === 'number' && Number.isSafeInteger(part)),
  ) ? value : undefined
}
