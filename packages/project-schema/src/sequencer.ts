// Keyframe Sequencer / Cutscene Timeline schema for Miniforge Engine v2.0

export type TrackTargetKind = 'entity' | 'camera' | 'event'
export type TrackProperty =
  | 'position'
  | 'rotation'
  | 'scale'
  | 'active'
  | 'lightIntensity'
  | 'fov'
  | 'lookAt'
  | 'playAudio'
  | 'playAnim'
  | 'emitEvent'

export type KeyframeEase = 'linear' | 'easeInOut' | 'step'

export interface SequenceKeyframe {
  id: string
  time: number // seconds
  value: any // Vec3, number, boolean, or string depending on property
  ease?: KeyframeEase
}

export interface SequenceTrack {
  id: string
  label: string
  targetKind: TrackTargetKind
  entityId?: string
  property: TrackProperty
  keyframes: SequenceKeyframe[]
}

export interface SequenceData {
  version: 1
  duration: number // seconds
  fps: number
  loop: boolean
  tracks: SequenceTrack[]
}

export function makeDefaultSequence(): SequenceData {
  return {
    version: 1,
    duration: 5,
    fps: 30,
    loop: false,
    tracks: [
      {
        id: 'trk-cam-pos',
        label: 'Camera Position',
        targetKind: 'camera',
        property: 'position',
        keyframes: [
          { id: 'kf-1', time: 0, value: [0, 3, 8], ease: 'easeInOut' },
          { id: 'kf-2', time: 2.5, value: [4, 2.5, 5], ease: 'easeInOut' },
          { id: 'kf-3', time: 5, value: [0, 2, 3], ease: 'easeInOut' },
        ],
      },
    ],
  }
}

export function parseSequence(raw?: string): SequenceData {
  try {
    const parsed = JSON.parse(raw || '')
    if (parsed && Array.isArray(parsed.tracks)) {
      return {
        version: 1,
        duration: Math.max(0.2, Number(parsed.duration) || 5),
        fps: Number(parsed.fps) || 30,
        loop: Boolean(parsed.loop),
        tracks: parsed.tracks,
      }
    }
  } catch {
    /* fallback */
  }
  return makeDefaultSequence()
}
