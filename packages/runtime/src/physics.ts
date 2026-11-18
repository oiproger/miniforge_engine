import R from '@dimforge/rapier3d-compat'
import { Quaternion, Vector3 } from 'three'
import type { Scene } from '../../project-schema/src'
import type { RenderWorld } from '../../graphics/src'
import type { PhysicsSession } from './types'

export default async function createPhysics(view: Pick<RenderWorld, 'objects'>, scene: Scene): Promise<PhysicsSession> {
  await R.init()
  const world = new R.World({ x: 0, y: -9.81, z: 0 }),
    queue = new R.EventQueue(true)
  const bodies = new Map<string, R.RigidBody>(),
    owners = new Map<number, string>()
  const pos = new Vector3(),
    rot = new Quaternion()
  for (const e of scene.entities) {
    const node = view.objects.get(e.id),
      body = e.components.find((c) => c.type === 'body' && c.enabled !== false)
    const c = e.components.find((c) => c.type === 'collider' && c.enabled !== false)
    if (!e.active || !node || (!body && !c)) continue
    const desc =
      body?.kind === 'dynamic'
        ? R.RigidBodyDesc.dynamic()
        : body?.kind === 'kinematic'
          ? R.RigidBodyDesc.kinematicPositionBased()
          : R.RigidBodyDesc.fixed()
    node.getWorldPosition(pos)
    node.getWorldQuaternion(rot)
    const rigid = world.createRigidBody(desc.setTranslation(pos.x, pos.y, pos.z).setRotation(rot))
    const [w, h, d] = (c?.size || e.transform.scale).map((v: number) => Math.max(0.001, Math.abs(v)))
    const collider =
      c?.shape === 'sphere'
        ? R.ColliderDesc.ball(w / 2)
        : c?.shape === 'capsule'
          ? R.ColliderDesc.capsule(Math.max(0, (h - w) / 2), w / 2)
          : R.ColliderDesc.cuboid(w / 2, h / 2, d / 2)
    collider.setSensor(!!c?.trigger).setActiveEvents(R.ActiveEvents.COLLISION_EVENTS)
    if (body && body.mass > 0) collider.setMass(body.mass)
    if (c?.groups != null) collider.setCollisionGroups(c.groups)
    owners.set(world.createCollider(collider, rigid).handle, e.id)
    bodies.set(e.id, rigid)
  }
  return {
    step(dt, contact) {
      world.timestep = dt
      for (const [id, body] of bodies)
        if (body.isKinematic()) {
          const node = view.objects.get(id)!
          body.setNextKinematicTranslation(node.getWorldPosition(pos))
          body.setNextKinematicRotation(node.getWorldQuaternion(rot))
        }
      world.step(queue)
      for (const [id, body] of bodies)
        if (body.isDynamic()) {
          const node = view.objects.get(id)!,
            p = body.translation(),
            q = body.rotation()
          pos.set(p.x, p.y, p.z)
          rot.set(q.x, q.y, q.z, q.w)
          if (node.parent) {
            node.parent.worldToLocal(pos)
            rot.premultiply(node.parent.getWorldQuaternion(new Quaternion()).invert())
          }
          node.position.copy(pos)
          node.quaternion.copy(rot)
        }
      queue.drainCollisionEvents((a, b, enter) => {
        const first = owners.get(a),
          second = owners.get(b)
        if (first && second)
          contact(first, second, enter, world.getCollider(a).isSensor() || world.getCollider(b).isSensor())
      })
    },
    raycast(origin, direction, length) {
      const hit = world.castRay(new R.Ray(origin, direction), length, true)
      return hit ? owners.get(hit.collider.handle) : undefined
    },
    dispose() {
      queue.free()
      world.free()
    },
  }
}
