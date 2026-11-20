import {
  parseSequence,
  type Project,
  type SequenceData,
  type SequenceKeyframe,
  type Vec3,
} from '../../project-schema/src'
import type { GameAPI } from './types'

export interface SequencerAPI {
  play(assetId: string, opts?: { loop?: boolean; speed?: number }): boolean
  stop(assetId?: string): void
  isPlaying(assetId?: string): boolean
}

function easeVal(t: number, ease?: string) {
  if (ease === 'step') return 0
  if (ease === 'easeInOut') return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2
  return t
}

function sampleKeyframes(kfs: SequenceKeyframe[], t: number): any {
  if (!kfs.length) return undefined
  const sorted = [...kfs].sort((a, b) => a.time - b.time)
  if (t <= sorted[0].time) return sorted[0].value
  if (t >= sorted[sorted.length - 1].time) return sorted[sorted.length - 1].value
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i]
    const b = sorted[i + 1]
    if (t >= a.time && t <= b.time) {
      const span = b.time - a.time || 1e-6
      const u = easeVal((t - a.time) / span, a.ease)
      if (typeof a.value === 'number' && typeof b.value === 'number') {
        return a.value + (b.value - a.value) * u
      }
      if (Array.isArray(a.value) && Array.isArray(b.value) && a.value.length >= 3) {
        return [
          a.value[0] + (b.value[0] - a.value[0]) * u,
          a.value[1] + (b.value[1] - a.value[1]) * u,
          a.value[2] + (b.value[2] - a.value[2]) * u,
        ]
      }
      return a.value
    }
  }
  return sorted[sorted.length - 1].value
}

export class SequencerPlayer {
  private active = new Map<
    string,
    { data: SequenceData; time: number; prevTime: number; loop: boolean; speed: number }
  >()

  constructor(private project: Project, private getApi: () => GameAPI) {}

  play(assetId: string, opts?: { loop?: boolean; speed?: number }): boolean {
    const asset = this.project.assets.find((a) => a.id === assetId && a.type === 'sequence')
    if (!asset) return false
    const data = parseSequence(asset.data)
    this.active.set(assetId, {
      data,
      time: 0,
      prevTime: -0.001,
      loop: opts?.loop ?? data.loop,
      speed: opts?.speed ?? 1,
    })
    return true
  }

  stop(assetId?: string) {
    if (assetId) this.active.delete(assetId)
    else this.active.clear()
  }

  isPlaying(assetId?: string) {
    return assetId ? this.active.has(assetId) : this.active.size > 0
  }

  update(dt: number) {
    if (!this.active.size) return
    const api = this.getApi()
    for (const [id, st] of [...this.active.entries()]) {
      const prev = st.prevTime
      const cur = st.time
      for (const trk of st.data.tracks) {
        if (trk.property === 'playAudio' || trk.property === 'playAnim' || trk.property === 'emitEvent') {
          for (const kf of trk.keyframes) {
            if (kf.time > prev && kf.time <= cur) {
              if (trk.property === 'playAudio' && kf.value) api.audio.play(String(kf.value))
              else if (trk.property === 'playAnim' && trk.entityId && kf.value) {
                api.animation.play(trk.entityId, String(kf.value), true, 1, 0.15)
              } else if (trk.property === 'emitEvent' && kf.value) {
                api.events.emit(String(kf.value), { sequenceId: id, time: cur })
              }
            }
          }
          continue
        }
        const val = sampleKeyframes(trk.keyframes, cur)
        if (val === undefined) continue
        if (trk.targetKind === 'camera') {
          if (trk.property === 'position' && Array.isArray(val)) {
            api.camera.position.set(val[0], val[1], val[2])
          } else if (trk.property === 'lookAt' && Array.isArray(val)) {
            api.camera.lookAt(val as Vec3)
          } else if (trk.property === 'fov') {
            api.camera.fov = Number(val) || 50
          }
        } else if (trk.targetKind === 'entity' && trk.entityId) {
          const node = api.find(trk.entityId)
          if (trk.property === 'position' && node && Array.isArray(val)) {
            node.position.set(val[0], val[1], val[2])
          } else if (trk.property === 'rotation' && node && Array.isArray(val)) {
            node.rotation.set(val[0], val[1], val[2])
          } else if (trk.property === 'scale' && node && Array.isArray(val)) {
            node.scale.set(val[0], val[1], val[2])
          } else if (trk.property === 'active') {
            api.setActive(trk.entityId, Boolean(val))
          } else if (trk.property === 'lightIntensity') {
            api.lights.setIntensity(trk.entityId, Number(val) || 0)
          }
        }
      }
      st.prevTime = cur
      st.time += dt * st.speed
      if (st.time > st.data.duration) {
        if (st.loop) {
          st.time = st.time % st.data.duration
          st.prevTime = -0.001
        } else {
          this.active.delete(id)
          api.events.emit('sequence.finished', { assetId: id })
        }
      }
    }
  }
}
