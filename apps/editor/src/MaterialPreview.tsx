import { useEffect, useRef, useState } from 'react'
import { RotateCw, Sun, Sunset, Moon } from 'lucide-react'
import type { Asset, Project } from '../../../packages/project-schema/src'

type ShapeKind = 'sphere' | 'cube' | 'torus' | 'plane'
type LightPreset = 'studio' | 'sunset' | 'night'

function hexToRgb(hex: string | undefined, fallback: [number, number, number]): [number, number, number] {
  if (!hex || typeof hex !== 'string') return fallback
  const clean = hex.trim().replace(/^#/, '')
  if (clean.length === 3) {
    const r = parseInt(clean[0] + clean[0], 16) / 255
    const g = parseInt(clean[1] + clean[1], 16) / 255
    const b = parseInt(clean[2] + clean[2], 16) / 255
    return [r, g, b]
  }
  if (clean.length >= 6) {
    const r = parseInt(clean.slice(0, 2), 16) / 255
    const g = parseInt(clean.slice(2, 4), 16) / 255
    const b = parseInt(clean.slice(4, 6), 16) / 255
    if (Number.isFinite(r) && Number.isFinite(g) && Number.isFinite(b)) return [r, g, b]
  }
  return fallback
}

function buildGeometry(kind: ShapeKind): { positions: Float32Array; normals: Float32Array; uvs: Float32Array; indices: Uint16Array } {
  const pos: number[] = []
  const norm: number[] = []
  const uv: number[] = []
  const idx: number[] = []

  if (kind === 'sphere') {
    const lat = 28
    const lon = 36
    for (let y = 0; y <= lat; y++) {
      const v = y / lat
      const theta = v * Math.PI
      const sinT = Math.sin(theta)
      const cosT = Math.cos(theta)
      for (let x = 0; x <= lon; x++) {
        const u = x / lon
        const phi = u * Math.PI * 2
        const nx = Math.cos(phi) * sinT
        const ny = cosT
        const nz = Math.sin(phi) * sinT
        pos.push(nx, ny, nz)
        norm.push(nx, ny, nz)
        uv.push(u, 1 - v)
      }
    }
    for (let y = 0; y < lat; y++) {
      for (let x = 0; x < lon; x++) {
        const a = y * (lon + 1) + x
        const b = a + lon + 1
        idx.push(a, b, a + 1, b, b + 1, a + 1)
      }
    }
  } else if (kind === 'cube') {
    const faces: Array<{ n: [number, number, number]; v: [number, number, number][] }> = [
      { n: [0, 0, 1], v: [[-0.8, -0.8, 0.8], [0.8, -0.8, 0.8], [0.8, 0.8, 0.8], [-0.8, 0.8, 0.8]] },
      { n: [0, 0, -1], v: [[0.8, -0.8, -0.8], [-0.8, -0.8, -0.8], [-0.8, 0.8, -0.8], [0.8, 0.8, -0.8]] },
      { n: [0, 1, 0], v: [[-0.8, 0.8, 0.8], [0.8, 0.8, 0.8], [0.8, 0.8, -0.8], [-0.8, 0.8, -0.8]] },
      { n: [0, -1, 0], v: [[-0.8, -0.8, -0.8], [0.8, -0.8, -0.8], [0.8, -0.8, 0.8], [-0.8, -0.8, 0.8]] },
      { n: [1, 0, 0], v: [[0.8, -0.8, 0.8], [0.8, -0.8, -0.8], [0.8, 0.8, -0.8], [0.8, 0.8, 0.8]] },
      { n: [-1, 0, 0], v: [[-0.8, -0.8, -0.8], [-0.8, -0.8, 0.8], [-0.8, 0.8, 0.8], [-0.8, 0.8, -0.8]] },
    ]
    const fuv = [[0, 0], [1, 0], [1, 1], [0, 1]]
    faces.forEach((f, fi) => {
      const base = fi * 4
      f.v.forEach((pt, vi) => {
        pos.push(...pt)
        norm.push(...f.n)
        uv.push(fuv[vi][0], fuv[vi][1])
      })
      idx.push(base, base + 1, base + 2, base, base + 2, base + 3)
    })
  } else if (kind === 'torus') {
    const segU = 36
    const segV = 20
    const R = 0.72
    const r = 0.28
    for (let i = 0; i <= segU; i++) {
      const u = (i / segU) * Math.PI * 2
      const cu = Math.cos(u)
      const su = Math.sin(u)
      for (let j = 0; j <= segV; j++) {
        const v = (j / segV) * Math.PI * 2
        const cv = Math.cos(v)
        const sv = Math.sin(v)
        const px = (R + r * cv) * cu
        const py = r * sv
        const pz = (R + r * cv) * su
        pos.push(px, py, pz)
        norm.push(cv * cu, sv, cv * su)
        uv.push(i / segU, j / segV)
      }
    }
    for (let i = 0; i < segU; i++) {
      for (let j = 0; j < segV; j++) {
        const a = i * (segV + 1) + j
        const b = a + segV + 1
        idx.push(a, b, a + 1, b, b + 1, a + 1)
      }
    }
  } else {
    pos.push(-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0)
    norm.push(0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1)
    uv.push(0, 0, 1, 0, 1, 1, 0, 1)
    idx.push(0, 1, 2, 0, 2, 3)
  }

  return {
    positions: new Float32Array(pos),
    normals: new Float32Array(norm),
    uvs: new Float32Array(uv),
    indices: new Uint16Array(idx),
  }
}

const VS_SRC = `#version 300 es
precision highp float;
layout(location=0) in vec3 a_pos;
layout(location=1) in vec3 a_norm;
layout(location=2) in vec2 a_uv;
uniform mat4 u_mvp;
uniform mat3 u_normMat;
out vec3 v_norm;
out vec3 v_pos;
out vec2 v_uv;
void main() {
  v_norm = normalize(u_normMat * a_norm);
  v_pos = (u_normMat * a_pos);
  v_uv = a_uv;
  gl_Position = u_mvp * vec4(a_pos, 1.0);
}`

const FS_SRC = `#version 300 es
precision highp float;
in vec3 v_norm;
in vec3 v_pos;
in vec2 v_uv;
uniform vec3 u_albedo;
uniform float u_roughness;
uniform float u_metalness;
uniform vec3 u_emissive;
uniform float u_emissiveInt;
uniform float u_opacity;
uniform vec3 u_lightDir;
uniform vec3 u_lightCol;
uniform vec3 u_ambCol;
uniform sampler2D u_tex;
uniform int u_hasTex;
uniform int u_unlit;
out vec4 fragColor;
void main() {
  vec3 N = normalize(v_norm);
  vec3 V = normalize(vec3(0.0, 0.0, 3.0) - v_pos);
  vec3 L = normalize(u_lightDir);
  vec3 H = normalize(L + V);
  vec3 base = u_albedo;
  if (u_hasTex == 1) {
    base *= texture(u_tex, v_uv).rgb;
  }
  float diff = max(dot(N, L), 0.0);
  float shininess = mix(128.0, 6.0, clamp(u_roughness, 0.05, 1.0));
  float specPow = pow(max(dot(N, H), 0.0), shininess);
  vec3 F0 = mix(vec3(0.04), base, clamp(u_metalness, 0.0, 1.0));
  vec3 diffuse = base * (1.0 - clamp(u_metalness, 0.0, 1.0) * 0.85) * diff * u_lightCol;
  vec3 specular = F0 * specPow * (1.3 - u_roughness * 0.7) * u_lightCol;
  float fresnel = pow(1.0 - max(dot(N, V), 0.0), 3.0);
  vec3 rim = u_ambCol * fresnel * (0.4 + u_metalness * 0.6);
  vec3 col = u_unlit == 1 ? (base + u_emissive * u_emissiveInt) : (base * u_ambCol + diffuse + specular + rim + u_emissive * u_emissiveInt);
  if (u_unlit == 0) {
    col = col / (col + vec3(1.0));
    col = pow(col, vec3(1.0 / 2.2));
  }
  fragColor = vec4(col, clamp(u_opacity, 0.05, 1.0));
}`

function mul4(a: Float32Array, b: Float32Array): Float32Array {
  const o = new Float32Array(16)
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      o[c * 4 + r] =
        a[0 * 4 + r] * b[c * 4 + 0] +
        a[1 * 4 + r] * b[c * 4 + 1] +
        a[2 * 4 + r] * b[c * 4 + 2] +
        a[3 * 4 + r] * b[c * 4 + 3]
    }
  }
  return o
}

