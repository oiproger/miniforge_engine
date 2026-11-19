import { mat4, quat, vec3 } from 'gl-matrix'
import type { Vec3 } from '../../project-schema/src'

export class Vector3 {
  constructor(
    public x = 0,
    public y = 0,
    public z = 0,
  ) {}
  set(x: number, y: number, z: number) {
    this.x = x
    this.y = y
    this.z = z
    return this
  }
  fromArray(a: ArrayLike<number>) {
    return this.set(a[0], a[1], a[2])
  }
  toArray(): Vec3 {
    return [this.x, this.y, this.z]
  }
  copy(v: { x: number; y: number; z: number }) {
    return this.set(v.x, v.y, v.z)
  }
  clone() {
    return new Vector3(this.x, this.y, this.z)
  }
  add(v: Vector3) {
    return this.addScaledVector(v, 1)
  }
  addScaledVector(v: Vector3, k: number) {
    return this.set(this.x + v.x * k, this.y + v.y * k, this.z + v.z * k)
  }
  lerp(v: Vector3, k: number) {
    return this.set(this.x + (v.x - this.x) * k, this.y + (v.y - this.y) * k, this.z + (v.z - this.z) * k)
  }
}

export interface Triangles {
  positions: number[]
  indices: number[]
}
export class SceneNode {
  position = new Vector3()
  rotation = new Vector3()
  scale = new Vector3(1, 1, 1)
  parent: SceneNode | null = null
  children: SceneNode[] = []
  visible = true
  surfaces: Triangles[] = []
  constructor(public id = '') {}
  add(child: SceneNode) {
    child.detach()
    this.children.push(child)
    child.parent = this
  }
  detach() {
    if (this.parent) this.parent.children = this.parent.children.filter((c) => c !== this)
    this.parent = null
  }
  get active(): boolean {
    return this.visible && (!this.parent || this.parent.active)
  }
  worldMatrix(): mat4 {
    const r = this.rotation,
      k = 180 / Math.PI
    const q = quat.fromEuler(quat.create(), r.x * k, r.y * k, r.z * k, 'yxz')
    const local = mat4.fromRotationTranslationScale(
      mat4.create(),
      q,
      this.position.toArray(),
      this.scale.toArray(),
    )
    return this.parent ? mat4.multiply(local, this.parent.worldMatrix(), local) : local
  }
  worldRotation(): quat {
    const r = this.rotation,
      k = 180 / Math.PI,
      q = quat.fromEuler(quat.create(), r.x * k, r.y * k, r.z * k, 'yxz')
    return this.parent ? quat.multiply(q, this.parent.worldRotation(), q) : q
  }
  setWorldRotation(value: { x: number; y: number; z: number; w: number }) {
    const q = quat.fromValues(value.x, value.y, value.z, value.w)
    if (this.parent) quat.multiply(q, quat.invert(quat.create(), this.parent.worldRotation()), q)
    const m = mat4.fromQuat(mat4.create(), q)
    this.rotation.set(
      Math.asin(-Math.max(-1, Math.min(1, m[9]))),
      Math.atan2(m[8], m[10]),
      Math.atan2(m[1], m[5]),
    )
  }
  getWorldPosition(out: Vector3) {
    return out.fromArray(mat4.getTranslation(vec3.create(), this.worldMatrix()))
  }
  getWorldScale(out: Vector3) {
    return out.fromArray(mat4.getScaling(vec3.create(), this.worldMatrix()))
  }
  localToWorld(v: Vector3) {
    return v.fromArray(vec3.transformMat4(vec3.create(), v.toArray(), this.worldMatrix()))
  }
  worldToLocal(v: Vector3) {
    const m = mat4.invert(mat4.create(), this.worldMatrix())
    return m ? v.fromArray(vec3.transformMat4(vec3.create(), v.toArray(), m)) : v
  }
  lookAt(target: Vector3) {
    const p = this.getWorldPosition(new Vector3()),
      dx = target.x - p.x,
      dy = target.y - p.y,
      dz = target.z - p.z
    this.rotation.set(Math.atan2(dy, Math.hypot(dx, dz)), Math.atan2(-dx, -dz), 0)
  }
}
export class SceneCamera extends SceneNode {
  fov = 45
  height = 0
}
