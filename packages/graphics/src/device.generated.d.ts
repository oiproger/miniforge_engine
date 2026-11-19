import type * as L from 'littlejsengine'
type Library = Pick<
  typeof L,
  | 'vec2'
  | 'vec3'
  | 'Color'
  | 'EngineObject3D'
  | 'Mesh'
  | 'Light3D'
  | 'Shader'
  | 'TextureInfo'
  | 'TileInfo'
  | 'Ray3D'
  | 'buildBox'
  | 'buildSphere'
  | 'buildGrid'
  | 'buildLathe'
  | 'buildCapsule'
  | 'loadGLTF'
>
export interface Device extends Library {
  r: L.Render3DPlugin
  canvas: HTMLCanvasElement
  checkShader(vertex: string, fragment: string): void
  triangles(): number
  whiteTexture(): L.TextureInfo
  setWhiteSprite(obj: L.EngineObject3D): void
  setTexture(obj: L.EngineObject3D, texture: L.TextureInfo): void
  background(hex: string): void
  tick(dt: number): void
  render(w: number, h: number, ratio: number, hidden: (o: L.EngineObject) => boolean): number
  pick(
    ray: L.Ray3D | L.Vector2,
    hidden: (o: L.EngineObject) => boolean,
  ): { object: L.EngineObject3D; distance: number } | undefined
  dispose(): void
}
export function createDevice(host: HTMLElement | null): Device
