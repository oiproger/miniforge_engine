export interface PostProcessOptions {
  /** Screen-space cavity ambient occlusion intensity (0..1). */
  ao?: number
  /** AO sampling radius in pixels (1..6). */
  aoRadius?: number
  /** Depth-of-field bokeh blur strength (0..1). */
  dof?: number
  /** Normalized vertical focus center (0..1, default 0.5). */
  dofFocus?: number
  /** Clear focus band width (0.05..0.5, default 0.22). */
  dofAperture?: number
  /** Bloom glow intensity (0..2). */
  bloom?: number
  /** Luminance threshold for bloom extraction (0.3..1.0, default 0.72). */
  bloomThreshold?: number
  /** Edge darkening vignette strength (0..1). */
  vignette?: number
  /** RGB chromatic aberration strength (0..1, ideal for anomalies). */
  chromatic?: number
  /** Animated film grain strength (0..0.4). */
  grain?: number
  /** CRT scanline overlay strength (0..1). */
  scanlines?: number
  /** Color contrast multiplier (0.5..2, default 1). */
  contrast?: number
  /** Color saturation multiplier (0..2, default 1). */
  saturation?: number
  /** Tone mapping mode: 'aces' or 'none'. */
  toneMapping?: 'aces' | 'none'
}

export const defaultPostProcess: Required<PostProcessOptions> = {
  ao: 0,
  aoRadius: 2.5,
  dof: 0,
  dofFocus: 0.5,
  dofAperture: 0.22,
  bloom: 0,
  bloomThreshold: 0.72,
  vignette: 0,
  chromatic: 0,
  grain: 0,
  scanlines: 0,
  contrast: 1,
  saturation: 1,
  toneMapping: 'none',
}

const VERT = `#version 300 es
precision highp float;
const vec2 POS[3] = vec2[3](vec2(-1.0, -1.0), vec2(3.0, -1.0), vec2(-1.0, 3.0));
out vec2 vUV;
void main() {
  vec2 p = POS[gl_VertexID];
  vUV = p * 0.5 + 0.5;
  gl_Position = vec4(p, 0.0, 1.0);
}`

