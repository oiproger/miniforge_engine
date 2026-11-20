import { useState } from 'react'
import { Play, Save, Volume2, Music, Shuffle, Trash2 } from 'lucide-react'
import type { Asset } from '../../../packages/project-schema/src'
import { Field, Numeric } from './Fields'

type WaveKind = 'sine' | 'square' | 'sawtooth' | 'triangle' | 'noise'

interface SfxParams {
  wave: WaveKind
  freq: number
  slide: number // Hz/sec
  semitones: number
  duration: number
  attack: number
  decay: number
  lowpass: number
  volume: number
}

const SFX_PRESETS: Record<string, SfxParams> = {
  'UI Click': { wave: 'triangle', freq: 720, slide: -1400, semitones: 0, duration: 0.08, attack: 0.004, decay: 0.07, lowpass: 5000, volume: 0.65 },
  'Coin / Pickup': { wave: 'square', freq: 587, slide: 900, semitones: 0, duration: 0.24, attack: 0.005, decay: 0.22, lowpass: 6000, volume: 0.55 },
  Footstep: { wave: 'noise', freq: 180, slide: -100, semitones: 0, duration: 0.11, attack: 0.005, decay: 0.09, lowpass: 900, volume: 0.7 },
  Jump: { wave: 'sine', freq: 240, slide: 680, semitones: 0, duration: 0.22, attack: 0.01, decay: 0.2, lowpass: 8000, volume: 0.65 },
  'Hit / Punch': { wave: 'noise', freq: 160, slide: -400, semitones: 0, duration: 0.18, attack: 0.004, decay: 0.17, lowpass: 1200, volume: 0.85 },
  Explosion: { wave: 'noise', freq: 90, slide: -120, semitones: 0, duration: 0.85, attack: 0.01, decay: 0.8, lowpass: 650, volume: 0.9 },
  'Door Creak': { wave: 'sawtooth', freq: 145, slide: -45, semitones: 0, duration: 0.55, attack: 0.06, decay: 0.45, lowpass: 1100, volume: 0.5 },
  'Fluorescent Hum': { wave: 'sawtooth', freq: 100, slide: 0, semitones: 0, duration: 1.5, attack: 0.08, decay: 1.4, lowpass: 420, volume: 0.35 },
  'Rain / Wind': { wave: 'noise', freq: 400, slide: 0, semitones: 0, duration: 2.0, attack: 0.2, decay: 1.8, lowpass: 1400, volume: 0.45 },
}

const SCALE_NOTES = [
  { name: 'C5', hz: 523.25 },
  { name: 'A4', hz: 440.0 },
  { name: 'G4', hz: 392.0 },
  { name: 'F4', hz: 349.23 },
  { name: 'E4', hz: 329.63 },
  { name: 'D4', hz: 293.66 },
  { name: 'C4', hz: 261.63 },
  { name: 'A3', hz: 220.0 },
]

function encodeWavDataUrl(samples: Float32Array, sampleRate: number): string {
  const numSamples = samples.length
  const buf = new ArrayBuffer(44 + numSamples * 2)
  const v = new DataView(buf)
  const writeStr = (off: number, s: string) => {
    for (let i = 0; i < s.length; i++) v.setUint8(off + i, s.charCodeAt(i))
  }
  writeStr(0, 'RIFF')
  v.setUint32(4, 36 + numSamples * 2, true)
  writeStr(8, 'WAVE')
  writeStr(12, 'fmt ')
  v.setUint32(16, 16, true)
  v.setUint16(20, 1, true) // PCM
  v.setUint16(22, 1, true) // mono
  v.setUint32(24, sampleRate, true)
  v.setUint32(28, sampleRate * 2, true)
  v.setUint16(32, 2, true)
  v.setUint16(34, 16, true)
  writeStr(36, 'data')
  v.setUint32(40, numSamples * 2, true)
  for (let i = 0; i < numSamples; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]))
    v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true)
  }
  const bytes = new Uint8Array(buf)
  let bin = ''
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
  return 'data:audio/wav;base64,' + btoa(bin)
}

