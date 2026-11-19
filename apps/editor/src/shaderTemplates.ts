import { createDevice } from '../../../packages/graphics/src/device.generated'

const vertex = 'void mainVertex(inout vec3 position, inout vec3 normal) {}'
const fragment = (body: string) => 'void mainImage(out vec4 color, vec2 uv) {\n  ' + body + '\n}'
export const shaders: Record<string, { vertex: string; fragment: string }> = {
  Unlit: { vertex, fragment: fragment('color = texture(iChannel0, uv);') },
  'Vertex wave': {
    vertex:
      'void mainVertex(inout vec3 position, inout vec3 normal) { position += normal * sin(position.y * 4.0 + iTime) * 0.12; }',
    fragment: fragment('color = texture(iChannel0, uv);'),
  },
  'Anomaly Glitch (Смещение)': {
    vertex:
      'void mainVertex(inout vec3 position, inout vec3 normal) { float g = step(0.86, fract(sin(floor(iTime * 6.0) * 43.1) * 192.3)); position.x += g * sin(position.y * 18.0 + iTime * 24.0) * 0.08; }',
    fragment: fragment(
      'float band = step(0.75, fract(sin(floor(worldPos.y * 12.0 + iTime * 5.0)) * 43758.5)); vec2 shift = vec2(band * 0.025, 0.0); float r = texture(iChannel0, uv + shift).r; float g = texture(iChannel0, uv).g; float b = texture(iChannel0, uv - shift).b; color = vec4(r, g, b, 1.0);',
    ),
  },
  'Wet Specular': {
    vertex,
    fragment: fragment(
      'vec3 n = normalize(worldNormal); vec3 v = normalize(cameraPos - worldPos); vec3 h = normalize(normalize(sunDirection) + v); float spec = pow(max(0.0, dot(n, h)), 64.0); vec4 tex = texture(iChannel0, uv); color = vec4(tex.rgb * 0.78 + vec3(spec * 0.7), tex.a);',
    ),
  },
  'CRT Scanlines': {
    vertex,
    fragment: fragment(
      'vec4 tex = texture(iChannel0, uv); float scan = 0.85 + 0.15 * sin(localUV.y * 180.0 + iTime * 4.0); color = vec4(tex.rgb * scan, tex.a);',
    ),
  },
  'Scrolling UV': {
    vertex,
    fragment: fragment('color = vec4(vec3(mix(0.5, 1.0, step(0.5, fract(localUV.x * 5.0 - iTime)))), 1.0);'),
  },
  Dissolve: {
    vertex,
    fragment: fragment(
      'float noise = fract(sin(dot(floor(localUV * 32.0), vec2(12.9898,78.233))) * 43758.5); if (noise < 0.3 + 0.25*sin(iTime)) discard; color = texture(iChannel0,uv);',
    ),
  },
  Fresnel: {
    vertex,
    fragment: fragment(
      'float rim = pow(1.0 - abs(dot(normalize(worldNormal),normalize(cameraPos-worldPos))),3.0); color = vec4(vec3(0.4 + 0.6*rim),1.0);',
    ),
  },
  Toon: {
    vertex,
    fragment: fragment(
      'float shade = step(0.4,dot(normalize(worldNormal),sunDirection)); color = vec4(vec3(mix(0.55,1.0,shade)),1.0);',
    ),
  },
}
export function checkShader(vertex: string, fragment: string) {
  const device = createDevice(document.createElement('div'))
  try {
    device.checkShader(vertex, fragment)
  } finally {
    device.dispose()
  }
}
