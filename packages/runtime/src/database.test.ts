import { expect, test } from 'vitest'
import { makeProject, type Asset } from '../../project-schema/src'
import { createDatabaseRuntime } from './database'
import { createDialogueRuntime } from './dialogue'
import type { GameAPI } from './types'

const asset: Asset = {
  type: 'db', id: 'items-id', name: 'Items', properties: {},
  data: '{"version":1,"columns":["info"],"rows":[{"id":"key","values":{"info":{"tags":["quest"],"hp":4}}}]}',
}

test('DB values are isolated and support typed CRUD and reset', () => {
  const events: unknown[][] = []
  const db = createDatabaseRuntime([asset], (...args) => events.push(args))
  expect(db.list()).toEqual(['Items'])
  expect(db.get('Items', 'key', 'info.hp')).toBe(4)
  expect(db.set('Items', 'key', ['new.field', 0], false)).toBe(true)
  expect(db.get('Items', 'key', ['new.field'])).toEqual([false])
  expect(db.set('Items', 'key', ['new.field', 5], false)).toBe(false)
  expect(db.set('Items', 'key', 'info.hp.value', 3)).toBe(false)
  expect(db.get('Items', 'key', 'info.hp')).toBe(4)
  expect(db.set('Items', 'next', 'value', null)).toBe(true)
  expect(db.has('Items', 'next', 'value')).toBe(true)
  expect(db.upsertRow('Items', 'next', { extra: 0 })).toBe(true)
  expect(db.has('Items', 'next', 'value')).toBe(false)
  db.rows('Items')[0].values.info = null
  expect(db.get('items-id', 'key', 'info.tags')).toEqual(['quest'])
  expect(db.delete('Items', 'key', 'info.tags.0')).toBe(true)
  expect(db.get('Items', 'key', 'info.tags')).toEqual([])
  expect(db.set('Items', 'key', ['__proto__', 'owned'], true)).toBe(true)
  expect(Object.hasOwn(Object.prototype, 'owned')).toBe(false)
  expect(db.removeRow('Items', 'next')).toBe(true)
  expect(db.reset('Items')).toBe(true)
  expect(db.rows('Items')).toEqual([{ id: 'key', values: { info: { tags: ['quest'], hp: 4 } } }])
  expect(events.at(-1)).toEqual(['db.changed', { db: 'Items', operation: 'reset' }])
})

test('a dialogue action writes JSON to the same runtime database by stable asset ID', () => {
  const project = makeProject()
  project.assets.push(asset, {
    id: 'talk', name: 'Talk', type: 'dialogue', properties: {},
    data: JSON.stringify({ title: 'Talk', nodes: [
      { id: 'action', type: 'action', actionKind: 'setDbValue', actionDbId: asset.id, actionDbRow: 'key',
        actionDbPath: 'info.hp', actionDbJson: '18', nextNodeId: 'end' },
      { id: 'end', type: 'end' },
    ] }),
  })
  const db = createDatabaseRuntime(project.assets, () => {})
  const api = { db, input: { setModal() {} }, events: { emit() {} } } as unknown as GameAPI
  expect(createDialogueRuntime(project, () => api).start('talk')).toBe(true)
  expect(db.get('Items', 'key', 'info.hp')).toBe(18)
})
