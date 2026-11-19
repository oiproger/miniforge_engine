export const behaviorDefaults: Record<string, [string, Record<string, string | number | boolean>]> = {
  rotate: ['Rotate Object', { axis: 'y', speed: 1 }],
  move: ['Move Between Points', { x: 2, y: 0, z: 0, speed: 1 }],
  follow: ['Follow Target', { target: '', speed: 2 }],
  lookAt: ['Look At', { target: '' }],
  player: ['Top Down Controller', { speed: 3, stepHeight: 0.3, maxSlope: 45, jumpHeight: 0.8 }],
  'first-person': ['First Person Controller', { speed: 3, stepHeight: 0.3, maxSlope: 45, jumpHeight: 1 }],
  collectible: ['Collectible', { points: 1, radius: 0.65 }],
  damage: ['Damage', { amount: 1, radius: 0.7 }],
  destroy: ['Destroy After Time', { seconds: 3 }],
  timer: ['Timer', { seconds: 3, repeat: false, event: 'timer.done' }],
  clickable: ['Clickable Object', { event: 'object.clicked' }],
  setVariable: ['Set Variable', { event: 'object.clicked', key: 'score', value: 1 }],
  sound: ['Play Sound', { event: 'coin.collected', asset: '' }],
  changeScene: ['Change Scene', { event: 'level.completed', scene: '' }],
  toggleUI: ['Show / Hide UI', { event: 'object.clicked', target: '' }],
  reward: ['Ad Reward', { event: 'reward.request', points: 1 }],
  spawn: ['Spawn Prefab', { event: 'spawn', prefab: '' }],
}

/** Suggestions only. Scripts, timers, buttons and clips may publish any event name. */
export const eventNames = [
  'object.clicked', 'pointer.click', 'trigger.enter', 'trigger.exit', 'collision.enter',
  'timer.done', 'coin.collected', 'level.completed', 'player.dead', 'time.up',
  'game.play', 'scene.start', 'reward.request', 'spawn',
] as const

export function behaviorParams(kind: string, overrides?: Record<string, unknown>): Record<string, any> {
  return { ...behaviorDefaults[kind]?.[1], ...overrides }
}
