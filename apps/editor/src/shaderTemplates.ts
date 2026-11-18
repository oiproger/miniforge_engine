const plainVertex = `varying vec2 vUv;
varying vec3 vNormal;
void main() {
  vUv = uv;
  vNormal = normalize(normalMatrix * normal);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`
const fragment = (main: string) => `uniform vec3 uColor;
uniform float uTime;
varying vec2 vUv;
varying vec3 vNormal;
void main() {
  ${main}
}`
export const shaders: Record<string, { vertex: string; fragment: string }> = {
  Unlit: { vertex: plainVertex, fragment: fragment('gl_FragColor = vec4(uColor, 1.0);') },
  'Vertex wave': {
    vertex:
      'uniform float uTime;\n' +
      plainVertex.replace(
        'vec4(position, 1.0)',
        'vec4(position + normal * sin(position.y * 4.0 + uTime) * 0.12, 1.0)',
      ),
    fragment: fragment('gl_FragColor = vec4(uColor, 1.0);'),
  },
  'Scrolling UV': {
    vertex: plainVertex,
    fragment: fragment(
      'float stripe = step(0.5, fract(vUv.x * 5.0 - uTime));\n  gl_FragColor = vec4(uColor * mix(0.5, 1.0, stripe), 1.0);',
    ),
  },
  Dissolve: {
    vertex: plainVertex,
    fragment: fragment(
      'float noise = fract(sin(dot(floor(vUv * 32.0), vec2(12.9898, 78.233))) * 43758.5);\n  if (noise < 0.3 + 0.25 * sin(uTime)) discard;\n  gl_FragColor = vec4(uColor, 1.0);',
    ),
  },
  Fresnel: {
    vertex: plainVertex,
    fragment: fragment(
      'float rim = pow(1.0 - abs(normalize(vNormal).z), 3.0);\n  gl_FragColor = vec4(mix(uColor, vec3(1.0), rim), 1.0);',
    ),
  },
  Toon: {
    vertex: plainVertex,
    fragment: fragment(
      'float shade = step(0.4, dot(normalize(vNormal), normalize(vec3(1.0, 2.0, 1.0))));\n  gl_FragColor = vec4(uColor * mix(0.55, 1.0, shade), 1.0);',
    ),
  },
}
export function checkShader(vertex: string, frag: string) {
  const gl = document.createElement('canvas').getContext('webgl2')
  if (!gl) throw Error('WebGL2 is required to validate this shader.')
  const program = gl.createProgram()!
  const stages = [gl.createShader(gl.VERTEX_SHADER)!, gl.createShader(gl.FRAGMENT_SHADER)!]
  const headers = [
    '#define varying out\nin vec3 position; in vec2 uv; in vec3 normal; uniform mat4 modelViewMatrix, projectionMatrix, modelMatrix, viewMatrix; uniform mat3 normalMatrix; uniform vec3 cameraPosition;',
    '#define varying in\nout vec4 mfColor;\n#define gl_FragColor mfColor',
  ]
  try {
    stages.forEach((s, i) => {
      gl.shaderSource(
        s,
        '#version 300 es\nprecision highp float;\n#define texture2D texture\n' +
          headers[i] +
          '\n' +
          [vertex, frag][i],
      )
      gl.compileShader(s)
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS))
        throw Error((i ? 'Fragment' : 'Vertex') + ' shader\n' + gl.getShaderInfoLog(s))
      gl.attachShader(program, s)
    })
    gl.linkProgram(program)
    if (!gl.getProgramParameter(program, gl.LINK_STATUS))
      throw Error(gl.getProgramInfoLog(program) || 'Shader link failed')
  } finally {
    stages.forEach((s) => gl.deleteShader(s))
    gl.deleteProgram(program)
    gl.getExtension('WEBGL_lose_context')?.loseContext()
  }
}