async function renderSfxBuffer(p: SfxParams): Promise<AudioBuffer> {
  const sr = 22050
  const len = Math.max(256, Math.ceil(Math.max(0.04, p.duration) * sr))
  const ctx = new OfflineAudioContext(1, len, sr)
  const filter = ctx.createBiquadFilter()
  filter.type = 'lowpass'
  filter.frequency.value = Math.max(80, Math.min(18000, p.lowpass))
  const gain = ctx.createGain()
  const atk = Math.min(p.duration * 0.4, Math.max(0.002, p.attack))
  gain.gain.setValueAtTime(0.0001, 0)
  gain.gain.linearRampToValueAtTime(Math.max(0.01, p.volume), atk)
  gain.gain.exponentialRampToValueAtTime(0.0001, Math.max(atk + 0.01, p.duration))
  filter.connect(gain)
  gain.connect(ctx.destination)

  const mult = Math.pow(2, (p.semitones || 0) / 12)
  if (p.wave === 'noise') {
    const nb = ctx.createBuffer(1, len, sr)
    const ch = nb.getChannelData(0)
    for (let i = 0; i < len; i++) ch[i] = Math.random() * 2 - 1
    const src = ctx.createBufferSource()
    src.buffer = nb
    src.playbackRate.value = Math.max(0.2, mult)
    src.connect(filter)
    src.start(0)
  } else {
    const osc = ctx.createOscillator()
    osc.type = p.wave
    const f0 = Math.max(20, p.freq * mult)
    const f1 = Math.max(20, (p.freq + p.slide * p.duration) * mult)
    osc.frequency.setValueAtTime(f0, 0)
    osc.frequency.linearRampToValueAtTime(f1, p.duration)
    osc.connect(filter)
    osc.start(0)
    osc.stop(p.duration)
  }
  return ctx.startRendering()
}

async function renderSeqBuffer(grid: boolean[][], bpm: number, wave: Exclude<WaveKind, 'noise'>, semitones: number): Promise<AudioBuffer> {
  const sr = 22050
  const stepSec = 60 / Math.max(40, bpm) / 4
  const totalSec = stepSec * 16 + 0.15
  const ctx = new OfflineAudioContext(1, Math.ceil(totalSec * sr), sr)
  const mult = Math.pow(2, semitones / 12)
  for (let step = 0; step < 16; step++) {
    const t0 = step * stepSec
    for (let row = 0; row < SCALE_NOTES.length; row++) {
      if (!grid[row][step]) continue
      const osc = ctx.createOscillator()
      const g = ctx.createGain()
      osc.type = wave
      osc.frequency.setValueAtTime(SCALE_NOTES[row].hz * mult, t0)
      g.gain.setValueAtTime(0.0001, t0)
      g.gain.linearRampToValueAtTime(0.22, t0 + 0.01)
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + stepSec * 0.92)
      osc.connect(g)
      g.connect(ctx.destination)
      osc.start(t0)
      osc.stop(t0 + stepSec)
    }
  }
  return ctx.startRendering()
}