const FRAG = `#version 300 es
precision highp float;
uniform sampler2D uScene;
uniform vec2 uTexel;
uniform float uTime;
uniform float uAO, uAORadius;
uniform float uDOF, uDOFFocus, uDOFAperture;
uniform float uBloom, uBloomThreshold;
uniform float uVignette, uChromatic, uGrain, uScanlines;
uniform float uContrast, uSaturation;
uniform int uToneMap;
in vec2 vUV;
out vec4 outColor;

float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }

vec3 aces(vec3 x) {
  const float a = 2.51, b = 0.03, c = 2.43, d = 0.59, e = 0.14;
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
}

vec3 sampleChromatic(vec2 uv) {
  if (uChromatic <= 0.001) return texture(uScene, uv).rgb;
  vec2 dir = (uv - 0.5) * uChromatic * 0.018;
  return vec3(
    texture(uScene, clamp(uv + dir, 0.001, 0.999)).r,
    texture(uScene, uv).g,
    texture(uScene, clamp(uv - dir, 0.001, 0.999)).b
  );
}

void main() {
  vec2 uv = vUV;
  vec3 col = sampleChromatic(uv);

  // Depth of Field (soft circular bokeh outside focus band)
  if (uDOF > 0.001) {
    float edgeDist = max(0.0, abs(uv.y - uDOFFocus) - uDOFAperture);
    float radDist = max(0.0, length((uv - vec2(0.5, uDOFFocus)) * vec2(0.75, 1.0)) - uDOFAperture);
    float blurAmt = clamp(max(edgeDist, radDist * 0.85) * 3.2, 0.0, 1.0) * uDOF;
    if (blurAmt > 0.01) {
      vec3 acc = col;
      float r = blurAmt * 5.0;
      const vec2 OFF[8] = vec2[8](
        vec2(1.0, 0.0), vec2(-1.0, 0.0), vec2(0.0, 1.0), vec2(0.0, -1.0),
        vec2(0.707, 0.707), vec2(-0.707, 0.707), vec2(0.707, -0.707), vec2(-0.707, -0.707)
      );
      for (int i = 0; i < 8; i++) {
        acc += texture(uScene, clamp(uv + OFF[i] * uTexel * r, 0.001, 0.999)).rgb;
      }
      col = mix(col, acc / 9.0, clamp(blurAmt * 1.15, 0.0, 1.0));
    }
  }

  // Screen-Space Cavity Ambient Occlusion
  if (uAO > 0.001) {
    float cL = luma(col);
    float occ = 0.0;
    float r = uAORadius;
    const vec2 AO_OFF[8] = vec2[8](
      vec2(1.0, 0.0), vec2(-1.0, 0.0), vec2(0.0, 1.0), vec2(0.0, -1.0),
      vec2(1.5, 1.5), vec2(-1.5, 1.5), vec2(1.5, -1.5), vec2(-1.5, -1.5)
    );
    for (int i = 0; i < 8; i++) {
      float sL = luma(texture(uScene, clamp(uv + AO_OFF[i] * uTexel * r, 0.001, 0.999)).rgb);
      occ += clamp(sL - cL, 0.0, 0.35);
    }
    float aoFactor = 1.0 - clamp(occ * 1.45 * uAO, 0.0, 0.65);
    col *= aoFactor;
  }

  // Soft 9-tap Bloom
  if (uBloom > 0.001) {
    vec3 glow = vec3(0.0);
    for (int x = -1; x <= 1; x++) {
      for (int y = -1; y <= 1; y++) {
        vec3 s = texture(uScene, clamp(uv + vec2(float(x), float(y)) * uTexel * 3.2, 0.001, 0.999)).rgb;
        float b = max(0.0, luma(s) - uBloomThreshold);
        glow += s * (b / max(0.001, 1.0 - uBloomThreshold));
      }
    }
    col += (glow / 9.0) * uBloom;
  }

  // Contrast & Saturation
  col = (col - 0.5) * uContrast + 0.5;
  float l = luma(col);
  col = mix(vec3(l), col, uSaturation);

  // ACES Filmic Tone Mapping
  if (uToneMap == 1) {
    col = aces(max(col, vec3(0.0)));
  }

  // Vignette
  if (uVignette > 0.001) {
    float d = length((uv - 0.5) * vec2(1.15, 1.0));
    col *= 1.0 - smoothstep(0.35, 0.95, d) * uVignette;
  }

  // Film Grain
  if (uGrain > 0.001) {
    float n = fract(sin(dot(uv * vec2(12.9898, 78.233) + uTime * 0.37, vec2(43758.5453, 19134.123))) * 43758.5453);
    col += (n - 0.5) * uGrain;
  }

  // Scanlines
  if (uScanlines > 0.001) {
    float scan = 0.5 + 0.5 * sin(gl_FragCoord.y * 1.5);
    col *= 1.0 - scan * uScanlines * 0.25;
  }

  outColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}`

/** Isolated WebGL2 post-processing compositor layered over the LittleJS canvas. */
export class PostProcessor {
  private canvas: HTMLCanvasElement
  private gl: WebGL2RenderingContext | null = null
  private program: WebGLProgram | null = null
  private tex: WebGLTexture | null = null
  private vao: WebGLVertexArrayObject | null = null
  private uniforms: Record<string, WebGLUniformLocation | null> = {}
  private opts: Required<PostProcessOptions> = { ...defaultPostProcess }
  private startTime = performance.now()

  constructor(container: HTMLElement) {
    this.canvas = document.createElement('canvas')
    this.canvas.style.cssText =
      'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;display:none;z-index:1'
    container.append(this.canvas)
  }

  get active(): boolean {
    const o = this.opts
    return (
      o.ao > 0.001 ||
      o.dof > 0.001 ||
      o.bloom > 0.001 ||
      o.vignette > 0.001 ||
      o.chromatic > 0.001 ||
      o.grain > 0.001 ||
      o.scanlines > 0.001 ||
      Math.abs(o.contrast - 1) > 0.005 ||
      Math.abs(o.saturation - 1) > 0.005 ||
      o.toneMapping === 'aces'
    )
  }

  setOptions(next: Partial<PostProcessOptions>) {
    Object.assign(this.opts, next)
    if (!this.active) this.canvas.style.display = 'none'
  }

  getOptions(): Required<PostProcessOptions> {
    return { ...this.opts }
  }

