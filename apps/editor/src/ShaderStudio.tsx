import { useEffect, useMemo, useRef, useState } from 'react'
import { Sparkles, CheckCircle2, AlertTriangle, Play, Pause } from 'lucide-react'
import type { Asset } from '../../../packages/project-schema/src'
import { shaders as BUILTIN_TEMPLATES } from './shaderTemplates'

export interface ShaderPreset {
  id: string
  name: string
  description: string
  vertex: string
  fragment: string
  defaults?: Record<string, number | string>
}

const DEFAULT_VERTEX = 'void mainVertex(inout vec3 position, inout vec3 normal) {}'

export const SHADER_STUDIO_PRESETS: ShaderPreset[] = [
  {
    id: 'water',
    name: 'Water Waves',
    description: 'Animated stylized water ripples with foam highlights',
    defaults: { u_speed: 1.0, u_scale: 1.0, u_color: '#38bdf8' },
    vertex: `void mainVertex(inout vec3 position, inout vec3 normal) {
  float w1 = sin(position.x * 3.2 + iTime * 2.0) * cos(position.z * 2.6 - iTime * 1.6);
  position.y += w1 * 0.08;
}`,
    fragment: `uniform float u_speed;
uniform float u_scale;
uniform vec3 u_color;

void mainImage(out vec4 color, vec2 uv) {
  float spd = u_speed > 0.001 ? u_speed : 1.0;
  float scl = max(2.0, (u_scale > 0.001 ? u_scale : 1.0) * 8.0);
  vec3 base = length(u_color) > 0.01 ? u_color : vec3(0.22, 0.74, 0.97);
  float t = iTime * spd;
  float w1 = sin(uv.x * scl + t * 2.2) * cos(uv.y * scl * 0.8 - t * 1.7);
  float w2 = sin((uv.x + uv.y) * scl * 1.3 - t * 2.8);
  float wave = (w1 + w2) * 0.5;
  vec3 deep = base * 0.45;
  vec3 shallow = base * 1.15 + vec3(0.06, 0.14, 0.18);
  vec3 col = mix(deep, shallow, wave * 0.5 + 0.5);
  float foam = smoothstep(0.68, 0.88, wave);
  col = mix(col, vec3(0.92, 0.98, 1.0), foam * 0.7);
  color = vec4(col, 1.0);
}`,
  },
  {
    id: 'toon',
    name: 'Toon Outline',
    description: 'Cel-shaded 3-band lighting with dark rim outline',
    defaults: { u_intensity: 1.1, u_color: '#f59447' },
    vertex: DEFAULT_VERTEX,
    fragment: `uniform float u_intensity;
uniform vec3 u_color;

void mainImage(out vec4 color, vec2 uv) {
  float inten = u_intensity > 0.001 ? u_intensity : 1.1;
  vec3 base = length(u_color) > 0.01 ? u_color : vec3(0.96, 0.58, 0.28);
  vec3 n = normalize(worldNormal);
  vec3 v = normalize(cameraPos - worldPos);
  vec3 l = normalize(sunDirection);
  float d = max(dot(n, l), 0.0);
  float bands = floor(d * 3.5 + 0.25) / 3.0;
  float outline = smoothstep(0.22, 0.34, abs(dot(n, v)));
  vec4 texCol = texture(iChannel0, uv);
  vec3 col = base * texCol.rgb * (0.30 + bands * max(0.5, inten)) * outline;
  color = vec4(col, texCol.a);
}`,
  },
  {
    id: 'hologram',
    name: 'Sci-Fi Hologram',
    description: 'Cyan scanlines, fresnel rim glow and digital pulse',
    defaults: { u_speed: 1.0, u_intensity: 1.1, u_color: '#2ee0ff' },
    vertex: DEFAULT_VERTEX,
    fragment: `uniform float u_speed;
uniform float u_intensity;
uniform vec3 u_color;

void mainImage(out vec4 color, vec2 uv) {
  float spd = u_speed > 0.001 ? u_speed : 1.0;
  float inten = u_intensity > 0.001 ? u_intensity : 1.1;
  vec3 base = length(u_color) > 0.01 ? u_color : vec3(0.18, 0.88, 1.0);
  vec3 n = normalize(worldNormal);
  vec3 v = normalize(cameraPos - worldPos);
  float rim = pow(1.0 - abs(dot(n, v)), 2.2);
  float scan = sin(localUV.y * 120.0 - iTime * 8.0 * spd) * 0.5 + 0.5;
  float flicker = 0.88 + 0.12 * sin(iTime * 24.0);
  vec3 col = base * (0.35 + rim * 1.45) * (0.65 + 0.35 * scan) * flicker * max(0.4, inten);
  color = vec4(col + vec3(0.03, 0.05, 0.08), clamp(0.45 + rim * 0.55, 0.0, 1.0));
}`,
  },
  {
    id: 'foliage',
    name: 'Foliage Wind',
    description: 'Dappled forest canopy swaying in breeze',
    defaults: { u_speed: 1.0, u_scale: 1.0, u_color: '#47ad52' },
    vertex: `void mainVertex(inout vec3 position, inout vec3 normal) {
  float sway = sin(position.x * 2.5 + position.z * 2.0 + iTime * 2.4) * 0.09;
  position.x += sway * max(0.0, position.y);
}`,
    fragment: `uniform float u_speed;
uniform float u_scale;
uniform vec3 u_color;

void mainImage(out vec4 color, vec2 uv) {
  float spd = u_speed > 0.001 ? u_speed : 1.0;
  float scl = max(3.0, (u_scale > 0.001 ? u_scale : 1.0) * 10.0);
  vec3 base = length(u_color) > 0.01 ? u_color : vec3(0.28, 0.68, 0.32);
  float sway = sin(uv.y * 6.0 + iTime * 2.4 * spd) * 0.04;
  vec2 p = (uv + vec2(sway, 0.0)) * scl;
  float leaf = sin(p.x) * sin(p.y) + 0.5 * cos(p.x * 1.7 - p.y * 1.3);
  float sun = smoothstep(-0.2, 0.9, leaf);
  vec3 shadowCol = base * 0.35;
  vec3 litCol = base * 1.25 + vec3(0.12, 0.14, 0.02);
  vec4 texCol = texture(iChannel0, uv);
  color = vec4(mix(shadowCol, litCol, sun) * texCol.rgb, texCol.a);
}`,
  },
  {
    id: 'ps1',
    name: 'PS1 Retro Dither',
    description: 'Ordered 4x4 Bayer dithering and 5-bit color quantization',
    defaults: { u_scale: 1.0, u_color: '#739eeb' },
    vertex: DEFAULT_VERTEX,
    fragment: `uniform float u_scale;
uniform vec3 u_color;

void mainImage(out vec4 color, vec2 uv) {
  float scl = u_scale > 0.001 ? u_scale : 1.0;
  vec3 base = length(u_color) > 0.01 ? u_color : vec3(0.45, 0.62, 0.92);
  float px = max(2.0, floor(scl * 4.0));
  vec2 cell = floor(gl_FragCoord.xy / px);
  vec2 qUv = floor(uv * (64.0 / max(1.0, scl))) / (64.0 / max(1.0, scl));
  vec4 texCol = texture(iChannel0, qUv);
  float grad = sin(qUv.x * 4.0 + iTime) * 0.25 + qUv.y * 0.65;
  vec3 col = mix(vec3(0.12, 0.09, 0.18), base * 1.2, clamp(grad, 0.0, 1.0)) * texCol.rgb;
  float bayer = fract(sin(dot(mod(cell, 4.0), vec2(12.9898, 78.233))) * 43758.5453) - 0.5;
  col = floor(col * 8.0 + bayer * 0.45) / 8.0;
  color = vec4(clamp(col, 0.0, 1.0), texCol.a);
}`,
  },
]

