import { test, expect } from 'vitest'
import { SceneNode as Group, Vector3 } from '../../graphics/src/scene'
import { makeEntity, makeScene } from '../../project-schema/src'
import createPhysics from './physics'

test('Rapier stops a falling dynamic body on the floor and reports the contact and ray hit', async () => {
  const scene = makeScene()
  const floor = makeEntity('Floor'),
    ball = makeEntity('Ball')
  floor.components = [{ type: 'collider', shape: 'box', size: [8, 1, 8] }]
  ball.components = [
    { type: 'body', kind: 'dynamic' },
    { type: 'collider', shape: 'sphere', size: [1, 1, 1] },
  ]
  scene.entities = [floor, ball]
  const floorNode = new Group(),
    ballNode = new Group()
  floorNode.position.y = -0.5
  ballNode.position.y = 4
  const view = {
    objects: new Map([
      [floor.id, floorNode],
      [ball.id, ballNode],
    ]),
  }
  const physics = await createPhysics(view, scene)
  const contacts: string[][] = []
  try {
    for (let i = 0; i < 180; i++)
      physics.step(1 / 60, (a, b, enter) => {
        if (enter) contacts.push([a, b])
      })
    expect(ballNode.position.y).toBeCloseTo(0.5, 1)
    expect(contacts.some((pair) => pair.includes(ball.id) && pair.includes(floor.id))).toBe(true)
    expect(physics.raycast(new Vector3(0, 5, 0), new Vector3(0, -1, 0), 10)).toBe(ball.id)
  } finally {
    physics.dispose()
  }
})

test('spawned collider can be disabled, reenabled, destroyed and its ID reused', async () => {
  const scene = makeScene(),
    node = new Group(),
    entity = makeEntity('Runtime blocker')
  entity.components = [{ type: 'collider', shape: 'box', size: [2, 2, 2] }]
  const view = { objects: new Map([[entity.id, node]]) }
  const sim = await createPhysics(view, scene)
  const hit = () => {
    sim.step(1 / 60, () => {})
    return sim.raycast(new Vector3(0, 4, 0), new Vector3(0, -1, 0), 8)
  }
  try {
    sim.add(entity)
    expect(hit()).toBe(entity.id)
    sim.setActive(entity.id, false)
    expect(hit()).toBeUndefined()
    sim.setActive(entity.id, true)
    expect(hit()).toBe(entity.id)
    sim.remove(entity.id)
    expect(hit()).toBeUndefined()
    sim.add(entity)
    expect(hit()).toBe(entity.id)
  } finally {
    sim.dispose()
  }
})

test('character climbs a low step and a triangle slope but stops at a tall wall', async () => {
  const scene = makeScene(),
    objects = new Map<string, Group>()
  function object(
    name: string,
    x: number,
    y: number,
    components: (typeof scene.entities)[number]['components'],
  ) {
    const e = makeEntity(name)
    e.components = components
    const node = new Group()
    node.position.set(x, y, 0)
    objects.set(e.id, node)
    scene.entities.push(e)
    return { e, node }
  }
  const { e: player, node } = object('Player', 0, 0.02, [
    { type: 'behavior', kind: 'player', params: { stepHeight: 0.3, maxSlope: 42 } },
  ])
  const floor = object('Floor', 0, -0.1, [{ type: 'collider', size: [20, 0.2, 4] }])
  floor.e.properties.floor = true
  object('Step', 1, 0.09, [{ type: 'collider', size: [1, 0.18, 3] }])
  const ramp = object('Ramp', 2.5, 0.38, [{ type: 'collider', shape: 'mesh' }])
  ramp.node.rotation.z=.28
  ramp.node.surfaces.push({positions:[-1.2,.05,-1.5,1.2,.05,-1.5,-1.2,.05,1.5,1.2,.05,1.5],indices:[0,2,1,1,2,3]})
  const wall = object('Wall', 4.2, 1, [{ type: 'collider', size: [0.25, 2, 4] }])
  const sim = await createPhysics({ objects }, scene)
  let peak = 0,
    stepY = 0,
    touched = false
  try {
    for (let i = 0; i < 250; i++) {
      sim.step(1 / 60, () => {})
      const move = sim.moveCharacter!(player.id, [0.025, -0.02, 0])!
      node.position.add(new Vector3(...move.delta))
      peak = Math.max(peak, node.position.y)
      if (node.position.x > 0.8 && node.position.x < 1.1) stepY = Math.max(stepY, node.position.y)
      touched ||= move.contacts.includes(wall.e.id)
    }
    expect(stepY).toBeGreaterThan(0.15)
    expect(peak).toBeGreaterThan(0.65)
    expect(touched).toBe(true)
    expect(node.position.x).toBeLessThan(4)
  } finally {
    sim.dispose()
  }
})

test('a character lands below its spawn height on sculpted terrain and cannot climb a steep face', async () => {
  const { makeTerrain } = await import('../../project-schema/src')
  const { terrainGeometry } = await import('../../graphics/src/terrain')
  const scene = makeScene(),
    ground = makeEntity('Terrain'),
    player = makeEntity('Climber')
  const t = makeTerrain(16)
  for (let z = 0; z <= 16; z++)
    for (let x = 0; x <= 16; x++) t.heights[z * 17 + x] = Math.max(0, x - 8) * 3 - 1
  ground.components = [t]
  player.components = [{ type: 'behavior', kind: 'first-person', params: { maxSlope: 35, stepHeight: 0.15 } }]
  const surface = new Group(),
    node = new Group(),
    geo = terrainGeometry(t)
  surface.surfaces.push(geo)
  node.position.set(-1, 2, 0)
  scene.entities = [ground, player]
  const sim = await createPhysics(
    {
      objects: new Map([
        [ground.id, surface],
        [player.id, node],
      ]),
    },
    scene,
  )
  function step(dx: number) {
    sim.step(1 / 60, () => {})
    const result = sim.moveCharacter!(player.id, [dx, -0.04, 0])!
    node.position.add(new Vector3(...result.delta))
  }
  try {
    for (let i = 0; i < 100; i++) step(0)
    expect(node.position.y).toBeCloseTo(-1, 1)
    for (let i = 0; i < 120; i++) step(0.03)
    expect(node.position.x).toBeGreaterThan(-0.4)
    expect(node.position.x).toBeLessThan(0.15)
    expect(node.position.y).toBeLessThan(-0.7)
  } finally {
    sim.dispose()
  }
})
