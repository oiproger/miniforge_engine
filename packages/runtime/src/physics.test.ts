import { test, expect } from 'vitest'
import { Group, Vector3 } from 'three'
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