interface ParsedUniform {
  name: string
  type: 'float' | 'vec3'
}

const BUILTIN_UNIFORMS = new Set([
  'iTime',
  'iResolution',
  'cameraPos',
  'cameraDir',
  'u_time',
  'u_resolution',
])

function parseCustomUniforms(src: string): ParsedUniform[] {
  const found: ParsedUniform[] = []
  const seen = new Set<string>(BUILTIN_UNIFORMS)
  const re = /uniform\s+(float|vec3)\s+([A-Za-z_][A-Za-z0-9_]*)\s*;/g
  let m: RegExpExecArray | null
  while ((m = re.exec(src))) {
    const [, type, name] = m
    if (!seen.has(name)) {
      seen.add(name)
      found.push({ name, type: type as 'float' | 'vec3' })
    }
  }
  return found
}

function hexToRgbVec(hex: string): [number, number, number] {
  const c = hex.replace('#', '')
  if (c.length < 6) return [0.35, 0.78, 0.95]
  return [parseInt(c.slice(0, 2), 16) / 255, parseInt(c.slice(2, 4), 16) / 255, parseInt(c.slice(4, 6), 16) / 255]
}

function buildPreviewVertex(userVert: string): string {
  const body = userVert.trim()
  const header = `#version 300 es
precision highp float;
uniform float iTime;
uniform vec3 iResolution;
uniform vec3 cameraPos;
const vec2 POS[3] = vec2[3](vec2(-1.0, -1.0), vec2(3.0, -1.0), vec2(-1.0, 3.0));
out vec2 vScreenUv;
`
  if (!body) {
    return `${header}
void main() {
  vec2 p = POS[gl_VertexID];
  vScreenUv = p * 0.5 + 0.5;
  gl_Position = vec4(p, 0.0, 1.0);
}`
  }
  return `${header}
void mainVertex(inout vec3, inout vec3);
void main() {
  vec2 p = POS[gl_VertexID];
  vScreenUv = p * 0.5 + 0.5;
  vec3 pos = vec3(p, 0.0);
  vec3 nrm = vec3(0.0, 1.0, 0.0);
  mainVertex(pos, nrm);
  gl_Position = vec4(p, 0.0, 1.0);
}
${body}
`
}

