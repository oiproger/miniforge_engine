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