export function SoundSynth({
  a,
  changeA,
}: {
  a: Asset
  changeA: (fn: (asset: Asset) => void) => void
}) {
  const [mode, setMode] = useState<'sfx' | 'music'>('sfx')
  const [sfx, setSfx] = useState<SfxParams>(SFX_PRESETS['Coin / Pickup'])
  const [bpm, setBpm] = useState(118)
  const [seqWave, setSeqWave] = useState<Exclude<WaveKind, 'noise'>>('triangle')
  const [seqSemi, setSeqSemi] = useState(0)
  const [grid, setGrid] = useState<boolean[][]>(() =>
    SCALE_NOTES.map((_, r) => Array.from({ length: 16 }, (__, c) => (r === 6 && c % 4 === 0) || (r === 2 && c % 4 === 2))),
  )
  const [status, setStatus] = useState('')

  const playPreview = async () => {
    const buf = mode === 'sfx' ? await renderSfxBuffer(sfx) : await renderSeqBuffer(grid, bpm, seqWave, seqSemi)
    const ctx = new AudioContext()
    const src = ctx.createBufferSource()
    src.buffer = buf
    src.connect(ctx.destination)
    src.start(0)
  }

  const bakeWav = async () => {
    const buf = mode === 'sfx' ? await renderSfxBuffer(sfx) : await renderSeqBuffer(grid, bpm, seqWave, seqSemi)
    const url = encodeWavDataUrl(buf.getChannelData(0), buf.sampleRate)
    changeA((asset) => {
      asset.data = url
      asset.properties = { ...(asset.properties || {}), synthMode: mode, duration: Number(buf.duration.toFixed(2)) }
    })
    setStatus(`Saved WAV (${buf.duration.toFixed(2)}s)`)
    setTimeout(() => setStatus(''), 2000)
  }

  return (
    <div className="mf-html-studio">
      <div className="mf-html-top">
        <div className="mf-html-tabs">
          <button type="button" className={mode === 'sfx' ? 'active' : ''} onClick={() => setMode('sfx')}>
            <Volume2 size={13} /> SFX &amp; Ambience
          </button>
          <button type="button" className={mode === 'music' ? 'active' : ''} onClick={() => setMode('music')}>
            <Music size={13} /> 16-Step Music Loop
          </button>
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          {status && <span style={{ fontSize: 11, color: '#7ee787' }}>{status}</span>}
          <button type="button" className="mf-btn" onClick={() => void playPreview()}>
            <Play size={12} /> Preview
          </button>
          <button type="button" className="mf-primary" style={{ padding: '4px 10px', fontSize: 11.5 }} onClick={() => void bakeWav()}>
            <Save size={12} /> Bake to .wav Asset
          </button>
        </div>
      </div>

      <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 12, maxHeight: 520, overflowY: 'auto' }}>
        {mode === 'sfx' ? (
          <>
            <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
              {Object.entries(SFX_PRESETS).map(([name, preset]) => (
                <button
                  key={name}
                  type="button"
                  className="mf-btn"
                  style={{ fontSize: 11 }}
                  onClick={() => setSfx({ ...preset })}
                >
                  {name}
                </button>
              ))}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <Field label="Waveform">
                <select value={sfx.wave} onChange={(e) => setSfx({ ...sfx, wave: e.target.value as WaveKind })}>
                  <option value="sine">Sine</option>
                  <option value="square">Square</option>
                  <option value="sawtooth">Sawtooth</option>
                  <option value="triangle">Triangle</option>
                  <option value="noise">White Noise</option>
                </select>
              </Field>
              <Field label="Base Freq (Hz)">
                <Numeric label="Freq" value={sfx.freq} min={30} max={4000} step={10} change={(v) => setSfx({ ...sfx, freq: v })} />
              </Field>
              <Field label="Pitch Slide (Hz/s)">
                <Numeric label="Slide" value={sfx.slide} min={-4000} max={4000} step={25} change={(v) => setSfx({ ...sfx, slide: v })} />
              </Field>
              <Field label="Transpose (semitones)">
                <Numeric label="Semitones" value={sfx.semitones} min={-24} max={24} step={1} change={(v) => setSfx({ ...sfx, semitones: v })} />
              </Field>
              <Field label="Duration (s)">
                <Numeric label="Duration" value={sfx.duration} min={0.04} max={4} step={0.02} change={(v) => setSfx({ ...sfx, duration: v })} />
              </Field>
              <Field label="Lowpass Filter (Hz)">
                <Numeric label="Lowpass" value={sfx.lowpass} min={100} max={18000} step={100} change={(v) => setSfx({ ...sfx, lowpass: v })} />
              </Field>
              <Field label="Attack (s)">
                <Numeric label="Attack" value={sfx.attack} min={0.002} max={0.5} step={0.005} change={(v) => setSfx({ ...sfx, attack: v })} />
              </Field>
              <Field label="Volume">
                <Numeric label="Volume" value={sfx.volume} min={0.05} max={1} step={0.05} change={(v) => setSfx({ ...sfx, volume: v })} />
              </Field>
            </div>
          </>
        ) : (
          <>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <Field label="BPM">
                <Numeric label="BPM" value={bpm} min={60} max={190} step={2} change={setBpm} />
              </Field>
              <Field label="Synth Wave">
                <select value={seqWave} onChange={(e) => setSeqWave(e.target.value as any)}>
                  <option value="triangle">Triangle</option>
                  <option value="square">Square (Chiptune)</option>
                  <option value="sawtooth">Sawtooth</option>
                  <option value="sine">Sine</option>
                </select>
              </Field>
              <Field label="Key Shift">
                <Numeric label="Semitones" value={seqSemi} min={-12} max={12} step={1} change={setSeqSemi} />
              </Field>
              <button
                type="button"
                className="mf-btn"
                onClick={() =>
                  setGrid(SCALE_NOTES.map(() => Array.from({ length: 16 }, () => Math.random() < 0.18)))
                }
              >
                <Shuffle size={12} /> Random
              </button>
              <button
                type="button"
                className="mf-btn"
                onClick={() => setGrid(SCALE_NOTES.map(() => Array(16).fill(false)))}
              >
                <Trash2 size={12} /> Clear
              </button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              {SCALE_NOTES.map((note, rIdx) => (
                <div key={note.name} style={{ display: 'grid', gridTemplateColumns: '34px repeat(16, 1fr)', gap: 3, alignItems: 'center' }}>
                  <span style={{ fontSize: 11, color: '#9aa7b8', fontFamily: 'monospace' }}>{note.name}</span>
                  {grid[rIdx].map((on, cIdx) => (
                    <button
                      key={cIdx}
                      type="button"
                      onClick={() =>
                        setGrid((prev) =>
                          prev.map((row, ri) => (ri === rIdx ? row.map((v, ci) => (ci === cIdx ? !v : v)) : row)),
                        )
                      }
                      style={{
                        height: 24,
                        borderRadius: 4,
                        border: cIdx % 4 === 0 ? '1px solid #3c4858' : '1px solid #262e38',
                        background: on ? '#f3a05d' : cIdx % 4 === 0 ? '#1c2430' : '#141920',
                        cursor: 'pointer',
                      }}
                    />
                  ))}
                </div>
              ))}
            </div>
          </>
        )}
        {a.data && a.data.startsWith('data:audio') && (
          <div style={{ borderTop: '1px solid #2b323b', paddingTop: 10 }}>
            <audio controls src={a.data} style={{ width: '100%' }} />
          </div>
        )}
      </div>
    </div>
  )
}