function buildPreviewFragment(userFrag: string): string {
  const body = userFrag.trim()
  return `#version 300 es
precision highp float;
uniform float iTime;
uniform vec3 iResolution;
uniform vec3 cameraPos;
uniform sampler2D iChannel0;
uniform vec3 sunDirection;
uniform vec3 sunColor;
uniform vec3 ambientColor;
uniform vec3 ambientGroundColor;
in vec2 vScreenUv;
out vec4 mf_outColor;

vec3 worldPos;
vec3 worldNormal;
vec2 localUV;

void mainImage(out vec4, vec2);

void main() {
  vec2 p = vScreenUv * 2.0 - 1.0;
  float aspect = iResolution.x / max(1.0, iResolution.y);
  vec2 sp = vec2(p.x * aspect, p.y);
  float r2 = dot(sp, sp);
  float rad2 = 0.72;
  if (r2 <= rad2) {
    float z = sqrt(max(0.0, rad2 - r2));
    vec3 n = normalize(vec3(sp.x, sp.y, z));
    float ang = iTime * 0.45;
    float ca = cos(ang), sa = sin(ang);
    vec3 rn = vec3(n.x * ca + n.z * sa, n.y, -n.x * sa + n.z * ca);
    worldNormal = n;
    worldPos = n * 1.1;
    localUV = vec2(atan(rn.x, rn.z) / 6.2831853 + 0.5, asin(clamp(rn.y, -1.0, 1.0)) / 3.1415926 + 0.5);
    vec4 col = vec4(1.0);
    mainImage(col, localUV);
    mf_outColor = vec4(col.rgb, 1.0);
  } else {
    float checker = mod(floor(vScreenUv.x * 16.0) + floor(vScreenUv.y * 10.0), 2.0);
    mf_outColor = vec4(mix(vec3(0.07, 0.09, 0.12), vec3(0.095, 0.12, 0.16), checker), 1.0);
  }
}
${body}
`
}

