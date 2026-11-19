import R from '@dimforge/rapier3d-compat'
import { Quaternion, Vector3 } from 'three'
import type { Entity, Scene } from '../../project-schema/src'
import type { RenderWorld } from '../../graphics/src'
import type { PhysicsSession } from './types'

export default async function createPhysics(
  view: Pick<RenderWorld, 'objects'>,
  scene: Scene,
): Promise<PhysicsSession> {
  await R.init()
  const world = new R.World({ x: 0, y: -9.81, z: 0 }),
    queue = new R.EventQueue(true)
  const bodies = new Map<string, R.RigidBody>(),
    owners = new Map<number, string>()
  const pos = new Vector3(),
    rot = new Quaternion()
  function add(e: Entity) {
    const node = view.objects.get(e.id),
      body = e.components.find((c) => c.type === 'body' && c.enabled !== false)
    const c = e.components.find((c) => c.type === 'collider' && c.enabled !== false)
    if (!node || bodies.has(e.id) || (!body && !c)) return
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
    let parent: typeof node | null = node
    while (parent) {
      if (!parent.visible) {
        rigid.setEnabled(false)
        break
      }
      parent = parent.parent
    }
    bodies.set(e.id, rigid)
  }
  for (const entity of scene.entities) add(entity)
  return {
    add,
    remove(id) {
      const body = bodies.get(id)
      if (!body) return
      for (let i = 0; i < body.numColliders(); i++) owners.delete(body.collider(i).handle)
      bodies.delete(id)
      world.removeRigidBody(body)
    },
    setActive(id, enabled) {
      bodies.get(id)?.setEnabled(enabled)
    },
    step(dt, contact) {
      world.timestep = dt
      for (const [id, body] of bodies)
        if (body.isEnabled() && body.isKinematic()) {
          const node = view.objects.get(id)!
          body.setNextKinematicTranslation(node.getWorldPosition(pos))
          body.setNextKinematicRotation(node.getWorldQuaternion(rot))
        }
      world.step(queue)
      for (const [id, body] of bodies)
        if (body.isEnabled() && body.isDynamic()) {
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
      const collisions: [string, string, boolean, boolean][] = []
      queue.drainCollisionEvents((a, b, enter) => {
        const first = owners.get(a),
          second = owners.get(b)
        if (first && second)
          collisions.push([
            first,
            second,
            enter,
            world.getCollider(a).isSensor() || world.getCollider(b).isSensor(),
          ])
      })
      for (const collision of collisions)
        if (bodies.has(collision[0]) && bodies.has(collision[1])) contact(...collision)
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
