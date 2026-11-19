import { useEffect, useState } from 'react'
import type { Asset, Component } from '../../../packages/project-schema/src'
import { Color, Field, Numeric } from './Fields'

/** Read only the JSON chunk. No geometry, textures or GPU context are needed in the inspector. */
export async function modelClipNames(model: Blob): Promise<string[]> {
  const header = await model.slice(0, 20).arrayBuffer()
  const view = new DataView(header)
  let json = model
  if (header.byteLength >= 20 && view.getUint32(0, true) === 0x46546c67) {
    const length = view.getUint32(12, true)
    if (
      view.getUint32(4, true) !== 2 ||
      view.getUint32(16, true) !== 0x4e4f534a ||
      length > model.size - 20
    ) {
      throw Error('Invalid GLB JSON chunk')
    }
    json = model.slice(20, 20 + length)
  }
  const document = JSON.parse(await json.text())
  return (document.animations ?? []).map(
    (clip: { name?: string }, i: number) => clip.name || 'animation ' + i,
  )
}

function AnimationFields({
  c,
  model,
  change,
}: {
  c: Component
  model?: Asset
  change: (key: string, value: unknown) => void
}) {
  const [clips, setClips] = useState<string[]>([])
  const [status, setStatus] = useState('')
  useEffect(() => {
    const abort = new AbortController()
    setClips([])
    setStatus('')
    if (!model?.data) {
      setStatus('Assign a glTF or GLB model to the Mesh Renderer.')
    } else {
      fetch(model.data, { signal: abort.signal })
        .then((r) => {
          if (!r.ok) throw Error('Model is unavailable')
          return r.blob()
        })
        .then(modelClipNames)
        .then((names) => {
          if (!abort.signal.aborted) {
            const custom = Array.isArray(model.properties?.clips)
              ? model.properties.clips.map((cl: any) => String(cl?.name || '')).filter(Boolean)
              : []
            const merged = [...custom, ...names.filter((n) => !custom.includes(n))]
            setClips(merged)
            if (!merged.length) setStatus('This model contains no animation clips.')
          }
        })
        .catch(() => {
          if (!abort.signal.aborted) setStatus('Could not read clips from this model.')
        })
    }
    return () => abort.abort()
  }, [model?.data, model?.properties?.clips])
  return (
    <>
      <Field label="Animation clip">
        <select
          aria-label="Animation clip"
          value={c.clip || ''}
          onChange={(e) => change('clip', e.target.value)}
        >
          <option value="">First clip</option>
          {c.clip && !clips.includes(c.clip) && <option value={c.clip}>{c.clip}</option>}
          {clips.map((name, i) => (
            <option key={i} value={name}>
              {name}
            </option>
          ))}
        </select>
      </Field>
      {status && <small role="status">{status}</small>}
      <Field label="Play on start">
        <input
          type="checkbox"
          checked={c.autoplay !== false}
          onChange={(e) => change('autoplay', e.target.checked)}
        />
      </Field>
      <Field label="Loop">
        <input
          type="checkbox"
          checked={c.loop !== false}
          onChange={(e) => change('loop', e.target.checked)}
        />
      </Field>
      <Field label="Playback speed">
        <Numeric label="Playback speed" value={c.speed ?? 1} change={(v) => change('speed', v)} />
      </Field>
      <Field label="Play on event">
        <input
          aria-label="Play on event"
          value={c.event ?? ''}
          onChange={(e) => change('event', e.target.value)}
        />
      </Field>
    </>
  )
}
export function VisualFields({
  c,
  assets,
  modelId,
  change,
}: {
  c: Component
  assets: Asset[]
  modelId?: string
  change: (key: string, value: unknown) => void
}) {
  if (c.type === 'animation')
    return <AnimationFields c={c} model={assets.find((a) => a.id === modelId)} change={change} />
  if (c.type !== 'sprite') return null
  return (
    <>
      <Field label="Sprite texture">
        <select
          aria-label="Sprite texture"
          value={c.texture || ''}
          onChange={(e) => change('texture', e.target.value)}
        >
          <option value="">None</option>
          {assets
            .filter((a) => a.type === 'texture')
            .map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
        </select>
      </Field>
      <Field label="Tint">
        <Color label="Sprite tint" value={c.color ?? '#ffffff'} change={(v) => change('color', v)} />
      </Field>
      <Field label="Opacity">
        <Numeric
          label="Sprite opacity"
          value={c.opacity ?? 1}
          min={0}
          max={1}
          change={(v) => change('opacity', v)}
        />
      </Field>
      <Field label="Width">
        <Numeric label="Sprite width" value={c.width ?? 1} min={0.001} change={(v) => change('width', v)} />
      </Field>
      <Field label="Height">
        <Numeric
          label="Sprite height"
          value={c.height ?? 1}
          min={0.001}
          change={(v) => change('height', v)}
        />
      </Field>
    </>
  )
}
