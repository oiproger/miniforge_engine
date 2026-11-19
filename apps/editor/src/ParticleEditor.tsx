import { useEffect, useRef, useState } from 'react'
import { Play, Pause, RotateCcw, Sparkles, Flame } from 'lucide-react'
import {
  defaultParticleConfig,
  PARTICLE_PRESETS,
  type Asset,
  type ParticleConfig,
  type Project,
  type Vec3,
} from '../../../packages/project-schema/src'
import { Field, Numeric, Color } from './Fields'
import { AssetSelect } from './Inspector'

interface PreviewParticle {
  x: number
  y: number
  z: number
  vx: number
  vy: number
  vz: number
  age: number
  life: number
}

function parseHex(hex: string): [number, number, number] {
  const c = (hex || '#ffffff').replace('#', '')
  const f = c.length === 3 ? c.split('').map((v) => v + v).join('') : c.padEnd(6, 'f')
  const n = parseInt(f.slice(0, 6), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

export function ParticleEditor({
  a,
  p,
  patch,
}: {
  a: Asset
  p: Project
  patch: (k: string, v: unknown) => void
}) {
  const cfg: ParticleConfig = { ...defaultParticleConfig(), ...(a.properties || {}) }
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const cfgRef = useRef(cfg)
  cfgRef.current = cfg
  const [playing, setPlaying] = useState(true)
  const playingRef = useRef(playing)
  playingRef.current = playing
  const [count, setCount] = useState(0)
  const [camYaw, setCamYaw] = useState(0.45)
  const yawRef = useRef(camYaw)
  yawRef.current = camYaw
  const burstRef = useRef(0)
  const resetRef = useRef(false)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    let list: PreviewParticle[] = []
    let accum = 0
    let last = performance.now()
    let raf = 0

    const spawn = (c: ParticleConfig) => {
      if (list.length >= Math.max(1, Math.min(250, c.maxParticles))) return
      let x = 0, y = 0, z = 0
      const ss = c.shapeSize || [0.2, 0.2, 0.2]
      if (c.shape === 'box') {
        x = (Math.random() - 0.5) * ss[0]
        y = (Math.random() - 0.5) * ss[1]
        z = (Math.random() - 0.5) * ss[2]
      } else if (c.shape === 'sphere') {
        const th = Math.random() * Math.PI * 2
        const ph = Math.acos(2 * Math.random() - 1)
        const rad = Math.cbrt(Math.random())
        x = Math.sin(ph) * Math.cos(th) * ss[0] * 0.5 * rad
        y = Math.cos(ph) * ss[1] * 0.5 * rad
        z = Math.sin(ph) * Math.sin(th) * ss[2] * 0.5 * rad
      }
      const dir = c.direction || [0, 1, 0]
      const dl = Math.hypot(dir[0], dir[1], dir[2]) || 1
      let dx = dir[0] / dl, dy = dir[1] / dl, dz = dir[2] / dl
      const sp = ((c.spread ?? 25) * Math.PI) / 180
      if (sp > 0.001) {
        const ang = Math.random() * Math.PI * 2
        const tilt = Math.random() * sp
        const s = Math.sin(tilt)
        dx += Math.cos(ang) * s
        dy += (Math.random() - 0.5) * s * 0.5
        dz += Math.sin(ang) * s
        const nl = Math.hypot(dx, dy, dz) || 1
        dx /= nl; dy /= nl; dz /= nl
      }
      const spd = c.speedMin + Math.random() * Math.max(0, c.speedMax - c.speedMin)
      const life = Math.max(0.08, c.lifeMin + Math.random() * Math.max(0, c.lifeMax - c.lifeMin))
      list.push({ x, y, z, vx: dx * spd, vy: dy * spd, vz: dz * spd, age: 0, life })
    }

    const tick = (now: number) => {
      const dt = Math.min(0.05, Math.max(0.001, (now - last) / 1000))
      last = now
      const c = cfgRef.current
      if (resetRef.current) {
        list = []
        accum = 0
        resetRef.current = false
      }
      if (burstRef.current > 0) {
        for (let i = 0; i < burstRef.current; i++) spawn(c)
        burstRef.current = 0
      }
      if (playingRef.current) {
        accum += Math.max(0, c.rate) * dt
        const n = Math.min(12, Math.floor(accum))
        accum -= n
        for (let i = 0; i < n; i++) spawn(c)
        const g = c.gravity || [0, 0, 0]
        for (let i = list.length - 1; i >= 0; i--) {
          const pt = list[i]
          pt.age += dt
          if (pt.age >= pt.life) {
            list.splice(i, 1)
            continue
          }
          pt.vx += g[0] * dt
          pt.vy += g[1] * dt
          pt.vz += g[2] * dt
          pt.x += pt.vx * dt
          pt.y += pt.vy * dt
          pt.z += pt.vz * dt
        }
      }

      const w = canvas.width
      const h = canvas.height
      ctx.globalCompositeOperation = 'source-over'
      const bg = ctx.createLinearGradient(0, 0, 0, h)
      bg.addColorStop(0, '#10161e')
      bg.addColorStop(1, '#18212b')
      ctx.fillStyle = bg
      ctx.fillRect(0, 0, w, h)

      // 3D floor grid
      const cy = Math.cos(yawRef.current)
      const sy = Math.sin(yawRef.current)
      const project = (px: number, py: number, pz: number) => {
        const rx = px * cy - pz * sy
        const rz = px * sy + pz * cy + 6.5
        if (rz < 0.2) return null
        const scale = 230 / rz
        return { sx: w * 0.5 + rx * scale, sy: h * 0.68 - (py - 0.6) * scale, scale, rz }
      }
      ctx.strokeStyle = 'rgba(130, 165, 195, 0.16)'
      ctx.lineWidth = 1
      for (let i = -3; i <= 3; i++) {
        const a1 = project(i, 0, -3), b1 = project(i, 0, 3)
        if (a1 && b1) { ctx.beginPath(); ctx.moveTo(a1.sx, a1.sy); ctx.lineTo(b1.sx, b1.sy); ctx.stroke() }
        const a2 = project(-3, 0, i), b2 = project(3, 0, i)
        if (a2 && b2) { ctx.beginPath(); ctx.moveTo(a2.sx, a2.sy); ctx.lineTo(b2.sx, b2.sy); ctx.stroke() }
      }

      const sc = parseHex(c.startColor)
      const ec = parseHex(c.endColor)
      ctx.globalCompositeOperation = c.additive ? 'lighter' : 'source-over'
      const sorted = list
        .map((pt) => ({ pt, proj: project(pt.x, pt.y, pt.z) }))
        .filter((it): it is { pt: PreviewParticle; proj: NonNullable<ReturnType<typeof project>> } => Boolean(it.proj))
        .sort((a, b) => b.proj.rz - a.proj.rz)

      for (const { pt, proj } of sorted) {
        const t = pt.age / pt.life
        const sz = Math.max(2, (c.startSize + (c.endSize - c.startSize) * t) * proj.scale * 0.55)
        const r = Math.round(sc[0] + (ec[0] - sc[0]) * t)
        const g = Math.round(sc[1] + (ec[1] - sc[1]) * t)
        const b = Math.round(sc[2] + (ec[2] - sc[2]) * t)
        const al = Math.max(0, Math.min(1, c.startAlpha + (c.endAlpha - c.startAlpha) * t))
        const grad = ctx.createRadialGradient(proj.sx, proj.sy, 0, proj.sx, proj.sy, sz)
        grad.addColorStop(0, `rgba(${r},${g},${b},${al.toFixed(3)})`)
        grad.addColorStop(0.5, `rgba(${r},${g},${b},${(al * 0.55).toFixed(3)})`)
        grad.addColorStop(1, `rgba(${r},${g},${b},0)`)
        ctx.fillStyle = grad
        ctx.beginPath()
        ctx.arc(proj.sx, proj.sy, sz, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.globalCompositeOperation = 'source-over'
      setCount(list.length)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])

  const applyPreset = (name: string) => {
    const preset = defaultParticleConfig(name)
    for (const [k, v] of Object.entries(preset)) patch(k, v)
    resetRef.current = true
  }

  const patchVec = (key: 'direction' | 'gravity' | 'shapeSize', idx: number, val: number) => {
    const cur: Vec3 = [...(cfg[key] || [0, 0, 0])]
    cur[idx] = val
    patch(key, cur)
  }

  return (
    <div className="mf-particle-editor">
      <div className="mf-particle-preview-col">
        <canvas ref={canvasRef} width={380} height={260} className="mf-particle-canvas" />
        <div className="mf-particle-toolbar">
          <button type="button" className="mf-btn" onClick={() => setPlaying((v) => !v)}>
            {playing ? <Pause size={13} /> : <Play size={13} />} {playing ? 'Pause' : 'Play'}
          </button>
          <button type="button" className="mf-btn" onClick={() => { burstRef.current = Math.max(12, cfg.burstCount || 20) }}>
            <Sparkles size={13} /> Burst
          </button>
          <button type="button" className="mf-btn" onClick={() => { resetRef.current = true }}>
            <RotateCcw size={13} /> Reset
          </button>
          <span className="mf-particle-stat">{count} / {cfg.maxParticles}</span>
        </div>
        <Field label="Preview orbit">
          <input
            type="range"
            min={-3.14}
            max={3.14}
            step={0.05}
            value={camYaw}
            onChange={(e) => setCamYaw(Number(e.target.value))}
          />
        </Field>
        <div className="mf-particle-presets">
          <div className="mf-minor-label"><Flame size={12} /> Presets</div>
          <div className="mf-preset-grid">
            {Object.keys(PARTICLE_PRESETS).map((name) => (
              <button key={name} type="button" className="mf-preset-chip" onClick={() => applyPreset(name)}>
                {name}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="mf-particle-params-col">
        <div className="mf-minor-label">Emission</div>
        <Field label="Rate (/sec)">
          <Numeric label="Rate" value={cfg.rate} min={0} max={200} step={1} change={(n) => patch('rate', n)} />
        </Field>
        <Field label="Max particles">
          <Numeric label="Max particles" value={cfg.maxParticles} min={1} max={250} step={5} change={(n) => patch('maxParticles', Math.round(n))} />
        </Field>
        <Field label="Initial burst">
          <Numeric label="Burst" value={cfg.burstCount} min={0} max={200} step={1} change={(n) => patch('burstCount', Math.round(n))} />
        </Field>
        <Field label="Emitter shape">
          <select value={cfg.shape} onChange={(e) => patch('shape', e.target.value)}>
            <option value="point">Point</option>
            <option value="sphere">Sphere</option>
            <option value="box">Box (Area)</option>
          </select>
        </Field>
        {cfg.shape !== 'point' && (
          <Field label="Shape size (X/Y/Z)">
            <div className="mf-vec3-inline">
              {[0, 1, 2].map((i) => (
                <Numeric key={i} label={`Shape ${i}`} value={cfg.shapeSize[i]} min={0} step={0.1} change={(n) => patchVec('shapeSize', i, n)} />
              ))}
            </div>
          </Field>
        )}

        <div className="mf-minor-label">Lifetime & Motion</div>
        <Field label="Life min / max (s)">
          <div className="mf-vec2-inline">
            <Numeric label="Life min" value={cfg.lifeMin} min={0.05} step={0.1} change={(n) => patch('lifeMin', n)} />
            <Numeric label="Life max" value={cfg.lifeMax} min={0.05} step={0.1} change={(n) => patch('lifeMax', n)} />
          </div>
        </Field>
        <Field label="Speed min / max">
          <div className="mf-vec2-inline">
            <Numeric label="Speed min" value={cfg.speedMin} min={0} step={0.1} change={(n) => patch('speedMin', n)} />
            <Numeric label="Speed max" value={cfg.speedMax} min={0} step={0.1} change={(n) => patch('speedMax', n)} />
          </div>
        </Field>
        <Field label="Cone spread (deg)">
          <Numeric label="Spread" value={cfg.spread} min={0} max={180} step={2} change={(n) => patch('spread', n)} />
        </Field>
        <Field label="Direction (X/Y/Z)">
          <div className="mf-vec3-inline">
            {[0, 1, 2].map((i) => (
              <Numeric key={i} label={`Dir ${i}`} value={cfg.direction[i]} step={0.1} change={(n) => patchVec('direction', i, n)} />
            ))}
          </div>
        </Field>
        <Field label="Gravity (X/Y/Z)">
          <div className="mf-vec3-inline">
            {[0, 1, 2].map((i) => (
              <Numeric key={i} label={`Grav ${i}`} value={cfg.gravity[i]} step={0.2} change={(n) => patchVec('gravity', i, n)} />
            ))}
          </div>
        </Field>

        <div className="mf-minor-label">Appearance</div>
        <Field label="Size start / end">
          <div className="mf-vec2-inline">
            <Numeric label="Start size" value={cfg.startSize} min={0.01} step={0.05} change={(n) => patch('startSize', n)} />
            <Numeric label="End size" value={cfg.endSize} min={0.01} step={0.05} change={(n) => patch('endSize', n)} />
          </div>
        </Field>
        <Field label="Start color">
          <Color label="Start color" value={cfg.startColor} change={(v) => patch('startColor', v)} />
        </Field>
        <Field label="End color">
          <Color label="End color" value={cfg.endColor} change={(v) => patch('endColor', v)} />
        </Field>
        <Field label="Alpha start / end">
          <div className="mf-vec2-inline">
            <Numeric label="Start alpha" value={cfg.startAlpha} min={0} max={1} step={0.05} change={(n) => patch('startAlpha', n)} />
            <Numeric label="End alpha" value={cfg.endAlpha} min={0} max={1} step={0.05} change={(n) => patch('endAlpha', n)} />
          </div>
        </Field>
        <Field label="Additive glow">
          <input type="checkbox" checked={Boolean(cfg.additive)} onChange={(e) => patch('additive', e.target.checked)} />
        </Field>
        <Field label="Custom texture">
          <AssetSelect label="Particle texture" assets={p.assets} type="texture" value={cfg.texture || ''} change={(id) => patch('texture', id)} />
        </Field>
      </div>
    </div>
  )
}