  private init(): boolean {
    if (this.gl && this.program) return true
    const gl = this.canvas.getContext('webgl2', { alpha: false, antialias: false, depth: false, stencil: false })
    if (!gl) return false
    const compile = (type: number, src: string) => {
      const s = gl.createShader(type)!
      gl.shaderSource(s, src)
      gl.compileShader(s)
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        console.warn('PostProcess shader error:', gl.getShaderInfoLog(s))
        gl.deleteShader(s)
        return null
      }
      return s
    }
    const vs = compile(gl.VERTEX_SHADER, VERT)
    const fs = compile(gl.FRAGMENT_SHADER, FRAG)
    if (!vs || !fs) return false
    const prog = gl.createProgram()!
    gl.attachShader(prog, vs)
    gl.attachShader(prog, fs)
    gl.linkProgram(prog)
    gl.deleteShader(vs)
    gl.deleteShader(fs)
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      console.warn('PostProcess link error:', gl.getProgramInfoLog(prog))
      gl.deleteProgram(prog)
      return false
    }
    const tex = gl.createTexture()!
    gl.bindTexture(gl.TEXTURE_2D, tex)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 1)

    this.gl = gl
    this.program = prog
    this.tex = tex
    this.vao = gl.createVertexArray()
    for (const name of [
      'uScene',
      'uTexel',
      'uTime',
      'uAO',
      'uAORadius',
      'uDOF',
      'uDOFFocus',
      'uDOFAperture',
      'uBloom',
      'uBloomThreshold',
      'uVignette',
      'uChromatic',
      'uGrain',
      'uScanlines',
      'uContrast',
      'uSaturation',
      'uToneMap',
    ]) {
      this.uniforms[name] = gl.getUniformLocation(prog, name)
    }
    return true
  }

  render(sourceCanvas: HTMLCanvasElement) {
    if (!this.active || !sourceCanvas.width || !sourceCanvas.height) {
      this.canvas.style.display = 'none'
      return
    }
    if (!this.init() || !this.gl || !this.program || !this.tex) return
    this.canvas.style.display = 'block'
    const gl = this.gl
    if (this.canvas.width !== sourceCanvas.width || this.canvas.height !== sourceCanvas.height) {
      this.canvas.width = sourceCanvas.width
      this.canvas.height = sourceCanvas.height
    }
    gl.viewport(0, 0, this.canvas.width, this.canvas.height)
    gl.useProgram(this.program)
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, this.tex)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, sourceCanvas)

    const u = this.uniforms
    const o = this.opts
    gl.uniform1i(u.uScene, 0)
    gl.uniform2f(u.uTexel, 1 / this.canvas.width, 1 / this.canvas.height)
    gl.uniform1f(u.uTime, (performance.now() - this.startTime) / 1000)
    gl.uniform1f(u.uAO, o.ao)
    gl.uniform1f(u.uAORadius, o.aoRadius)
    gl.uniform1f(u.uDOF, o.dof)
    gl.uniform1f(u.uDOFFocus, o.dofFocus)
    gl.uniform1f(u.uDOFAperture, o.dofAperture)
    gl.uniform1f(u.uBloom, o.bloom)
    gl.uniform1f(u.uBloomThreshold, o.bloomThreshold)
    gl.uniform1f(u.uVignette, o.vignette)
    gl.uniform1f(u.uChromatic, o.chromatic)
    gl.uniform1f(u.uGrain, o.grain)
    gl.uniform1f(u.uScanlines, o.scanlines)
    gl.uniform1f(u.uContrast, o.contrast)
    gl.uniform1f(u.uSaturation, o.saturation)
    gl.uniform1i(u.uToneMap, o.toneMapping === 'aces' ? 1 : 0)

    gl.bindVertexArray(this.vao)
    gl.drawArrays(gl.TRIANGLES, 0, 3)
  }

  dispose() {
    if (this.gl) {
      if (this.tex) this.gl.deleteTexture(this.tex)
      if (this.program) this.gl.deleteProgram(this.program)
      if (this.vao) this.gl.deleteVertexArray(this.vao)
      this.gl.getExtension('WEBGL_lose_context')?.loseContext()
    }
    this.canvas.remove()
    this.gl = null
    this.program = null
    this.tex = null
  }
}
