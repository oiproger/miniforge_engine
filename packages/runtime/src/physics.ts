import R from '@dimforge/rapier3d-compat'
import { mat4, vec3 } from 'gl-matrix'
import { Vector3, type SceneNode } from '../../graphics/src/scene'
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
  const pos = new Vector3()
  const controllers = new Map<string, R.KinematicCharacterController>()
  function triangleCollider(node: SceneNode) {
    const world = node.worldMatrix()
    const pose = mat4.fromRotationTranslation(
      mat4.create(),
      node.worldRotation(),
      node.getWorldPosition(pos).toArray(),
    )
    const local = mat4.multiply(mat4.create(), mat4.invert(pose, pose)!, world)
    const positions: number[] = [],
      indices: number[] = []
    const v = vec3.create()
    for (const surface of node.surfaces) {
      const start = positions.length / 3
      for (let i = 0; i < surface.positions.length; i += 3) {
        vec3.set(v, surface.positions[i], surface.positions[i + 1], surface.positions[i + 2])
        vec3.transformMat4(v, v, local)
        positions.push(v[0], v[1], v[2])
      }
      for (const index of surface.indices) indices.push(start + index)
    }
    return indices.length
      ? R.ColliderDesc.trimesh(
          new Float32Array(positions),
          new Uint32Array(indices),
          R.TriMeshFlags.FIX_INTERNAL_EDGES,
        )
      : undefined
  }
  function rotation(node: SceneNode) {
    const [x, y, z, w] = node.worldRotation()
    return { x, y, z, w }
  }
  function add(e: Entity) {
    const node = view.objects.get(e.id)
    const enabled = e.components.filter((c) => c.enabled !== false)
    const body = enabled.find((c) => c.type === 'body'),
      c = enabled.find((c) => c.type === 'collider')
    const character = enabled.find(
      (c) => c.type === 'behavior' && ['player', 'first-person'].includes(c.kind),
    )
    const mesh = enabled.some((c) => c.type === 'terrain') || c?.shape === 'mesh'
    if (!node || bodies.has(e.id) || !(body || c || character || mesh)) return
    const scale = node.getWorldScale(new Vector3())
    const [w, h, d] = (c?.size || scale.toArray()).map((v: number) => Math.max(0.001, Math.abs(v)))
    const radius = Math.max(0.02, Number(character?.params?.radius ?? (c ? w / 2 : 0.24)))
    const height = Math.max(2 * radius, Number(character?.params?.height ?? (c ? h : 0.96)))
    const collider = character
      ? R.ColliderDesc.roundCylinder(height / 2 - 0.02, radius - 0.01, 0.01).setTranslation(0, height / 2, 0)
      : mesh
        ? triangleCollider(node)
        : c?.shape === 'sphere'
          ? R.ColliderDesc.ball(w / 2)
          : c?.shape === 'capsule'
            ? R.ColliderDesc.capsule(Math.max(0, (h - w) / 2), w / 2)
            : R.ColliderDesc.cuboid(w / 2, h / 2, d / 2)
    if (!collider) return
    const desc =
      character || body?.kind === 'kinematic'
        ? R.RigidBodyDesc.kinematicPositionBased()
        : body?.kind === 'dynamic'
          ? R.RigidBodyDesc.dynamic()
          : R.RigidBodyDesc.fixed()
    node.getWorldPosition(pos)
    const rot = rotation(node)
    const rigid = world.createRigidBody(desc.setTranslation(pos.x, pos.y, pos.z).setRotation(rot))
    if (character) {
      const controller = world.createCharacterController(0.01)
      const step = Math.max(0, character.params?.stepHeight ?? 0.3)
      if (step) controller.enableAutostep(step, 0.12, false)
      const slope = (Math.max(0, Math.min(89, character.params?.maxSlope ?? 45)) * Math.PI) / 180
      controller.setMaxSlopeClimbAngle(slope)
      controller.setMinSlopeSlideAngle(slope)
      controller.enableSnapToGround(0.12)
      controllers.set(e.id, controller)
    }
    collider.setSensor(!!c?.trigger).setActiveEvents(R.ActiveEvents.COLLISION_EVENTS)
    if (c?.trigger) collider.setActiveCollisionTypes(R.ActiveCollisionTypes.ALL)
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
  // Older arenas use the spawn height as their implicit floor.
  const hasGround = scene.entities.some((e) =>
    e.components.some(
      (c) =>
        c.enabled !== false &&
        (c.type === 'terrain' ||
          (c.type === 'collider' && !c.trigger && (e.properties.floor || c.shape === 'mesh'))),
    ),
  )
  if (!hasGround && controllers.size) {
    const player = bodies.get(controllers.keys().next().value!)!
    const p = player.translation()
    const ray = new R.Ray({ x: p.x, y: p.y + 0.02, z: p.z }, { x: 0, y: -1, z: 0 })
    const authoredFloor = [...bodies.values()].some(
      (body) =>
        body !== player &&
        body.isEnabled() &&
        !body.collider(0).isSensor() &&
        body.collider(0).castRayAndGetNormal(ray, 10000, true),
    )
    const floor = R.ColliderDesc.cuboid(10000, 0.05, 10000).setTranslation(
      0,
      player.translation().y - 0.05,
      0,
    )
    if (!authoredFloor) world.createCollider(floor)
  }
  return {
    add,
    moveCharacter(id, delta) {
      const controller = controllers.get(id),
        body = bodies.get(id)
      if (!controller || !body) return
      controller.computeColliderMovement(
        body.collider(0),
        { x: delta[0], y: delta[1], z: delta[2] },
        R.QueryFilterFlags.EXCLUDE_SENSORS,
      )
      const m = controller.computedMovement(),
        contacts = new Set<string>()
      for (let i = 0; i < controller.numComputedCollisions(); i++) {
        const collider = controller.computedCollision(i)?.collider
        const owner = collider && owners.get(collider.handle)
        if (owner) contacts.add(owner)
      }
      return { delta: [m.x, m.y, m.z], grounded: controller.computedGrounded(), contacts: [...contacts] }
    },
    remove(id) {
      const body = bodies.get(id)
      if (!body) return
      for (let i = 0; i < body.numColliders(); i++) owners.delete(body.collider(i).handle)
      const controller = controllers.get(id)
      if (controller) world.removeCharacterController(controller)
      controllers.delete(id)
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
          body.setNextKinematicRotation(rotation(node))
        }
      world.step(queue)
      for (const [id, body] of bodies)
        if (body.isEnabled() && body.isDynamic()) {
          const node = view.objects.get(id)!,
            p = body.translation(),
            q = body.rotation()
          pos.set(p.x, p.y, p.z)
          node.setWorldRotation(q)
          if (node.parent) {
            node.parent.worldToLocal(pos)
          }
          node.position.copy(pos)
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
      const hit = world.castRay(
        new R.Ray(origin, direction),
        length,
        true,
        undefined,
        undefined,
        undefined,
        undefined,
        (collider) => owners.has(collider.handle),
      )
      return hit ? owners.get(hit.collider.handle) : undefined
    },
    dispose() {
      queue.free()
      world.free()
    },
  }
}
