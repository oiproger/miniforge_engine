import { useMemo, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { parseDbJson, parseDbAsset, writeDbField, type Asset, type DbAssetData } from '../../../packages/project-schema/src'
import { Field } from './Fields'

type Draft =
  | { kind: 'cell'; row: string; column: string; text: string }
  | { kind: 'row' | 'column'; key: string; text: string }

function nextKey(prefix: string, used: string[]) {
  let number = 1
  while (used.includes(prefix + number)) number++
  return prefix + number
}

export function DbEditor({ asset, changeAsset, onEditing }: {
  asset: Asset
  changeAsset: (fn: (asset: Asset) => void) => void
  onEditing: (editing: boolean) => void
}) {
  const db = useMemo(() => parseDbAsset(asset.data), [asset.data])
  const [draft, setDraft] = useState<Draft>()
  const [error, setError] = useState('')
  const update = (fn: (db: DbAssetData) => void) => changeAsset(current => {
    const next = parseDbAsset(current.data)
    fn(next)
    current.data = JSON.stringify(next)
  })
  const edit = (value?: Draft) => {
    setDraft(value)
    setError('')
    onEditing(Boolean(value))
  }

  function apply() {
    if (!draft) return
    if (draft.kind === 'cell') {
      const value = parseDbJson(draft.text)
      if (value === undefined) { setError('Enter a valid JSON value. Put quotation marks around text.'); return }
      update(next => {
        const row = next.rows.find(row => row.id === draft.row)
        if (row) writeDbField(row.values, draft.column, value)
      })
    } else {
      const name = draft.text.trim()
      const keys = draft.kind === 'row' ? db.rows.map(row => row.id) : db.columns
      if (!name || (name !== draft.key && keys.includes(name))) {
        setError('Enter a unique, nonempty name.')
        return
      }
      if (name !== draft.key) update(next => {
        if (draft.kind === 'row') {
          const row = next.rows.find(row => row.id === draft.key)
          if (row) row.id = name
        } else {
          next.columns[next.columns.indexOf(draft.key)] = name
          for (const { values } of next.rows) {
            if (!Object.hasOwn(values, draft.key)) continue
            writeDbField(values, name, values[draft.key])
            delete values[draft.key]
          }
        }
      })
    }
    edit()
  }

  function clearCell() {
    if (draft?.kind !== 'cell') return
    update(next => {
      const row = next.rows.find(row => row.id === draft.row)
      if (row) delete row.values[draft.column]
    })
    edit()
  }

  return (
    <div className="mf-db-editor">
      <div className="mf-db-actions">
        <button type="button" className="mf-btn" disabled={Boolean(draft)} onClick={() => update(next => {
          next.columns.push(nextKey('field_', next.columns))
        })}><Plus size={14} /> Add column</button>
        <button type="button" className="mf-btn" disabled={Boolean(draft)} onClick={() => update(next => {
          next.rows.push({ id: nextKey('row_', next.rows.map(row => row.id)), values: {} })
        })}><Plus size={14} /> Add row</button>
        <small>{db.rows.length} rows · {db.columns.length} columns</small>
      </div>
      {draft && (
        <div className="mf-db-draft">
          {draft.kind === 'cell'
            ? <Field label={draft.row + ' / ' + draft.column + ' (JSON)'}>
                <textarea autoFocus aria-label={draft.row + ' / ' + draft.column + ' (JSON)'} rows={4} value={draft.text} onChange={ev => setDraft({ ...draft, text: ev.target.value })} />
              </Field>
            : <Field label={draft.kind === 'row' ? 'Row ID' : 'Column name'}>
                <input autoFocus value={draft.text} onChange={ev => setDraft({ ...draft, text: ev.target.value })} />
              </Field>}
          {error && <div className="mf-error" role="alert">{error}</div>}
          <div className="mf-db-actions">
            <button type="button" className="mf-primary" onClick={apply}>Apply</button>
            {draft.kind === 'cell' && <button type="button" className="mf-btn" onClick={clearCell}>Clear cell</button>}
            <button type="button" className="mf-btn" onClick={() => edit()}>Cancel edit</button>
          </div>
        </div>
      )}
      <div className="mf-db-grid">
        <table aria-label="Database rows">
          <thead><tr>
            <th scope="col">Row ID</th>
            {db.columns.map(column => (
              <th key={column} scope="col">
                <button type="button" disabled={Boolean(draft)} aria-label={'Rename column ' + column} onClick={() => edit({ kind: 'column', key: column, text: column })}>{column}</button>
                <button type="button" disabled={Boolean(draft)} title="Remove column and its values" aria-label={'Remove column ' + column} onClick={() => update(next => {
                  next.columns = next.columns.filter(key => key !== column)
                  for (const { values } of next.rows) delete values[column]
                })}><Trash2 size={13} /></button>
              </th>
            ))}
          </tr></thead>
          <tbody>
            {db.rows.map(row => (
              <tr key={row.id}>
                <th scope="row">
                  <button type="button" disabled={Boolean(draft)} aria-label={'Rename row ' + row.id} onClick={() => edit({ kind: 'row', key: row.id, text: row.id })}>{row.id}</button>
                  <button type="button" disabled={Boolean(draft)} aria-label={'Remove row ' + row.id} onClick={() => update(next => {
                    next.rows = next.rows.filter(item => item.id !== row.id)
                  })}><Trash2 size={13} /></button>
                </th>
                {db.columns.map(column => {
                  const value = Object.hasOwn(row.values, column) ? JSON.stringify(row.values[column]) : undefined
                  return <td key={column}>
                    <button type="button" className="mf-db-cell" disabled={Boolean(draft)}
                      aria-label={'Edit ' + row.id + ' / ' + column} title={value}
                      onClick={() => edit({ kind: 'cell', row: row.id, column, text: value ?? 'null' })}>{value ?? '—'}</button>
                  </td>
                })}
              </tr>
            ))}
          </tbody>
        </table>
        {!db.rows.length && <p>Add a row to enter data.</p>}
      </div>
    </div>
  )
}