function createPreviewTexture(gl: WebGL2RenderingContext): WebGLTexture | null {
  const tex = gl.createTexture()
  if (!tex) return null
  const size = 64
  const data = new Uint8Array(size * size * 4)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4
      const check = ((x >> 3) + (y >> 3)) & 1
      const v = check ? 235 : 195
      data[idx] = v
      data[idx + 1] = v
      data[idx + 2] = v
      data[idx + 3] = 255
    }
  }
  gl.bindTexture(gl.TEXTURE_2D, tex)
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, size, size, 0, gl.RGBA, gl.UNSIGNED_BYTE, data)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT)
  return tex
}

export function ShaderStudio({
  a,
  changeA,
}: {
  a: Asset
  changeA: (fn: (asset: Asset) => void) => void
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [stage, setStage] = useState<'fragment' | 'vertex'>('fragment')
  const [playing, setPlaying] = useState(true)
  const [compileErr, setCompileErr] = useState<string | null>(null)
  const [uniformValues, setUniformValues] = useState<Record<string, any>>(() => ({
    u_speed: 1.0,
    u_scale: 1.0,
    u_intensity: 1.1,
    u_color: '#38bdf8',
    ...(a.properties?.uniforms && typeof a.properties.uniforms === 'object' ? a.properties.uniforms : {}),
  }))

  const fragSource = a.data || BUILTIN_TEMPLATES.Unlit.fragment
  const vertSource = String(a.properties?.vertex || '')
  const uniforms = useMemo(() => parseCustomUniforms(fragSource), [fragSource])
  const uniformRef = useRef(uniformValues)
  uniformRef.current = uniformValues
  const playingRef = useRef(playing)
  playingRef.current = playing

  const setUniformVal = (name: string, val: number | string) => {
    setUniformValues((prev) => {
      const next = { ...prev, [name]: val }
      changeA((asset) => {
        asset.properties = {
          ...(asset.properties || {}),
          uniforms: { ...((asset.properties?.uniforms as Record<string, any>) || {}), [name]: val },
        }
      })
      return next
    })
  }

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const gl = canvas.getContext('webgl2', { antialias: true })
    if (!gl) {
      setCompileErr('WebGL2 context unavailable in this browser.')
      return
    }

    if (/\bvoid\s+main\s*\(/.test(fragSource)) {
      setCompileErr(
        "Miniforge shaders use `void mainImage(out vec4 color, vec2 uv)` (not `void main()`). LittleJS injects `main()` automatically.",
      )
      return
    }
    if (vertSource && /\bvoid\s+main\s*\(/.test(vertSource)) {
      setCompileErr(
        "Miniforge vertex shaders use `void mainVertex(inout vec3 position, inout vec3 normal)` (not `void main()`).",
      )
      return
    }

    const fullVert = buildPreviewVertex(vertSource)
    const fullFrag = buildPreviewFragment(fragSource)

    const vs = gl.createShader(gl.VERTEX_SHADER)!
    gl.shaderSource(vs, fullVert)
    gl.compileShader(vs)
    if (!gl.getShaderParameter(vs, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(vs) || 'Vertex shader compilation failed.'
      setCompileErr(`Vertex error: ${log.trim()}`)
      gl.deleteShader(vs)
      return
    }

    const fs = gl.createShader(gl.FRAGMENT_SHADER)!
    gl.shaderSource(fs, fullFrag)
    gl.compileShader(fs)
    if (!gl.getShaderParameter(fs, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(fs) || 'Fragment shader compilation failed.'
      setCompileErr(`Fragment error: ${log.trim()}`)
      gl.deleteShader(vs)
      gl.deleteShader(fs)
      return
    }

    const prog = gl.createProgram()!
    gl.attachShader(prog, vs)
    gl.attachShader(prog, fs)
    gl.linkProgram(prog)
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      setCompileErr(gl.getProgramInfoLog(prog) || 'Shader link error.')
      gl.deleteProgram(prog)
      gl.deleteShader(vs)
      gl.deleteShader(fs)
      return
    }

    const previewTex = createPreviewTexture(gl)
    setCompileErr(null)
    let raf = 0
    let t = 0
    let last = performance.now()
    const render = (now: number) => {
      raf = requestAnimationFrame(render)
      const dt = Math.min(0.1, (now - last) / 1000)
      last = now
      if (playingRef.current) t += dt

      const w = canvas.clientWidth || 320
      const h = canvas.clientHeight || 220
      if (canvas.width !== w * 2 || canvas.height !== h * 2) {
        canvas.width = w * 2
        canvas.height = h * 2
      }
      gl.viewport(0, 0, canvas.width, canvas.height)
      gl.useProgram(prog)

      if (previewTex) {
        gl.activeTexture(gl.TEXTURE0)
        gl.bindTexture(gl.TEXTURE_2D, previewTex)
        const ch0 = gl.getUniformLocation(prog, 'iChannel0')
        if (ch0) gl.uniform1i(ch0, 0)
      }

      const uTime = gl.getUniformLocation(prog, 'iTime')
      if (uTime) gl.uniform1f(uTime, t)
      const uRes = gl.getUniformLocation(prog, 'iResolution')
      if (uRes) gl.uniform3f(uRes, canvas.width, canvas.height, 1.0)
      const uCam = gl.getUniformLocation(prog, 'cameraPos')
      if (uCam) gl.uniform3f(uCam, 0.0, 0.25, 2.8)
      const uSunDir = gl.getUniformLocation(prog, 'sunDirection')
      if (uSunDir) gl.uniform3f(uSunDir, 0.6, 0.8, 0.7)
      const uSunCol = gl.getUniformLocation(prog, 'sunColor')
      if (uSunCol) gl.uniform3f(uSunCol, 1.0, 0.97, 0.92)
      const uAmb = gl.getUniformLocation(prog, 'ambientColor')
      if (uAmb) gl.uniform3f(uAmb, 0.24, 0.28, 0.36)
      const uAmbG = gl.getUniformLocation(prog, 'ambientGroundColor')
      if (uAmbG) gl.uniform3f(uAmbG, 0.14, 0.15, 0.18)

      for (const u of uniforms) {
        const loc = gl.getUniformLocation(prog, u.name)
        if (!loc) continue
        const val = uniformRef.current[u.name]
        if (u.type === 'float') {
          gl.uniform1f(loc, Number(val ?? 1.0))
        } else {
          const rgb = hexToRgbVec(typeof val === 'string' ? val : '#38bdf8')
          gl.uniform3f(loc, rgb[0], rgb[1], rgb[2])
        }
      }

      gl.drawArrays(gl.TRIANGLES, 0, 3)
    }
    raf = requestAnimationFrame(render)

    return () => {
      cancelAnimationFrame(raf)
      if (previewTex) gl.deleteTexture(previewTex)
      gl.deleteProgram(prog)
      gl.deleteShader(vs)
      gl.deleteShader(fs)
    }
  }, [fragSource, vertSource, uniforms])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {/* Preset & Stage Toolbar */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          <select
            aria-label="Shader stage"
            value={stage}
            onChange={(e) => setStage(e.target.value as 'fragment' | 'vertex')}
            style={{ fontSize: 12 }}
          >
            <option value="fragment">Fragment (mainImage)</option>
            <option value="vertex">Vertex (mainVertex)</option>
          </select>
          <select
            aria-label="Classic shader templates"
            defaultValue=""
            onChange={(e) => {
              const tpl = BUILTIN_TEMPLATES[e.target.value]
              if (!tpl) return
              setStage('fragment')
              changeA((asset) => {
                asset.data = tpl.fragment
                asset.properties = { ...(asset.properties || {}), vertex: tpl.vertex }
              })
              e.target.value = ''
            }}
            style={{ fontSize: 11.5 }}
          >
            <option value="">Templates…</option>
            {Object.keys(BUILTIN_TEMPLATES).map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
          <span style={{ fontSize: 11, color: '#8b9bb0', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <Sparkles size={12} color="#f59e0b" /> Presets:
          </span>
          {SHADER_STUDIO_PRESETS.map((pr) => (
            <button
              key={pr.id}
              type="button"
              className="mf-btn"
              style={{ fontSize: 11, padding: '3px 8px' }}
              title={pr.description}
              onClick={() => {
                setStage('fragment')
                if (pr.defaults) setUniformValues((prev) => ({ ...prev, ...pr.defaults }))
                changeA((asset) => {
                  asset.data = pr.fragment
                  asset.properties = {
                    ...(asset.properties || {}),
                    vertex: pr.vertex,
                    ...(pr.defaults ? { uniforms: { ...pr.defaults } } : {}),
                  }
                })
              }}
            >
              {pr.name}
            </button>
          ))}
        </div>
        <button type="button" className="mf-btn" style={{ fontSize: 11 }} onClick={() => setPlaying((v) => !v)}>
          {playing ? <Pause size={12} /> : <Play size={12} />} {playing ? 'Pause' : 'Play'}
        </button>
      </div>

      {/* Compile Status Banner */}
      <div
        style={{
          padding: '6px 10px',
          borderRadius: 6,
          fontSize: 11.5,
          fontFamily: 'ui-monospace, monospace',
          background: compileErr ? 'rgba(229,83,75,0.16)' : 'rgba(87,209,99,0.12)',
          color: compileErr ? '#ff7b72' : '#7ee787',
          border: '1px solid ' + (compileErr ? 'rgba(255,123,114,0.4)' : 'rgba(126,231,135,0.3)'),
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          whiteSpace: 'pre-wrap',
        }}
      >
        {compileErr ? <AlertTriangle size={13} /> : <CheckCircle2 size={13} />}
        <span>{compileErr || 'LittleJS / GLSL ES 3.00 compiled cleanly — live preview running'}</span>
      </div>

      {/* Side-by-Side Live Preview + Uniform Sliders & Code Editor */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(260px, 340px) minmax(0, 1fr)', gap: 10, minHeight: 340 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ border: '1px solid #2b323b', borderRadius: 8, overflow: 'hidden', height: 220, background: '#090d12' }}>
            <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block' }} />
          </div>
          <div style={{ border: '1px solid #2b323b', borderRadius: 8, padding: 10, background: '#141a22', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <strong style={{ fontSize: 11.5, color: '#cbd5e1', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Shader Uniforms ({uniforms.length})
            </strong>
            {uniforms.length === 0 ? (
              <span style={{ fontSize: 11, color: '#8b9bb0' }}>
                Declare `uniform float u_name;` or `uniform vec3 u_color;` to generate sliders and control them at runtime via `api.materials.setShaderUniform(...)`.
              </span>
            ) : (
              uniforms.map((u) => (
                <label key={u.name} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, fontSize: 11.5, color: '#cbd5e1' }}>
                  <span style={{ fontFamily: 'ui-monospace, monospace' }}>{u.name}</span>
                  {u.type === 'float' ? (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      <input
                        type="range"
                        min={0}
                        max={3}
                        step={0.05}
                        value={Number(uniformValues[u.name] ?? 1.0)}
                        onChange={(e) => setUniformVal(u.name, Number(e.target.value))}
                        style={{ width: 110 }}
                      />
                      <span style={{ width: 32, textAlign: 'right', fontFamily: 'ui-monospace, monospace', fontSize: 11 }}>
                        {Number(uniformValues[u.name] ?? 1.0).toFixed(2)}
                      </span>
                    </span>
                  ) : (
                    <input
                      type="color"
                      value={typeof uniformValues[u.name] === 'string' ? uniformValues[u.name] : '#38bdf8'}
                      onChange={(e) => setUniformVal(u.name, e.target.value)}
                    />
                  )}
                </label>
              ))
            )}
          </div>
        </div>

        <textarea
          spellCheck={false}
          value={stage === 'vertex' ? vertSource : fragSource}
          onChange={(e) => {
            const val = e.target.value
            changeA((asset) => {
              if (stage === 'vertex') asset.properties = { ...(asset.properties || {}), vertex: val }
              else asset.data = val
            })
          }}
          style={{
            width: '100%',
            minHeight: 340,
            resize: 'vertical',
            borderRadius: 8,
            border: '1px solid #2b323b',
            padding: 12,
            background: '#0d1117',
            color: '#e6edf3',
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
            fontSize: 12,
            lineHeight: 1.5,
          }}
        />
      </div>
    </div>
  )
}