function perspective(fovRad: number, aspect: number, near: number, far: number): Float32Array {
  const f = 1 / Math.tan(fovRad / 2)
  const nf = 1 / (near - far)
  return new Float32Array([f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) * nf, -1, 0, 0, 2 * far * near * nf, 0])
}

export function MaterialPreview({ p, a, compact = false, height }: { p: Project; a: Asset; compact?: boolean; height?: number }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [shape, setShape] = useState<ShapeKind>('sphere')
  const [lightPreset, setLightPreset] = useState<LightPreset>('studio')
  const [autoRotate, setAutoRotate] = useState(true)
  const rotRef = useRef({ yaw: 0.45, pitch: 0.25, dragging: false, lx: 0, ly: 0 })

  const props = a.properties || {}
  const albedoHex = String(props.color ?? '#78aca0')
  const roughness = Number(props.roughness ?? 0.55)
  const metalness = Number(props.metalness ?? 0.1)
  const emissiveHex = String(props.emissive ?? '#000000')
  const emissiveInt = Number(props.emissiveIntensity ?? (emissiveHex && emissiveHex !== "#000000" ? 1 : 0))
  const unlit = Boolean(props.unlit)
  const opacity = Number(props.opacity ?? 1)
  const wireframe = Boolean(props.wireframe)
  const texAssetId = String(props.map ?? props.texture ?? '')
  const texAsset = p.assets.find((x) => x.id === texAssetId && x.type === 'texture')

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const gl = canvas.getContext('webgl2', { antialias: true, alpha: true })
    if (!gl) return

    const compile = (type: number, src: string) => {
      const sh = gl.createShader(type)!
      gl.shaderSource(sh, src)
      gl.compileShader(sh)
      return sh
    }
    const prog = gl.createProgram()!
    const vs = compile(gl.VERTEX_SHADER, VS_SRC)
    const fs = compile(gl.FRAGMENT_SHADER, FS_SRC)
    gl.attachShader(prog, vs)
    gl.attachShader(prog, fs)
    gl.linkProgram(prog)
    gl.useProgram(prog)

    const geo = buildGeometry(shape)
    const vao = gl.createVertexArray()
    gl.bindVertexArray(vao)

    const bindBuf = (loc: number, data: Float32Array, size: number) => {
      const buf = gl.createBuffer()
      gl.bindBuffer(gl.ARRAY_BUFFER, buf)
      gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW)
      gl.enableVertexAttribArray(loc)
      gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0)
      return buf
    }
    const b0 = bindBuf(0, geo.positions, 3)
    const b1 = bindBuf(1, geo.normals, 3)
    const b2 = bindBuf(2, geo.uvs, 2)
    const ibo = gl.createBuffer()
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo)
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, geo.indices, gl.STATIC_DRAW)

    const tex = gl.createTexture()
    gl.bindTexture(gl.TEXTURE_2D, tex)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([255, 255, 255, 255]))
    let hasTex = 0
    if (texAsset?.data) {
      const img = new Image()
      img.onload = () => {
        gl.bindTexture(gl.TEXTURE_2D, tex)
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img)
        gl.generateMipmap(gl.TEXTURE_2D)
        hasTex = 1
      }
      img.src = texAsset.data
    }

    const uMvp = gl.getUniformLocation(prog, 'u_mvp')
    const uNorm = gl.getUniformLocation(prog, 'u_normMat')
    const uAlbedo = gl.getUniformLocation(prog, 'u_albedo')
    const uRough = gl.getUniformLocation(prog, 'u_roughness')
    const uMetal = gl.getUniformLocation(prog, 'u_metalness')
    const uEmiss = gl.getUniformLocation(prog, 'u_emissive')
    const uEmissInt = gl.getUniformLocation(prog, 'u_emissiveInt')
    const uOpacity = gl.getUniformLocation(prog, 'u_opacity')
    const uLDir = gl.getUniformLocation(prog, 'u_lightDir')
    const uLCol = gl.getUniformLocation(prog, 'u_lightCol')
    const uAmb = gl.getUniformLocation(prog, 'u_ambCol')
    const uHasTex = gl.getUniformLocation(prog, 'u_hasTex')
    const uUnlit = gl.getUniformLocation(prog, 'u_unlit')

    let raf = 0
    const render = () => {
      raf = requestAnimationFrame(render)
      if (autoRotate && !rotRef.current.dragging) rotRef.current.yaw += 0.009
      const rect = canvas.getBoundingClientRect()
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const pw = Math.max(2, Math.round((rect.width || 320) * dpr))
      const ph = Math.max(2, Math.round((rect.height || 240) * dpr))
      if (canvas.width !== pw || canvas.height !== ph) {
        canvas.width = pw
        canvas.height = ph
      }
      gl.viewport(0, 0, canvas.width, canvas.height)
      const bg = lightPreset === 'night' ? [0.04, 0.06, 0.09] : lightPreset === 'sunset' ? [0.12, 0.08, 0.1] : [0.08, 0.11, 0.15]
      gl.clearColor(bg[0], bg[1], bg[2], 1)
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)
      gl.enable(gl.DEPTH_TEST)
      gl.enable(gl.BLEND)
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)

      const cy = Math.cos(rotRef.current.yaw)
      const sy = Math.sin(rotRef.current.yaw)
      const cx = Math.cos(rotRef.current.pitch)
      const sx = Math.sin(rotRef.current.pitch)

      const rotY = new Float32Array([cy, 0, -sy, 0, 0, 1, 0, 0, sy, 0, cy, 0, 0, 0, 0, 1])
      const rotX = new Float32Array([1, 0, 0, 0, 0, cx, sx, 0, 0, -sx, cx, 0, 0, 0, 0, 1])
      const model = mul4(rotX, rotY)
      const view = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, -3.15, 1])
      const proj = perspective(Math.PI / 4, canvas.width / Math.max(1, canvas.height), 0.1, 20)
      const mvp = mul4(proj, mul4(view, model))
      const normMat = new Float32Array([
        model[0], model[1], model[2],
        model[4], model[5], model[6],
        model[8], model[9], model[10],
      ])

      gl.useProgram(prog)
      gl.bindVertexArray(vao)
      gl.uniformMatrix4fv(uMvp, false, mvp)
      gl.uniformMatrix3fv(uNorm, false, normMat)
      gl.uniform3fv(uAlbedo, hexToRgb(albedoHex, [0.47, 0.67, 0.63]))
      gl.uniform1f(uRough, roughness)
      gl.uniform1f(uMetal, metalness)
      gl.uniform3fv(uEmiss, hexToRgb(emissiveHex, [0, 0, 0]))
      gl.uniform1f(uEmissInt, emissiveInt)
      gl.uniform1f(uOpacity, opacity)

      if (lightPreset === 'studio') {
        gl.uniform3f(uLDir, 0.65, 0.8, 0.7)
        gl.uniform3f(uLCol, 1.35, 1.32, 1.28)
        gl.uniform3f(uAmb, 0.28, 0.34, 0.42)
      } else if (lightPreset === 'sunset') {
        gl.uniform3f(uLDir, -0.8, 0.35, 0.55)
        gl.uniform3f(uLCol, 1.6, 0.95, 0.55)
        gl.uniform3f(uAmb, 0.26, 0.2, 0.32)
      } else {
        gl.uniform3f(uLDir, 0.2, 0.6, 0.8)
        gl.uniform3f(uLCol, 0.42, 0.52, 0.72)
        gl.uniform3f(uAmb, 0.08, 0.11, 0.16)
      }

      gl.activeTexture(gl.TEXTURE0)
      gl.bindTexture(gl.TEXTURE_2D, tex)
      gl.uniform1i(uHasTex, hasTex)
      gl.uniform1i(uUnlit, unlit ? 1 : 0)
      gl.drawElements(wireframe ? gl.LINES : gl.TRIANGLES, geo.indices.length, gl.UNSIGNED_SHORT, 0)
    }
    render()

    return () => {
      cancelAnimationFrame(raf)
      gl.deleteBuffer(b0)
      gl.deleteBuffer(b1)
      gl.deleteBuffer(b2)
      gl.deleteBuffer(ibo)
      gl.deleteTexture(tex)
      gl.deleteVertexArray(vao)
      gl.deleteProgram(prog)
      gl.deleteShader(vs)
      gl.deleteShader(fs)
    }
  }, [shape, lightPreset, autoRotate, albedoHex, roughness, metalness, emissiveHex, emissiveInt, opacity, wireframe, unlit, texAsset?.data])

  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden', background: '#0d1117', marginBottom: compact ? 8 : 0, flexShrink: 0 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 10px', borderBottom: '1px solid #242c37', background: '#141a22', flexWrap: 'wrap', gap: 6 }}>
        <div style={{ display: 'flex', gap: 4 }}>
          {(['sphere', 'cube', 'torus', 'plane'] as ShapeKind[]).map((k) => (
            <button
              key={k}
              type="button"
              className={shape === k ? 'mf-primary' : 'mf-btn'}
              style={{ padding: '3px 8px', fontSize: 11, textTransform: 'capitalize' }}
              onClick={() => setShape(k)}
            >
              {k}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          <button type="button" className={lightPreset === 'studio' ? 'mf-primary' : 'mf-btn'} style={{ padding: '3px 7px', fontSize: 11 }} onClick={() => setLightPreset('studio')} title="Studio Light">
            <Sun size={12} />
          </button>
          <button type="button" className={lightPreset === 'sunset' ? 'mf-primary' : 'mf-btn'} style={{ padding: '3px 7px', fontSize: 11 }} onClick={() => setLightPreset('sunset')} title="Sunset Light">
            <Sunset size={12} />
          </button>
          <button type="button" className={lightPreset === 'night' ? 'mf-primary' : 'mf-btn'} style={{ padding: '3px 7px', fontSize: 11 }} onClick={() => setLightPreset('night')} title="Night / Emissive">
            <Moon size={12} />
          </button>
          <button type="button" className={autoRotate ? 'mf-primary' : 'mf-btn'} style={{ padding: '3px 7px', fontSize: 11 }} onClick={() => setAutoRotate((v) => !v)} title="Auto-Rotate">
            <RotateCw size={12} />
          </button>
        </div>
      </div>
      <div style={{ position: 'relative', height: height ?? (compact ? 150 : 340), width: '100%' }}>
        <canvas
          ref={canvasRef}
          style={{ width: '100%', height: '100%', display: 'block', cursor: 'grab' }}
          onPointerDown={(e) => {
            rotRef.current.dragging = true
            rotRef.current.lx = e.clientX
            rotRef.current.ly = e.clientY
            ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
          }}
          onPointerMove={(e) => {
            if (!rotRef.current.dragging) return
            rotRef.current.yaw += (e.clientX - rotRef.current.lx) * 0.012
            rotRef.current.pitch = Math.max(-1.3, Math.min(1.3, rotRef.current.pitch + (e.clientY - rotRef.current.ly) * 0.012))
            rotRef.current.lx = e.clientX
            rotRef.current.ly = e.clientY
          }}
          onPointerUp={() => {
            rotRef.current.dragging = false
          }}
        />
        <span style={{ position: 'absolute', bottom: 6, right: 8, fontSize: 10, color: '#8b9bb0', background: 'rgba(13,17,23,0.72)', padding: '2px 6px', borderRadius: 4 }}>
          Live 3D PBR · Drag to orbit
        </span>
      </div>
    </div>
  )
}
