import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import type { Project, Component } from '../../../packages/project-schema/src'
import { getScene } from '../../../packages/project-schema/src'
import { Field, Color, Numeric } from './Fields'
const defaults = {
  number: 0,
  boolean: false,
  string: '',
  color: '#ffffff',
  vector: [0, 0, 0],
  entity: '',
  asset: '',
}
export default function ScriptParams({
  project,
  component,
  change,
}: {
  project: Project
  component: Component
  change: (fields: Partial<Component>) => void
}) {
  const [name, setName] = useState(''),
    [kind, setKind] = useState<keyof typeof defaults>('number')
  const params = component.params ?? {},
    types = component.paramTypes ?? {}
  const update = (key: string, value: unknown) => change({ params: { ...params, [key]: value } })
  const add = () => {
    const key = name.trim()
    if (!key || Object.hasOwn(params, key)) return
    change({ params: { ...params, [key]: defaults[kind] }, paramTypes: { ...types, [key]: kind } })
    setName('')
  }
  return (
    <>
      {Object.entries(params).map(([key, v]) => {
        const type = types[key] ?? typeof v
        return (
          <div key={key}>
            <Field label={key}>
              {type === 'number' ? (
                <Numeric label={key} value={Number(v)} change={(n) => update(key, n)} />
              ) : type === 'boolean' ? (
                <input type="checkbox" checked={!!v} onChange={(e) => update(key, e.target.checked)} />
              ) : type === 'color' ? (
                <Color label={key} value={String(v)} change={(s) => update(key, s)} />
              ) : type === 'vector' ? (
                <div className="mf-pair">
                  {(v as number[]).map((n, i) => (
                    <Numeric
                      key={i}
                      label={key + ' ' + i}
                      value={n}
                      change={(num) =>
                        update(
                          key,
                          (v as number[]).map((x, j) => (i === j ? num : x)),
                        )
                      }
                    />
                  ))}
                </div>
              ) : type === 'asset' || type === 'entity' ? (
                <select value={String(v)} onChange={(e) => update(key, e.target.value)}>
                  <option value="">Select…</option>
                  {(type === 'entity' ? getScene(project).entities : project.assets).map((row) => (
                    <option value={row.id} key={row.id}>
                      {row.name}
                    </option>
                  ))}
                </select>
              ) : (
                <input value={String(v)} onChange={(e) => update(key, e.target.value)} />
              )}
            </Field>
            <button
              className="mf-text-action"
              title={'Remove ' + key}
              onClick={() => {
                const values = { ...params },
                  kinds = { ...types }
                delete values[key]
                delete kinds[key]
                change({ params: values, paramTypes: kinds })
              }}
            >
              <Trash2 size={11} />
              Remove {key}
            </button>
          </div>
        )
      })}
      <Field label="Parameter">
        <input placeholder="New parameter name" value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <div className="mf-row">
        <select
          aria-label="Parameter type"
          value={kind}
          onChange={(e) => setKind(e.target.value as typeof kind)}
        >
          {Object.keys(defaults).map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
        <button disabled={!name.trim() || Object.hasOwn(params, name.trim())} onClick={add}>
          <Plus size={12} />
          Add
        </button>
      </div>
    </>
  )
}
