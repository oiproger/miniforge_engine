import { useEffect, useMemo, useState } from 'react'
import { Play, Pause, Square, Plus, Trash2, Clapperboard, Diamond } from 'lucide-react'
import {
  getScene,
  parseSequence,
  uid,
  type Asset,
  type KeyframeEase,
  type Project,
  type SequenceData,
  type TrackProperty,
  type TrackTargetKind,
} from '../../../packages/project-schema/src'
import { Field, Numeric } from './Fields'
import { SceneEntityPickerButton } from './SceneEntityPicker'

const TRACK_PROPS: TrackProperty[] = [
  'position',
  'rotation',
  'scale',
  'active',
  'lightIntensity',
  'fov',
  'lookAt',
  'playAudio',
  'playAnim',
  'emitEvent',
]

function defaultValForProp(prop: TrackProperty) {
  if (prop === 'position' || prop === 'rotation' || prop === 'lookAt') return [0, 0, 0]
  if (prop === 'scale') return [1, 1, 1]
  if (prop === 'active') return true
  if (prop === 'fov') return 50
  if (prop === 'lightIntensity') return 2
  return ''
}

export function SequencerEditor({
  a,
  p,
  changeA,
}: {
  a: Asset
  p: Project
  changeA: (fn: (asset: Asset) => void) => void
}) {
  const data: SequenceData = useMemo(() => parseSequence(a.data), [a.data])
  const [playhead, setPlayhead] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [selTrackId, setSelTrackId] = useState<string>(data.tracks[0]?.id ?? '')
  const [selKfId, setSelKfId] = useState<string>(data.tracks[0]?.keyframes[0]?.id ?? '')

  const scene = getScene(p)

  useEffect(() => {
    if (!playing) return
    let raf = 0
    let last = performance.now()
    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      setPlayhead((t) => {
        const next = t + dt
        if (next >= data.duration) {
          if (data.loop) return next % data.duration
          setPlaying(false)
          return data.duration
        }
        return next
      })
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [playing, data.duration, data.loop])

  const commit = (fn: (d: SequenceData) => void) => {
    const next = structuredClone(data)
    fn(next)
    changeA((asset) => {
      asset.data = JSON.stringify(next)
    })
  }

  const addTrack = (targetKind: TrackTargetKind) => {
    const id = uid('trk')
    const firstEnt = scene.entities[0]
    const prop: TrackProperty =
      targetKind === 'camera' ? 'position' : targetKind === 'event' ? 'emitEvent' : 'position'
    commit((d) =>
      d.tracks.push({
        id,
        label:
          targetKind === 'camera'
            ? 'Camera Position'
            : targetKind === 'event'
              ? 'Events / Audio'
              : `${firstEnt?.name || 'Entity'} · position`,
        targetKind,
        entityId: targetKind === 'entity' ? firstEnt?.id : undefined,
        property: prop,
        keyframes: [{ id: uid('kf'), time: 0, value: defaultValForProp(prop), ease: 'easeInOut' }],
      }),
    )
    setSelTrackId(id)
  }

  const curTrack = data.tracks.find((t) => t.id === selTrackId) ?? data.tracks[0]
  const curKf = curTrack?.keyframes.find((k) => k.id === selKfId) ?? curTrack?.keyframes[0]

  const keys = [...(curTrack?.keyframes ?? [])].sort((a, b) => a.time - b.time)
  const previousKey = keys.filter((k) => k.time < playhead - 0.00001).at(-1)
  const nextKey = keys.find((k) => k.time > playhead + 0.00001)
  function seekKey(key: typeof nextKey) {
    if (!key) return
    setPlaying(false)
    setSelKfId(key.id)
    setPlayhead(key.time)
  }

  return (
    <div className="mf-bp-editor">
      <div className="mf-bp-toolbar">
        <div className="mf-bp-tabs">
          <span style={{ fontSize: 12, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <Clapperboard size={13} /> Keyframe Sequencer
          </span>
          <button type="button" className="mf-btn" disabled={!previousKey} onClick={() => seekKey(previousKey)}>Previous key</button>
          <button type="button" className="mf-btn" disabled={!nextKey} onClick={() => seekKey(nextKey)}>Next key</button>
          <button type="button" className="mf-btn" onClick={() => setPlaying((v) => !v)}>
            {playing ? <Pause size={12} /> : <Play size={12} />}
          </button>
          <button type="button" className="mf-btn" onClick={() => { setPlaying(false); setPlayhead(0) }}>
            <Square size={12} />
          </button>
          <span style={{ fontSize: 11.5, fontFamily: 'monospace', color: '#f3a05d' }}>
            {playhead.toFixed(2)}s / {data.duration.toFixed(2)}s
          </span>
        </div>
        <div className="mf-bp-actions">
          <label style={{ fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            Dur(s):
            <input
              type="number"
              min={0.5}
              max={120}
              step={0.5}
              value={data.duration}
              onChange={(e) => commit((d) => (d.duration = Math.max(0.5, Number(e.target.value) || 5)))}
              style={{ width: 54, fontSize: 11 }}
            />
          </label>
          <label style={{ fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <input type="checkbox" checked={data.loop} onChange={(e) => commit((d) => (d.loop = e.target.checked))} />
            Loop
          </label>
          <button type="button" className="mf-btn" onClick={() => addTrack('entity')}><Plus size={12} /> Entity Track</button>
          <button type="button" className="mf-btn" onClick={() => addTrack('camera')}><Plus size={12} /> Camera Track</button>
          <button type="button" className="mf-btn" onClick={() => addTrack('event')}><Plus size={12} /> Event/Audio</button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 265px', flex: 1, minHeight: 0 }}>
        {/* Timeline Tracks */}
        <div style={{ display: 'flex', flexDirection: 'column', overflowY: 'auto', padding: 10, gap: 6, background: '#11151b' }}>
          {/* Scrubber */}
          <input
            type="range"
            min={0}
            max={data.duration}
            step={0.01}
            value={playhead}
            onChange={(e) => setPlayhead(Number(e.target.value))}
            style={{ width: '100%' }}
          />
          {data.tracks.map((trk) => {
            const active = trk.id === curTrack?.id
            return (
              <div
                key={trk.id}
                onClick={() => setSelTrackId(trk.id)}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '190px minmax(0, 1fr)',
                  gap: 8,
                  alignItems: 'center',
                  padding: '6px 8px',
                  borderRadius: 6,
                  border: active ? '1px solid #4c9aff' : '1px solid #262e38',
                  background: '#171d26',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4, minWidth: 0 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 11.5, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {trk.label}
                    </div>
                    <div style={{ fontSize: 10, color: '#8b9bb0' }}>
                      {trk.targetKind} · {trk.property}
                    </div>
                  </div>
                  <button
                    type="button"
                    className="mf-bp-icon-btn"
                    onClick={(e) => {
                      e.stopPropagation()
                      commit((d) => (d.tracks = d.tracks.filter((x) => x.id !== trk.id)))
                    }}
                  >
                    <Trash2 size={11} />
                  </button>
                </div>

                {/* Track Keyframe Bar */}
                <div
                  style={{
                    position: 'relative',
                    height: 28,
                    borderRadius: 4,
                    background: '#0e1319',
                    border: '1px solid #27313d',
                    cursor: 'pointer',
                  }}
                  onClick={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect()
                    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
                    setPlayhead(Number((ratio * data.duration).toFixed(2)))
                  }}
                >
                  {/* Playhead Line */}
                  <div
                    style={{
                      position: 'absolute',
                      top: 0,
                      bottom: 0,
                      left: `${(playhead / Math.max(0.01, data.duration)) * 100}%`,
                      width: 2,
                      background: '#f3a05d',
                      pointerEvents: 'none',
                    }}
                  />
                  {/* Keyframe Diamonds */}
                  {trk.keyframes.map((kf) => (
                    <button
                      key={kf.id}
                      type="button"
                      title={`${kf.time.toFixed(2)}s`}
                      onClick={(e) => {
                        e.stopPropagation()
                        setSelTrackId(trk.id)
                        setSelKfId(kf.id)
                        setPlayhead(kf.time)
                      }}
                      style={{
                        position: 'absolute',
                        top: 5,
                        left: `calc(${(kf.time / Math.max(0.01, data.duration)) * 100}% - 8px)`,
                        background: 'none',
                        border: 'none',
                        color: kf.id === curKf?.id ? '#57d163' : '#58a6ff',
                        cursor: 'pointer',
                        padding: 0,
                      }}
                    >
                      <Diamond size={14} fill="currentColor" />
                    </button>
                  ))}
                </div>
              </div>
            )
          })}
        </div>

        {/* Right: Track & Keyframe Inspector */}
        <aside className="mf-bp-sidebar" style={{ borderRight: 'none', borderLeft: '1px solid var(--border)' }}>
          {!curTrack ? (
            <div className="mf-bp-empty">Add a track above</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <strong style={{ fontSize: 12 }}>Track Settings</strong>
              {curTrack.targetKind === 'entity' && (
                <Field label="Target Entity">
                  <div style={{ display: 'flex', gap: 4, width: '100%' }}>
                    <select
                      style={{ flex: 1, minWidth: 0 }}
                      value={curTrack.entityId || ''}
                      onChange={(e) =>
                        commit((d) => {
                          const t = d.tracks.find((x) => x.id === curTrack.id)!
                          t.entityId = e.target.value
                          const ent = scene.entities.find((x) => x.id === e.target.value)
                          t.label = `${ent?.name || 'Entity'} · ${t.property}`
                        })
                      }
                    >
                      {scene.entities.map((ent) => (
                        <option key={ent.id} value={ent.id}>{ent.name}</option>
                      ))}
                    </select>
                    <SceneEntityPickerButton
                      project={p}
                      value={curTrack.entityId}
                      onPick={(pickedId) =>
                        commit((d) => {
                          const t = d.tracks.find((x) => x.id === curTrack.id)!
                          t.entityId = pickedId
                          const ent = scene.entities.find((x) => x.id === pickedId)
                          t.label = `${ent?.name || 'Entity'} · ${t.property}`
                        })
                      }
                    />
                  </div>
                </Field>
              )}
              <Field label="Property">
                <select
                  value={curTrack.property}
                  onChange={(e) =>
                    commit((d) => {
                      const t = d.tracks.find((x) => x.id === curTrack.id)!
                      t.property = e.target.value as TrackProperty
                      t.label = `${t.targetKind === 'camera' ? 'Camera' : scene.entities.find((x) => x.id === t.entityId)?.name || 'Event'} · ${t.property}`
                    })
                  }
                >
                  {TRACK_PROPS.map((pr) => (
                    <option key={pr} value={pr}>{pr}</option>
                  ))}
                </select>
              </Field>
              <button
                type="button"
                className="mf-primary"
                style={{ padding: '5px 8px', fontSize: 11.5 }}
                onClick={() => {
                  const kfid = uid('kf')
                  commit((d) => {
                    const t = d.tracks.find((x) => x.id === curTrack.id)!
                    t.keyframes.push({
                      id: kfid,
                      time: Number(playhead.toFixed(2)),
                      value: defaultValForProp(t.property),
                      ease: 'easeInOut',
                    })
                  })
                  setSelKfId(kfid)
                }}
              >
                <Plus size={12} /> Add Keyframe @ {playhead.toFixed(2)}s
              </button>

              {curKf && (
                <div style={{ borderTop: '1px solid var(--border)', paddingTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <strong style={{ fontSize: 12 }}>Selected Keyframe</strong>
                    <button
                      type="button"
                      className="mf-bp-icon-btn"
                      onClick={() =>
                        commit((d) => {
                          const t = d.tracks.find((x) => x.id === curTrack.id)!
                          t.keyframes = t.keyframes.filter((x) => x.id !== curKf.id)
                        })
                      }
                    >
                      <Trash2 size={11} />
                    </button>
                  </div>
                  <Field label="Time (s)">
                    <Numeric
                      label="Time"
                      value={curKf.time}
                      min={0}
                      max={data.duration}
                      step={0.05}
                      change={(v) =>
                        commit((d) => {
                          const k = d.tracks.find((x) => x.id === curTrack.id)?.keyframes.find((x) => x.id === curKf.id)
                          if (k) k.time = v
                        })
                      }
                    />
                  </Field>
                  <Field label="Ease">
                    <select
                      value={curKf.ease || 'easeInOut'}
                      onChange={(e) =>
                        commit((d) => {
                          const k = d.tracks.find((x) => x.id === curTrack.id)?.keyframes.find((x) => x.id === curKf.id)
                          if (k) k.ease = e.target.value as KeyframeEase
                        })
                      }
                    >
                      <option value="linear">Linear</option>
                      <option value="easeInOut">Ease In-Out</option>
                      <option value="step">Step (Instant)</option>
                    </select>
                  </Field>
                  <Field label="Value">
                    {Array.isArray(curKf.value) ? (
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 3 }}>
                        {[0, 1, 2].map((ax) => (
                          <Numeric
                            key={ax}
                            label={`v${ax}`}
                            value={Number(curKf.value[ax]) || 0}
                            step={0.1}
                            change={(v) =>
                              commit((d) => {
                                const k = d.tracks.find((x) => x.id === curTrack.id)?.keyframes.find((x) => x.id === curKf.id)
                                if (k && Array.isArray(k.value)) k.value[ax] = v
                              })
                            }
                          />
                        ))}
                      </div>
                    ) : typeof curKf.value === 'boolean' ? (
                      <input
                        type="checkbox"
                        checked={curKf.value}
                        onChange={(e) =>
                          commit((d) => {
                            const k = d.tracks.find((x) => x.id === curTrack.id)?.keyframes.find((x) => x.id === curKf.id)
                            if (k) k.value = e.target.checked
                          })
                        }
                      />
                    ) : typeof curKf.value === 'number' ? (
                      <Numeric
                        label="Val"
                        value={curKf.value}
                        step={0.1}
                        change={(v) =>
                          commit((d) => {
                            const k = d.tracks.find((x) => x.id === curTrack.id)?.keyframes.find((x) => x.id === curKf.id)
                            if (k) k.value = v
                          })
                        }
                      />
                    ) : (
                      <input
                        value={String(curKf.value ?? '')}
                        placeholder="Asset ID / Clip / Event"
                        onChange={(e) =>
                          commit((d) => {
                            const k = d.tracks.find((x) => x.id === curTrack.id)?.keyframes.find((x) => x.id === curKf.id)
                            if (k) k.value = e.target.value
                          })
                        }
                      />
                    )}
                  </Field>
                </div>
              )}
            </div>
          )}
        </aside>
      </div>
    </div>
  )
}
